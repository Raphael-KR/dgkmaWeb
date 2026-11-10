import { permittedBrowserRequest } from "./collection-http";
import { applyRule, ruleUrl } from "./collection-rules";
import { evidenceText } from "./collection-fields";
import type { CollectionContext } from "./collection-context";

export async function collectStoredRule(run: CollectionContext) {
  const { url, budget, store, noticeType, warnings, stages } = run;
  stages.push("stored-rules");
  const saved = await store.find(new URL(url).hostname).catch(() => {
    warnings.push("rule_read_failed");
    return [];
  });
  for (const entry of saved) {
    if (!(entry.rule.noticeTypes ?? ["obituary"]).includes(noticeType)) continue;
    try {
      const endpoint = ruleUrl(entry.rule, url);
      if (!endpoint || !permittedBrowserRequest(endpoint, "GET", "fetch")) continue;
      const response = await budget.read(endpoint);
      if (!/json/.test(response.contentType)) throw Error("rule_content_type");
      const evidence = applyRule(
        entry.rule,
        JSON.parse(response.body.toString("utf8")),
        response.url,
        noticeType,
      );
      if (!evidence) throw Error("rule_shape_changed");
      await store.succeeded(entry.id).catch(() => warnings.push("rule_touch_failed"));
      return run.result("stored-rule", evidenceText(evidence, noticeType), evidence, {
        id: entry.id,
        version: entry.version,
        reused: true,
      });
    } catch {
      warnings.push("rule_stale");
    }
  }
}
