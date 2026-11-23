import { useState, type ComponentType } from 'react';
import { LayoutDashboard, ListChecks, Settings, Users, Wallet } from 'lucide-react';
import type { Message } from '../parser/types';
import type { Board } from '../lib/types';
import type { TaskFilter } from '../lib/dashboard';
import Overview from './Overview';
import TaskList from './TaskList';
import PeopleGrid from './PeopleGrid';
import BudgetPanel from './BudgetPanel';
import SettingsPanel from './SettingsPanel';
import type { ToastData } from './Toast';

type Tab = 'overview' | 'tasks' | 'people' | 'budget' | 'settings';

const TABS: Array<{ id: Tab; label: string; Icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', Icon: ListChecks },
  { id: 'people', label: 'People', Icon: Users },
  { id: 'budget', label: 'Budget', Icon: Wallet },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

type Props = {
  board: Board;
  boards: Board[];
  messages: Message[] | null;
  mutate: (fn: (b: Board) => Board) => void;
  toast: (t: Omit<ToastData, 'id'>) => void;
  onSwitchBoard: (id: string) => void;
  onDeleteAll: () => void;
  onNewChat: () => void;
  onBackToReview: () => void;
};

export default function Dashboard(props: Props) {
  const { board } = props;
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<TaskFilter>({ personId: 'all', status: 'all', query: '' });

  const showTasksFor = (personId?: string) => {
    setFilter({ personId: personId ?? 'all', status: 'all', query: '' });
    setTab('tasks');
  };

  return (
    <div className="lg:flex lg:gap-8">
      <nav aria-label="Dashboard" className="hidden lg:block lg:w-48 lg:shrink-0">
        <ul className="sticky top-4 space-y-1">
          {TABS.map(({ id, label, Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 font-medium ${
                  tab === id ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <Icon className="h-5 w-5" /> {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 pb-24 lg:pb-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {props.boards.length > 1 ? (
              <label>
                <span className="sr-only">Switch board</span>
                <select
                  value={board.id}
                  onChange={(e) => props.onSwitchBoard(e.target.value)}
                  className="min-h-11 max-w-full rounded-lg border border-line bg-surface px-2 text-lg font-bold"
                >
                  {props.boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.chatName}
                      {b.isSample ? ' (sample)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <h2 className="truncate text-xl font-bold">{board.chatName}</h2>
            )}
          </div>
          {board.isSample && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Sample chat</span>}
        </div>

        {tab === 'overview' && <Overview board={board} onGoTasks={showTasksFor} />}
        {tab === 'tasks' && (
          <TaskList board={board} messages={props.messages} mutate={props.mutate} toast={props.toast} filter={filter} setFilter={setFilter} />
        )}
        {tab === 'people' && <PeopleGrid board={board} mutate={props.mutate} onShowTasks={showTasksFor} />}
        {tab === 'budget' && <BudgetPanel board={board} messages={props.messages} />}
        {tab === 'settings' && (
          <SettingsPanel
            board={board}
            onDeleteAll={props.onDeleteAll}
            onNewChat={props.onNewChat}
            onBackToReview={props.onBackToReview}
            onCopied={(ok) => props.toast({ text: ok ? 'Results copied.' : "Couldn't copy. Select and copy manually." })}
          />
        )}
      </div>

      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden">
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map(({ id, label, Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  tab === id ? 'text-accent' : 'text-ink-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
