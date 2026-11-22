import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWhatsApp } from '../src/parser/whatsapp';
import { inferDateOrder } from '../src/parser/detectFormat';
import type { ParseResult } from '../src/parser/types';

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'fixtures', name), 'utf8');
}

function parseOk(text: string, opts?: Parameters<typeof parseWhatsApp>[1]): ParseResult {
  const out = parseWhatsApp(text, opts);
  if (!out.ok) throw new Error(`expected ok parse, got: ${out.reason}`);
  return out.result;
}

describe('01 Android 24h DD/MM/YY', () => {
  const r = parseOk(fixture('01-android-24h-dmy.txt'));
  it('detects format and date order', () => {
    expect(r.format).toBe('android-24h');
    expect(r.dateOrder).toBe('DMY');
  });
  it('parses messages, senders and timestamps', () => {
    expect(r.messages).toHaveLength(5);
    expect(r.messages[0]?.isSystem).toBe(true);
    expect(r.messages[0]?.sender).toBeNull();
    expect(r.messages[3]).toMatchObject({ idx: 3, sender: 'Neha K', ts: '2026-11-14T18:45:00', isSystem: false });
    expect(r.participants).toEqual(['Asha Rao', 'Vikram', 'Neha K']);
    expect(r.warnings).toEqual([]);
  });
});

describe('02 Android 12h with narrow no-break space', () => {
  const raw = fixture('02-android-12h-nnbsp.txt');
  const r = parseOk(raw);
  it('fixture really contains U+202F', () => {
    expect(raw).toContain(' ');
  });
  it('detects 12h format and 4-digit year', () => {
    expect(r.format).toBe('android-12h');
    expect(r.dateOrder).toBe('DMY');
  });
  it('converts 12 pm, 12 am and 11:59 pm correctly', () => {
    expect(r.messages[2]?.ts).toBe('2026-11-21T12:00:00');
    expect(r.messages[3]?.ts).toBe('2026-11-21T00:30:00');
    expect(r.messages[4]?.ts).toBe('2026-11-21T23:59:00');
  });
  it('strips the edited marker', () => {
    expect(r.messages[3]?.text).toBe('(sent past midnight) fixed the slides');
  });
});

describe('03 iOS 24h with seconds and brackets', () => {
  const raw = fixture('03-ios-24h.txt');
  const r = parseOk(raw);
  it('fixture really contains U+200E', () => {
    expect(raw).toContain('‎');
  });
  it('detects format', () => {
    expect(r.format).toBe('ios-24h');
    expect(r.dateOrder).toBe('DMY');
  });
  it('flags iOS group events (U+200E after the group name) as system with no sender', () => {
    for (const i of [0, 1, 2]) {
      expect(r.messages[i]?.isSystem).toBe(true);
      expect(r.messages[i]?.sender).toBeNull();
    }
  });
  it('keeps sender on media-omitted but marks it system', () => {
    expect(r.messages[5]).toMatchObject({ sender: 'Priti', isSystem: true, text: 'image omitted' });
  });
  it('does not list the group name as a participant', () => {
    expect(r.participants).toEqual(['Sam', 'Jo', 'Priti']);
    expect(r.messages[6]?.ts).toBe('2026-11-17T19:45:59');
  });
});

describe('04 iOS 12h AM/PM', () => {
  const r = parseOk(fixture('04-ios-12h.txt'));
  it('detects format', () => {
    expect(r.format).toBe('ios-12h');
  });
  it('converts times', () => {
    expect(r.messages[2]?.ts).toBe('2026-11-21T12:05:10');
    expect(r.messages[3]?.ts).toBe('2026-11-21T00:00:00');
  });
  it('flags deleted messages', () => {
    expect(r.messages[4]).toMatchObject({ sender: 'Maya', isSystem: true });
    expect(r.participants).toEqual(['Kiran', 'Maya']);
  });
});

describe('05 MM/DD file (US locale)', () => {
  const r = parseOk(fixture('05-android-mdy-us.txt'));
  it('infers MDY from a day over 12', () => {
    expect(r.format).toBe('android-12h');
    expect(r.dateOrder).toBe('MDY');
    expect(r.messages[0]?.ts).toBe('2026-11-02T15:04:00');
    expect(r.messages[2]?.ts).toBe('2026-11-21T10:00:00');
  });
});

describe('06 ambiguous dates', () => {
  const raw = fixture('06-ambiguous-dates.txt');
  it("reports 'ambiguous' and defaults to DMY timestamps", () => {
    const r = parseOk(raw);
    expect(r.dateOrder).toBe('ambiguous');
    expect(r.messages[0]?.ts).toBe('2026-02-01T10:00:00');
  });
  it('respects a user-confirmed order', () => {
    const r = parseOk(raw, { dateOrder: 'MDY' });
    expect(r.messages[0]?.ts).toBe('2026-01-02T10:00:00');
    expect(r.messages[3]?.ts).toBe('2026-12-02T17:45:00');
  });
});

describe('07 multi-line, emoji, Hindi/Hinglish, phone-number senders', () => {
  const r = parseOk(fixture('07-multiline-unicode.txt'));
  it('joins multi-line messages', () => {
    expect(r.messages).toHaveLength(5);
    expect(r.messages[0]?.text).toBe('Shopping list for the stall:\n- 5 kg atta\n- 2 L oil\n\nAlso chai cups ☕️');
  });
  it('handles names with digits, Devanagari names and phone-number senders', () => {
    expect(r.participants).toEqual(['Rohan 2', '+91 90000 12345', 'सुनीता', '+44 7700 900123']);
    expect(r.messages[2]?.text).toBe('ठीक है, बजट ₹2,000 तक रखो');
    expect(r.messages[3]?.text).toContain('🙏🏽👨‍👩‍👧');
    expect(r.messages.every((m) => !m.isSystem)).toBe(true);
  });
});

describe('08 system messages and garbage lines', () => {
  const r = parseOk(fixture('08-system-garbage.txt'));
  it('does not crash and produces warnings', () => {
    expect(r.warnings).toEqual([
      { line: 1, reason: expect.stringContaining('before the first message') },
      { line: 9, reason: expect.stringContaining('Unreadable date') },
    ]);
  });
  it('flags every system message', () => {
    expect(r.messages).toHaveLength(10);
    const nonSystem = r.messages.filter((m) => !m.isSystem).map((m) => m.idx);
    expect(nonSystem).toEqual([6, 7, 9]);
  });
  it('treats a quoted group name with a colon as an event, not a sender', () => {
    expect(r.messages[1]).toMatchObject({ sender: null, isSystem: true });
    expect(r.participants).toEqual(['Ira', 'Omar']);
  });
  it('keeps the garbled message without a timestamp', () => {
    expect(r.messages[7]).toMatchObject({ ts: null, sender: 'Omar', text: 'garbled header line' });
  });
  it('ignores the invalid date when inferring order', () => {
    expect(r.dateOrder).toBe('DMY');
  });
});

describe('09 not a WhatsApp export', () => {
  it('returns a friendly error instead of throwing', () => {
    const out = parseWhatsApp(fixture('09-not-whatsapp.txt'));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/Export chat/);
  });
  it('handles an empty file', () => {
    expect(parseWhatsApp('').ok).toBe(false);
  });
});

describe('robustness', () => {
  it('strips a BOM and handles CRLF line endings', () => {
    const r = parseOk('﻿21/11/26, 10:00 - A: one\r\nsecond line\r\n21/11/26, 10:01 - B: two\r\n');
    expect(r.messages.map((m) => m.text)).toEqual(['one\nsecond line', 'two']);
  });
  it('rejects 31 Feb as unreadable instead of rolling over', () => {
    const r = parseOk('31/02/26, 10:00 - A: hi\n21/11/26, 10:01 - B: yo');
    expect(r.messages[0]?.ts).toBeNull();
    expect(r.warnings).toHaveLength(1);
  });
  it('survives a 5,000 message chat quickly', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `21/11/26, 10:${String(i % 60).padStart(2, '0')} - P${i % 7}: msg ${i}`);
    const t0 = performance.now();
    const r = parseOk(lines.join('\n'));
    expect(r.messages).toHaveLength(5000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('inferDateOrder', () => {
  it('flags conflicting evidence and picks the majority', () => {
    expect(inferDateOrder([[13, 1], [14, 2], [1, 13]])).toEqual({ order: 'DMY', conflict: true });
  });
});
