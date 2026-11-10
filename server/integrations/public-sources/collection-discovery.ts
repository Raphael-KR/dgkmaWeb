import { permittedBrowserRequest } from "./collection-http";
import { applyRule, buildRule, ruleUrl } from "./collection-rules";
import { evidenceText } from "./collection-fields";
import type { CollectionContext } from "./collection-context";
import type { CollectionResult } from "./collection-contract";

export async function collectDiscoveredApi(
  run: CollectionContext,
): Promise<CollectionResult | undefined> {
  const { url, budget, store, noticeType, observations, stages, warnings } = run;
  // 이미 처리한 관찰은 소비하고, 이후 브라우저에서 추가된 관찰만 다음 호출에서 처리한다.
  for (const observation of observations.splice(0)) {
    try {
      const rule = buildRule(url, observation.url, observation.value, noticeType);
      if (!rule || !permittedBrowserRequest(observation.url, "GET", "fetch")) continue;
      // 브라우저 관찰만으로 저장하지 않고 쿠키·인증 없는 읽기 재호출을 먼저 확인한다.
      const response = await budget.read(ruleUrl(rule, url)!);
      if (!/json/.test(response.contentType)) continue;
      const found = applyRule(
        rule,
        JSON.parse(response.body.toString("utf8")),
        response.url,
        noticeType,
      );
      if (!found) continue;
      stages.push("anonymous-api-replay");
      const persisted = await store.save(rule).catch(() => {
        warnings.push("rule_save_failed");
        return undefined;
      });
      return run.result(
        "discovered-api",
        [evidenceText(found, noticeType), run.browser ? run.text : ""].filter(Boolean).join("\n"),
        [...found, ...(run.browser ? run.evidence : [])],
        persisted && { ...persisted, reused: false },
      );
    } catch {
      // 재사용 가능한 공개 읽기를 확인하지 못했으므로 다른 수집 경로를 계속한다.
    }
  }
}
