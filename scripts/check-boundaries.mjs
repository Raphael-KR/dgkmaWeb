import ts from "typescript";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const roots = ["client/src", "server", "shared"];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.[cm]?tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}
const files = roots.flatMap(walk);
const graph = new Map();
const errors = [];
function targetOf(from, spec) {
  const base = spec.startsWith("@/") ? `client/src/${spec.slice(2)}`
    : spec.startsWith("@shared/") ? `shared/${spec.slice(8)}`
    : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null;
  if (!base) return null;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(existsSync);
}
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const edges = [];
  function visit(node) {
    const spec = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
    if (spec && ts.isStringLiteral(spec)) {
      const target = targetOf(file, spec.text);
      const browser = file.startsWith("client/") || file.startsWith("shared/contracts/") || file.startsWith("shared/domain/");
      if (browser && (target?.startsWith("server/") || target === "shared/schema.ts" || /^(node:|drizzle-|pg$|express$)/.test(spec.text))) {
        errors.push(`${file}: browser boundary imports ${spec.text}`);
      }
      if (file.startsWith("shared/") && target?.startsWith("client/")) errors.push(`${file}: shared imports client`);
      if (/^client\/src\/(hooks|lib|components)\//.test(file) && target?.startsWith("client/src/features/")) {
        errors.push(`${file}: common code imports feature ${target}`);
      }
      if (target?.startsWith("artifacts/")) errors.push(`${file}: application imports sandbox`);
      const owner = file.match(/^client\/src\/features\/([^/]+)\//)?.[1];
      const other = target?.match(/^client\/src\/features\/([^/]+)\/(.+)$/);
      if (other && owner !== other[1] && other[2] !== "index.ts") {
        errors.push(`${file}: use feature public API instead of ${target}`);
      }
      // Type-only dependencies do not create runtime cycles.
      const typeOnly = ts.isImportDeclaration(node) && node.importClause?.isTypeOnly
        || ts.isExportDeclaration(node) && node.isTypeOnly;
      if (target && !typeOnly) edges.push(target);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  graph.set(file, edges);
}
const done = new Set(), active = [];
function check(file) {
  if (active.includes(file)) {
    errors.push(`Runtime cycle: ${[...active.slice(active.indexOf(file)), file].join(" -> ")}`);
    return;
  }
  if (done.has(file)) return;
  active.push(file);
  for (const edge of graph.get(file) ?? []) check(edge);
  active.pop();
  done.add(file);
}
for (const file of files) check(file);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(`Boundary and runtime cycle checks passed (${files.length} application files; sandbox excluded).`);
