import type { ReactNode } from 'react';
import { initials } from '../lib/people';

export function Avatar({ name, size = 'md' }: { name: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-8 w-8 text-xs';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${cls} ${
        name ? 'bg-accent-soft text-accent' : 'border border-dashed border-line text-ink-muted'
      }`}
    >
      {name ? initials(name) : '?'}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

/** Single-value progress ring. The number in the middle carries the meaning; the ring is decoration. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : done / total;
  return (
    <div className="relative h-36 w-36" role="img" aria-label={`${done} of ${total} tasks done`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ opacity: total === 0 ? 0 : 1 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{Math.round(frac * 100)}%</span>
        <span className="text-xs text-ink-muted">
          {done} of {total} done
        </span>
      </div>
    </div>
  );
}

export function StatTile({ label, value, tone = 'ink', hint }: { label: string; value: number | string; tone?: 'ink' | 'danger' | 'warn'; hint?: string }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${color}`}>{value}</dd>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export const btn = {
  primary: 'min-h-11 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong disabled:opacity-50',
  secondary: 'min-h-11 rounded-lg border border-line bg-surface px-4 font-medium hover:bg-canvas',
  icon: 'flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink',
};
