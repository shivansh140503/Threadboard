/** Money is stored as integer minor units (paise, cents). Never floats. */

const SYMBOLS: Record<string, string> = {
  '₹': 'INR',
  RS: 'INR',
  'RS.': 'INR',
  INR: 'INR',
  RUPEES: 'INR',
  $: 'USD',
  USD: 'USD',
  '£': 'GBP',
  GBP: 'GBP',
  '€': 'EUR',
  EUR: 'EUR',
};

export function normaliseCurrency(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const key = raw.trim().toUpperCase();
  if (SYMBOLS[key]) return SYMBOLS[key];
  return /^[A-Z]{3}$/.test(key) ? key : fallback;
}

/** Convert a major-unit amount (e.g. 1500.5) to integer minor units (150050). */
export function toMinor(amountMajor: number): number {
  if (!Number.isFinite(amountMajor) || amountMajor < 0) return 0;
  return Math.round(amountMajor * 100);
}

/** Parse what a user types ("1,500.50") into minor units, or null if invalid. */
export function parseMajorInput(input: string): number | null {
  const cleaned = input.replace(/[,\s₹$£€]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}
