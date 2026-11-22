import { useState } from 'react';
import sampleChat from './data/sampleChat.txt?raw';
import sampleResultJson from './data/sampleResult.json';
import { ExtractionSchema, type Extraction } from './ai/schema';
import { parseWhatsApp } from './parser/whatsapp';
import { readExport } from './parser/readExport';
import type { ParseResult } from './parser/types';
import { chatNameFromFile } from './lib/people';
import Stepper from './components/Stepper';
import ImportCard from './components/ImportCard';
import ParseSummary from './components/ParseSummary';
import SamplePreview from './components/SamplePreview';

type Stage =
  | { kind: 'import' }
  | {
      kind: 'summary';
      chatName: string;
      isSample: boolean;
      text: string;
      result: ParseResult;
      confirmedOrder: 'DMY' | 'MDY' | null;
    }
  | { kind: 'samplePreview'; result: ParseResult; extraction: Extraction };

export default function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'import' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showSummary = (text: string, chatName: string, isSample: boolean) => {
    const outcome = parseWhatsApp(text);
    if (!outcome.ok) {
      setError(outcome.reason);
      return;
    }
    setError(null);
    setStage({ kind: 'summary', chatName, isSample, text, result: outcome.result, confirmedOrder: null });
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const read = readExport(bytes, file.name);
      if (!read.ok) setError(read.reason);
      else showSummary(read.text, chatNameFromFile(file.name), false);
    } catch {
      setError("We couldn't read that file. Try exporting the chat again.");
    } finally {
      setBusy(false);
    }
  };

  const onSample = () => showSummary(sampleChat, 'Annual Day Committee', true);

  const step = stage.kind === 'import' ? 0 : stage.kind === 'summary' ? 0 : 1;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-accent">ThreadBoard</h1>
          <Stepper current={step} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {stage.kind === 'import' && (
          <>
            <p className="mb-6 text-lg text-ink-muted">Paste your group chat, get a to-do board that shows who's doing what.</p>
            <ImportCard onFile={onFile} onSample={onSample} busy={busy} error={error} />
          </>
        )}

        {stage.kind === 'summary' && (
          <ParseSummary
            chatName={stage.chatName}
            isSample={stage.isSample}
            result={stage.result}
            confirmedOrder={stage.confirmedOrder}
            onConfirmOrder={(order) => {
              const re = parseWhatsApp(stage.text, { dateOrder: order });
              if (re.ok) setStage({ ...stage, result: re.result, confirmedOrder: order });
            }}
            onBack={() => setStage({ kind: 'import' })}
            continueLabel={stage.isSample ? 'See the sample results' : 'Find tasks with AI'}
            continueNote={stage.isSample ? undefined : 'AI extraction arrives in the next update. Try the sample for now.'}
            onContinue={() => {
              if (!stage.isSample) return; // Phase 2: consent modal + extraction
              const extraction = ExtractionSchema.parse(sampleResultJson);
              setStage({ kind: 'samplePreview', result: stage.result, extraction });
            }}
          />
        )}

        {stage.kind === 'samplePreview' && (
          <SamplePreview
            extraction={stage.extraction}
            messages={stage.result.messages}
            onBack={() => setStage({ kind: 'import' })}
          />
        )}
      </main>
    </div>
  );
}
