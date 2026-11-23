import type { Message } from '../parser/types';
import { formatDay } from '../lib/dates';

type Props = { idx: number[]; messages: Message[] | null; max?: number };

/** Source messages for an item. Rendered as plain text, never HTML. */
export default function Evidence({ idx, messages, max = 3 }: Props) {
  if (!messages) {
    return <p className="mt-2 text-xs text-ink-muted">Source messages aren't kept on this device.</p>;
  }
  const shown = idx.slice(0, max).map((i) => messages[i]).filter((m): m is Message => Boolean(m));
  if (shown.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {shown.map((m) => (
        <li key={m.idx} className="border-l-2 border-accent/40 pl-2 text-xs text-ink-muted">
          <span className="font-medium text-ink">{m.sender ?? 'System'}</span>
          <span> · {formatDay(m.ts)}</span>
          <p className="line-clamp-3 whitespace-pre-line break-words">{m.text}</p>
        </li>
      ))}
      {idx.length > max && <li className="pl-2 text-xs text-ink-muted">+{idx.length - max} more</li>}
    </ul>
  );
}
