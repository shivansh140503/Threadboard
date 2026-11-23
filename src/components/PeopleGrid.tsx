import { useState } from 'react';
import { Pencil, Star } from 'lucide-react';
import type { Board } from '../lib/types';
import { peopleStats, setPersonRole, togglePersonKey, type PersonStats } from '../lib/dashboard';
import { Avatar, EmptyState, btn } from './ui';

type Props = { board: Board; mutate: (fn: (b: Board) => Board) => void; onShowTasks: (personId: string) => void };

export default function PeopleGrid({ board, mutate, onShowTasks }: Props) {
  const stats = peopleStats(board);
  const key = stats.filter((s) => s.person.isKey);
  const others = stats.filter((s) => !s.person.isKey).sort((a, b) => b.assigned - a.assigned);

  if (stats.length === 0) return <EmptyState title="No people found in this chat" />;

  const card = (s: PersonStats) => (
    <PersonCard
      key={s.person.id}
      s={s}
      onToggleKey={() => mutate((b) => togglePersonKey(b, s.person.id))}
      onRole={(role) => mutate((b) => setPersonRole(b, s.person.id, role))}
      onShowTasks={() => onShowTasks(s.person.id)}
    />
  );

  return (
    <div className="space-y-6">
      {key.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Key people</h3>
          <ul className="grid gap-3 sm:grid-cols-2">{key.map(card)}</ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 font-semibold">{key.length > 0 ? 'Everyone else' : 'People'}</h3>
        {others.length === 0 ? (
          <p className="text-sm text-ink-muted">Everyone is marked as key.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">{others.map(card)}</ul>
        )}
      </section>
    </div>
  );
}

function PersonCard({ s, onToggleKey, onRole, onShowTasks }: { s: PersonStats; onToggleKey: () => void; onRole: (r: string) => void; onShowTasks: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.role ?? '');
  const { person } = s;

  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <Avatar name={person.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{person.name}</p>
          {editing ? (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onRole(draft);
                setEditing(false);
              }}
            >
              <label className="flex-1">
                <span className="sr-only">Role for {person.name}</span>
                <input
                  autoFocus
                  maxLength={100}
                  value={draft}
                  placeholder="e.g. Treasurer"
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-line px-2 text-sm"
                />
              </label>
              <button type="submit" className={`${btn.primary} text-sm`}>
                Save
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(s.role ?? '');
                setEditing(true);
              }}
              className="mt-0.5 flex min-h-11 items-center gap-1 text-sm text-ink-muted hover:text-ink"
              aria-label={`Edit role for ${person.name}`}
            >
              {s.role ?? 'Add a role'} <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleKey}
          aria-pressed={person.isKey}
          aria-label={person.isKey ? `Remove ${person.name} from key people` : `Mark ${person.name} as key person`}
          className={btn.icon}
        >
          <Star className={`h-5 w-5 ${person.isKey ? 'fill-amber-400 text-amber-500' : ''}`} aria-hidden />
        </button>
      </div>
      <button type="button" onClick={onShowTasks} className="mt-2 flex min-h-11 w-full items-center justify-between rounded-lg bg-canvas px-3 text-sm hover:bg-accent-soft">
        <span>
          <span className="font-semibold tabular-nums">{s.assigned}</span> assigned ·{' '}
          <span className="font-semibold tabular-nums">{s.completed}</span> done
        </span>
        <span className="text-accent">See tasks →</span>
      </button>
    </li>
  );
}
