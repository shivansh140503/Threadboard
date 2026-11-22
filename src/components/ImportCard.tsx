import { useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, ShieldCheck, Sparkles, Upload } from 'lucide-react';

type Props = {
  onFile: (file: File) => void;
  onSample: () => void;
  busy: boolean;
  error: string | null;
};

export default function ImportCard({ onFile, onSample, busy, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={
          'rounded-card border-2 border-dashed p-6 text-center transition-colors ' +
          (dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface')
        }
      >
        <Upload className="mx-auto h-8 w-8 text-accent" aria-hidden />
        <p className="mt-3 font-medium">Drop your exported chat here</p>
        <p className="text-sm text-ink-muted">.txt or .zip, exported "Without media"</p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.zip,text/plain,application/zip"
          className="sr-only"
          aria-label="Choose a WhatsApp chat export"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-4 min-h-11 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {busy ? 'Reading…' : 'Choose file'}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex gap-3 rounded-card border border-danger/30 bg-red-50 p-4 text-sm text-danger">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onSample}
        disabled={busy}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-surface px-5 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Sparkles className="h-5 w-5" aria-hidden />
        Try with a sample chat
      </button>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="font-semibold">How to export a chat from WhatsApp</h2>
        <div className="mt-3 grid gap-4 text-sm text-ink-muted sm:grid-cols-2">
          <div>
            <h3 className="font-medium text-ink">Android</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Open the group, tap ⋮ → More → Export chat.</li>
              <li>Choose "Without media".</li>
              <li>Save the file, then choose it here.</li>
            </ol>
          </div>
          <div>
            <h3 className="font-medium text-ink">iPhone</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Open the group, tap its name → Export chat.</li>
              <li>Choose "Without media".</li>
              <li>Save to Files, then choose the .zip here.</li>
            </ol>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">Only export a chat if the group is okay with it.</p>
      </section>

      <p className="flex items-center justify-center gap-2 text-sm text-ink-muted">
        <ShieldCheck className="h-4 w-4 text-ok" aria-hidden />
        Your chat is parsed on your device.
      </p>
    </div>
  );
}
