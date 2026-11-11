export function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }
  return "UnknownError";
}

export function logObjectStorageFailure(
  stage: "upload" | "upload-url" | "serve" | "download" | "stream",
  error: unknown,
  validation: Record<string, string | number | boolean> = {},
): void {
  try {
    const details =
      error && typeof error === "object" ? (error as { code?: unknown; statusCode?: unknown }) : {};
    const status = details.statusCode ?? details.code;
    console.error("Object storage operation failed", {
      stage,
      validation,
      errorType: getErrorType(error),
      httpStatus:
        typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
          ? status
          : null,
      privateDataOmitted: true,
    });
  } catch {
    // 진단 실패가 업로드·다운로드의 원래 오류 처리를 덮지 않게 한다.
  }
}

// 본문·회원 식별자·인증정보 대신 정해진 단계/코드와 판정에 쓴 수치·상태만 받는다.
export function logNoticeFailure(
  stage: "writer" | "extraction",
  code: string,
  facts: Record<string, number | boolean | null>,
): void {
  try {
    console.error("Notice processing failed", { stage, code, ...facts, privateDataOmitted: true });
  } catch {
    // 진단 출력 실패가 원래 작성 오류를 덮지 않게 한다.
  }
}
