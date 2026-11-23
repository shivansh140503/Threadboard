import { useCallback, useEffect, useRef, useState } from 'react';
import sampleChat from './data/sampleChat.txt?raw';
import sampleResultJson from './data/sampleResult.json';
import { ExtractionSchema } from './ai/schema';
import { ExtractionError, extractChat } from './ai/extract';
import { parseWhatsApp } from './parser/whatsapp';
import { readExport } from './parser/readExport';
import type { Message, ParseResult } from './parser/types';
import type { Board } from './lib/types';
import { buildBoard, finishReview } from './lib/board';
import { hashString } from './lib/ids';
import { chatNameFromFile } from './lib/people';
import {
  consentStore,
  deleteAllData,
  loadBoards,
  loadMessages,
  loadPrefs,
  removeMessages,
  saveBoards,
  saveMessages,
  savePrefs,
} from './lib/storage';
import Stepper from './components/Stepper';
import ImportCard from './components/ImportCard';
import ParseSummary from './components/ParseSummary';
import ConsentModal from './components/ConsentModal';
import Extracting from './components/Extracting';
import ReviewList from './components/ReviewList';
import Dashboard from './components/Dashboard';
import Toast, { type ToastData } from './components/Toast';

type Parsed = {
  chatName: string;
  isSample: boolean;
  text: string;
  chatId: string;
  result: ParseResult;
  confirmedOrder: 'DMY' | 'MDY' | null;
  startedAt: string;
};

type Flow =
  | { kind: 'import' }
  | { kind: 'summary'; parsed: Parsed; error: string | null; consentOpen: boolean }
  | { kind: 'extracting'; parsed: Parsed; done: number; total: number; label: string }
  | { kind: 'review'; warning: string | null }
  | { kind: 'dashboard' };

const consent = consentStore();

function latest(boards: Board[]): Board | null {
  return [...boards].sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0] ?? null;
}

export default function App() {
  const [boards, setBoards] = useState<Board[]>(() => loadBoards());
  const [currentId, setCurrentId] = useState<string | null>(() => latest(boards)?.id ?? null);
  const [messages, setMessages] = useState<Message[] | null>(() => (currentId ? loadMessages(currentId) : null));
  const [flow, setFlow] = useState<Flow>(() => {
    const b = latest(boards);
    if (!b) return { kind: 'import' };
    return b.timing.reviewDoneAt || !b.aiUsed ? { kind: 'dashboard' } : { kind: 'review', warning: null };
  });
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const board = boards.find((b) => b.id === currentId) ?? null;

  useEffect(() => {
    saveBoards(boards);
  }, [boards]);

  const updateBoard = useCallback((next: Board) => {
    setBoards((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  }, []);

  const addBoard = (next: Board, msgs: Message[], keepChat: boolean) => {
    setBoards((prev) => {
      const replaced = prev.filter((b) => b.sourceHash !== next.sourceHash);
      for (const old of prev) if (old.sourceHash === next.sourceHash) removeMessages(old.id);
      return [...replaced, next];
    });
    if (keepChat) saveMessages(next.id, msgs);
    setMessages(msgs);
    setCurrentId(next.id);
  };

  const showToast = (text: string) => setToast({ id: Date.now(), text });
  const showActionToast = (t: Omit<ToastData, 'id'>) => setToast({ id: Date.now(), ...t });

  /** Functional update of the current board; captured id keeps Undo pointed at the right board. */
  const boardId = currentId;
  const mutate = useCallback(
    (fn: (b: Board) => Board) => setBoards((prev) => prev.map((b) => (b.id === boardId ? fn(b) : b))),
    [boardId],
  );

  // ---- Import ----------------------------------------------------------------

  const toSummary = (text: string, chatName: string, isSample: boolean, startedAt: string) => {
    const outcome = parseWhatsApp(text);
    if (!outcome.ok) {
      setImportError(outcome.reason);
      return;
    }
    setImportError(null);
    const parsed: Parsed = {
      chatName,
      isSample,
      text,
      chatId: hashString(text),
      result: outcome.result,
      confirmedOrder: null,
      startedAt,
    };
    setFlow({ kind: 'summary', parsed, error: null, consentOpen: false });
  };

  const onFile = async (file: File) => {
    const startedAt = new Date().toISOString();
    setBusy(true);
    try {
      const read = readExport(new Uint8Array(await file.arrayBuffer()), file.name);
      if (!read.ok) setImportError(read.reason);
      else toSummary(read.text, chatNameFromFile(file.name), false, startedAt);
    } catch {
      setImportError("We couldn't read that file. Try exporting the chat again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Extraction ------------------------------------------------------------

  const runExtraction = (parsed: Parsed, anonymize: boolean, keepChat: boolean) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setFlow({ kind: 'extracting', parsed, done: 0, total: 0, label: '' });
    extractChat(
      { chatId: parsed.chatId, messages: parsed.result.messages, participants: parsed.result.participants, anonymize },
      {
        consent,
        signal: ac.signal,
        onProgress: (p) =>
          setFlow((f) => (f.kind === 'extracting' ? { ...f, done: p.done, total: p.total, label: p.label } : f)),
      },
    )
      .then((out) => {
        if (ac.signal.aborted) return;
        const b = buildBoard(parsed.result, out.extraction, {
          chatName: parsed.chatName,
          isSample: false,
          startedAt: parsed.startedAt,
          aiUsed: true,
          sourceHash: parsed.chatId,
        });
        addBoard(b, parsed.result.messages, keepChat);
        const warning =
          out.failedChunks > 0
            ? `We couldn't read ${out.failedChunks} of ${out.totalChunks} parts of this chat, so some items may be missing.`
            : null;
        setFlow({ kind: 'review', warning });
      })
      .catch((e: unknown) => {
        const cancelled = e instanceof ExtractionError && e.code === 'cancelled';
        const message = cancelled
          ? null
          : e instanceof ExtractionError
            ? e.message
            : 'Something went wrong while reading the chat. Your chat is still here; try again.';
        setFlow({ kind: 'summary', parsed, error: message, consentOpen: false });
      });
  };

  const continueWithoutAi = (parsed: Parsed) => {
    const b = buildBoard(parsed.result, null, {
      chatName: parsed.chatName,
      isSample: parsed.isSample,
      startedAt: parsed.startedAt,
      aiUsed: false,
      sourceHash: parsed.chatId,
    });
    addBoard(finishReview(b), parsed.result.messages, loadPrefs().keepChat);
    setFlow({ kind: 'dashboard' });
  };

  const onContinueFromSummary = (parsed: Parsed) => {
    if (parsed.isSample) {
      // Demo mode: zero API calls, cached result.
      const b = buildBoard(parsed.result, ExtractionSchema.parse(sampleResultJson), {
        chatName: parsed.chatName,
        isSample: true,
        startedAt: parsed.startedAt,
        aiUsed: true,
        sourceHash: parsed.chatId,
      });
      addBoard(b, parsed.result.messages, true);
      setFlow({ kind: 'review', warning: null });
      return;
    }
    if (consent.has(parsed.chatId)) {
      const prefs = loadPrefs();
      runExtraction(parsed, prefs.anonymize, prefs.keepChat);
    } else {
      setFlow({ kind: 'summary', parsed, error: null, consentOpen: true });
    }
  };

  const deleteAll = () => {
    deleteAllData();
    setBoards([]);
    setCurrentId(null);
    setMessages(null);
    setFlow({ kind: 'import' });
    showToast('All your data was deleted from this device.');
  };

  const wide = flow.kind === 'dashboard' ? 'max-w-5xl' : 'max-w-2xl';
  const step = flow.kind === 'import' || flow.kind === 'summary' || flow.kind === 'extracting' ? 0 : flow.kind === 'review' ? 1 : 2;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto flex ${wide} flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between`}>
          <h1 className="text-xl font-bold text-accent">ThreadBoard</h1>
          <Stepper current={step} />
        </div>
      </header>

      <main className={`mx-auto ${wide} px-4 py-6`}>
        {flow.kind === 'import' && (
          <>
            <p className="mb-6 text-lg text-ink-muted">Paste your group chat, get a to-do board that shows who's doing what.</p>
            <ImportCard
              onFile={onFile}
              onSample={() => toSummary(sampleChat, 'Annual Day Committee', true, new Date().toISOString())}
              busy={busy}
              error={importError}
            />
          </>
        )}

        {flow.kind === 'summary' && (
          <>
            <ParseSummary
              chatName={flow.parsed.chatName}
              isSample={flow.parsed.isSample}
              result={flow.parsed.result}
              confirmedOrder={flow.parsed.confirmedOrder}
              onConfirmOrder={(order) => {
                const re = parseWhatsApp(flow.parsed.text, { dateOrder: order });
                if (re.ok) setFlow({ ...flow, parsed: { ...flow.parsed, result: re.result, confirmedOrder: order } });
              }}
              onBack={() => setFlow({ kind: 'import' })}
              continueLabel={flow.parsed.isSample ? 'Review the sample results' : 'Find tasks with AI'}
              continueNote={flow.parsed.isSample ? 'Sample results are prepared in advance. No AI is called.' : undefined}
              onContinue={() => onContinueFromSummary(flow.parsed)}
              error={flow.error}
              onSkipAi={flow.parsed.isSample ? undefined : () => continueWithoutAi(flow.parsed)}
            />
            {flow.consentOpen && (
              <ConsentModal
                messageCount={flow.parsed.result.messages.filter((m) => !m.isSystem).length}
                defaultAnonymize={loadPrefs().anonymize}
                onClose={() => setFlow({ ...flow, consentOpen: false })}
                onDecline={() => continueWithoutAi(flow.parsed)}
                onAllow={({ anonymize, keepChat }) => {
                  consent.grant(flow.parsed.chatId);
                  savePrefs({ anonymize, keepChat });
                  runExtraction(flow.parsed, anonymize, keepChat);
                }}
              />
            )}
          </>
        )}

        {flow.kind === 'extracting' && (
          <Extracting
            done={flow.done}
            total={flow.total}
            label={flow.label}
            onCancel={() => {
              abortRef.current?.abort();
              setFlow({ kind: 'summary', parsed: flow.parsed, error: null, consentOpen: false });
            }}
          />
        )}

        {flow.kind === 'review' && board && (
          <ReviewList
            board={board}
            messages={messages}
            warning={flow.warning}
            onChange={updateBoard}
            onContinue={() => {
              updateBoard(finishReview(board));
              setFlow({ kind: 'dashboard' });
            }}
            onCopied={(ok) => showToast(ok ? 'Results copied.' : "Couldn't copy. Select and copy manually.")}
          />
        )}

        {flow.kind === 'dashboard' && board && (
          <Dashboard
            board={board}
            boards={boards}
            messages={messages}
            mutate={mutate}
            toast={showActionToast}
            onSwitchBoard={(id) => {
              setCurrentId(id);
              setMessages(loadMessages(id));
            }}
            onNewChat={() => setFlow({ kind: 'import' })}
            onDeleteAll={deleteAll}
            onBackToReview={() => setFlow({ kind: 'review', warning: null })}
          />
        )}

        {(flow.kind === 'review' || flow.kind === 'dashboard') && !board && (
          <p className="text-ink-muted">
            Nothing here yet.{' '}
            <button type="button" className="font-semibold text-accent underline" onClick={() => setFlow({ kind: 'import' })}>
              Import a chat
            </button>
          </p>
        )}
      </main>

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
