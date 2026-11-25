import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CONTAINER, digest, loadManifest, requireMatch } from "./band-development-manifest.mjs";

// Use the previous verified manifest for content and its receipt for database IDs.
export async function loadRetirements(file, checksum, currentSha, current) {
  const bytes = await readFile(file);
  requireMatch(digest(bytes) === checksum, "retirement-file-digest");
  const spec = JSON.parse(bytes);
  requireMatch(
    spec.format === "band-author-exclusions-v1" &&
      spec.environment === "development" &&
      spec.containerId === CONTAINER &&
      spec.manifestSha256 === currentSha &&
      /^[0-9a-f]{64}$/.test(spec.previousSha256),
    "retirement-scope",
  );
  const previous = await loadManifest(
    resolve(dirname(file), `development-manifest-${spec.previousSha256}.json`),
    spec.previousSha256,
  );
  requireMatch(previous.throughKst === current.throughKst, "retirement-cutoff");
  function targets(rows, previousRows, currentRows, field) {
    const old = new Map(previousRows.map((r) => [r[field], r]));
    const keep = new Set(currentRows.map((r) => r[field]));
    const ids = new Set();
    const keys = new Set();
    return rows.map(({ source, id, reason }) => {
      requireMatch(
        old.has(source) &&
          !keep.has(source) &&
          !keys.has(source) &&
          !ids.has(id) &&
          Number.isSafeInteger(id) &&
          id > 0 &&
          ["author:withdrawn_account", "author:spam_account"].includes(reason),
        "retirement-target",
      );
      ids.add(id);
      keys.add(source);
      return { source, id, row: old.get(source) };
    });
  }
  return {
    posts: targets(spec.posts, previous.posts, current.posts, "sourceId"),
    comments: targets(spec.comments, previous.comments, current.comments, "sourceKey"),
    assets: new Map(previous.assets.map((a) => [a.objectPath, a])),
  };
}

export async function checkRetirements(db, plan, existing, compareStored) {
  const ids = { posts: [], comments: [] };
  if (!plan) return ids;
  const rows = { posts: [], comments: [] };
  for (const kind of ["posts", "comments"]) {
    for (const target of plan[kind]) {
      const stored = existing[kind].get(target.source);
      if (!stored) continue;
      requireMatch(stored.id === target.id && stored.revision === 0, "retirement-target-changed");
      ids[kind].push(target.id);
      rows[kind].push(target.row);
    }
  }
  const count = ids.posts.length + ids.comments.length;
  if (!count) return ids;
  requireMatch(count === plan.posts.length + plan.comments.length, "partial-retirement-inventory");
  compareStored(rows, existing, plan.assets, true);
  const other = await db.query(
    `select 1 from comments where (post_id = any($1::int[]) or parent_comment_id = any($2::int[]))
       and not (id = any($2::int[])) limit 1`,
    [ids.posts, ids.comments],
  );
  requireMatch(other.rowCount === 0, "unreviewed-dependent-comment");
  return ids;
}

export async function removeReviewed(db, ids) {
  if (ids.comments.length) {
    const r = await db.query(
      "delete from comments where id = any($1::int[]) and author_id is null and import_source_id is not null",
      [ids.comments],
    );
    requireMatch(r.rowCount === ids.comments.length, "retirement-comment-count");
  }
  if (ids.posts.length) {
    const r = await db.query(
      `delete from posts where id = any($1::int[]) and author_id is null
       and import_data->>'platform' = 'band' and import_data->>'containerId' = $2`,
      [ids.posts, CONTAINER],
    );
    requireMatch(r.rowCount === ids.posts.length, "retirement-post-count");
  }
}
