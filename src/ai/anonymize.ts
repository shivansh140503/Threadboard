/**
 * Swap participant names, phone numbers and emails for tokens before text
 * leaves the device, and map tokens back locally afterwards.
 * Amounts are kept: budget extraction needs them.
 */

export type Anonymizer = {
  /** Replace names/numbers/emails in free text. */
  forward(text: string): string;
  /** Token for a sender name (participants only). */
  sender(name: string): string;
  /** Replace tokens in AI output with the original values. */
  back(text: string): string;
  readonly enabled: boolean;
};

export const identityAnonymizer: Anonymizer = {
  forward: (t) => t,
  sender: (n) => n,
  back: (t) => t,
  enabled: false,
};

function letters(i: number): string {
  // 0 → A, 25 → Z, 26 → AA ...
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PHONE_RE = /\+?\d[\d\s-]{7,}\d/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export function createAnonymizer(participants: string[]): Anonymizer {
  const tokenOf = new Map<string, string>(); // lowercased variant → token
  const original = new Map<string, string>(); // token → original
  const senderToken = new Map<string, string>();

  participants.forEach((name, i) => {
    const token = `Person ${letters(i)}`;
    senderToken.set(name, token);
    original.set(token, name);
    tokenOf.set(name.toLowerCase(), token);
  });

  // First names as aliases, when unambiguous ("Meera" for "Meera Iyer").
  const firstCounts = new Map<string, number>();
  const firstOf = (n: string) => (n.split(/\s+/)[0] ?? '').toLowerCase();
  for (const p of participants) firstCounts.set(firstOf(p), (firstCounts.get(firstOf(p)) ?? 0) + 1);
  for (const p of participants) {
    const first = firstOf(p);
    if ([...first].length >= 3 && firstCounts.get(first) === 1 && !/\d/.test(first) && !tokenOf.has(first)) {
      tokenOf.set(first, senderToken.get(p)!);
    }
  }

  const variants = [...tokenOf.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const nameRe = variants.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${variants.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
    : null;

  const phoneTokens = new Map<string, string>();
  const emailTokens = new Map<string, string>();
  const numbered = (map: Map<string, string>, prefix: string, value: string) => {
    const key = prefix === 'Phone' ? value.replace(/\D/g, '') : value.toLowerCase();
    let token = map.get(key);
    if (!token) {
      token = `${prefix} ${map.size + 1}`;
      map.set(key, token);
      original.set(token, value);
    }
    return token;
  };

  return {
    enabled: true,
    sender: (name) => senderToken.get(name) ?? name,
    forward(text) {
      let out = text.replace(EMAIL_RE, (m) => numbered(emailTokens, 'Email', m));
      if (nameRe) out = out.replace(nameRe, (m) => tokenOf.get(m.toLowerCase()) ?? m);
      // 10+ digits only, so dates ("2026-11-21") and amounts stay untouched.
      out = out.replace(PHONE_RE, (m) =>
        m.replace(/\D/g, '').length >= 10 ? numbered(phoneTokens, 'Phone', m.trim()) : m,
      );
      return out;
    },
    back(text) {
      return text.replace(/\b(Person [A-Z]{1,2}|Phone \d+|Email \d+)\b/g, (m) => original.get(m) ?? m);
    },
  };
}
