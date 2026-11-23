import type { ReactNode } from 'react';
import { AlertTriangle, Calendar, MessageSquare, Users } from 'lucide-react';
import type { ParseResult } from '../parser/types';
import { dateRange, formatDay } from '../lib/dates';
import { initials } from '../lib/people';

type Props = {
  chatName: string;
  isSample: boolean;
  result: ParseResult;
  confirmedOrder: 'DMY' | 'MDY' | null;
  onConfirmOrder: (order: 'DMY' | 'MDY') => void;
  onContinue: () => void;
  onBack: () => void;
  continueLabel: string;
  continueNote?: string;
  error?: string | null;
  onSkipAi?: () => void;
};

export default function ParseSummary(props: Props) {
  const { result, chatName, isSample, confirmedOrder } = props;
  const content = result.messages.filter((m) => !m.isSystem);
  const range = dateRange(result.messages.map((m) => m.ts));
  const needsOrder = result.dateOrder === 'ambiguous' && confirmedOrder === null;
  const example = result.messages.find((m) => m.ts && !m.isSystem);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{chatName}</h2>
          {isSample && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Sample chat</span>
          )}
        </div>
        <p className="text-sm text-ink-muted">Read on your device. Nothing has been sent anywhere.</p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<MessageSquare className="h-5 w-5" />} label="Messages" value={content.length.toLocaleString()} />
        <Stat icon={<Users className="h-5 w-5" />} label="People" value={String(result.participants.length)} />
        <Stat
          icon={<Calendar className="h-5 w-5" />}
          label="Dates"
          value={range ? `${formatDay(range.first)} – ${formatDay(range.last)}` : 'Unknown'}
        />
      </dl>

      <section>
        <h3 className="text-sm font-semibold">Participants</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {result.participants.map((p) => (
            <li key={p} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent" aria-hidden>
                {initials(p)}
              </span>
              {p}
            </li>
          ))}
        </ul>
      </section>

      {needsOrder && example?.ts && (
        <section className="rounded-card border border-warn/40 bg-amber-50 p-4">
          <h3 className="font-semibold">Which date is right?</h3>
          <p className="mt-1 text-sm text-ink-muted">
            We can't tell if your phone writes day/month or month/day. This message from {example.sender} was sent on:
          </p>
          <blockquote className="mt-2 truncate rounded bg-surface p-2 text-sm">"{example.text}"</blockquote>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['DMY', 'MDY'] as const).map((order) => (
              <button
                key={order}
                type="button"
                onClick={() => props.onConfirmOrder(order)}
                className="min-h-11 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-accent"
              >
                {formatDay(swapIfNeeded(example.ts!, order))}
              </button>
            ))}
          </div>
        </section>
      )}

      {result.warnings.length > 0 && (
        <details className="rounded-card border border-line bg-surface p-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-warn" aria-hidden />
            {result.warnings.length} line{result.warnings.length === 1 ? '' : 's'} couldn't be read fully (the rest is fine)
          </summary>
          <ul className="mt-2 space-y-1 text-ink-muted">
            {result.warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w.line > 0 ? `Line ${w.line}: ` : ''}{w.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {props.error && (
        <div role="alert" className="rounded-card border border-danger/30 bg-red-50 p-4 text-sm text-danger">
          <p>{props.error}</p>
          {props.onSkipAi && (
            <button type="button" onClick={props.onSkipAi} className="mt-2 min-h-11 font-semibold underline">
              Continue without AI (add tasks by hand)
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={props.onBack} className="min-h-11 rounded-lg px-4 font-medium text-ink-muted hover:text-ink">
          Choose a different chat
        </button>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            disabled={needsOrder || content.length === 0}
            onClick={props.onContinue}
            className="min-h-11 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {props.continueLabel}
          </button>
          {props.continueNote && <p className="text-xs text-ink-muted">{props.continueNote}</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <span className="text-accent" aria-hidden>{icon}</span>
      <div>
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className="font-semibold">{value}</dd>
      </div>
    </div>
  );
}

/** Timestamps of an ambiguous file are computed as DMY; show the MDY reading by swapping day and month. */
function swapIfNeeded(iso: string, order: 'DMY' | 'MDY'): string {
  if (order === 'DMY') return iso;
  const [y, m, rest] = iso.split('-');
  const d = rest?.slice(0, 2);
  return `${y}-${d}-${m}${rest?.slice(2) ?? ''}`;
}
