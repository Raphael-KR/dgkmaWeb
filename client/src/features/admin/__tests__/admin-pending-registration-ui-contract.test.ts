import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHookPath = new URL("../use-pending-registrations.ts", import.meta.url);
const adminPanelPath = new URL("../pending-registrations-panel.tsx", import.meta.url);

function pendingQuerySource(source: string): string {
  const start = source.search(/const\s*\{\s*data:\s*pendingRegistrations\b/);
  const end = source.indexOf("const updateRegistrationMutation");
  assert.ok(start >= 0 && end > start, "pending query declaration must precede the mutation");
  return source.slice(start, end);
}

test("admin approval mutation rejects non-OK responses with the server message", async () => {
  const source = await readFile(adminHookPath, "utf8");
  const mutation = source.slice(
    source.indexOf("const updateRegistrationMutation"),
    source.indexOf("const handleApprove"),
  );

  assert.match(mutation, /if\s*\(!response\.ok\)/);
  assert.match(mutation, /typeof\s+responseBody\.message\s*===\s*["']string["']/);
  assert.match(mutation, /throw new Error\(responseBody\.message\)/);
  assert.match(mutation, /onError:\s*\(error\)/);
  assert.match(mutation, /description:\s*error instanceof Error \? error\.message/);
});

test("admin pending query rejects HTTP errors and non-array payloads", async () => {
  const source = await readFile(adminHookPath, "utf8");
  const query = pendingQuerySource(source);

  assert.match(query, /if\s*\(!response\.ok\)/);
  assert.match(query, /typeof\s+responseBody\.message\s*===\s*["']string["']/);
  assert.match(query, /throw new Error\(responseBody\.message\)/);
  assert.match(query, /Array\.isArray\(responseBody\)/);
  assert.match(query, /throw new Error\(["']가입 대기 목록 응답 형식이 올바르지 않습니다\.["']\)/);
});

test("admin pending component renders a destructive query error instead of the empty state", async () => {
  const source = await readFile(adminHookPath, "utf8");
  const query = pendingQuerySource(source);
  const pendingTab = await readFile(adminPanelPath, "utf8");

  assert.match(query, /isError/);
  assert.match(query, /\berror\b/);
  assert.match(
    pendingTab,
    /import \{ Alert, AlertDescription, AlertTitle \} from "@\/components\/ui\/alert"/,
  );
  assert.match(pendingTab, /isError\s*\?/);
  assert.match(pendingTab, /<Alert variant="destructive">/);
  assert.match(pendingTab, /<AlertTitle>가입 대기 목록 조회 실패<\/AlertTitle>/);
  assert.match(pendingTab, /error instanceof Error \? error\.message/);

  const errorBranch = pendingTab.indexOf("isError ?");
  const emptyBranch = pendingTab.indexOf("pendingRegistrations?.length === 0");
  assert.ok(errorBranch >= 0 && errorBranch < emptyBranch);
});

test("admin pending hooks use the approved DTO types", async () => {
  const adminSource = await readFile(adminHookPath, "utf8");
  assert.match(
    adminSource,
    /import\s+type\s+\{\s*AdminPendingRegistrationDto,\s*AdminPendingRegistrationUpdateResult,?\s*\}\s+from\s+"@shared\/contracts"/,
  );
  assert.match(adminSource, /useQuery<AdminPendingRegistrationDto\[]>/);
  assert.match(adminSource, /useMutation<\s*AdminPendingRegistrationUpdateResult/);
  assert.doesNotMatch(adminSource, /map\(\(registration:\s*any\)/);
});
