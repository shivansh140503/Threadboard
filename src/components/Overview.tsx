import { AlertTriangle } from 'lucide-react';
import type { Board } from '../lib/types';
import { budgetTotals, overdueTasks, peopleStats, progress, visibleTasks } from '../lib/dashboard';
import { formatMoney } from '../lib/money';
import { Avatar, EmptyState, ProgressRing, StatTile } from './ui';

type Props = { board: Board; onGoTasks: (personId?: string) => void };

export default function Overview({ board, onGoTasks }: Props) {
  const p = progress(board);
  const tasks = visibleTasks(board);
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const toConfirm = tasks.filter((t) => t.status === 'pending' && t.aiSuggestedDone).length;
  const overdue = overdueTasks(board).length;
  const people = peopleStats(board)
    .filter((s) => s.assigned > 0)
    .sort((a, b) => b.assigned - a.assigned);
  const unassigned = tasks.filter((t) => t.ownerId === null).length;
  const maxAssigned = Math.max(1, ...people.map((s) => s.assigned), unassigned);
  const budget = budgetTotals(board);
  const hasBudget = budget.capMinor !== null || budget.committedMinor > 0 || budget.proposedMinor > 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-center gap-5 rounded-card border border-line bg-surface p-5 sm:flex-row">
        <ProgressRing done={p.done} total={p.total} />
        <dl className="grid w-full grid-cols-3 gap-2">
          <StatTile label="Pending" value={pending} />
          <StatTile label="Overdue" value={overdue} tone={overdue ? 'danger' : 'ink'} hint="with a set date" />
          <StatTile label="To confirm" value={toConfirm} tone={toConfirm ? 'warn' : 'ink'} hint="AI thinks done" />
        </dl>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Tasks per person</h3>
          <div className="flex items-center gap-3 text-xs text-ink-muted" aria-hidden>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Done
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-300" /> Pending
            </span>
          </div>
        </div>
        {people.length === 0 && unassigned === 0 ? (
          <div className="mt-3">
            <EmptyState title="No tasks yet">Add tasks on the Tasks tab.</EmptyState>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {people.map((s) => (
              <PersonBar
                key={s.person.id}
                name={s.person.name}
                done={s.completed}
                assigned={s.assigned}
                max={maxAssigned}
                onClick={() => onGoTasks(s.person.id)}
              />
            ))}
            {unassigned > 0 && (
              <PersonBar
                name={null}
                done={tasks.filter((t) => t.ownerId === null && t.status === 'done').length}
                assigned={unassigned}
                max={maxAssigned}
                onClick={() => onGoTasks('none')}
              />
            )}
          </ul>
        )}
      </section>

      {hasBudget && (
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold">Budget</h3>
          <BudgetMeter
            committed={budget.committedMinor}
            cap={budget.capMinor}
            currency={budget.currency}
            remaining={budget.remainingMinor}
          />
        </section>
      )}
    </div>
  );
}

function PersonBar(props: { name: string | null; done: number; assigned: number; max: number; onClick: () => void }) {
  const { name, done, assigned, max } = props;
  const label = `${name ?? 'No owner'}: ${done} of ${assigned} done`;
  return (
    <li>
      <button
        type="button"
        onClick={props.onClick}
        title={label}
        aria-label={`${label}. Show tasks`}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left hover:bg-canvas"
      >
        <Avatar name={name} size="sm" />
        <span className="w-24 shrink-0 truncate text-sm sm:w-36">{name ?? 'No owner'}</span>
        <span className="flex h-3 flex-1 gap-[2px]" aria-hidden>
          {/* Done segment then pending segment, 2px gap, rounded data-ends. Width scaled to the busiest person. */}
          {done > 0 && <span className="h-full rounded-l-[4px] bg-accent last:rounded-r-[4px]" style={{ width: `${(done / max) * 100}%` }} />}
          {assigned - done > 0 && (
            <span
              className={`h-full rounded-r-[4px] bg-indigo-300 ${done === 0 ? 'rounded-l-[4px]' : ''}`}
              style={{ width: `${((assigned - done) / max) * 100}%` }}
            />
          )}
        </span>
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-ink-muted">
          {done}/{assigned}
        </span>
      </button>
    </li>
  );
}

function BudgetMeter({ committed, cap, currency, remaining }: { committed: number; cap: number | null; currency: string; remaining: number | null }) {
  const over = remaining !== null && remaining < 0;
  const frac = cap ? Math.min(1, committed / cap) : 0;
  return (
    <div className="mt-2">
      <p className="text-sm">
        <span className="text-lg font-bold tabular-nums">{formatMoney(committed, currency)}</span>
        <span className="text-ink-muted"> committed{cap !== null ? ` of ${formatMoney(cap, currency)}` : ''}</span>
      </p>
      {cap !== null && (
        <>
          <div
            className="mt-2 h-3 w-full overflow-hidden rounded-[4px] bg-canvas ring-1 ring-line"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={committed}
            aria-label="Budget committed"
          >
            <div className={`h-full rounded-[4px] ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${frac * 100}%` }} />
          </div>
          <p className={`mt-1 flex items-center gap-1 text-sm ${over ? 'font-semibold text-danger' : 'text-ink-muted'}`}>
            {over && <AlertTriangle className="h-4 w-4" aria-hidden />}
            {over ? `Over budget by ${formatMoney(-remaining!, currency)}` : `${formatMoney(remaining ?? 0, currency)} remaining`}
          </p>
        </>
      )}
    </div>
  );
}
