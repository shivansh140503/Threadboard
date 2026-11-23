import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPTIONS, POST } from '../api/extract';

const ORIGIN = 'https://threadboard.example';

function req(body: unknown, headers: Record<string, string> = {}): Request {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://threadboard.example/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, host: 'threadboard.example', ...headers },
    body: text,
  });
}

const valid = { participants: ['Person A'], lines: ['[3] Person A: Secret plan text'] };

describe('/api/extract safeguards (no network)', () => {
  const env = { ...process.env };
  let logs: string[] = [];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ALLOWED_ORIGIN;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it('rejects requests without an Origin, or from another origin', async () => {
    expect((await POST(req(valid, { origin: '' }))).status).toBe(403);
    expect((await POST(req(valid, { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('honours ALLOWED_ORIGIN when set', async () => {
    process.env.ALLOWED_ORIGIN = 'https://other.example';
    expect((await POST(req(valid))).status).toBe(403);
  });

  it('rejects non-JSON, oversized and malformed bodies', async () => {
    expect((await POST(req(valid, { 'content-type': 'text/plain' }))).status).toBe(415);
    process.env.MAX_REQUEST_BYTES = '100';
    expect((await POST(req({ ...valid, lines: ['x'.repeat(500)] }))).status).toBe(413);
    delete process.env.MAX_REQUEST_BYTES;
    expect((await POST(req('{broken'))).status).toBe(400);
    expect((await POST(req({ participants: [], lines: [] }))).status).toBe(400);
  });

  it('returns a clear error when the API key is missing', async () => {
    const res = await POST(req(valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'not_configured' } });
  });

  it('never logs the request body', async () => {
    await POST(req(valid));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toContain('Secret plan text');
    expect(logs.join('\n')).not.toContain('Person A');
  });

  it('answers CORS preflight only for the allowed origin', () => {
    const pre = (origin: string) =>
      OPTIONS(new Request('https://threadboard.example/api/extract', { method: 'OPTIONS', headers: { origin, host: 'threadboard.example' } }));
    expect(pre(ORIGIN).status).toBe(204);
    expect(pre('https://evil.example').status).toBe(403);
  });
});
