import { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { Board } from '../lib/types';
import { computeMetrics, pct, resultsSummary } from '../lib/metrics';
import { btn } from './ui';

type Props = {
  board: Board;
  onDeleteAll: () => void;
  onNewChat: () => void;
  onBackToReview: () => void;
  onCopied: (ok: boolean) => void;
};

export default function SettingsPanel({ board, onDeleteAll, onNewChat, onBackToReview, onCopied }: Props) {
  const [confirm, setConfirm] = useState(false);
  const m = computeMetrics(board);

  return (
    <div className="space-y-5">
      {board.aiUsed && (
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold">Accuracy for this chat</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Reviewed {m.reviewed} of {m.totalItems} · precision {pct(m.precision)} · recall {pct(m.recall)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
              className={`${btn.secondary} flex items-center gap-2 text-sm`}
            >
              <Copy className="h-4 w-4" aria-hidden /> Copy results (numbers only)
            </button>
            <button type="button" onClick={onBackToReview} className={`${btn.secondary} text-sm`}>
              Back to review
            </button>
          </div>
        </section>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="font-semibold">Chats</h3>
        <button type="button" onClick={onNewChat} className={`${btn.secondary} mt-2 text-sm`}>
          Import another chat
        </button>
      </section>

      <section className="rounded-card border border-line bg-surface p-4 text-sm">
        <h3 className="font-semibold">Privacy</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
          <li>Your chat is parsed on your device. Boards are saved only in this browser.</li>
          <li>Chat text is sent to AI only after you allow it for that chat. It goes through our server to Anthropic's Claude and is not saved on our server.</li>
          <li>Photos, videos and files are never read or sent.</li>
          <li>AI can make mistakes. Check items against the chat. Tasks are never marked done unless you confirm.</li>
        </ul>
      </section>

      <section className="rounded-card border border-danger/30 bg-surface p-4">
        <h3 className="font-semibold text-danger">Delete all my data</h3>
        <p className="mt-1 text-sm text-ink-muted">Removes every board, saved chat and consent choice from this browser.</p>
        {confirm ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onDeleteAll} className="min-h-11 rounded-lg bg-danger px-4 text-sm font-semibold text-white">
              Yes, delete everything
            </button>
            <button type="button" onClick={() => setConfirm(false)} className={`${btn.secondary} text-sm`}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger">
            <Trash2 className="h-4 w-4" aria-hidden /> Delete all my data
          </button>
        )}
      </section>

      <p className="text-center text-xs text-ink-muted">ThreadBoard prototype · synthetic sample data only in the demo</p>
    </div>
  );
}
