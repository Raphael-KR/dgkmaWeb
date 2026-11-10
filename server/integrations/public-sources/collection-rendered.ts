import { browserCollect } from "./collection-browser";
import { enoughFields, evidenceText, meaningfulText, textFields } from "./collection-fields";
import { collectDiscoveredApi } from "./collection-discovery";
import type { CollectionContext } from "./collection-context";

export async function collectRenderedContent(run: CollectionContext) {
  const { url, budget, noticeType, observations, stages, warnings } = run;
  stages.push("playwright-fetch-xhr-render");
  run.browser = true;
  try {
    const rendered = await browserCollect(url, budget, observations, noticeType);
    run.browserStats = rendered.stats;
    run.ocrImages = rendered.stats.ocrImages;
    if (!rendered.blocked) {
      run.text = rendered.segments.map((segment) => segment.text).join("\n");
      run.evidence = [
        ...rendered.segments.flatMap((segment) =>
          textFields(segment.text, segment.url, segment.kind, segment.locator, noticeType),
        ),
        ...run.evidence,
      ];
    }
    const api = await collectDiscoveredApi(run);
    if (api) return api;
    if (rendered.blocked) {
      warnings.push("access_challenge");
    } else {
      if (meaningfulText(run.text, noticeType) || enoughFields(run.evidence, noticeType)) {
        if (run.ocrImages) stages.push("image-ocr");
        return run.result(
          run.ocrImages ? "ocr" : "browser",
          [run.text, evidenceText(run.evidence, noticeType)].join("\n"),
          run.evidence,
        );
      }
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    warnings.push(
      [
        "launch_failed",
        "navigation_failed",
        "render_failed",
        "ocr_failed",
        "collector_worker_exit",
        "collector_browser_timeout",
        "collector_capacity",
        "collector_cancelled",
        "collector_message_limit",
      ].includes(code)
        ? code
        : "browser_unavailable",
    );
    // 렌더링이 중단되기 전에 수집된 JSON 관찰도 기존 순서대로 재호출해 확인한다.
    const api = await collectDiscoveredApi(run);
    if (api) return api;
  }
}
