import { describe, expect, it } from 'vitest';
import { chunkLines, lineBytes } from '../src/ai/chunk';
import { linkOwner, mergeExtractions } from '../src/ai/merge';
import type { Extraction } from '../src/ai/schema';

const base: Extraction = { tasks: [], decisions: [], open_questions: [], budget: [], budget_cap: null, roles: [] };
const people = ['Meera Iyer', 'Rahul Verma', 'Ananya', '+91 90000 12345'];

describe('chunkLines', () => {
  const lines = Array.from({ length: 700 }, (_, i) => ({ idx: i + 3, line: `[${i + 3}] A: m${i}` }));
  it('makes 300-line chunks with a 30-line overlap and stable indexes', () => {
    const chunks = chunkLines(lines);
    expect(chunks.map((c) => [c.fromIdx, c.toIdx, c.lines.length])).toEqual([
      [3, 302, 300],
      [273, 572, 300],
      [543, 702, 160],
    ]);
  });
  it('splits earlier when the byte budget is hit', () => {
    const fat = Array.from({ length: 50 }, (_, i) => ({ idx: i, line: 'x'.repeat(1000) }));
    const chunks = chunkLines(fat, 300, 5, 10_000);
    expect(chunks.every((c) => c.lines.reduce((n, l) => n + lineBytes(l.line), 0) <= 10_000)).toBe(true);
    expect(chunks[chunks.length - 1]!.toIdx).toBe(49);
  });
  it('keeps 300 long Devanagari messages under the server body limit', () => {
    const hindi = 'ठीक है, बजट और सजावट की लिस्ट कल तक भेज दूंगा 🙏 '.repeat(20).slice(0, 1000);
    const lines = Array.from({ length: 300 }, (_, i) => ({ idx: i, line: `[${i}] Person A: ${hindi}` }));
    const chunks = chunkLines(lines);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      const body = JSON.stringify({ participants: ['Person A'], lines: c.lines.map((l) => l.line) });
      expect(new TextEncoder().encode(body).length).toBeLessThan(200_000);
    }
  });
  it('handles empty input and single lines', () => {
    expect(chunkLines([])).toEqual([]);
    expect(chunkLines([{ idx: 5, line: 'a' }])).toHaveLength(1);
  });
});

describe('linkOwner', () => {
  it('links exact, case-insensitive and unique first names; never invents', () => {
    expect(linkOwner('Meera Iyer', people)).toBe('Meera Iyer');
    expect(linkOwner('meera iyer', people)).toBe('Meera Iyer');
    expect(linkOwner('Meera', people)).toBe('Meera Iyer');
    expect(linkOwner('Dev', people)).toBeNull();
    expect(linkOwner(null, people)).toBeNull();
  });
});

describe('mergeExtractions', () => {
  it('dedupes overlapping tasks and a later "done" beats an earlier "will do"', () => {
    const a: Extraction = {
      ...base,
      tasks: [{ title: 'Book the auditorium', owner: 'Rahul Verma', due_text: 'by Monday', status_hint: 'pending', evidence_idx: [9], confidence: 0.8 }],
    };
    const b: Extraction = {
      ...base,
      tasks: [{ title: 'Book auditorium', owner: 'Rahul', due_text: null, status_hint: 'done', evidence_idx: [25], confidence: 0.9 }],
    };
    const out = mergeExtractions([a, b], people);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]).toMatchObject({
      owner: 'Rahul Verma',
      due_text: 'by Monday',
      status_hint: 'done',
      evidence_idx: [9, 25],
      confidence: 0.9,
    });
  });

  it('keeps different tasks separate and drops invented owners', () => {
    const a: Extraction = {
      ...base,
      tasks: [
        { title: 'Book the auditorium', owner: 'Rahul Verma', due_text: null, status_hint: 'pending', evidence_idx: [9], confidence: 1 },
        { title: 'Design the poster', owner: 'Zoya', due_text: null, status_hint: 'pending', evidence_idx: [10], confidence: 1 },
      ],
    };
    const out = mergeExtractions([a], people);
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[1]!.owner).toBeNull();
  });

  it('dedupes budget items by amount and label, keeping the most advanced status', () => {
    const a: Extraction = { ...base, budget: [{ label: 'Sound and lights', amount: 11000, currency: 'INR', status_hint: 'proposed', evidence_idx: [28] }] };
    const b: Extraction = { ...base, budget: [{ label: 'Sound + lights vendor', amount: 11000, currency: null, status_hint: 'approved', evidence_idx: [29] }] };
    const out = mergeExtractions([a, b], people);
    expect(out.budget).toEqual([{ label: 'Sound and lights', amount: 11000, currency: 'INR', status_hint: 'approved', evidence_idx: [28, 29] }]);
  });

  it('keeps a second, different role for the same person', () => {
    const a: Extraction = { ...base, roles: [{ person: 'Meera Iyer', role: 'Treasurer', evidence_idx: [10] }] };
    const b: Extraction = {
      ...base,
      roles: [
        { person: 'Meera', role: 'Design lead', evidence_idx: [400] },
        { person: 'Meera Iyer', role: 'treasurer', evidence_idx: [12] },
      ],
    };
    expect(mergeExtractions([a, b], people).roles).toEqual([
      { person: 'Meera Iyer', role: 'Treasurer; Design lead', evidence_idx: [10, 12, 400] },
    ]);
  });

  it('keeps the latest budget cap and drops roles for unknown people', () => {
    const a: Extraction = { ...base, budget_cap: { amount: 40000, currency: 'INR', evidence_idx: [6] }, roles: [{ person: 'Nobody', role: 'x', evidence_idx: [1] }] };
    const b: Extraction = { ...base, budget_cap: { amount: 50000, currency: 'INR', evidence_idx: [40] } };
    const out = mergeExtractions([a, b], people);
    expect(out.budget_cap?.amount).toBe(50000);
    expect(out.roles).toEqual([]);
  });
});
