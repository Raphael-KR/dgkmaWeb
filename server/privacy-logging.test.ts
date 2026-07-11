import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const protectedFiles = [
  "routes.ts",
  "google-sheets.ts",
  "google-sheets-old.ts",
  "storage.ts",
];

const sensitiveIdentifiers = new Set([
  "rows",
  "row",
  "user",
  "finalUser",
  "userInfo",
  "userData",
  "alumniData",
  "googleResults",
  "name",
  "email",
  "mobile",
  "phone",
  "phoneNumber",
  "address",
  "birthday",
  "kakaoId",
  "accessToken",
  "code",
  "error",
  "err",
]);

const sensitiveProperties = new Set([
  "name",
  "email",
  "mobile",
  "phone",
  "phoneNumber",
  "address",
  "birthday",
  "kakaoId",
  "accessToken",
  "userData",
]);

function isConsoleCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "console";
}

function containsSensitiveValue(node: ts.Node): boolean {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return false;
  }
  if (
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "getErrorType"
  ) {
    return false;
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === "length") {
      return false;
    }
    if (sensitiveProperties.has(node.name.text)) {
      return true;
    }
  }
  if (
    ts.isElementAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && (node.expression.text === "rows" || node.expression.text === "row")
  ) {
    return true;
  }
  if (ts.isIdentifier(node) && sensitiveIdentifiers.has(node.text)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsSensitiveValue(child)) {
      found = true;
    }
  });
  return found;
}

test("protected server logs contain no personal source values", async () => {
  const violations: string[] = [];

  for (const fileName of protectedFiles) {
    const fileUrl = new URL(`./${fileName}`, import.meta.url);
    const source = await readFile(fileUrl, "utf8");
    const sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    function visit(node: ts.Node): void {
      if (isConsoleCall(node) && node.arguments.some(containsSensitiveValue)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        violations.push(`${fileName}:${line}`);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  assert.deepEqual(violations, []);
});
