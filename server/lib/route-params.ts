const POSTGRES_SERIAL_MAX = 2_147_483_647;

export function parsePositiveInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= POSTGRES_SERIAL_MAX ? parsed : undefined;
}
