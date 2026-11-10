import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const serverRoot = new URL("../", import.meta.url);

export function readServerSource(path: string): Promise<string> {
  return readFile(new URL(path, serverRoot), "utf8");
}

// 구현을 import하지 않고 선언 본문만 읽는다. 파일 이동·이름 변경으로 검사 대상이
// 사라지면 빈 문자열을 검사하지 않고 실제 발견 개수와 함께 실패한다.
export async function readDeclarationSource(path: string, name: string): Promise<string> {
  const source = ts.createSourceFile(
    path,
    await readServerSource(path),
    ts.ScriptTarget.Latest,
    true,
  );
  const matches: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.body
    ) {
      matches.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(
    matches.length,
    1,
    `${path}: expected one implementation of ${name}, found ${matches.length}`,
  );
  return matches[0];
}

export async function readRouteSource(): Promise<string> {
  const paths = [
    "modules/identity/routes.ts",
    "modules/identity/kakao-authorization.ts",
    "modules/identity/profile-routes.ts",
    "modules/content/routes.ts",
    "modules/events/routes.ts",
    "modules/dues/routes.ts",
    "modules/registry/routes.ts",
    "integrations/object-storage/routes.ts",
  ];
  return (await Promise.all(paths.map(readServerSource))).join("\n");
}
