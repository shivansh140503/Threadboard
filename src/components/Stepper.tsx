const STEPS = ['Import', 'Review', 'Dashboard'] as const;

export default function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ' +
                (state === 'todo' ? 'border border-line bg-surface text-ink-muted' : 'bg-accent text-white')
              }
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={state === 'current' ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
