import { useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Message } from '../parser/types';
import type { Board, Task } from '../lib/types';
import {
  addTask,
  confirmSuggestedDone,
  deleteTask,
  dismissSuggestedDone,
  editTask,
  filterTasks,
  restoreTask,
  todayLocal,
  toggleTask,
  visibleTasks,
  type TaskDraft,
  type TaskFilter,
} from '../lib/dashboard';
import { formatDay } from '../lib/dates';
import Evidence from './Evidence';
import { Avatar, EmptyState, btn } from './ui';
import type { ToastData } from './Toast';

type Props = {
  board: Board;
  messages: Message[] | null;
  mutate: (fn: (b: Board) => Board) => void;
  toast: (t: Omit<ToastData, 'id'>) => void;
  filter: TaskFilter;
  setFilter: (f: TaskFilter) => void;
};

export default function TaskList({ board, messages, mutate, toast, filter, setFilter }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const all = visibleTasks(board);
  const shown = filterTasks(all, filter);
  const people = new Map(board.people.map((p) => [p.id, p]));

  /** Run a change to one task with a 5-second Undo that restores the exact previous task. */
  const withUndo = (task: Task, change: (b: Board) => Board, message: string) => {
    const index = board.tasks.findIndex((t) => t.id === task.id);
    mutate(change);
    toast({ text: message, actionLabel: 'Undo', onAction: () => mutate((b) => restoreTask(b, task, index)) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder="Search tasks"
            className="min-h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Filter by person</span>
            <select
              value={filter.personId}
              onChange={(e) => setFilter({ ...filter, personId: e.target.value })}
              className="min-h-11 w-full rounded-lg border border-line bg-surface px-2 sm:w-40"
            >
              <option value="all">Everyone</option>
              <option value="none">No owner</option>
              {board.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="sr-only">Filter by status</span>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value as TaskFilter['status'] })}
              className="min-h-11 w-full rounded-lg border border-line bg-surface px-2 sm:w-32"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
          </label>
        </div>
      </div>

      {adding ? (
        <TaskForm
          board={board}
          initial={{ title: '', ownerId: filter.personId !== 'all' && filter.personId !== 'none' ? filter.personId : null, dueText: null, dueDate: null }}
          onCancel={() => setAdding(false)}
          onSave={(d) => {
            mutate((b) => addTask(b, d).board);
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${btn.secondary} flex w-full items-center justify-center gap-2`}>
          <Plus className="h-4 w-4" aria-hidden /> Add a task
        </button>
      )}

      {all.length === 0 ? (
        <EmptyState title="No tasks yet">Add the first one above.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No tasks match">
          <button type="button" className="font-semibold text-accent underline" onClick={() => setFilter({ personId: 'all', status: 'all', query: '' })}>
            Clear filters
          </button>
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) =>
            editingId === t.id ? (
              <li key={t.id}>
                <TaskForm
                  board={board}
                  initial={{ title: t.title, ownerId: t.ownerId, dueText: t.dueText, dueDate: t.dueDate }}
                  onCancel={() => setEditingId(null)}
                  onSave={(d) => {
                    mutate((b) => editTask(b, t.id, d));
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <TaskRow
                key={t.id}
                task={t}
                ownerName={t.ownerId ? (people.get(t.ownerId)?.name ?? null) : null}
                messages={messages}
                onToggle={() => withUndo(t, (b) => toggleTask(b, t.id), t.status === 'done' ? 'Marked not done' : 'Marked done')}
                onConfirm={() => withUndo(t, (b) => confirmSuggestedDone(b, t.id), 'Marked done')}
                onDismiss={() => withUndo(t, (b) => dismissSuggestedDone(b, t.id), 'Kept as pending')}
                onEdit={() => setEditingId(t.id)}
                onDelete={() => withUndo(t, (b) => deleteTask(b, t.id), 'Task deleted')}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function TaskRow(props: {
  task: Task;
  ownerName: string | null;
  messages: Message[] | null;
  onToggle: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { task: t, ownerName } = props;
  const [open, setOpen] = useState(false);
  const done = t.status === 'done';
  const overdue = !done && t.dueDate !== null && t.dueDate < todayLocal();

  return (
    <li className="rounded-card border border-line bg-surface p-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={props.onToggle}
          aria-pressed={done}
          aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
              done ? 'border-ok bg-ok text-white' : 'border-ink-muted/50 text-transparent'
            }`}
          >
            <Check className="h-4 w-4" aria-hidden />
          </span>
        </button>
        <div className="min-w-0 flex-1 py-2">
          <p
            className={`break-words font-medium line-through decoration-2 transition-[text-decoration-color,color] duration-300 ${
              done ? 'text-ink-muted decoration-ink-muted' : 'decoration-transparent'
            }`}
          >
            {t.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <span className="flex items-center gap-1">
              <Avatar name={ownerName} size="sm" />
              {ownerName ?? 'No owner'}
            </span>
            {t.dueText && <span>· {t.dueText}</span>}
            {t.dueDate && <span className={overdue ? 'font-semibold text-danger' : ''}>· {overdue ? 'Overdue, ' : ''}{formatDay(t.dueDate)}</span>}
            {t.source === 'ai' && !t.confirmed && (
              <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent" title="Found by AI, not yet checked">
                AI
              </span>
            )}
          </div>
          {!done && t.aiSuggestedDone && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2 py-1 text-sm">
              <span className="font-medium text-warn">Suggested done — confirm?</span>
              <button type="button" onClick={props.onConfirm} className="min-h-11 rounded-md px-2 font-semibold text-ok">
                Yes, it's done
              </button>
              <button type="button" onClick={props.onDismiss} className="min-h-11 rounded-md px-2 font-medium text-ink-muted">
                Not yet
              </button>
            </div>
          )}
          {open && <Evidence idx={t.evidenceIdx} messages={props.messages} />}
        </div>
        <div className="flex shrink-0 flex-col sm:flex-row">
          {t.evidenceIdx.length > 0 && (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Show source messages" className={btn.icon}>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
          )}
          <button type="button" onClick={props.onEdit} aria-label={`Edit "${t.title}"`} className={btn.icon}>
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={props.onDelete} aria-label={`Delete "${t.title}"`} className={btn.icon}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

function TaskForm({ board, initial, onSave, onCancel }: { board: Board; initial: TaskDraft; onSave: (d: TaskDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<TaskDraft>(initial);
  return (
    <form
      className="space-y-3 rounded-card border border-accent/40 bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (d.title.trim()) onSave(d);
      }}
    >
      <label className="block text-sm">
        <span className="font-medium">Task</span>
        <input
          autoFocus
          required
          maxLength={300}
          value={d.title}
          onChange={(e) => setD({ ...d, title: e.target.value })}
          className="mt-1 min-h-11 w-full rounded-lg border border-line px-3"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Owner</span>
          <select
            value={d.ownerId ?? ''}
            onChange={(e) => setD({ ...d, ownerId: e.target.value || null })}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-2"
          >
            <option value="">No owner</option>
            {board.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Deadline (words)</span>
          <input
            maxLength={100}
            value={d.dueText ?? ''}
            placeholder="e.g. by Friday"
            onChange={(e) => setD({ ...d, dueText: e.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-line px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Due date</span>
          <input
            type="date"
            value={d.dueDate ?? ''}
            onChange={(e) => setD({ ...d, dueDate: e.target.value || null })}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btn.secondary}>
          Cancel
        </button>
        <button type="submit" disabled={!d.title.trim()} className={btn.primary}>
          Save
        </button>
      </div>
    </form>
  );
}
