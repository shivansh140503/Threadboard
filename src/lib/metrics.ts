import type { Board, ReviewKind } from './types';

export type Metrics = {
  totalItems: number;
  reviewed: number;
  correct: number;
  wrong: number;
  taskItems: number;
  taskCorrect: number;
  taskWrong: number;
  missed: number;
  /** correct ÷ (correct + wrong), all item kinds. null until something is reviewed. */
  precision: number | null;
  /** task correct ÷ (task correct + task wrong). */
  taskPrecision: number | null;
  /** task correct ÷ (task correct + missed). "Missed" is asked about tasks, so recall is task-only. */
  recall: number | null;
};

export function countAiItems(board: Board): Record<ReviewKind, number> {
  return {
    task: board.tasks.filter((t) => t.source === 'ai').length,
    budget: board.budget.items.filter((b) => b.source === 'ai').length,
    decision: board.decisions.length,
    question: board.questions.length,
    role: Object.keys(board.roleEvidence).length,
  };
}

export function computeMetrics(board: Board): Metrics {
  const counts = countAiItems(board);
  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
  const correct = board.reviews.filter((r) => r.verdict === 'correct').length;
  const wrong = board.reviews.filter((r) => r.verdict === 'wrong').length;
  const taskCorrect = board.reviews.filter((r) => r.kind === 'task' && r.verdict === 'correct').length;
  const taskWrong = board.reviews.filter((r) => r.kind === 'task' && r.verdict === 'wrong').length;
  const missed = Math.max(0, Math.floor(board.missedCount));
  const ratio = (a: number, b: number) => (a + b === 0 ? null : a / (a + b));
  return {
    totalItems,
    reviewed: correct + wrong,
    correct,
    wrong,
    taskItems: counts.task,
    taskCorrect,
    taskWrong,
    missed,
    precision: ratio(correct, wrong),
    taskPrecision: ratio(taskCorrect, taskWrong),
    recall: ratio(taskCorrect, missed),
  };
}

export function pct(x: number | null): string {
  return x === null ? '–' : `${Math.round(x * 100)}%`;
}

/** Numbers-only summary a tester can copy into RESULTS.md. Contains no chat content. */
export function resultsSummary(board: Board): string {
  const m = computeMetrics(board);
  const minutes =
    board.timing.reviewDoneAt !== null
      ? ((Date.parse(board.timing.reviewDoneAt) - Date.parse(board.timing.startedAt)) / 60000).toFixed(1)
      : '–';
  return [
    `ThreadBoard results${board.isSample ? ' (SAMPLE chat)' : ''}`,
    `Messages: ${board.messageCount}`,
    `Items extracted: ${m.totalItems} (tasks: ${m.taskItems})`,
    `Correct: ${m.correct}  Wrong: ${m.wrong}  Unreviewed: ${m.totalItems - m.reviewed}`,
    `Task correct: ${m.taskCorrect}  Task wrong: ${m.taskWrong}  Missed tasks: ${m.missed}`,
    `Precision (all): ${pct(m.precision)}  Precision (tasks): ${pct(m.taskPrecision)}  Recall (tasks): ${pct(m.recall)}`,
    `Import to dashboard: ${minutes} min`,
  ].join('\n');
}
