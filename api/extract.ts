/**
 * POST /api/extract: the only server code. Receives one chunk of chat lines,
 * asks Claude for structured JSON, returns it. Never logs request bodies.
 * Self-contained on purpose (no relative imports) so Vercel can bundle it as-is.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const PROMPT_VERSION = 'v1';

const SYSTEM_PROMPT = `You extract project information from a WhatsApp group chat.
Each message is given as: [idx] sender: text
A "⏎" inside a message marks a line break.

Return ONLY a JSON object matching the schema you are given. No prose.

Rules:
- Use only information stated in the messages. Never invent owners, dates, amounts or tasks.
- A task is a concrete action someone agreed to, was asked to do, or volunteered for.
  Ignore jokes, hypotheticals and general chatter.
- owner must be exactly one of the known participant names, or null if unclear.
- due_text is the deadline in the chat's own words ("by Friday", "kal tak"), or null.
- status_hint is "done" only if a later message says it was completed; otherwise "pending" or "unclear".
- amount is a number in the stated currency; if no currency is stated, currency is null.
- budget_cap is the overall budget limit for the project if one is stated, otherwise null.
- roles are lasting responsibilities a person holds (e.g. treasurer, design lead), not one-off tasks.
- Every item must include evidence_idx: the indexes of the messages that support it.
- Messages may be in English, Hindi or Hinglish. Write titles in clear English.
- confidence is 0 to 1. If unsure, use a low value rather than leaving the item out.
- If there is nothing of a kind, return an empty array for it.`;

const idx = { type: 'array', items: { type: 'integer' } } as const;
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const textItem = obj({ text: { type: 'string' }, evidence_idx: idx });

const OUTPUT_SCHEMA = obj({
  tasks: {
    type: 'array',
    items: obj({
      title: { type: 'string' },
      owner: nullableString,
      due_text: nullableString,
      status_hint: { type: 'string', enum: ['pending', 'done', 'unclear'] },
      evidence_idx: idx,
      confidence: { type: 'number' },
    }),
  },
  decisions: { type: 'array', items: textItem },
  open_questions: { type: 'array', items: textItem },
  budget: {
    type: 'array',
    items: obj({
      label: { type: 'string' },
      amount: { type: 'number' },
      currency: nullableString,
      status_hint: { type: 'string', enum: ['proposed', 'approved', 'paid', 'unclear'] },
      evidence_idx: idx,
    }),
  },
  budget_cap: {
    anyOf: [obj({ amount: { type: 'number' }, currency: nullableString, evidence_idx: idx }), { type: 'null' }],
  },
  roles: { type: 'array', items: obj({ person: { type: 'string' }, role: { type: 'string' }, evidence_idx: idx }) },
});

const RequestSchema = z.object({
  participants: z.array(z.string().max(120)).max(300),
  lines: z.array(z.string().max(1300)).min(1).max(400),
  retryError: z.string().max(2000).optional(),
});

/** Models that accept the server-side refusal fallback. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5']);

// ---- Best-effort limits (per warm instance only; the real cap is the provider spend limit) ----
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP_LIMIT = 60;
const ipHits = new Map<string, number[]>();
let day = '';
let dayCount = 0;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) ipHits.clear();
  return hits.length > PER_IP_LIMIT;
}

function dailyCapReached(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  dayCount++;
  return dayCount > Number(process.env.DAILY_REQUEST_CAP || 300);
}

function originAllowed(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  const allowed = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length > 0) return allowed.includes(origin) ? origin : null;
  try {
    return new URL(origin).host === req.headers.get('host') ? origin : null; // same-origin default
  } catch {
    return null;
  }
}

function json(status: number, body: unknown, origin: string | null, started: number): Response {
  // Log status and duration only. Never the body.
  console.log(JSON.stringify({ route: 'extract', status, ms: Date.now() - started }));
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

export function OPTIONS(req: Request): Response {
  const origin = originAllowed(req);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  const origin = originAllowed(req);
  if (!origin) return json(403, err('forbidden', 'Origin not allowed.'), null, started);
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return json(415, err('bad_type', 'Send JSON.'), origin, started);
  }

  const maxBytes = Number(process.env.MAX_REQUEST_BYTES || 200_000);
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) return json(413, err('too_large', 'Request too large.'), origin, started);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > maxBytes) return json(413, err('too_large', 'Request too large.'), origin, started);

  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0]!.trim();
  if (rateLimited(ip)) return json(429, err('rate_limited', 'Too many requests. Try again in a few minutes.'), origin, started);
  if (dailyCapReached()) return json(429, err('daily_cap', "Today's limit for this demo has been reached."), origin, started);

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(JSON.parse(raw));
  } catch {
    return json(400, err('bad_request', 'Malformed request.'), origin, started);
  }

  if (!process.env.ANTHROPIC_API_KEY) return json(503, err('not_configured', 'AI is not configured (no key on server).'), origin, started);

  const model = process.env.MODEL_CHUNK || 'claude-opus-5-5';
  const userContent =
    `Known participants: ${JSON.stringify(body.participants)}\n\nMessages:\n${body.lines.join('\n')}` +
    (body.retryError
      ? `\n\nYour previous answer failed validation: ${body.retryError}\nReturn corrected JSON only.`
      : '');

  // Tolerate copy-paste artefacts (spaces, newlines, surrounding quotes) in the env var.
  const apiKey = process.env.ANTHROPIC_API_KEY.trim().replace(/^["']|["']$/g, '');
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 110_000 });
  try {
    const useFallback = FALLBACK_MODELS.has(model);
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });

    if (response.stop_reason === 'refusal') {
      return json(422, err('refusal', 'The AI declined to process this part of the chat.'), origin, started);
    }
    if (response.stop_reason === 'max_tokens') {
      return json(502, err('truncated', 'The AI response was cut off.'), origin, started);
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json(502, err('bad_json', 'The AI returned invalid JSON.'), origin, started);
    }
    return json(200, { ok: true, data, promptVersion: PROMPT_VERSION }, origin, started);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, err('provider_busy', 'The AI is busy. Try again shortly.'), origin, started);
    if (e instanceof Anthropic.AuthenticationError) return json(503, err('auth_failed', 'AI key was rejected.'), origin, started);
    if (e instanceof Anthropic.PermissionDeniedError) return json(503, err('permission_denied', 'AI key lacks access.'), origin, started);
    if (e instanceof Anthropic.APIError) {
      // Status only: no message text, which could echo request content.
      return json(502, err('provider_error', `The AI service returned an error (${e.status ?? 'unknown'}).`), origin, started);
    }
    return json(502, err('unknown', 'Something went wrong.'), origin, started);
  }
}
