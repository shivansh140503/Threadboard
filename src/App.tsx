import { useMemo } from 'react';
import sampleChat from './data/sampleChat.txt?raw';
import { parseWhatsApp } from './parser/whatsapp';

// Phase 1 placeholder: proves the parser runs in the browser bundle.
// Replaced by the import flow in Phase 2.
export default function App() {
  const outcome = useMemo(() => parseWhatsApp(sampleChat), []);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold text-accent">ThreadBoard</h1>
      <p className="mt-2 text-ink-muted">Paste your group chat, get a to-do board that shows who's doing what.</p>
      <section className="mt-8 rounded-card border border-line bg-surface p-4">
        <h2 className="font-semibold">Sample chat parse check</h2>
        {outcome.ok ? (
          <ul className="mt-2 text-sm text-ink-muted">
            <li>Format: {outcome.result.format}</li>
            <li>Messages: {outcome.result.messages.length}</li>
            <li>Participants: {outcome.result.participants.join(', ')}</li>
            <li>Warnings: {outcome.result.warnings.length}</li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-danger">{outcome.reason}</p>
        )}
      </section>
    </main>
  );
}
