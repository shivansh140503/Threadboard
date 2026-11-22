import {
  ANDROID_HEADER,
  IOS_HEADER,
  cleanLine,
  detectFormat,
  inferDateOrder,
  stripInvisible,
  type Platform,
} from './detectFormat';
import type { Message, ParseOutcome, ParseWarning } from './types';

export type ParseOptions = {
  /** Set after the user confirms the date order for an ambiguous file. */
  dateOrder?: 'DMY' | 'MDY';
};

/** Messages that carry no project content: media placeholders and deletions. */
const MEDIA_OR_DELETED: RegExp[] = [
  /^<media omitted>$/i,
  /^(image|video|audio|sticker|gif|document|contact card|voice message) omitted$/i,
  /^<attached: [^>]+>$/i,
  /^.+ \(file attached\)$/i,
  /^this message was deleted\.?$/i,
  /^you deleted this message\.?$/i,
  /^waiting for this message\.?.*$/i,
  /^null$/i, // Android "view once" media
];

const EDITED_SUFFIX = /\s*<this message was edited>\s*$/i;

function isMediaOrDeleted(text: string): boolean {
  const t = text.trim();
  return MEDIA_OR_DELETED.some((re) => re.test(t));
}

type HeaderParts = {
  sender: string | null;
  body: string;
  /** Group event such as a join, leave or the encryption notice. */
  isEvent: boolean;
};

/**
 * Split "Name: text" into sender and body.
 * Android group events have no "Name: " part. iOS group events do (the group
 * name), but the body starts with U+200E, which is how we tell them apart.
 */
function splitSender(rest: string, platform: Platform): HeaderParts {
  const sep = rest.indexOf(': ');
  if (sep === -1) return { sender: null, body: rest, isEvent: true };

  const candidate = stripInvisible(rest.slice(0, sep)).trim();
  const body = rest.slice(sep + 2);

  // 'Asha created group "Fest: 2026"' has a colon but is an event.
  if (!candidate || /["“”]/.test(candidate) || candidate.length > 60) {
    return { sender: null, body: rest, isEvent: true };
  }

  if (platform === 'ios' && body.startsWith('‎')) {
    if (isMediaOrDeleted(stripInvisible(body))) return { sender: candidate, body, isEvent: false };
    return { sender: null, body, isEvent: true };
  }

  return { sender: candidate, body, isEvent: false };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Build a local ISO timestamp, or null if any part is out of range. */
function toIso(
  first: number,
  second: number,
  yearRaw: string,
  hourRaw: number,
  minute: number,
  secondOfMinute: number,
  ampm: string | undefined,
  order: 'DMY' | 'MDY',
): string | null {
  const day = order === 'DMY' ? first : second;
  const month = order === 'DMY' ? second : first;
  const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);

  let hour = hourRaw;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    const pm = ampm.toLowerCase() === 'p';
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || secondOfMinute > 59) return null;

  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(secondOfMinute)}`;
}

type Draft = {
  ts: string | null;
  sender: string | null;
  isEvent: boolean;
  lines: string[];
};

/**
 * Parse a WhatsApp chat export (the .txt file).
 * Never throws on bad lines: they become warnings. Returns ok:false only
 * when the file has no recognisable message headers at all.
 */
export function parseWhatsApp(input: string, opts: ParseOptions = {}): ParseOutcome {
  const lines = input.split(/\r\n|\r|\n/).map(cleanLine);
  const detected = detectFormat(lines);
  if (!detected) {
    return {
      ok: false,
      reason:
        "This doesn't look like a WhatsApp chat export. In WhatsApp, open the group, choose Export chat → Without media, and import that file.",
    };
  }

  const re = detected.platform === 'ios' ? IOS_HEADER : ANDROID_HEADER;
  const matches = lines.map((l) => re.exec(l));

  const pairs: Array<[number, number]> = [];
  for (const m of matches) if (m) pairs.push([Number(m[1]), Number(m[2])]);
  const inferred = inferDateOrder(pairs);
  const order = opts.dateOrder ?? (inferred.order === 'ambiguous' ? 'DMY' : inferred.order);

  const warnings: ParseWarning[] = [];
  if (inferred.conflict && !opts.dateOrder) {
    warnings.push({
      line: 0,
      reason: `Dates in this file disagree about day/month order; using ${order}.`,
    });
  }

  const messages: Message[] = [];
  let draft: Draft | null = null;

  const flush = () => {
    if (!draft) return;
    const text = stripInvisible(draft.lines.join('\n')).replace(EDITED_SUFFIX, '').trim();
    const isSystem = draft.isEvent || isMediaOrDeleted(text);
    messages.push({
      idx: messages.length,
      ts: draft.ts,
      sender: draft.isEvent ? null : draft.sender,
      text,
      isSystem,
    });
    draft = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = matches[i];
    if (m) {
      flush();
      const ts = toIso(
        Number(m[1]),
        Number(m[2]),
        m[3] ?? '',
        Number(m[4]),
        Number(m[5]),
        m[6] ? Number(m[6]) : 0,
        m[7],
        order,
      );
      if (ts === null) warnings.push({ line: i + 1, reason: 'Unreadable date or time; message kept without a timestamp.' });
      const parts = splitSender(m[8] ?? '', detected.platform);
      draft = { ts, sender: parts.sender, isEvent: parts.isEvent, lines: [parts.body] };
    } else if (draft) {
      draft.lines.push(line); // continuation of a multi-line message
    } else if (stripInvisible(line).trim() !== '') {
      warnings.push({ line: i + 1, reason: 'Text before the first message was ignored.' });
    }
  }
  flush();

  const participants: string[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    if (msg.sender && !seen.has(msg.sender)) {
      seen.add(msg.sender);
      participants.push(msg.sender);
    }
  }

  return {
    ok: true,
    result: {
      format: detected.format,
      dateOrder: inferred.order,
      messages,
      participants,
      warnings,
    },
  };
}
