import { CheckCircle2, Circle, HelpCircle } from 'lucide-react';
import type { Extraction } from '../ai/schema';
import type { Message } from '../parser/types';
import { initials } from '../lib/people';

type Props = { extraction: Extraction; messages: Message[]; onBack: () => void };

/**
 * Block 1b stand-in for the review + dashboard screens: shows the cached
 * sample extraction read-only. Replaced in Phases 2–3.
 */
export default function SamplePreview({ extraction, messages, onBack }: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-card border border-accent/30 bg-accent-soft p-3 text-sm text-accent">
        Sample results, prepared in advance. No AI was called. The full review and dashboard are coming soon.
      </div>

      <section>
        <h2 className="text-lg font-bold">Tasks found ({extraction.tasks.length})</h2>
        <ul className="mt-3 space-y-2">
          {extraction.tasks.map((t, i) => {
            const source = messages[t.evidence_idx[0] ?? -1];
            return (
              <li key={i} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-start gap-3">
                  <StatusIcon status={t.status_hint} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                      {t.owner ? (
                        <span className="flex items-center gap-1">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent" aria-hidden>
                            {initials(t.owner)}
                          </span>
                          {t.owner}
                        </span>
                      ) : (
                        <span>No owner yet</span>
                      )}
                      {t.due_text && <span>· {t.due_text}</span>}
                      {t.status_hint === 'done' && <span className="text-ok">· Suggested done</span>}
                    </p>
                    {source && (
                      <p className="mt-2 border-l-2 border-line pl-2 text-xs text-ink-muted">
                        {source.sender}: "{source.text}"
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <button type="button" onClick={onBack} className="min-h-11 rounded-lg px-4 font-medium text-ink-muted hover:text-ink">
        ← Back to import
      </button>
    </div>
  );
}

function StatusIcon({ status }: { status: 'pending' | 'done' | 'unclear' }) {
  if (status === 'done') return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-label="Suggested done" />;
  if (status === 'unclear') return <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-label="Unclear" />;
  return <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-label="Pending" />;
}
