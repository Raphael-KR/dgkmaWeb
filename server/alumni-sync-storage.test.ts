import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Pool } from "pg";
import type { AlumniSourceSnapshot } from "./alumni-sync-plan";

const DEVELOPMENT_REPL_ID = "dc5e5541-525b-4ad6-b914-2d2db70cb4a9";
const developmentDatabasePort = Number(process.env.PGPORT ?? "5432");
const hasExplicitDevelopmentDatabaseTarget = Boolean(
  process.env.REPL_ID === DEVELOPMENT_REPL_ID
    && process.env.REPLIT_DEPLOYMENT !== "1"
    && process.env.NODE_ENV !== "production"
    && process.env.PGHOST === "helium"
    && process.env.PGDATABASE === "heliumdb"
    && process.env.PGUSER
    && process.env.PGPASSWORD
    && Number.isInteger(developmentDatabasePort)
    && developmentDatabasePort > 0,
);

test("alumni sync storage uses one advisory-locked transaction without delete", async () => {
  const source = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  const method = source.slice(
    source.indexOf("async applyAlumniSync"),
    source.indexOf("async getObituaries"),
  );

  assert.match(source, /async previewAlumniSync/);
  const transactionIndex = method.indexOf("db.transaction");
  const lockIndex = method.indexOf("pg_try_advisory_xact_lock");
  const sourceReadIndex = method.indexOf("fetchAlumniSnapshot");
  const planIndex = method.indexOf("planAlumniSync");
  assert.ok(transactionIndex >= 0);
  assert.ok(lockIndex > transactionIndex);
  assert.ok(sourceReadIndex > lockIndex, "source는 advisory lock 획득 후 다시 읽어야 합니다.");
  assert.ok(planIndex > sourceReadIndex);
  assert.match(method, /tx\.insert\(alumniDatabase\)/);
  assert.match(method, /tx\.update\(alumniDatabase\)/);
  assert.doesNotMatch(method, /tx\.delete\(alumniDatabase\)/);
  assert.doesNotMatch(source, /async syncAlumniFromGoogleSheets/);
});

test("development helium fixture proves preview, guarded apply, rollback, and cleanup", {
  skip: hasExplicitDevelopmentDatabaseTarget
    ? false
    : "지정된 Replit Development Database의 명시적 PG* 대상이 아니므로 건너뜁니다.",
}, async (t) => {
  const testPool = new Pool({
    host: process.env.PGHOST!,
    port: developmentDatabasePort,
    user: process.env.PGUSER!,
    password: process.env.PGPASSWORD!,
    database: process.env.PGDATABASE!,
    ssl: false,
    max: 3,
  });
  const token = randomUUID().replaceAll("-", "");
  const marker = `TASK5-${token}`;
  const phone = (offset: number) => {
    const digits = String((BigInt(`0x${token.slice(0, 14)}`) + BigInt(offset)) % 100000000n)
      .padStart(8, "0");
    return `010-${digits.slice(0, 4)}-${digits.slice(4)}`;
  };
  const mobiles = [phone(1), phone(2), phone(3), phone(4), phone(5)];
  const email = `task5-${token}@example.invalid`;
  const functionName = `task5_fail_${token.slice(0, 16)}`;
  const triggerName = `task5_trigger_${token.slice(0, 16)}`;
  let targetVerified = false;
  let userId: number | undefined;
  const fixtureAlumniIds = new Set<number>();
  let currentSnapshot: AlumniSourceSnapshot;
  let delayNextSourceRead = false;
  let sourceReadCalls = 0;
  let markSourceReadStarted: (() => void) | undefined;
  const sourceReadStarted = new Promise<void>((resolve) => {
    markSourceReadStarted = resolve;
  });
  let resumeSourceRead: (() => void) | undefined;
  const sourceReadResume = new Promise<void>((resolve) => {
    resumeSourceRead = resolve;
  });

  const sourceRecord = (
    rowNumber: number,
    mobile: string,
    generation: string,
    name: string,
  ) => ({
    rowNumber,
    department: "한의학과",
    generation,
    name,
    admissionDate: "2000-03-01",
    graduationDate: "2006-02-20",
    address: `${marker}-address`,
    mobile,
    phone: null,
    group: null,
    status: "active",
    alumniPosition: null,
    memo: `${marker}-memo`,
  });

  try {
    const database = await testPool.query<{ database: string }>(
      "select current_database() as database",
    );
    assert.equal(database.rows[0]?.database, "heliumdb");
    targetVerified = true;

    const collisions = await testPool.query<{
      alumni_count: number;
      user_count: number;
    }>(
      `select
         (select count(*)::int from alumni_database where mobile = any($1::text[])) as alumni_count,
         (select count(*)::int from users where email = $2) as user_count`,
      [mobiles, email],
    );
    assert.deepEqual(
      collisions.rows[0],
      { alumni_count: 0, user_count: 0 },
      "fixture 식별자가 기존 Development 데이터와 충돌하면 테스트를 중단해야 합니다.",
    );

    const user = await testPool.query<{ id: number }>(
      `insert into users (email, name, is_verified, activity_region)
       values ($1, $2, true, '서울특별시') returning id`,
      [email, marker],
    );
    userId = user.rows[0].id;
    const fixtureAlumni = await testPool.query<{ id: number }>(
      `insert into alumni_database
        (department, generation, name, mobile, status, is_matched, matched_user_id)
       values
        ('한의학과', $1, $2, $3, 'old', true, $5),
        ('한의학과', $1, $4, $6, 'database-only', false, null)
       returning id`,
      [marker, `${marker}-existing`, mobiles[0], `${marker}-database-only`, userId, mobiles[1]],
    );
    for (const row of fixtureAlumni.rows) fixtureAlumniIds.add(row.id);

    currentSnapshot = {
      sourceTotal: 2,
      issues: [],
      records: [
        sourceRecord(2, mobiles[0], marker, `${marker}-updated`),
        sourceRecord(3, mobiles[2], marker, `${marker}-inserted`),
      ],
    };
    const { googleSheetsService } = await import("./google-sheets");
    t.mock.method(googleSheetsService, "fetchAlumniSnapshot", async () => {
      sourceReadCalls++;
      const snapshot = currentSnapshot;
      if (delayNextSourceRead) {
        delayNextSourceRead = false;
        markSourceReadStarted?.();
        await sourceReadResume;
      }
      return snapshot;
    });
    const {
      AlumniSyncBlockedError,
      AlumniSyncFingerprintMismatchError,
      AlumniSyncInProgressError,
      storage,
    } = await import("./storage");

    const beforePreview = await testPool.query(
      "select name, status, is_matched, matched_user_id from alumni_database where mobile = any($1::text[]) order by mobile",
      [mobiles],
    );
    const preview = await storage.previewAlumniSync();
    assert.equal(preview.insert, 1);
    assert.equal(preview.update, 1);
    assert.equal(preview.blocked, false);
    assert.match(preview.sourceFingerprint ?? "", /^sha256:[a-f0-9]{64}$/);
    const afterPreview = await testPool.query(
      "select name, status, is_matched, matched_user_id from alumni_database where mobile = any($1::text[]) order by mobile",
      [mobiles],
    );
    assert.deepEqual(afterPreview.rows, beforePreview.rows, "preview는 DB를 변경하면 안 됩니다.");

    const staleFingerprint = preview.sourceFingerprint!;
    delayNextSourceRead = true;
    const staleApply = storage.applyAlumniSync(staleFingerprint);
    await sourceReadStarted;

    currentSnapshot = {
      ...currentSnapshot,
      records: currentSnapshot.records.map((record, index) => index === 0
        ? { ...record, status: "source-changed" }
        : record),
    };
    const freshPreview = await storage.previewAlumniSync();
    const sourceReadsBeforeConcurrentApply = sourceReadCalls;
    let concurrencyFailure: unknown;
    try {
      await assert.rejects(
        storage.applyAlumniSync(freshPreview.sourceFingerprint!),
        AlumniSyncInProgressError,
      );
      assert.equal(
        sourceReadCalls,
        sourceReadsBeforeConcurrentApply,
        "lock을 얻지 못한 apply는 source를 읽으면 안 됩니다.",
      );
    } catch (error) {
      concurrencyFailure = error;
    } finally {
      resumeSourceRead?.();
    }
    await staleApply;
    const freshApply = await storage.applyAlumniSync(freshPreview.sourceFingerprint!);
    assert.equal(freshApply.update, 1);
    const concurrencyRow = await testPool.query<{ status: string }>(
      "select status from alumni_database where mobile = $1",
      [mobiles[0]],
    );
    assert.equal(
      concurrencyRow.rows[0]?.status,
      "source-changed",
      "먼저 시작한 stale apply가 fresh apply 뒤에서 덮어쓰면 안 됩니다.",
    );
    if (concurrencyFailure) throw concurrencyFailure;

    await assert.rejects(
      storage.applyAlumniSync(staleFingerprint),
      AlumniSyncFingerprintMismatchError,
    );

    currentSnapshot = {
      sourceTotal: 1,
      issues: [{ code: "MISSING_REQUIRED_VALUE", count: 1 }],
      records: [{ ...sourceRecord(2, mobiles[0], marker, ""), name: "" }],
    };
    await assert.rejects(
      storage.applyAlumniSync(staleFingerprint),
      AlumniSyncBlockedError,
    );

    currentSnapshot = {
      sourceTotal: 2,
      issues: [],
      records: [
        sourceRecord(2, mobiles[0], marker, `${marker}-updated`),
        sourceRecord(3, mobiles[2], marker, `${marker}-inserted`),
      ],
    };
    const appliedPreview = await storage.previewAlumniSync();
    const applied = await storage.applyAlumniSync(appliedPreview.sourceFingerprint!);
    assert.equal(applied.insert, 0);
    assert.equal(applied.update, 1);
    const appliedRows = await testPool.query<{
      mobile: string;
      name: string;
      status: string;
      is_matched: boolean;
      matched_user_id: number | null;
    }>(
      `select mobile, name, status, is_matched, matched_user_id
         from alumni_database where mobile = any($1::text[]) order by mobile`,
      [mobiles.slice(0, 3)],
    );
    assert.equal(appliedRows.rows.length, 3, "databaseOnly 행은 삭제하면 안 됩니다.");
    const matched = appliedRows.rows.find((row) => row.mobile === mobiles[0]);
    assert.deepEqual(
      { isMatched: matched?.is_matched, matchedUserId: matched?.matched_user_id },
      { isMatched: true, matchedUserId: userId },
    );
    assert.equal(matched?.name, `${marker}-updated`);
    const ownedRows = await testPool.query<{ id: number }>(
      `select id from alumni_database
        where generation = $1 and mobile = any($2::text[])`,
      [marker, mobiles],
    );
    for (const row of ownedRows.rows) fixtureAlumniIds.add(row.id);

    await testPool.query(
      `create function ${functionName}() returns trigger language plpgsql as $$
       begin
         if new.generation = '${marker}-ROLLBACK' then
           raise exception 'task5 fixture failure';
         end if;
         return new;
       end $$`,
    );
    await testPool.query(
      `create trigger ${triggerName} before insert or update on alumni_database
       for each row execute function ${functionName}()`,
    );
    currentSnapshot = {
      sourceTotal: 2,
      issues: [],
      records: [
        sourceRecord(2, mobiles[3], marker, `${marker}-rollback-first`),
        sourceRecord(3, mobiles[4], `${marker}-ROLLBACK`, `${marker}-rollback-fail`),
      ],
    };
    const rollbackPreview = await storage.previewAlumniSync();
    await assert.rejects(storage.applyAlumniSync(rollbackPreview.sourceFingerprint!));
    const rolledBack = await testPool.query<{ count: number }>(
      "select count(*)::int as count from alumni_database where mobile = any($1::text[])",
      [mobiles.slice(3)],
    );
    assert.equal(rolledBack.rows[0]?.count, 0, "apply 오류는 모든 변경을 rollback해야 합니다.");
  } finally {
    try {
      if (targetVerified) {
        await testPool.query(`drop trigger if exists ${triggerName} on alumni_database`);
        await testPool.query(`drop function if exists ${functionName}()`);
        const client = await testPool.connect();
        try {
          await client.query("begin");
          const discoveredFixtureRows = await client.query<{ id: number }>(
            `select id from alumni_database
              where generation = any($1::text[])
                and mobile = any($2::text[])`,
            [[marker, `${marker}-ROLLBACK`], mobiles],
          );
          for (const row of discoveredFixtureRows.rows) fixtureAlumniIds.add(row.id);
          const ownedIds = Array.from(fixtureAlumniIds);
          if (ownedIds.length > 0) {
            await client.query(
              `delete from alumni_database
                where id = any($1::int[])
                  and generation = any($2::text[])
                  and mobile = any($3::text[])`,
              [ownedIds, [marker, `${marker}-ROLLBACK`], mobiles],
            );
          }
          if (userId !== undefined) {
            await client.query("delete from users where id = $1 and email = $2", [userId, email]);
          }
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally {
          client.release();
        }
        const residue = await testPool.query<{
          alumni_count: number;
          user_count: number;
          trigger_count: number;
          function_count: number;
        }>(
          `select
             (select count(*)::int from alumni_database
               where generation = any($1::text[]) and mobile = any($2::text[])) as alumni_count,
             (select count(*)::int from users where id = $3 and email = $4) as user_count,
             (select count(*)::int from pg_trigger where tgname = $5) as trigger_count,
             (select count(*)::int from pg_proc where proname = $6) as function_count`,
          [[marker, `${marker}-ROLLBACK`], mobiles, userId ?? 0, email, triggerName, functionName],
        );
        assert.deepEqual(residue.rows[0], {
          alumni_count: 0,
          user_count: 0,
          trigger_count: 0,
          function_count: 0,
        });
      }
    } finally {
      await testPool.end();
    }
  }
});
