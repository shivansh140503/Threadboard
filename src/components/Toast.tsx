import { useEffect } from 'react';

export type ToastData = { id: number; text: string; actionLabel?: string; onAction?: () => void };

type Props = { toast: ToastData | null; onDone: () => void; durationMs?: number };

export default function Toast({ toast, onDone, durationMs = 5000 }: Props) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [toast, onDone, durationMs]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex items-center gap-4 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
        <span>{toast.text}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onDone();
            }}
            className="min-h-11 font-semibold text-indigo-200 underline"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
