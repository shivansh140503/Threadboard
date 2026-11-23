import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

type Props = {
  messageCount: number;
  defaultAnonymize: boolean;
  onAllow: (opts: { anonymize: boolean; keepChat: boolean }) => void;
  onDecline: (opts: { keepChat: boolean }) => void;
  onClose: () => void;
};

export default function ConsentModal({ messageCount, defaultAnonymize, onAllow, onDecline, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [anonymize, setAnonymize] = useState(defaultAnonymize);
  const [keepChat, setKeepChat] = useState(true);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="consent-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-accent" aria-hidden />
          <h2 id="consent-title" className="text-lg font-bold">
            Send this chat to AI?
          </h2>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">What is sent</dt>
            <dd className="text-ink-muted">
              The text of {messageCount.toLocaleString()} messages, sender names, and any numbers in the text (like
              amounts or phone numbers).
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Who receives it</dt>
            <dd className="text-ink-muted">
              ThreadBoard's server (hosted on Vercel), which passes it straight to Anthropic's Claude AI. Our server
              does not save it. Anthropic processes it under its commercial API terms.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Why</dt>
            <dd className="text-ink-muted">To find tasks, decisions, budget items and who does what.</dd>
          </div>
          <div>
            <dt className="font-semibold">What is not sent</dt>
            <dd className="text-ink-muted">Photos, videos, files, system notices, and any other chats.</dd>
          </div>
        </dl>

        <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line p-3">
          <input
            type="checkbox"
            checked={anonymize}
            onChange={(e) => setAnonymize(e.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--color-accent)]"
          />
          <span className="text-sm">
            <span className="font-semibold">Anonymize names and numbers</span>
            <span className="block text-ink-muted">
              Names, phone numbers and emails are swapped for codes like "Person A" before sending, and swapped back
              on your device. Other details in messages (and surnames used on their own) are still sent.
            </span>
          </span>
        </label>

        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line p-3">
          <input
            type="checkbox"
            checked={keepChat}
            onChange={(e) => setKeepChat(e.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--color-accent)]"
          />
          <span className="text-sm">
            <span className="font-semibold">Keep chat on this device</span>
            <span className="block text-ink-muted">So you can see the source message for each item later.</span>
          </span>
        </label>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            autoFocus
            onClick={() => onAllow({ anonymize, keepChat })}
            className="min-h-11 flex-1 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong"
          >
            Allow for this chat
          </button>
          <button
            type="button"
            onClick={() => onDecline({ keepChat })}
            className="min-h-11 flex-1 rounded-lg border border-line px-4 font-semibold hover:bg-canvas"
          >
            Don't allow
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-ink-muted">If you don't allow it, you can still add tasks by hand.</p>
      </div>
    </dialog>
  );
}
