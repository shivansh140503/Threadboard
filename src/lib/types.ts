/** App data model (CLAUDE.md §7). Stored locally only. */

export type Person = { id: string; name: string; aliases: string[]; role: string | null; isKey: boolean };

export type Task = {
  id: string;
  title: string;
  ownerId: string | null;
  dueText: string | null;
  dueDate: string | null;
  status: 'pending' | 'done';
  source: 'ai' | 'manual';
  /** AI thinks a later message says this is done. Shown as "Suggested done — confirm"; never auto-completes. */
  aiSuggestedDone: boolean;
  confirmed: boolean;
  evidenceIdx: number[];
  createdAt: string;
  completedAt: string | null;
};

export type BudgetItem = {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  status: 'proposed' | 'approved' | 'paid';
  evidenceIdx: number[];
  source: 'ai' | 'manual';
};

export type ReviewKind = 'task' | 'decision' | 'question' | 'budget' | 'role';
export type Review = { itemId: string; kind: ReviewKind; verdict: 'correct' | 'wrong' };

export type TextItem = { id: string; text: string; evidenceIdx: number[] };

export type Board = {
  id: string;
  chatName: string;
  importedAt: string;
  isSample: boolean;
  /** Hash of the chat text, so re-importing the same chat replaces its board. */
  sourceHash: string;
  /** Whether AI extraction ran for this board (false if consent was declined). */
  aiUsed: boolean;
  people: Person[];
  tasks: Task[];
  budget: { capMinor: number | null; currency: string; items: BudgetItem[]; capEvidenceIdx: number[] };
  decisions: TextItem[];
  questions: TextItem[];
  /** Role evidence, keyed by person id (role text lives on Person). */
  roleEvidence: Record<string, number[]>;
  reviews: Review[];
  missedCount: number;
  /** For the case study: time from choosing a file to reaching the dashboard. */
  timing: { startedAt: string; reviewDoneAt: string | null };
  messageCount: number;
  schemaVersion: 1;
};
