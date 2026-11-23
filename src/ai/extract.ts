import type { Message } from '../parser/types';
import type { ConsentStore } from '../lib/storage';
import { ExtractionSchema, type Extraction } from './schema';
import { createAnonymizer, identityAnonymizer, type Anonymizer } from './anonymize';
import { aiInputMessages, chunkLines, formatLine, type Chunk } from './chunk';
import { mergeExtractions } from './merge';

/** Thrown before any network call if the user has not consented for this chat. */
export class ConsentRequiredError extends Error {
  constructor() {
    super('Consent is required before chat text can be sent to AI.');
    this.name = 'ConsentRequiredError';
  }
}

/** A failure the user should see. `message` is always friendly. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly code: 'network' | 'limit' | 'unavailable' | 'invalid' | 'cancelled',
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/** The model's answer could not be used, but a second try may work (bad JSON, cut off, failed zod). */
class RetryableAnswer extends Error {
  constructor(readonly hint: string) {
    super(hint);
  }
}

export type ExtractRequest = { participants: string[]; lines: string[]; retryError?: string };

export type ExtractInput = {
  chatId: string;
  messages: Message[];
  participants: string[];
  anonymize: boolean;
};

export type ExtractDeps = {
  consent: ConsentStore;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (p: { done: number; total: number; label: string }) => void;
  endpoint?: string;
  concurrency?: number;
};

export type ExtractOutput = { extraction: Extraction; totalChunks: number; failedChunks: number };

const ENDPOINT = '/api/extract';

type Ctx = { deps: ExtractDeps; signal: AbortSignal };

async function postChunk(body: ExtractRequest, ctx: Ctx): Promise<unknown> {
  const doFetch = ctx.deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ctx.deps.endpoint ?? ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
  } catch {
    if (ctx.signal.aborted) throw new ExtractionError('Cancelled.', 'cancelled');
    throw new ExtractionError("We couldn't reach the server. Check your connection and try again.", 'network');
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON error page */
  }
  const code = (payload as { error?: { code?: string } } | null)?.error?.code;
  if (res.status === 429) {
    throw new ExtractionError(
      'The AI is busy or today’s limit for this demo has been reached. Try again later, or try the sample chat.',
      'limit',
    );
  }
  if (code === 'bad_json') throw new RetryableAnswer('Your previous answer was not valid JSON. Return only the JSON object.');
  if (code === 'truncated') {
    throw new RetryableAnswer('Your previous answer was cut off. Return the JSON object with shorter titles and only clear items.');
  }
  if (!res.ok) {
    throw new ExtractionError('The AI service is unavailable right now. Your chat is still here; try again in a minute.', 'unavailable');
  }
  const data = (payload as { data?: unknown } | null)?.data;
  if (data === undefined) throw new ExtractionError('The AI returned an unexpected response.', 'invalid');
  return data;
}

function summariseZodError(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues
    .slice(0, 10)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/** Keep only evidence that points at messages in this chunk; drop items left with none. */
function sanitise(ex: Extraction, chunk: Chunk, anon: Anonymizer): Extraction {
  const allowed = new Set(chunk.lines.map((l) => l.idx));
  const ev = (idx: number[]) => [...new Set(idx.filter((i) => allowed.has(i)))].sort((a, b) => a - b);
  const keep = <T extends { evidence_idx: number[] }>(items: T[]) =>
    items.map((i) => ({ ...i, evidence_idx: ev(i.evidence_idx) })).filter((i) => i.evidence_idx.length > 0);
  const back = (s: string) => anon.back(s);
  const backN = (s: string | null) => (s === null ? null : anon.back(s));
  const cap = ex.budget_cap ? { ...ex.budget_cap, evidence_idx: ev(ex.budget_cap.evidence_idx) } : null;

  return {
    tasks: keep(ex.tasks).map((t) => ({ ...t, title: back(t.title), owner: backN(t.owner), due_text: backN(t.due_text) })),
    decisions: keep(ex.decisions).map((d) => ({ ...d, text: back(d.text) })),
    open_questions: keep(ex.open_questions).map((d) => ({ ...d, text: back(d.text) })),
    budget: keep(ex.budget).map((b) => ({ ...b, label: back(b.label) })),
    budget_cap: cap && cap.evidence_idx.length > 0 ? cap : null,
    roles: keep(ex.roles).map((r) => ({ ...r, person: back(r.person), role: back(r.role) })),
  };
}

/** One attempt: returns validated data or throws RetryableAnswer / ExtractionError. */
async function attempt(body: ExtractRequest, ctx: Ctx): Promise<Extraction> {
  const raw = await postChunk(body, ctx);
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) throw new RetryableAnswer(`Your previous answer failed validation: ${summariseZodError(parsed.error)}`);
  return parsed.data;
}

/** Invalid JSON, a cut-off answer or a schema failure gets exactly one retry, told what went wrong. */
async function extractChunk(chunk: Chunk, participants: string[], ctx: Ctx): Promise<Extraction> {
  const body: ExtractRequest = { participants, lines: chunk.lines.map((l) => l.line) };
  try {
    return await attempt(body, ctx);
  } catch (e) {
    if (!(e instanceof RetryableAnswer)) throw e;
    try {
      return await attempt({ ...body, retryError: e.hint }, ctx);
    } catch (e2) {
      if (e2 instanceof RetryableAnswer) throw new ExtractionError('The AI returned results we could not read.', 'invalid');
      throw e2;
    }
  }
}

/**
 * The only function that sends chat text over the network.
 * Consent is checked here, first, before anything else happens.
 */
export async function extractChat(input: ExtractInput, deps: ExtractDeps): Promise<ExtractOutput> {
  if (!deps.consent.has(input.chatId)) throw new ConsentRequiredError();

  // Internal abort: a user cancel OR a fatal error (limit reached) stops every worker and in-flight request.
  const stop = new AbortController();
  const onUserAbort = () => stop.abort();
  if (deps.signal?.aborted) stop.abort();
  deps.signal?.addEventListener('abort', onUserAbort);
  const ctx: Ctx = { deps, signal: stop.signal };

  const anon = input.anonymize ? createAnonymizer(input.participants) : identityAnonymizer;
  const lines = aiInputMessages(input.messages).map((m) => formatLine(m, anon));
  const chunks = chunkLines(lines);
  const participants = input.participants.map((p) => anon.sender(p));

  const results: Extraction[] = [];
  let failed = 0;
  let done = 0;
  let firstError: ExtractionError | null = null;
  let fatal: ExtractionError | null = null;
  const total = chunks.length;
  deps.onProgress?.({ done: 0, total, label: total ? `Reading messages 1–${Math.min(300, lines.length)}` : '' });

  let next = 0;
  const worker = async () => {
    while (next < chunks.length && !stop.signal.aborted) {
      const chunk = chunks[next++]!;
      try {
        results.push(sanitise(await extractChunk(chunk, participants, ctx), chunk, anon));
      } catch (e) {
        if (stop.signal.aborted) return; // another worker already stopped the run
        if (e instanceof ExtractionError && (e.code === 'cancelled' || e.code === 'limit')) {
          fatal = e;
          stop.abort();
          return;
        }
        failed++;
        firstError ??= e instanceof ExtractionError ? e : new ExtractionError('Something went wrong reading part of the chat.', 'invalid');
      }
      done++;
      deps.onProgress?.({ done, total, label: `Read ${done} of ${total} parts` });
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? 3, Math.max(chunks.length, 1)) }, worker));
  } finally {
    deps.signal?.removeEventListener('abort', onUserAbort);
  }

  if (deps.signal?.aborted) throw new ExtractionError('Cancelled.', 'cancelled');
  if (fatal) throw fatal;
  if (total > 0 && failed === total && firstError) throw firstError;
  return { extraction: mergeExtractions(results, input.participants), totalChunks: total, failedChunks: failed };
}
