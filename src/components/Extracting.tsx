type Props = { done: number; total: number; label: string; onCancel: () => void };

export default function Extracting({ done, total, label, onCancel }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-5 rounded-card border border-line bg-surface p-5" aria-live="polite">
      <h2 className="text-lg font-bold">Finding tasks…</h2>
      <p className="text-sm text-ink-muted">{label || 'Starting…'}</p>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-canvas"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Extraction progress"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <p className="text-xs text-ink-muted">Long chats take a minute or two. Keep this tab open.</p>
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-card bg-canvas" />
        ))}
      </div>
      <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4 font-medium hover:bg-canvas">
        Cancel
      </button>
    </div>
  );
}
