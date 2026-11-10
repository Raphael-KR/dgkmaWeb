import type { NoticeType } from "@shared/contracts/notices";
import { CollectionContext } from "./collection-context";
import { collectStoredRule } from "./collection-stored-rules";
import { collectInitialContent, collectScriptObservations } from "./collection-static";
import { collectDiscoveredApi } from "./collection-discovery";
import { collectRenderedContent } from "./collection-rendered";
import { evidenceText, hasEventIdentity } from "./collection-fields";
import type { CollectionResult, RuleStore } from "./collection-contract";

/** 모든 단계는 같은 공개 주소·DNS·리다이렉트·응답 크기 검사를 통과한다. LLM은 호출하지 않는다. */
export async function collectPublicNotice(
  page: string,
  store: RuleStore,
  signal?: AbortSignal,
  noticeType: NoticeType = "obituary",
): Promise<CollectionResult> {
  const run = new CollectionContext(page, store, signal, noticeType);
  const saved = await collectStoredRule(run);
  if (saved) return saved;

  const initial = await collectInitialContent(run);
  if (initial) return initial;

  await collectScriptObservations(run);
  const staticApi = await collectDiscoveredApi(run);
  if (staticApi) return staticApi;

  const rendered = await collectRenderedContent(run);
  if (rendered) return rendered;

  if (hasEventIdentity(run.evidence, noticeType)) {
    run.warnings.push("partial_event_facts");
    return run.result(
      run.browser ? (run.ocrImages ? "ocr" : "browser") : "static-html",
      evidenceText(run.evidence, noticeType),
      run.evidence,
    );
  }
  // HTTP 200의 빈 화면·탐색·접근 확인 페이지를 수집 성공으로 처리하지 않는다.
  throw new CollectionUnavailableError({
    stages: run.stages,
    warnings: run.warnings,
    requests: run.budget.requests,
    bytes: run.budget.bytes,
    browser: run.browser,
    ocrImages: run.ocrImages,
    browserStats: run.browserStats,
  });
}

export class CollectionUnavailableError extends Error {
  constructor(public readonly diagnostics: CollectionResult["diagnostics"]) {
    super("public_event_content_unavailable");
  }
}
