const MAX_MINOR = BigInt("999999999999");
const AUTO_NUMBER = /^INV-\d{4}-$/;

export class MoneyInputError extends Error {
  readonly reason: "REQUIRED" | "FORMAT" | "POSITIVE" | "TOO_LARGE";

  constructor(reason: "REQUIRED" | "FORMAT" | "POSITIVE" | "TOO_LARGE") {
    super(reason);
    this.name = "MoneyInputError";
    this.reason = reason;
  }
}

export function majorAmountToMinor(value: string, options: { positive?: boolean } = {}) {
  const normalized = value.trim();
  if (!normalized) throw new MoneyInputError("REQUIRED");
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new MoneyInputError("FORMAT");
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (options.positive !== false && minor <= BigInt(0)) throw new MoneyInputError("POSITIVE");
  if (minor > MAX_MINOR) throw new MoneyInputError("TOO_LARGE");
  return minor;
}

export function requestedInvoiceNumber(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return !normalized || AUTO_NUMBER.test(normalized) ? null : normalized;
}

export function invoiceNumberPrefix(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new RangeError("Invalid invoice year.");
  return `INV-${year}-`;
}

export function nextInvoiceNumber(existingNumbers: string[], year: number) {
  const prefix = invoiceNumberPrefix(year);
  const highest = existingNumbers.reduce((current, number) => {
    if (!number.startsWith(prefix)) return current;
    const suffix = number.slice(prefix.length);
    return /^\d{6}$/.test(suffix) ? Math.max(current, Number(suffix)) : current;
  }, 0);
  if (highest >= 999_999) throw new RangeError("The annual invoice sequence is exhausted.");
  return `${prefix}${String(highest + 1).padStart(6, "0")}`;
}
