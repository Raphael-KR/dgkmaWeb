import { migratePostBody } from "../server/modules/content/post-body-migration";

const mode = process.argv[2];
if (process.argv.length !== 3 || (mode !== "--preview" && mode !== "--apply"))
  throw new Error("Use --preview or --apply");
const result = await migratePostBody(
  mode === "--apply" ? "apply" : "preview",
  ".superpowers/post-body-jsonb-release-20261109",
  "production",
);
console.log(JSON.stringify(result));
