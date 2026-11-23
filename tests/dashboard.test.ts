import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ExtractionSchema } from '../src/ai/schema';
import { buildBoard, finishReview, roleItemId, setReview } from '../src/lib/board';
import {
  addTask,
  budgetTotals,
  confirmSuggestedDone,
  deleteTask,
  dismissSuggestedDone,
  editTask,
  filterTasks,
  overdueTasks,
  peopleStats,
  progress,
  restoreTask,
  setPersonRole,
  toggleTask,
  visibleTasks,
} from '../src/lib/dashboard';
import { loadBoards, memoryKV, saveBoards } from '../src/lib/storage';
import { parseWhatsApp } from '../src/parser/whatsapp';

const chat = readFileSync(resolve(process.cwd(), 'src/data/sampleChat.txt'), 'utf8');
const sample = ExtractionSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/sampleResult.json'), 'utf8')));
const parsed = parseWhatsApp(chat);
if (!parsed.ok) throw new Error('sample must parse');
const fresh = () =>
  finishReview(buildBoard(parsed.result, sample, { chatName: 'S', isSample: true, startedAt: new Date().toISOString(), aiUsed: true }));

describe('complete / undo', () => {
  it('toggling completes, and restoring the snapshot undoes it; survives a storage round-trip', () => {
    const b0 = fresh();
    const t = b0.tasks[3]!;
    const idx = b0.tasks.indexOf(t);
    const b1 = toggleTask(b0, t.id, new Date('2026-11-24T10:00:00Z'));
    expect(b1.tasks[idx]).toMatchObject({ status: 'done', completedAt: '2026-11-24T10:00:00.000Z', confirmed: true });
    expect(progress(b1).done).toBe(progress(b0).done + 1);

    const store = memoryKV();
    saveBoards([b1], store);
    const reloaded = loadBoards(store)[0]!;
    expect(reloaded.tasks[idx]!.status).toBe('done');

    const b2 = restoreTask(reloaded, t, idx);
    expect(b2.tasks[idx]).toEqual(t);
  });

  it('undo of a delete puts the task back in the same place', () => {
    const b0 = fresh();
    const t = b0.tasks[5]!;
    const b1 = deleteTask(b0, t.id);
    expect(b1.tasks).toHaveLength(11);
    const b2 = restoreTask(b1, t, 5);
    expect(b2.tasks.map((x) => x.id)).toEqual(b0.tasks.map((x) => x.id));
  });
});

describe('suggested done', () => {
  it('is never complete until confirmed', () => {
    const b0 = fresh();
    const suggested = b0.tasks.filter((t) => t.aiSuggestedDone);
    expect(suggested.length).toBeGreaterThan(0);
    expect(progress(b0).done).toBe(0);
    const id = suggested[0]!.id;
    const confirmed = confirmSuggestedDone(b0, id);
    expect(confirmed.tasks.find((t) => t.id === id)).toMatchObject({ status: 'done', aiSuggestedDone: false });
    const dismissed = dismissSuggestedDone(b0, id);
    expect(dismissed.tasks.find((t) => t.id === id)).toMatchObject({ status: 'pending', aiSuggestedDone: false });
  });
});

describe('add / edit / filter / search', () => {
  it('adds manual tasks and edits them', () => {
    const b0 = fresh();
    const meera = b0.people.find((p) => p.name === 'Meera Iyer')!;
    const { board: b1, id } = addTask(b0, { title: '  Buy balloons ', ownerId: meera.id, dueText: 'Fri', dueDate: '2026-12-04' });
    const t = b1.tasks.find((x) => x.id === id)!;
    expect(t).toMatchObject({ title: 'Buy balloons', source: 'manual', confirmed: true, status: 'pending' });
    const b2 = editTask(b1, id, { title: 'Buy 50 balloons', ownerId: null, dueText: '', dueDate: null });
    expect(b2.tasks.find((x) => x.id === id)).toMatchObject({ title: 'Buy 50 balloons', ownerId: null, dueText: null });
  });

  it('filters by person, status and search text', () => {
    const b = fresh();
    const tasks = visibleTasks(b);
    const meera = b.people.find((p) => p.name === 'Meera Iyer')!;
    expect(filterTasks(tasks, { personId: meera.id, status: 'all', query: '' })).toHaveLength(4);
    expect(filterTasks(tasks, { personId: 'none', status: 'all', query: '' })).toHaveLength(1);
    expect(filterTasks(tasks, { personId: 'all', status: 'all', query: 'CERTIFICATE' })).toHaveLength(2);
    expect(filterTasks(tasks, { personId: 'all', status: 'done', query: '' })).toHaveLength(0);
    const done = toggleTask(b, tasks[0]!.id);
    expect(filterTasks(visibleTasks(done), { personId: 'all', status: 'done', query: '' })).toHaveLength(1);
  });

  it('counts overdue only for pending tasks with a past set date', () => {
    let b = fresh();
    const now = new Date('2026-11-24T12:00:00');
    b = addTask(b, { title: 'late', ownerId: null, dueText: null, dueDate: '2026-11-20' }, now).board;
    b = addTask(b, { title: 'today', ownerId: null, dueText: null, dueDate: '2026-11-24' }, now).board;
    const late2 = addTask(b, { title: 'late but done', ownerId: null, dueText: null, dueDate: '2026-11-01' }, now);
    b = toggleTask(late2.board, late2.id, now);
    expect(overdueTasks(b, now).map((t) => t.title)).toEqual(['late']);
  });
});

describe('people', () => {
  it('counts assigned and completed per person, excluding rejected tasks', () => {
    let b = fresh();
    const meera = b.people.find((p) => p.name === 'Meera Iyer')!;
    const meeraTasks = b.tasks.filter((t) => t.ownerId === meera.id);
    b = toggleTask(b, meeraTasks[0]!.id);
    b = setReview(b, meeraTasks[1]!.id, 'task', 'wrong');
    const s = peopleStats(b).find((x) => x.person.id === meera.id)!;
    expect(s).toMatchObject({ assigned: 3, completed: 1, role: 'Treasurer' });
  });
  it('hides rejected roles; an edited role shows again', () => {
    let b = fresh();
    const meera = b.people.find((p) => p.name === 'Meera Iyer')!;
    b = setReview(b, roleItemId(meera.id), 'role', 'wrong');
    expect(peopleStats(b).find((x) => x.person.id === meera.id)!.role).toBeNull();
    b = setPersonRole(b, meera.id, 'Finance lead');
    expect(peopleStats(b).find((x) => x.person.id === meera.id)!.role).toBe('Finance lead');
  });
});

describe('budget totals (minor units)', () => {
  it('sums by status and computes remaining against the cap', () => {
    const t = budgetTotals(fresh());
    expect(t).toMatchObject({
      currency: 'INR',
      capMinor: 5_000_000,
      paidMinor: 500_000,
      approvedMinor: 1_100_000 + 800_000 + 250_000,
      proposedMinor: 0,
      committedMinor: 2_650_000,
      remainingMinor: 2_350_000,
      otherCurrencyCount: 0,
    });
  });
  it('excludes rejected items and other currencies; remaining can go negative', () => {
    let b = fresh();
    b = setReview(b, b.budget.items[1]!.id, 'budget', 'wrong'); // drop sound ₹11,000
    b = {
      ...b,
      budget: {
        ...b.budget,
        capMinor: 1_000_000,
        items: [
          ...b.budget.items,
          { id: 'usd', label: 'Domain', amountMinor: 1200, currency: 'USD', status: 'paid', evidenceIdx: [], source: 'manual' },
        ],
      },
    };
    const t = budgetTotals(b);
    expect(t.committedMinor).toBe(1_550_000);
    expect(t.remainingMinor).toBe(-550_000);
    expect(t.otherCurrencyCount).toBe(1);
  });
});
