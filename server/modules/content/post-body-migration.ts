import { Client } from "pg";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { posts } from "../../db/schema";
import { postBodyTextExpression } from "./post-body-query";
import { postDocumentText, type PostDocument } from "@shared/contracts/post-document";
import { normalizePostDocument, postDocumentFromMarkdown, postDocumentMarkdown, postDocumentsEqual, PostDocumentError } from "@shared/editor/post-document";

type StoredRow = { id: number; original: Record<string, unknown> & { content: unknown } };
type Target = "development" | "production";
const databaseName = (target: Target) => target === "production" ? "neondb" : "heliumdb";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function mismatch(reason: string, expected: unknown, actual: unknown): never {
  throw Object.assign(new Error(reason), { evidence: { reason, expected, actual, contentOmitted: true } });
}
function connection(target: Target, readOnly = false) {
  const env = process.env;
  if (target === "production") {
    const connectionString = readOnly
      ? env.PROD_DATABASE_READONLY_URL || env.PROD_DATABASE_URL
      : env.PROD_DATABASE_URL;
    if (!connectionString) mismatch("production_configuration", "explicit production Secret present", "missing; values excluded");
    return new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
  }
  if (env.REPLIT_DEPLOYMENT === "1" || env.NODE_ENV === "production"
    || env.PGDATABASE !== "heliumdb" || !env.PGUSER || !env.PGPASSWORD
    || !["helium", "localhost", "127.0.0.1"].includes(env.PGHOST ?? "")) {
    mismatch("development_target", "Replit development PG*", "missing or disallowed configuration");
  }
  return new Client({ host: env.PGHOST, port: Number(env.PGPORT || 5432),
    user: env.PGUSER, password: env.PGPASSWORD, database: env.PGDATABASE, ssl: false });
}
async function identify(client: Client, target: Target) {
  const { rows } = await client.query("select current_database() as name");
  if (rows[0]?.name !== databaseName(target)) mismatch("database", databaseName(target), rows[0]?.name);
}
async function readRows(client: Client): Promise<StoredRow[]> {
  return (await client.query("select id, to_jsonb(posts) as original from public.posts order by id")).rows;
}
function withoutContent(row: StoredRow) {
  const { content: _content, ...rest } = row.original;
  return rest;
}
async function counts(client: Client) {
  const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const result: Record<string, number> = {};
  for (const { tablename } of tables) {
    const name = String(tablename).replace(/"/g, '""');
    result[tablename] = Number((await client.query(`select count(*) as n from public."${name}"`)).rows[0].n);
  }
  return result;
}

export async function migratePostBody(mode: "preview" | "apply", directory: string, target: Target = "development") {
  const allowedRoot = path.resolve(target === "production"
    ? ".superpowers/post-body-jsonb-release-20261109" : ".superpowers/post-body-jsonb-20261109");
  if (path.resolve(directory) !== allowedRoot) mismatch("backup_directory", allowedRoot, path.resolve(directory));
  await mkdir(allowedRoot, { recursive: true, mode: 0o700 });
  await chmod(allowedRoot, 0o700);
  const client = connection(target, mode === "preview");
  let committed = false;
  let backupPath: string | undefined;
  const started = new Date().toISOString();
  const receipt: Record<string, unknown> = { mode, started, database: databaseName(target), committed: false };
  try {
    await client.connect();
    await client.query(mode === "apply" ? "BEGIN" : "BEGIN READ ONLY");
    await identify(client, target);
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    if (mode === "apply") await client.query("LOCK TABLE public.posts IN ACCESS EXCLUSIVE MODE");
    const type = (await client.query("select data_type from information_schema.columns where table_schema='public' and table_name='posts' and column_name='content'")).rows[0]?.data_type;
    if (type !== "text") mismatch("content_type_before", "text (not already converted)", type);
    const before = await readRows(client);
    const beforeCounts = await counts(client);
    const converted = new Map<number, PostDocument>();
    const errors: { id: number; reason: string; path?: string }[] = [];
    for (const row of before) {
      try {
        if (typeof row.original.content !== "string") throw new PostDocumentError("legacy_content_type");
        const document = postDocumentFromMarkdown(row.original.content);
        if (!postDocumentsEqual(document, postDocumentFromMarkdown(postDocumentMarkdown(document)))) throw new PostDocumentError("markdown_roundtrip");
        converted.set(row.id, document);
      } catch (error) {
        errors.push({ id: row.id, reason: error instanceof PostDocumentError ? error.reason : "conversion_failed",
          ...(error instanceof PostDocumentError ? { path: error.path } : {}) });
      }
    }
    Object.assign(receipt, { rows: before.length, convertible: converted.size, errors, beforeCounts });
    if (errors.length) mismatch("conversion_errors", 0, errors);
    if (mode === "preview") {
      await client.query("ROLLBACK");
      await writeFile(path.join(allowedRoot, "preview.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
      return receipt;
    }

    // Requested preservation: private, excluded from Git, never copied to the Mac or printed.
    backupPath = path.join(allowedRoot, `posts-before-${Date.now()}.json`);
    const backup = JSON.stringify({ database: databaseName(target), started, rows: before.map((row) => row.original) });
    await writeFile(backupPath, backup, { mode: 0o600, flag: "wx" });
    Object.assign(receipt, { backupFile: path.basename(backupPath), backupSha256: createHash("sha256").update(backup).digest("hex") });
    const ddl = await readFile(target === "production" ? "scripts/post-body-jsonb-production.sql" : "scripts/post-body-jsonb.sql", "utf8");
    receipt.ddlSha256 = createHash("sha256").update(ddl).digest("hex");
    for (const [id, document] of Array.from(converted.entries())) {
      await client.query("update public.posts set content=$1::text where id=$2", [JSON.stringify(document), id]);
    }
    await client.query(ddl);
    const verifyRows = (after: StoredRow[]) => {
      if (after.length !== before.length) mismatch("row_count", before.length, after.length);
      for (let i = 0; i < before.length; i++) {
        const previous = before[i], current = after[i];
        if (previous.id !== current.id || digest(withoutContent(previous)) !== digest(withoutContent(current))) {
          mismatch("non_content_columns", { id: previous.id, hash: digest(withoutContent(previous)) }, { id: current.id, hash: digest(withoutContent(current)) });
        }
        if (!postDocumentsEqual(converted.get(previous.id)!, normalizePostDocument(current.original.content))) {
          mismatch("converted_document", { id: previous.id, hash: digest(converted.get(previous.id)) }, { hash: digest(current.original.content) });
        }
      }
    };
    verifyRows(await readRows(client));
    await client.query("COMMIT");
    committed = true;
    Object.assign(receipt, { committed: true, committedAt: new Date().toISOString() });
    await writeFile(path.join(allowedRoot, "apply.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    const fresh = connection(target, true);
    try {
      await fresh.connect();
      await fresh.query("BEGIN READ ONLY");
      await identify(fresh, target);
      verifyRows(await readRows(fresh));
      const query = new PgDialect().sqlToQuery(sql`select ${posts.id} as id, ${postBodyTextExpression()} as plain_text from ${posts} order by ${posts.id}`);
      const plainRows = (await fresh.query(query.sql, query.params)).rows;
      for (const row of plainRows) {
        const expected = postDocumentText(converted.get(row.id)!);
        if (row.plain_text.trim() !== expected) mismatch("search_text", { id: row.id, hash: digest(expected) }, { hash: digest(row.plain_text.trim()) });
      }
      const afterCounts = await counts(fresh);
      if (digest(beforeCounts) !== digest(afterCounts)) mismatch("table_counts", beforeCounts, afterCounts);
      const column = (await fresh.query("select data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='posts' and column_name='content'")).rows[0];
      const constraint = (await fresh.query("select convalidated from pg_constraint where conrelid='public.posts'::regclass and conname='posts_content_document_check'")).rows[0];
      if (column?.data_type !== "jsonb" || column?.is_nullable !== "NO" || constraint?.convalidated !== true) mismatch("schema_after", "jsonb NOT NULL and validated CHECK", { column, constraint });
      Object.assign(receipt, { verifiedAt: new Date().toISOString(), afterCounts, verifiedRows: before.length, searchRows: plainRows.length, column, constraint });
      await fresh.query("ROLLBACK");
    } finally { await fresh.end(); }
    await writeFile(path.join(allowedRoot, "apply.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    return receipt;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    const safe = error as { name?: string; code?: string; evidence?: unknown };
    Object.assign(receipt, { committed, failed: true, errorType: safe.name, sqlState: safe.code, evidence: safe.evidence, contentOmitted: true });
    await writeFile(path.join(allowedRoot, `${mode}-failure.json`), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    console.error(JSON.stringify(receipt));
    throw new Error("Post body migration failed; see the metadata-only receipt.");
  } finally { await client.end(); }
}
