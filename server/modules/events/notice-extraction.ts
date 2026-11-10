import { noticeFactsSchema, type NoticeFacts, type NoticeType } from "@shared/contracts/notices";
import { parseObituaryEventSource } from "./obituary-parser";
import { logNoticeFailure } from "../../lib/safe-logging";
import {
  noticeExtractionInstructions,
  noticeFactsFormat,
  responseSchema,
} from "./notice-extraction-contract";

export class NoticeGenerationError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "NoticeGenerationError";
  }
}

const AI_RESPONSE_LIMIT = 200_000;

export async function extractNoticeFacts(
  type: NoticeType,
  input: string,
  sourceText: string,
  signal: AbortSignal,
): Promise<NoticeFacts> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    logNoticeFailure("extraction", "configuration_missing", { keyConfigured: false });
    throw new NoticeGenerationError(
      "경조사 작성 기능을 준비 중입니다. 관리자에게 OpenAI API 설정을 요청해 주세요. 입력한 내용은 초안에 저장됩니다.",
      503,
    );
  }

  const hints = type === "obituary" ? parseObituaryEventSource(sourceText).draft : null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_NOTICE_MODEL || "gpt-6-luna",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 6000,
      input: [
        { role: "system", content: noticeExtractionInstructions },
        {
          role: "user",
          content: JSON.stringify({
            type,
            input,
            publicSourceText: sourceText.slice(0, 60_000),
            staticHints: hints,
          }),
        },
      ],
      text: { format: noticeFactsFormat },
    }),
  }).catch((error: unknown) => {
    logNoticeFailure("extraction", "request_failed", { aborted: signal.aborted });
    throw error;
  });

  if (!response.ok) {
    logNoticeFailure("extraction", "http_error", { httpStatus: response.status });
    throw new NoticeGenerationError(
      "AI 작성 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      response.status === 429 ? 429 : 502,
    );
  }
  const raw = await response.text().catch((error: unknown) => {
    logNoticeFailure("extraction", "response_read_failed", {
      httpStatus: response.status,
      aborted: signal.aborted,
    });
    throw error;
  });
  return parseNoticeFactsResponse(raw);
}

function parseNoticeFactsResponse(raw: string): NoticeFacts {
  if (raw.length > AI_RESPONSE_LIMIT) {
    logNoticeFailure("extraction", "response_limit", {
      responseChars: raw.length,
      maxResponseChars: AI_RESPONSE_LIMIT,
    });
    throw new NoticeGenerationError("AI 응답이 너무 깁니다. 입력을 간단히 정리해 주세요.");
  }

  let responseData: unknown;
  try {
    responseData = JSON.parse(raw);
  } catch (error) {
    logNoticeFailure("extraction", "response_json_invalid", { responseChars: raw.length });
    throw error;
  }
  const parsed = responseSchema.safeParse(responseData);
  if (!parsed.success || parsed.data.status !== "completed") {
    logNoticeFailure("extraction", "response_incomplete", {
      schemaValid: parsed.success,
      completed: parsed.success && parsed.data.status === "completed",
      issueCount: parsed.success ? 0 : parsed.error.issues.length,
    });
    throw new NoticeGenerationError(
      "작성을 끝내지 못했습니다. 내용을 보완한 뒤 다시 시도해 주세요.",
    );
  }

  const content = parsed.data.output.flatMap((item) => item.content ?? []);
  const refusalCount = content.filter((part) => part.type === "refusal").length;
  if (refusalCount > 0) {
    logNoticeFailure("extraction", "refusal", { refusalCount });
    throw new NoticeGenerationError("입력 내용을 확인하고 다시 작성해 주세요.");
  }
  const text = content
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
  try {
    return noticeFactsSchema.parse(JSON.parse(text));
  } catch {
    logNoticeFailure("extraction", "facts_invalid", { outputChars: text.length });
    throw new NoticeGenerationError("작성 정보를 해석하지 못했습니다. 다시 시도해 주세요.");
  }
}

/** 명확한 공개 JSON에 이름·학번만 보충하는 경우 LLM을 호출하지 않는다. */
export function staticObituaryFacts(
  input: string,
  urls: string[],
  provider?: NoticeFacts,
): NoticeFacts | undefined {
  if (!provider || urls.length !== 1) return;
  let rest = input;
  for (const url of urls) rest = rest.split(url).join("");
  rest = rest.trim();
  if (!rest) return provider;
  const match =
    /^(?:(\d{2}|\d{4})\s*학번\s*)?([가-힣]{2,5})\s*(?:동문|권리회원|정회원|회원)?(?:\s*(본인|부친|모친|빙부|빙모|시부|시모|자녀)상)?[.\s]*$/.exec(
      rest,
    );
  if (!match) return;
  return {
    ...provider,
    memberName: match[2],
    admissionYear: match[1] || null,
    relation: match[3] || provider.relation,
  };
}
