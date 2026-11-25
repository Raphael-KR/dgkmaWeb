import { isDeepStrictEqual } from "node:util";

const imported = "p.is_published = true AND p.import_data IS NOT NULL";

export function promotionError(reason) {
  throw Object.assign(new Error("Content promotion failed"), { reason });
}

function postQuery(version) {
  const affiliation = version === 2 ? ", p.author_affiliation" : "";
  return `SELECT p.id, p.title, p.content, p.author_id, p.author_name${affiliation},
    p.import_data, p.is_hidden, p.revision, p.image_urls, p.event_data, p.source_text,
    p.published_at AT TIME ZONE 'UTC' AS published_at,
    p.created_at AT TIME ZONE 'UTC' AS created_at, p.updated_at AT TIME ZONE 'UTC' AS updated_at,
    c.name AS category_name
    FROM posts p JOIN categories c ON c.id = p.category_id WHERE ${imported} ORDER BY p.id`;
}

const commentQuery = `SELECT c.id, c.post_id, c.parent_comment_id, c.import_source_id,
    c.author_id, c.author_name, c.author_affiliation, c.content, c.attachment, c.is_hidden,
    c.revision, c.created_at AT TIME ZONE 'UTC' AS created_at,
    c.edited_at AT TIME ZONE 'UTC' AS edited_at
    FROM comments c JOIN posts p ON p.id = c.post_id WHERE ${imported}
      AND p.import_data->>'platform' = 'band' AND c.import_source_id IS NOT NULL ORDER BY c.id`;

const countsQuery = `SELECT (SELECT count(*)::int FROM posts) AS posts,
    (SELECT count(*)::int FROM comments) AS comments`;

export async function readPromotionRows(client, version) {
  const posts = (await client.query(postQuery(version))).rows;
  const comments = version === 2 ? (await client.query(commentQuery)).rows : [];
  const counts = (await client.query(countsQuery)).rows[0];
  return { posts, comments, counts };
}

export async function previewPromotion(client, snapshot) {
  await client.query(postQuery(snapshot.schemaVersion) + " LIMIT 0");
  if (snapshot.schemaVersion === 2) await client.query(commentQuery + " LIMIT 0");
  const categories = new Map(
    (await client.query("SELECT id, name FROM categories WHERE is_active = true")).rows.map(
      ({ name, id }) => [name, id],
    ),
  );
  for (const post of snapshot.posts) {
    if (!categories.has(post.category_name))
      promotionError("missing-category:" + post.category_name);
  }
  const counts = (await client.query(countsQuery)).rows[0];
  return { categories, counts };
}

const insertPosts = `INSERT INTO posts (id, title, content, category_id, author_id, author_name,
  import_data, is_published, is_hidden, revision, image_urls, event_data, source_text, published_at, created_at, updated_at`;
const postRecord = `id integer, title text, content jsonb, category_id integer, author_name text,
  import_data jsonb, is_hidden boolean, revision integer, image_urls text[], event_data jsonb,
  source_text text, published_at timestamptz, created_at timestamptz, updated_at timestamptz`;
const postValues = `id, title, content, category_id, NULL, author_name, import_data, true, is_hidden,
  revision, image_urls, event_data, source_text, published_at AT TIME ZONE 'UTC',
  created_at AT TIME ZONE 'UTC', updated_at AT TIME ZONE 'UTC'`;

const insertComments = `INSERT INTO comments (id, post_id, parent_comment_id, import_source_id,
    author_id, author_name, author_affiliation, content, attachment, is_hidden, revision, created_at, edited_at)
  SELECT id, post_id, parent_comment_id, import_source_id, NULL, author_name, author_affiliation,
    content, attachment, is_hidden, revision, created_at AT TIME ZONE 'UTC', edited_at AT TIME ZONE 'UTC'
  FROM jsonb_to_recordset($1::jsonb) AS r(id integer, post_id integer, parent_comment_id integer,
    import_source_id text, author_name text, author_affiliation text, content text, attachment jsonb,
    is_hidden boolean, revision integer, created_at timestamptz, edited_at timestamptz)`;

async function insertBatches(client, sql, rows) {
  for (let i = 0; i < rows.length; i += 150) {
    const batch = rows.slice(i, i + 150);
    const result = await client.query(sql, [JSON.stringify(batch)]);
    if (result.rowCount !== batch.length) {
      promotionError(`inserted-rows:expected=${batch.length}:actual=${result.rowCount}`);
    }
  }
}

// ALTER SEQUENCE RESTART, unlike setval, is cancelled with an unsuccessful transaction.
async function resetSequence(client, table, rows) {
  const {
    rows: [{ sequence }],
  } = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence", [
    "public." + table,
  ]);
  if (sequence !== `public.${table}_id_seq`) promotionError("unexpected-id-sequence:" + table);
  const nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  await client.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${nextId}`);
}

export async function applyPromotionRows(client, snapshot, preview, reset, verify) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("LOCK TABLE posts, comments IN SHARE ROW EXCLUSIVE MODE");
    const current = await previewPromotion(client, snapshot);
    if (!isDeepStrictEqual(current, preview)) {
      promotionError(
        `target-changed:posts=${current.counts.posts}:comments=${current.counts.comments}`,
      );
    }
    if (reset) await client.query("DELETE FROM posts");
    else if (current.counts.posts || current.counts.comments) {
      promotionError(
        `target-not-empty:posts=${current.counts.posts}:comments=${current.counts.comments}`,
      );
    }

    const v2 = snapshot.schemaVersion === 2;
    const affiliation = v2 ? ", author_affiliation" : "";
    const posts = snapshot.posts.map((p) => ({
      ...p,
      category_id: current.categories.get(p.category_name),
    }));
    await insertBatches(
      client,
      `${insertPosts}${affiliation}) SELECT ${postValues}${affiliation}
      FROM jsonb_to_recordset($1::jsonb) AS r(${postRecord}${v2 ? ", author_affiliation text" : ""})`,
      posts,
    );
    const comments = snapshot.comments ?? [];
    await insertBatches(
      client,
      insertComments,
      comments.filter((c) => c.parent_comment_id === null),
    );
    await insertBatches(
      client,
      insertComments,
      comments.filter((c) => c.parent_comment_id !== null),
    );
    await verify(client);
    await resetSequence(client, "posts", posts);
    await resetSequence(client, "comments", comments);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
