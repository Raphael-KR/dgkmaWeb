import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePhoneForComparison } from "./storage";

const routesPath = new URL("./routes.ts", import.meta.url);
const storagePath = new URL("./storage.ts", import.meta.url);

test("Kakao login uses PostgreSQL alumni matching without Google Sheets", async () => {
  const routesSource = await readFile(routesPath, "utf8");
  const authorizeRoute = routesSource.slice(
    routesSource.indexOf('app.post("/api/auth/kakao/authorize"'),
    routesSource.indexOf('app.get("/api/auth/me"'),
  );

  assert.doesNotMatch(authorizeRoute, /findAlumniByPhoneAndName|\.\/google-sheets/);
  assert.match(authorizeRoute, /getUserByNormalizedPhone/);
  assert.match(authorizeRoute, /createUserWithAlumniClaim/);
});

test("storage compares normalized phone numbers and claims one unlinked alumni row", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const claimMethod = storageSource.slice(
    storageSource.indexOf("async claimAlumniRecord("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );

  assert.match(storageSource, /getUserByNormalizedPhone\(phoneNumber: string\)/);
  assert.match(storageSource, /claimAlumniRecord\(name: string, phoneNumber: string, userId: number\)/);
  assert.match(claimMethod, /db\.transaction/);
  assert.match(claimMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(claimMethod, /normalizePhoneForComparison/);
});

test("member creation and alumni claim share one database transaction", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const registrationMethod = storageSource.slice(
    storageSource.indexOf("async createUserWithAlumniClaim("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );

  assert.match(registrationMethod, /db\.transaction/);
  assert.match(registrationMethod, /tx\.insert\(users\)/);
  assert.match(registrationMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(registrationMethod, /throw new AlumniClaimConflictError/);
});

test("phone normalization compares Kakao country code with domestic alumni numbers", () => {
  assert.equal(normalizePhoneForComparison("+82 10-9876-5432"), "01098765432");
  assert.equal(normalizePhoneForComparison("010-9876-5432"), "01098765432");
  assert.equal(
    normalizePhoneForComparison("+82 (0)10 9876 5432"),
    normalizePhoneForComparison("010.9876.5432"),
  );
});

test("transactional alumni lookup uses the same normalized phone SQL expression", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const registrationMethod = storageSource.slice(
    storageSource.indexOf("async createUserWithAlumniClaim("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );

  assert.match(storageSource, /function normalizedPhoneSql/);
  assert.match(registrationMethod, /normalizedPhoneSql\(alumniDatabase\.mobile\)/);
  assert.doesNotMatch(
    registrationMethod,
    /regexp_replace\(coalesce\(\$\{alumniDatabase\.mobile\}/,
  );
});

test("atomic registration locks the phone before rechecking users and inserting", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const registrationMethod = storageSource.slice(
    storageSource.indexOf("async createUserWithAlumniClaim("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );
  const lockIndex = registrationMethod.indexOf("pg_advisory_xact_lock");
  const userRecheckIndex = registrationMethod.indexOf("tx.select().from(users)");
  const insertIndex = registrationMethod.indexOf("tx.insert(users)");

  assert.ok(lockIndex >= 0, "normalized phone advisory lock is required");
  assert.ok(userRecheckIndex > lockIndex, "existing users must be checked after the lock");
  assert.ok(insertIndex > userRecheckIndex, "insert must happen after the locked user check");
  assert.match(registrationMethod, /throw new PhoneRegistrationConflictError/);
});
