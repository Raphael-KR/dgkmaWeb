import type { NoticeType } from "@shared/contracts/notices";
import { assertSafeSourceUrl } from "../../modules/events/event-source-policy";
import { CollectionBudget } from "./collection-http";
import type {
  CollectionResult,
  FieldEvidence,
  JsonObservation,
  RuleStore,
} from "./collection-contract";

// 단계가 바뀌어도 한 수집 요청의 예산·관찰·진단을 새로 만들지 않는다.
export class CollectionContext {
  readonly url: string;
  readonly budget: CollectionBudget;
  readonly stages: string[] = [];
  readonly warnings: string[] = [];
  readonly observations: JsonObservation[] = [];
  browser = false;
  ocrImages = 0;
  browserStats: CollectionResult["diagnostics"]["browserStats"];
  text = "";
  evidence: FieldEvidence[] = [];
  scripts: string[] = [];
  inline = "";

  constructor(
    page: string,
    readonly store: RuleStore,
    signal: AbortSignal | undefined,
    readonly noticeType: NoticeType,
  ) {
    this.url = assertSafeSourceUrl(page).href;
    this.budget = new CollectionBudget(signal);
  }

  result(
    method: CollectionResult["method"],
    text: string,
    evidence: FieldEvidence[],
    rule?: CollectionResult["diagnostics"]["rule"],
  ): CollectionResult {
    return {
      method,
      text: text.slice(0, 40_000),
      evidence: evidence.slice(0, 100),
      diagnostics: {
        stages: this.stages,
        requests: this.budget.requests,
        bytes: this.budget.bytes,
        browser: this.browser,
        ocrImages: this.ocrImages,
        browserStats: this.browserStats,
        rule,
        warnings: this.warnings,
      },
    };
  }
}
