import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConsentRequiredError, ExtractionError, extractChat, type ExtractRequest } from '../src/ai/extract';
import { consentStore, memoryKV } from '../src/lib/storage';
import { parseWhatsApp } from '../src/parser/whatsapp';

const chat = readFileSync(resolve(process.cwd(), 'src/data/sampleChat.txt'), 'utf8');
const parsed = parseWhatsApp(chat);
if (!parsed.ok) throw new Error('sample must parse');
const { messages, participants } = parsed.result;
const CHAT_ID = 'chat-1';

const emptyResult = { tasks: [], decisions: [], open_questions: [], budget: [], budget_cap: null, roles: [] };

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function bodies(fetchMock: ReturnType<typeof vi.fn>): ExtractRequest[] {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string) as ExtractRequest);
}

describe('consent guard', () => {
  it('makes NO network request without recorded consent', async () => {
    const fetchMock = vi.fn(async () => okResponse(emptyResult));
    const consent = consentStore(memoryKV());
    await expect(
      extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consent for a different chat does not count', async () => {
    const fetchMock = vi.fn(async () => okResponse(emptyResult));
    const consent = consentStore(memoryKV());
    consent.grant('another-chat');
    await expect(
      extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revoked consent blocks again', async () => {
    const fetchMock = vi.fn(async () => okResponse(emptyResult));
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    consent.revoke(CHAT_ID);
    await expect(
      extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with consent, sends only non-system messages with stable indexes', async () => {
    const fetchMock = vi.fn(async () => okResponse(emptyResult));
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    await extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    const sent = body!.lines.join('\n');
    expect(sent).not.toContain('end-to-end encrypted');
    expect(sent).not.toContain('<Media omitted>');
    expect(sent).not.toContain('This message was deleted');
    expect(body!.lines[0]).toMatch(/^\[3\] Priya Sharma: /);
  });
});

describe('anonymize', () => {
  it('sends no participant names, first names or phone numbers, and maps them back', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const req = JSON.parse(init?.body as string) as ExtractRequest;
      // Simulate the model answering with tokens.
      const meeraToken = req.participants[1]!;
      return okResponse({
        ...emptyResult,
        tasks: [
          { title: `${meeraToken} prints certificates`, owner: meeraToken, due_text: null, status_hint: 'pending', evidence_idx: [49], confidence: 0.9 },
        ],
      });
    });
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    const out = await extractChat({ chatId: CHAT_ID, messages, participants, anonymize: true }, { consent, fetchImpl: fetchMock });

    const sent = JSON.stringify(bodies(fetchMock));
    // Full names and unique first names are replaced. A surname on its own ("Sharma Caterers") is not.
    for (const name of ['Priya', 'Priya Sharma', 'Meera', 'Meera Iyer', 'Rahul', 'Ananya', 'Kabir', '90000 12345', '90000 11111']) {
      expect(sent, name).not.toContain(name);
    }
    expect(sent).toContain('Person A');
    expect(sent).toContain('₹50,000'); // amounts are kept
    expect(out.extraction.tasks[0]).toMatchObject({ owner: 'Meera Iyer', title: 'Meera Iyer prints certificates' });
  });
});

describe('validation and retry', () => {
  it('retries once with the validation error, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ tasks: [{ title: 'x' }] }))
      .mockResolvedValueOnce(okResponse(emptyResult));
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    const out = await extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies(fetchMock)[1]!.retryError).toMatch(/tasks\.0/);
    expect(out.failedChunks).toBe(0);
  });

  it('gives a friendly error after the retry also fails', async () => {
    const fetchMock = vi.fn(async () => okResponse({ nonsense: true, tasks: 'no' }));
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    const p = extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock });
    await expect(p).rejects.toBeInstanceOf(ExtractionError);
    await expect(p).rejects.toMatchObject({ code: 'invalid' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once when the server reports invalid JSON or a cut-off answer', async () => {
    for (const code of ['bad_json', 'truncated']) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code } }), { status: 502 }))
        .mockResolvedValueOnce(okResponse(emptyResult));
      const consent = consentStore(memoryKV());
      consent.grant(CHAT_ID);
      const out = await extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock });
      expect(fetchMock, code).toHaveBeenCalledTimes(2);
      expect(bodies(fetchMock)[1]!.retryError, code).toBeTruthy();
      expect(out.failedChunks).toBe(0);
    }
  });

  it('stops sending further chunks after a limit error', async () => {
    // 1,500 synthetic messages → 6 chunks
    const many = Array.from({ length: 1500 }, (_, i) => ({ idx: i, ts: null, sender: 'A', text: `msg ${i}`, isSystem: false }));
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return calls === 1 ? new Response('{}', { status: 429 }) : okResponse(emptyResult);
    });
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    await expect(
      extractChat({ chatId: CHAT_ID, messages: many, participants: ['A'], anonymize: false }, { consent, fetchImpl: fetchMock, concurrency: 1 }),
    ).rejects.toMatchObject({ code: 'limit' });
    expect(calls).toBe(1);
  });

  it('a user cancel aborts the run', async () => {
    const ac = new AbortController();
    const fetchMock = vi.fn(async (_u: unknown, init?: RequestInit) => {
      ac.abort();
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return okResponse(emptyResult);
    });
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    await expect(
      extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock, signal: ac.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('maps 429 to a friendly limit error', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 429 }));
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    await expect(
      extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ code: 'limit' });
  });

  it('drops evidence outside the chunk and items left without evidence', async () => {
    const fetchMock = vi.fn(async () =>
      okResponse({
        ...emptyResult,
        tasks: [
          { title: 'Real', owner: 'Rahul Verma', due_text: null, status_hint: 'pending', evidence_idx: [9, 9999], confidence: 1 },
          { title: 'Invented', owner: null, due_text: null, status_hint: 'pending', evidence_idx: [9999], confidence: 1 },
          { title: 'Cites system msg', owner: null, due_text: null, status_hint: 'pending', evidence_idx: [0], confidence: 1 },
        ],
      }),
    );
    const consent = consentStore(memoryKV());
    consent.grant(CHAT_ID);
    const out = await extractChat({ chatId: CHAT_ID, messages, participants, anonymize: false }, { consent, fetchImpl: fetchMock });
    expect(out.extraction.tasks).toEqual([expect.objectContaining({ title: 'Real', evidence_idx: [9] })]);
  });
});
