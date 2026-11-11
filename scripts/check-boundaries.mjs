import ts from "typescript";
import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const roots = ["client/src", "server", "shared"];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory()
      ? e.name === "tests" || e.name === "testing" || e.name === "__tests__"
        ? []
        : walk(p)
      : /\.[cm]?tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)
        ? [p]
        : [];
  });
}
const files = roots.flatMap(walk);
const errors = [];
function targetOf(from, spec) {
  const base = spec.startsWith("@/")
    ? `client/src/${spec.slice(2)}`
    : spec.startsWith("@shared/")
      ? `shared/${spec.slice(8)}`
      : spec.startsWith(".")
        ? normalize(join(dirname(from), spec))
        : null;
  if (!base) return null;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}
for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    const spec =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : null;
    if (spec && ts.isStringLiteral(spec)) {
      const target = targetOf(file, spec.text);
      const sharedBrowser = file.startsWith("shared/") && file !== "shared/schema.ts";
      const browser = file.startsWith("client/") || sharedBrowser;
      const forbiddenTarget =
        target &&
        (sharedBrowser
          ? !target.startsWith("shared/") || target === "shared/schema.ts"
          : target.startsWith("server/") || target === "shared/schema.ts");
      if (
        browser &&
        (forbiddenTarget || /^(node:|drizzle-|pg(?:-core)?$|express$)/.test(spec.text))
      ) {
        errors.push(`${file}: browser boundary imports ${spec.text}`);
      }
      if (target?.startsWith("artifacts/")) errors.push(`${file}: application imports sandbox`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(
  `Browser/server and sandbox boundary checks passed (${files.length} application files; sandbox excluded).`,
);
