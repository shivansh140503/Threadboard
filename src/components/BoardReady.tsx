import { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { Board } from '../lib/types';
import { isRejected } from '../lib/board';
import { computeMetrics, pct, resultsSummary } from '../lib/metrics';

type Props = {
  board: Board;
  onNewChat: () => void;
  onDeleteAll: () => void;
  onBackToReview: () => void;
  onCopied: (ok: boolean) => void;
};

/** Temporary end of the flow until the Phase 3 dashboard lands. */
export default function BoardReady({ board, onNewChat, onDeleteAll, onBackToReview, onCopied }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const m = computeMetrics(board);
  const tasks = board.tasks.filter((t) => !isRejected(board, t.id));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{board.chatName}</h2>
        <p className="text-sm text-ink-muted">
          {tasks.length} tasks · {board.people.length} people{board.isSample ? ' · sample chat' : ''}
        </p>
      </div>
      <div className="rounded-card border border-accent/30 bg-accent-soft p-4 text-sm text-accent">
        The full dashboard (tasks checklist, people, budget) is coming in the next update. Your board is saved on this
        device.
      </div>
      {board.aiUsed && (
        <dl className="grid grid-cols-3 gap-3">
          {[
            ['Reviewed', `${m.reviewed}/${m.totalItems}`],
            ['Precision', pct(m.precision)],
            ['Recall', pct(m.recall)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-card border border-line bg-surface p-3">
              <dt className="text-xs text-ink-muted">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        {board.aiUsed && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(resultsSummary(board));
                onCopied(true);
              } catch {
                onCopied(false);
              }
            }}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium"
          >
            <Copy className="h-4 w-4" aria-hidden /> Copy results
          </button>
        )}
        {board.aiUsed && (
          <button type="button" onClick={onBackToReview} className="min-h-11 rounded-lg border border-line bg-surface px-4 text-sm font-medium">
            Back to review
          </button>
        )}
        <button type="button" onClick={onNewChat} className="min-h-11 rounded-lg border border-line bg-surface px-4 text-sm font-medium">
          Import another chat
        </button>
      </div>
      <div className="border-t border-line pt-4">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Delete every board and chat stored on this device?</span>
            <button type="button" onClick={onDeleteAll} className="min-h-11 rounded-lg bg-danger px-4 text-sm font-semibold text-white">
              Yes, delete everything
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 rounded-lg px-4 text-sm">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete all my data
          </button>
        )}
      </div>
    </div>
  );
}
