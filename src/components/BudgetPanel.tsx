import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Message } from '../parser/types';
import type { Board, BudgetItem } from '../lib/types';
import { budgetTotals, visibleBudgetItems } from '../lib/dashboard';
import { formatMoney } from '../lib/money';
import Evidence from './Evidence';
import { EmptyState, btn } from './ui';

const STATUS_STYLE: Record<BudgetItem['status'], string> = {
  proposed: 'bg-canvas text-ink-muted',
  approved: 'bg-accent-soft text-accent',
  paid: 'bg-green-50 text-ok',
};

/** Read-only budget (editing was cut for the one-day build; see docs/decisions.md). */
export default function BudgetPanel({ board, messages }: { board: Board; messages: Message[] | null }) {
  const t = budgetTotals(board);
  const items = visibleBudgetItems(board);

  if (items.length === 0 && t.capMinor === null) {
    return <EmptyState title="No budget found">No amounts or budget limit were mentioned in this chat.</EmptyState>;
  }

  const rows: Array<[string, number | null, string?]> = [
    ['Budget limit', t.capMinor],
    ['Paid', t.paidMinor],
    ['Approved, not yet paid', t.approvedMinor],
    ['Committed (paid + approved)', t.committedMinor, 'font-semibold'],
    ['Remaining', t.remainingMinor, t.remainingMinor !== null && t.remainingMinor < 0 ? 'font-semibold text-danger' : 'font-semibold'],
    ['Proposed (not counted)', t.proposedMinor, 'text-ink-muted'],
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="font-semibold">Totals ({t.currency})</h3>
        <dl className="mt-2 divide-y divide-line text-sm">
          {rows.map(([label, value, cls]) => (
            <div key={label} className={`flex justify-between py-2 ${cls ?? ''}`}>
              <dt>{label}</dt>
              <dd className="tabular-nums">{value === null ? 'Not set' : formatMoney(value, t.currency)}</dd>
            </div>
          ))}
        </dl>
        {t.otherCurrencyCount > 0 && (
          <p className="mt-2 text-xs text-warn">{t.otherCurrencyCount} item(s) in another currency are listed below but not added up.</p>
        )}
        {board.budget.capEvidenceIdx.length > 0 && <Evidence idx={board.budget.capEvidenceIdx} messages={messages} max={1} />}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Items ({items.length})</h3>
        <ul className="space-y-2">
          {items.map((i) => (
            <BudgetRow key={i.id} item={i} messages={messages} />
          ))}
        </ul>
      </section>
      <p className="text-xs text-ink-muted">AI can make mistakes. Check amounts against the chat.</p>
    </div>
  );
}

function BudgetRow({ item, messages }: { item: BudgetItem; messages: Message[] | null }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.label}</p>
          <span className={`mt-1 inline-block rounded px-1.5 text-xs font-semibold capitalize ${STATUS_STYLE[item.status]}`}>{item.status}</span>
        </div>
        <p className="font-semibold tabular-nums">{formatMoney(item.amountMinor, item.currency)}</p>
        {item.evidenceIdx.length > 0 && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Show source messages" className={btn.icon}>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
      {open && <Evidence idx={item.evidenceIdx} messages={messages} />}
    </li>
  );
}
