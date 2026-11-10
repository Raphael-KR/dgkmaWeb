function requiredText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function graduationClassLabel(value: unknown): string | undefined {
  const text = requiredText(value);
  if (!text) return undefined;
  const match = /^(?:제\s*)?(\d+)\s*기?$/.exec(text);
  if (!match) return undefined;
  const generation = Number(match[1]);
  return Number.isInteger(generation) && generation > 0 ? `${generation}기` : undefined;
}

export function admissionYearLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const normalized = value
    .trim()
    .replace(/[./]/g, "-")
    .replace(/\s*년\s*/, "-")
    .replace(/\s*월\s*/, "-")
    .replace(/\s*일\s*$/, "")
    .replace(/\s/g, "");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${String(year % 100).padStart(2, "0")}학번`;
}
