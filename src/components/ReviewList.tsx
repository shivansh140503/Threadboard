import type { ReactNode } from 'react';
import { AlertTriangle, Check, Copy, X } from 'lucide-react';
import type { Message } from '../parser/types';
import type { Board, ReviewKind } from '../lib/types';
import { roleItemId, setReview, verdictOf } from '../lib/board';
import { computeMetrics, pct, resultsSummary } from '../lib/metrics';
import { formatMoney } from '../lib/money';
import Evidence from './Evidence';

type Props = {
  board: Board;
  messages: Message[] | null;
  warning: string | null;
  onChange: (b: Board) => void;
  onContinue: () => void;
  onCopied: (ok: boolean) => void;
};

export default function ReviewList({ board, messages, warning, onChange, onContinue, onCopied }: Props) {
  const m = computeMetrics(board);
  const roles = board.people.filter((p) => board.roleEvidence[p.id]);

  const verdict = (id: string, kind: ReviewKind) => (
    <VerdictButtons value={verdictOf(board, id)} onSet={(v) => onChange(setReview(board, id, kind, v))} />
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resultsSummary(board));
      onCopied(true);
    } catch {
      onCopied(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h2 className="text-xl font-bold">Check what we found</h2>
        <p className="text-sm text-ink-muted">
          Mark each item ✓ if it's right or ✗ if it's wrong. Your answers measure how accurate the tool is.
          {board.isSample && ' (This is the sample chat.)'}
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-warn">
          <AlertTriangle className="h-4 w-4" aria-hidden /> AI can make mistakes. Check items against the chat.
        </p>
      </div>

      {warning && (
        <div role="status" className="rounded-card border border-warn/40 bg-amber-50 p-3 text-sm">
          {warning}
        </div>
      )}

      {m.totalItems === 0 && (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink-muted">
          We didn't find any tasks or decisions in this chat. You can still add tasks by hand on the dashboard.
        </p>
      )}

      <Section title="Tasks" count={board.tasks.filter((t) => t.source === 'ai').length}>
        {board.tasks
          .filter((t) => t.source === 'ai')
          .map((t) => (
            <Card key={t.id} actions={verdict(t.id, 'task')} state={verdictOf(board, t.id)}>
              <p className="font-medium">{t.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <label className="flex items-center gap-1">
                  <span className="sr-only">Owner</span>
                  <select
                    value={t.ownerId ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...board,
                        tasks: board.tasks.map((x) => (x.id === t.id ? { ...x, ownerId: e.target.value || null } : x)),
                      })
                    }
                    className="min-h-9 max-w-[12rem] rounded-md border border-line bg-surface px-2 text-sm text-ink"
                  >
                    <option value="">No owner</option>
                    {board.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {t.dueText && <span>· {t.dueText}</span>}
                {t.aiSuggestedDone && <span className="rounded bg-green-50 px-1.5 text-xs font-medium text-ok">Looks done</span>}
              </div>
              <Evidence idx={t.evidenceIdx} messages={messages} />
            </Card>
          ))}
      </Section>

      <Section title="Budget" count={board.budget.items.length}>
        {board.budget.items.map((b) => (
          <Card key={b.id} actions={verdict(b.id, 'budget')} state={verdictOf(board, b.id)}>
            <p className="font-medium">
              {b.label} · {formatMoney(b.amountMinor, b.currency)}
            </p>
            <p className="text-sm capitalize text-ink-muted">{b.status}</p>
            <Evidence idx={b.evidenceIdx} messages={messages} />
          </Card>
        ))}
      </Section>

      <Section title="Decisions" count={board.decisions.length}>
        {board.decisions.map((d) => (
          <Card key={d.id} actions={verdict(d.id, 'decision')} state={verdictOf(board, d.id)}>
            <p className="font-medium">{d.text}</p>
            <Evidence idx={d.evidenceIdx} messages={messages} />
          </Card>
        ))}
      </Section>

      <Section title="Open questions" count={board.questions.length}>
        {board.questions.map((q) => (
          <Card key={q.id} actions={verdict(q.id, 'question')} state={verdictOf(board, q.id)}>
            <p className="font-medium">{q.text}</p>
            <Evidence idx={q.evidenceIdx} messages={messages} />
          </Card>
        ))}
      </Section>

      <Section title="Roles" count={roles.length}>
        {roles.map((p) => (
          <Card key={p.id} actions={verdict(roleItemId(p.id), 'role')} state={verdictOf(board, roleItemId(p.id))}>
            <p className="font-medium">
              {p.name} — {p.role}
            </p>
            <Evidence idx={board.roleEvidence[p.id] ?? []} messages={messages} />
          </Card>
        ))}
      </Section>

      <section className="rounded-card border border-line bg-surface p-4">
        <label htmlFor="missed" className="font-semibold">
          How many real tasks did we miss?
        </label>
        <p className="text-sm text-ink-muted">Tasks people agreed to in the chat that aren't in the list above.</p>
        <input
          id="missed"
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          value={board.missedCount}
          onChange={(e) => {
            const n = Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0)));
            onChange({ ...board, missedCount: n });
          }}
          className="mt-2 min-h-11 w-28 rounded-lg border border-line px-3 text-lg"
        />
      </section>

      <button type="button" onClick={copy} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-accent">
        <Copy className="h-4 w-4" aria-hidden /> Copy results (numbers only, no chat text)
      </button>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <dl className="flex gap-4 text-sm" aria-live="polite">
            <Metric label="Reviewed" value={`${m.reviewed}/${m.totalItems}`} />
            <Metric label="Precision" value={pct(m.precision)} />
            <Metric label="Recall" value={pct(m.recall)} />
          </dl>
          <button
            type="button"
            onClick={onContinue}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong"
          >
            Continue to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="mb-2 font-semibold">
        {title} <span className="text-ink-muted">({count})</span>
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function Card({ children, actions, state }: { children: ReactNode; actions: ReactNode; state: 'correct' | 'wrong' | null }) {
  const border = state === 'correct' ? 'border-ok/50' : state === 'wrong' ? 'border-danger/50 opacity-70' : 'border-line';
  return (
    <li className={`flex gap-3 rounded-card border bg-surface p-3 transition-colors ${border}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="shrink-0">{actions}</div>
    </li>
  );
}

function VerdictButtons({ value, onSet }: { value: 'correct' | 'wrong' | null; onSet: (v: 'correct' | 'wrong' | null) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label="Correct"
        aria-pressed={value === 'correct'}
        onClick={() => onSet(value === 'correct' ? null : 'correct')}
        className={
          'flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ' +
          (value === 'correct' ? 'border-ok bg-ok text-white' : 'border-line text-ok hover:bg-green-50')
        }
      >
        <Check className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Wrong"
        aria-pressed={value === 'wrong'}
        onClick={() => onSet(value === 'wrong' ? null : 'wrong')}
        className={
          'flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ' +
          (value === 'wrong' ? 'border-danger bg-danger text-white' : 'border-line text-danger hover:bg-red-50')
        }
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
