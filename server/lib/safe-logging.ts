export function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }
  return "UnknownError";
}
