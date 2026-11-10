import { migratePostBody } from "../server/modules/content/post-body-migration";

const mode = process.argv[2];
if (mode !== "--preview" && mode !== "--apply") throw new Error("Use --preview or --apply");
const result = await migratePostBody(
  mode === "--apply" ? "apply" : "preview",
  ".superpowers/post-body-jsonb-20261109",
);
console.log(JSON.stringify(result));
