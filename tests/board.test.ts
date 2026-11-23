import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ExtractionSchema } from '../src/ai/schema';
import { buildBoard, finishReview, isRejected, setReview } from '../src/lib/board';
import { computeMetrics, resultsSummary } from '../src/lib/metrics';
import { formatMoney, parseMajorInput, toMinor } from '../src/lib/money';
import { parseWhatsApp } from '../src/parser/whatsapp';
import { deleteAllData, loadBoards, memoryKV, saveBoards, saveMessages, consentStore } from '../src/lib/storage';

const chat = readFileSync(resolve(process.cwd(), 'src/data/sampleChat.txt'), 'utf8');
const sample = ExtractionSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/sampleResult.json'), 'utf8')));
const parsed = parseWhatsApp(chat);
if (!parsed.ok) throw new Error('sample must parse');
const meta = { chatName: 'Annual Day', isSample: true, startedAt: new Date().toISOString(), aiUsed: true };

describe('buildBoard', () => {
  const board = buildBoard(parsed.result, sample, meta);
  it('never marks AI tasks as done; flags "suggested done" instead', () => {
    expect(board.tasks.every((t) => t.status === 'pending' && t.completedAt === null && !t.confirmed)).toBe(true);
    expect(board.tasks.filter((t) => t.aiSuggestedDone)).toHaveLength(7);
  });
  it('links owners to people and roles to people', () => {
    const rahul = board.people.find((p) => p.name === 'Rahul Verma')!;
    expect(board.tasks.find((t) => t.title.startsWith('Book the auditorium'))!.ownerId).toBe(rahul.id);
    expect(board.people.find((p) => p.name === 'Meera Iyer')!).toMatchObject({ role: 'Treasurer', isKey: true });
  });
  it('stores money as integer minor units', () => {
    expect(board.budget.capMinor).toBe(5_000_000);
    expect(board.budget.currency).toBe('INR');
    expect(board.budget.items.map((b) => b.amountMinor)).toEqual([500_000, 1_100_000, 800_000, 250_000]);
    expect(board.budget.items.every((b) => Number.isInteger(b.amountMinor))).toBe(true);
  });
});

describe('review metrics', () => {
  it('computes precision over all items and recall over tasks', () => {
    let board = buildBoard(parsed.result, sample, meta);
    const [t1, t2, t3] = board.tasks;
    board = setReview(board, t1!.id, 'task', 'correct');
    board = setReview(board, t2!.id, 'task', 'correct');
    board = setReview(board, t3!.id, 'task', 'wrong');
    board = setReview(board, board.decisions[0]!.id, 'decision', 'correct');
    board = { ...board, missedCount: 2 };
    const m = computeMetrics(board);
    expect(m.totalItems).toBe(12 + 4 + 4 + 2 + 6);
    expect(m.precision).toBeCloseTo(3 / 4);
    expect(m.taskPrecision).toBeCloseTo(2 / 3);
    expect(m.recall).toBeCloseTo(2 / 4);
    // changing a verdict replaces it rather than adding another
    board = setReview(board, t3!.id, 'task', 'correct');
    expect(computeMetrics(board).wrong).toBe(0);
    board = setReview(board, t3!.id, 'task', null);
    expect(computeMetrics(board).reviewed).toBe(3);
  });

  it('finishing review keeps rejected items (for totals) but marks them rejected', () => {
    let board = buildBoard(parsed.result, sample, meta);
    const wrongId = board.tasks[0]!.id;
    const rightId = board.tasks[1]!.id;
    board = setReview(board, wrongId, 'task', 'wrong');
    board = setReview(board, rightId, 'task', 'correct');
    const done = finishReview(board);
    expect(done.tasks).toHaveLength(12);
    expect(isRejected(done, wrongId)).toBe(true);
    expect(done.tasks.find((t) => t.id === rightId)!.confirmed).toBe(true);
    expect(done.tasks.find((t) => t.id === board.tasks[2]!.id)!.confirmed).toBe(false);
    expect(done.timing.reviewDoneAt).not.toBeNull();
    expect(computeMetrics(done).totalItems).toBe(computeMetrics(board).totalItems);
  });

  it('a reviewed task deleted later still counts, so reviewed never exceeds total', () => {
    let board = buildBoard(parsed.result, sample, meta);
    for (const t of board.tasks.slice(0, 4)) board = setReview(board, t.id, 'task', 'correct');
    const before = computeMetrics(board);
    board = { ...board, tasks: board.tasks.filter((t) => t.id !== board.tasks[0]!.id) };
    const after = computeMetrics(board);
    expect(after.totalItems).toBe(before.totalItems);
    expect(after.taskItems).toBe(before.taskItems);
    expect(after.reviewed).toBeLessThanOrEqual(after.totalItems);
    expect(resultsSummary(board)).not.toMatch(/Unreviewed: -/);
  });

  it('the copyable summary contains numbers but no chat content', () => {
    const board = finishReview(buildBoard(parsed.result, sample, meta));
    const s = resultsSummary(board);
    expect(s).toContain('SAMPLE');
    for (const leak of ['Priya', 'Meera', 'auditorium', '₹']) expect(s).not.toContain(leak);
  });
});

describe('money', () => {
  it('converts without float errors', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(1500.5)).toBe(150050);
    expect(parseMajorInput('1,500.5')).toBe(150050);
    expect(parseMajorInput('12.345')).toBeNull();
    expect(parseMajorInput('abc')).toBeNull();
    expect(formatMoney(5_000_000, 'INR')).toContain('50,000');
  });
});

describe('storage', () => {
  it('round-trips boards and delete-all clears everything, including consent', () => {
    const store = memoryKV();
    const board = buildBoard(parsed.result, sample, meta);
    saveBoards([board], store);
    saveMessages(board.id, parsed.result.messages, store);
    consentStore(store).grant('x');
    store.setItem('unrelated', 'keep');
    expect(loadBoards(store)).toHaveLength(1);
    deleteAllData(store);
    expect(loadBoards(store)).toEqual([]);
    expect(consentStore(store).has('x')).toBe(false);
    expect(store.keys()).toEqual(['unrelated']);
  });
  it('survives corrupt storage', () => {
    const store = memoryKV();
    store.setItem('threadboard:v1:boards', '{not json');
    expect(loadBoards(store)).toEqual([]);
  });
});
