import type { Extraction } from '../ai/schema';
import type { ParseResult } from '../parser/types';
import type { Board, BudgetItem, Person, Review, ReviewKind, Task } from './types';
import { newId } from './ids';
import { normaliseCurrency, toMinor } from './money';

export const DEFAULT_CURRENCY = 'INR';

type Meta = { chatName: string; isSample: boolean; startedAt: string; aiUsed: boolean; sourceHash?: string };

/** Build a board from parsed chat + (possibly empty) extraction. AI tasks never start as done. */
export function buildBoard(parse: ParseResult, extraction: Extraction | null, meta: Meta): Board {
  const now = new Date().toISOString();
  const ex: Extraction = extraction ?? {
    tasks: [],
    decisions: [],
    open_questions: [],
    budget: [],
    budget_cap: null,
    roles: [],
  };

  const people: Person[] = parse.participants.map((name) => ({ id: newId(), name, aliases: [], role: null, isKey: false }));
  const byName = new Map(people.map((p) => [p.name, p]));

  const roleEvidence: Record<string, number[]> = {};
  for (const r of ex.roles) {
    const person = byName.get(r.person);
    if (!person) continue;
    person.role = r.role;
    person.isKey = true;
    roleEvidence[person.id] = r.evidence_idx;
  }

  const tasks: Task[] = ex.tasks.map((t) => ({
    id: newId(),
    title: t.title,
    ownerId: t.owner ? (byName.get(t.owner)?.id ?? null) : null,
    dueText: t.due_text,
    dueDate: null,
    status: 'pending', // never auto-complete from AI output
    source: 'ai',
    aiSuggestedDone: t.status_hint === 'done',
    confirmed: false,
    evidenceIdx: t.evidence_idx,
    createdAt: now,
    completedAt: null,
  }));

  const currency = normaliseCurrency(ex.budget_cap?.currency ?? ex.budget.find((b) => b.currency)?.currency, DEFAULT_CURRENCY);
  const items: BudgetItem[] = ex.budget.map((b) => ({
    id: newId(),
    label: b.label,
    amountMinor: toMinor(b.amount),
    currency: normaliseCurrency(b.currency, currency),
    status: b.status_hint === 'unclear' ? 'proposed' : b.status_hint,
    evidenceIdx: b.evidence_idx,
    source: 'ai',
  }));

  return {
    id: newId(),
    chatName: meta.chatName,
    importedAt: now,
    isSample: meta.isSample,
    sourceHash: meta.sourceHash ?? '',
    aiUsed: meta.aiUsed,
    people,
    tasks,
    budget: {
      capMinor: ex.budget_cap ? toMinor(ex.budget_cap.amount) : null,
      currency,
      items,
      capEvidenceIdx: ex.budget_cap?.evidence_idx ?? [],
    },
    decisions: ex.decisions.map((d) => ({ id: newId(), text: d.text, evidenceIdx: d.evidence_idx })),
    questions: ex.open_questions.map((q) => ({ id: newId(), text: q.text, evidenceIdx: q.evidence_idx })),
    roleEvidence,
    reviews: [],
    missedCount: 0,
    timing: { startedAt: meta.startedAt, reviewDoneAt: null },
    messageCount: parse.messages.filter((m) => !m.isSystem).length,
    schemaVersion: 1,
  };
}

/** Set, change or clear (verdict null) the review for one item. */
export function setReview(board: Board, itemId: string, kind: ReviewKind, verdict: Review['verdict'] | null): Board {
  const rest = board.reviews.filter((r) => r.itemId !== itemId);
  return { ...board, reviews: verdict ? [...rest, { itemId, kind, verdict }] : rest };
}

export function verdictOf(board: Board, itemId: string): Review['verdict'] | null {
  return board.reviews.find((r) => r.itemId === itemId)?.verdict ?? null;
}

/** Review item id for a person's role. */
export const roleItemId = (personId: string) => `role:${personId}`;

/** Items marked ✗ are kept (so accuracy totals stay intact) but hidden from the dashboard. */
export function isRejected(board: Board, itemId: string): boolean {
  return verdictOf(board, itemId) === 'wrong';
}

/**
 * Leaving review: items marked ✓ become confirmed (the "AI" marker goes away);
 * unreviewed items stay unconfirmed. Records when review finished, for timing.
 */
export function finishReview(board: Board): Board {
  const correct = new Set(board.reviews.filter((r) => r.verdict === 'correct').map((r) => r.itemId));
  return {
    ...board,
    tasks: board.tasks.map((t) => (correct.has(t.id) ? { ...t, confirmed: true } : t)),
    timing: { ...board.timing, reviewDoneAt: board.timing.reviewDoneAt ?? new Date().toISOString() },
  };
}
