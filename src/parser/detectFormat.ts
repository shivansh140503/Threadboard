import type { ChatFormat, DateOrder } from './types';

export type Platform = 'android' | 'ios';

// Groups: 1 = first date part, 2 = second date part, 3 = year,
//         4 = hour, 5 = minute, 6 = second (optional), 7 = a/p (optional), 8 = rest of line
const DATE = String.raw`(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})`;
const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?`;
const AMPM = String.raw`(?:\s?([AaPp])\.?\s?[Mm]\.?)?`;

/** `21/11/26, 14:05 - Name: text` and `21/11/26, 2:05 pm - Name: text` */
export const ANDROID_HEADER = new RegExp(String.raw`^${DATE},?\s${TIME}${AMPM}\s[-–]\s(.*)$`);
/** `[21/11/26, 14:05:33] Name: text` and `[21/11/26, 2:05:33 PM] Name: text` */
export const IOS_HEADER = new RegExp(String.raw`^\[${DATE},?\s${TIME}${AMPM}\]\s?(.*)$`);

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

/** Remove direction marks, BOM and other invisible characters. */
export function stripInvisible(s: string): string {
  return s.replace(INVISIBLE, '');
}

/**
 * Normalise one raw line: odd spaces (narrow no-break space before AM/PM, NBSP)
 * become plain spaces, and invisible marks at the very start are dropped.
 * Marks later in the line are kept on purpose: iOS puts U+200E after "Name: "
 * on system messages, and the parser uses that as a signal.
 */
export function cleanLine(raw: string): string {
  return raw.replace(/[    ]/g, ' ').replace(/^[﻿‎‏]+/, '');
}

export type DetectedFormat = { platform: Platform; clock: '12h' | '24h'; format: ChatFormat };

/**
 * Detect the export format from the first ~200 lines (falls back to 2000
 * if the opening is one huge message). Returns null if nothing looks like
 * a WhatsApp message header.
 */
export function detectFormat(lines: string[]): DetectedFormat | null {
  for (const limit of [200, 2000]) {
    let android = 0;
    let ios = 0;
    let ampm = 0;
    for (const line of lines.slice(0, limit)) {
      const a = ANDROID_HEADER.exec(line);
      if (a) {
        android++;
        if (a[7]) ampm++;
        continue;
      }
      const i = IOS_HEADER.exec(line);
      if (i) {
        ios++;
        if (i[7]) ampm++;
      }
    }
    const total = android + ios;
    if (total === 0) continue;
    const platform: Platform = ios > android ? 'ios' : 'android';
    const clock = ampm > total / 2 ? '12h' : '24h';
    return { platform, clock, format: `${platform}-${clock}` as ChatFormat };
  }
  return null;
}

export type DateOrderInference = { order: DateOrder; conflict: boolean };

/**
 * Infer DD/MM vs MM/DD from every header in the file.
 * A first part over 12 means DMY; a second part over 12 means MDY.
 * If nothing settles it, the order is 'ambiguous' and the UI asks the user.
 */
export function inferDateOrder(pairs: Array<[number, number]>): DateOrderInference {
  let dmy = 0;
  let mdy = 0;
  for (const [a, b] of pairs) {
    if (a > 31 || b > 31 || a < 1 || b < 1) continue; // garbage, ignore
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy > 0 && mdy === 0) return { order: 'DMY', conflict: false };
  if (mdy > 0 && dmy === 0) return { order: 'MDY', conflict: false };
  if (dmy > 0 && mdy > 0) return { order: dmy >= mdy ? 'DMY' : 'MDY', conflict: true };
  return { order: 'ambiguous', conflict: false };
}
