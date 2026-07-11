export function uniqueAlumniMatch<T>(records: readonly T[]): T | undefined {
  return records.length === 1 ? records[0] : undefined;
}
