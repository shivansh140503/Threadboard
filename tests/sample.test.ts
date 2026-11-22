import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWhatsApp } from '../src/parser/whatsapp';
import { ExtractionSchema } from '../src/ai/schema';

const chat = readFileSync(resolve(process.cwd(), 'src/data/sampleChat.txt'), 'utf8');
const rawResult: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/sampleResult.json'), 'utf8'));

const parsed = parseWhatsApp(chat);
if (!parsed.ok) throw new Error(parsed.reason);
const r = parsed.result;

describe('bundled sample chat', () => {
  it('parses with no warnings', () => {
    expect(r.format).toBe('android-12h');
    expect(r.dateOrder).toBe('DMY');
    expect(r.messages).toHaveLength(52);
    expect(r.warnings).toEqual([]);
    expect(r.participants).toEqual([
      'Priya Sharma',
      'Meera Iyer',
      'Rahul Verma',
      'Ananya',
      'Kabir Singh',
      '+91 90000 12345',
    ]);
  });

  it('message indexes line up with the cached result', () => {
    expect(r.messages[6]?.text).toContain('₹50,000');
    expect(r.messages[25]?.text).toContain('Auditorium booked');
    expect(r.messages[30]?.text).toContain('- font size');
    expect(r.messages[51]?.text).toContain('Script first draft');
  });
});

describe('sampleResult.json', () => {
  const result = ExtractionSchema.parse(rawResult);
  const all = [
    ...result.tasks,
    ...result.decisions,
    ...result.open_questions,
    ...result.budget,
    ...result.roles,
    ...(result.budget_cap ? [result.budget_cap] : []),
  ];

  it('validates against the zod schema', () => {
    expect(result.tasks.length).toBeGreaterThan(0);
  });

  it('cites only real, non-system messages', () => {
    for (const item of all) {
      for (const idx of item.evidence_idx) {
        const msg = r.messages[idx];
        expect(msg, `idx ${idx}`).toBeDefined();
        expect(msg?.isSystem, `idx ${idx} is system`).toBe(false);
      }
    }
  });

  it('uses only participant names as owners and role holders', () => {
    for (const t of result.tasks) if (t.owner) expect(r.participants).toContain(t.owner);
    for (const role of result.roles) expect(r.participants).toContain(role.person);
  });
});
