import type { Board, BudgetItem, Person, Task } from './types';
import { isRejected, roleItemId } from './board';
import { newId } from './ids';

/** Tasks shown on the dashboard: everything except items marked ✗ in review. */
export function visibleTasks(board: Board): Task[] {
  return board.tasks.filter((t) => !isRejected(board, t.id));
}

export function visibleBudgetItems(board: Board): BudgetItem[] {
  return board.budget.items.filter((b) => !isRejected(board, b.id));
}

/** Person's role, unless the role was marked ✗ in review. */
export function visibleRole(board: Board, p: Person): string | null {
  return isRejected(board, roleItemId(p.id)) ? null : p.role;
}

// ---- Task mutations (pure; return a new board) ------------------------------

function mapTask(board: Board, id: string, fn: (t: Task) => Task): Board {
  return { ...board, tasks: board.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}

/** Toggle done/pending. A user action, so it also confirms the item. */
export function toggleTask(board: Board, id: string, now = new Date()): Board {
  return mapTask(board, id, (t) =>
    t.status === 'done'
      ? { ...t, status: 'pending', completedAt: null, confirmed: true }
      : { ...t, status: 'done', completedAt: now.toISOString(), confirmed: true, aiSuggestedDone: false },
  );
}

/** "Suggested done — confirm": the user accepts the AI's suggestion. */
export function confirmSuggestedDone(board: Board, id: string, now = new Date()): Board {
  return mapTask(board, id, (t) => ({ ...t, status: 'done', completedAt: now.toISOString(), confirmed: true, aiSuggestedDone: false }));
}

/** The user rejects the AI's "done" suggestion; the task stays pending. */
export function dismissSuggestedDone(board: Board, id: string): Board {
  return mapTask(board, id, (t) => ({ ...t, aiSuggestedDone: false, confirmed: true }));
}

export type TaskDraft = { title: string; ownerId: string | null; dueText: string | null; dueDate: string | null };

export function addTask(board: Board, draft: TaskDraft, now = new Date()): { board: Board; id: string } {
  const id = newId();
  const task: Task = {
    id,
    title: draft.title.trim(),
    ownerId: draft.ownerId,
    dueText: draft.dueText?.trim() || null,
    dueDate: draft.dueDate || null,
    status: 'pending',
    source: 'manual',
    aiSuggestedDone: false,
    confirmed: true,
    evidenceIdx: [],
    createdAt: now.toISOString(),
    completedAt: null,
  };
  return { board: { ...board, tasks: [task, ...board.tasks] }, id };
}

export function editTask(board: Board, id: string, draft: TaskDraft): Board {
  return mapTask(board, id, (t) => ({
    ...t,
    title: draft.title.trim() || t.title,
    ownerId: draft.ownerId,
    dueText: draft.dueText?.trim() || null,
    dueDate: draft.dueDate || null,
    confirmed: true,
  }));
}

export function deleteTask(board: Board, id: string): Board {
  return { ...board, tasks: board.tasks.filter((t) => t.id !== id) };
}

/** Put a task back exactly as it was (used by Undo), at its original position if possible. */
export function restoreTask(board: Board, task: Task, index: number): Board {
  if (board.tasks.some((t) => t.id === task.id)) return mapTask(board, task.id, () => task);
  const tasks = [...board.tasks];
  tasks.splice(Math.min(index, tasks.length), 0, task);
  return { ...board, tasks };
}

// ---- Queries ------------------------------------------------------------------

export type TaskFilter = { personId: string | 'all' | 'none'; status: 'all' | 'pending' | 'done'; query: string };

export function filterTasks(tasks: Task[], f: TaskFilter): Task[] {
  const q = f.query.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (f.personId === 'all' || (f.personId === 'none' ? t.ownerId === null : t.ownerId === f.personId)) &&
      (f.status === 'all' || t.status === f.status) &&
      (q === '' || t.title.toLowerCase().includes(q) || (t.dueText ?? '').toLowerCase().includes(q)),
  );
}

/** Local date as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Pending tasks whose set due date is before today. Tasks with only a text deadline are not counted. */
export function overdueTasks(board: Board, now = new Date()): Task[] {
  const today = todayLocal(now);
  return visibleTasks(board).filter((t) => t.status === 'pending' && t.dueDate !== null && t.dueDate < today);
}

export type PersonStats = { person: Person; role: string | null; assigned: number; completed: number };

export function peopleStats(board: Board): PersonStats[] {
  const tasks = visibleTasks(board);
  return board.people.map((person) => {
    const mine = tasks.filter((t) => t.ownerId === person.id);
    return {
      person,
      role: visibleRole(board, person),
      assigned: mine.length,
      completed: mine.filter((t) => t.status === 'done').length,
    };
  });
}

export function progress(board: Board): { done: number; total: number } {
  const tasks = visibleTasks(board);
  return { done: tasks.filter((t) => t.status === 'done').length, total: tasks.length };
}

export type BudgetTotals = {
  currency: string;
  capMinor: number | null;
  proposedMinor: number;
  approvedMinor: number;
  paidMinor: number;
  /** approved + paid: money already committed. */
  committedMinor: number;
  /** cap − committed, or null without a cap. Can be negative (over budget). */
  remainingMinor: number | null;
  /** Items in another currency are listed but not added to the totals. */
  otherCurrencyCount: number;
};

export function budgetTotals(board: Board): BudgetTotals {
  const currency = board.budget.currency;
  const items = visibleBudgetItems(board);
  const same = items.filter((i) => i.currency === currency);
  const sum = (s: BudgetItem['status']) => same.filter((i) => i.status === s).reduce((n, i) => n + i.amountMinor, 0);
  const approvedMinor = sum('approved');
  const paidMinor = sum('paid');
  const committedMinor = approvedMinor + paidMinor;
  return {
    currency,
    capMinor: board.budget.capMinor,
    proposedMinor: sum('proposed'),
    approvedMinor,
    paidMinor,
    committedMinor,
    remainingMinor: board.budget.capMinor === null ? null : board.budget.capMinor - committedMinor,
    otherCurrencyCount: items.length - same.length,
  };
}

export function togglePersonKey(board: Board, personId: string): Board {
  return { ...board, people: board.people.map((p) => (p.id === personId ? { ...p, isKey: !p.isKey } : p)) };
}

export function setPersonRole(board: Board, personId: string, role: string): Board {
  const r = role.trim() || null;
  // An edited role is the user's own: drop any ✗ verdict on the AI role so it shows.
  return {
    ...board,
    people: board.people.map((p) => (p.id === personId ? { ...p, role: r } : p)),
    reviews: board.reviews.filter((rv) => !(rv.itemId === roleItemId(personId) && rv.verdict === 'wrong')),
  };
}
