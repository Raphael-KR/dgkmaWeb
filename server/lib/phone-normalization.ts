export function normalizePhoneForComparison(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits.startsWith("82")) return digits;

  const domesticNumber = digits.slice(2);
  return domesticNumber.startsWith("0") ? domesticNumber : `0${domesticNumber}`;
}
