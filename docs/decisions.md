# Decisions log

## 2026-11-23 — Schedule compressed to one day
Phases 1–5 plus documentation all happen on Mon Nov 23. Cut: contacts, decisions/questions tabs, CSV export, dark mode, budget editing (budget is read-only totals), board switcher. Merge step simplified to normalised-title dedupe + "later done beats earlier will-do".

## Parser (Phase 1)
- **Timestamps are local ISO without a timezone** (`2026-11-21T14:05:00`). Exports carry no timezone; converting to UTC would shift dates depending on the viewer's machine.
- **Ambiguous date order** → `dateOrder: 'ambiguous'`, timestamps computed as DMY (INR/India default). The UI asks the user and re-parses with `{ dateOrder }`.
- **Conflicting date evidence** (some days > 12 in each position) → majority wins, plus a warning.
- **System messages:** group events (encryption notice, joins, leaves, subject changes) get `sender: null`. Media-omitted and deleted messages keep their sender but are `isSystem: true`, so they are still excluded from AI input. Every message keeps its index, so evidence references stay stable.
- **iOS group events** are recognised by the U+200E mark WhatsApp puts at the start of the body; that is why invisible characters are stripped only after this check.
- **Android lines like `X created group "A: B"`** contain `: ` but are events; a sender candidate with quotes or over 60 characters is treated as an event.
- **Invalid dates (e.g. 31/02)** are rejected rather than rolled over; the message is kept with `ts: null` and a warning.
- **Zip import** decompresses only `.txt` entries (media are never decompressed); prefers `_chat.txt` (iOS), then `WhatsApp Chat*.txt` (Android).

## Extraction schema
- Added an optional `budget_cap` field (beyond the base schema in CLAUDE.md) so the overall budget limit ("Principal approved ₹50,000") can be extracted separately from spend items.
- Budget `status_hint` allows `unclear`, mapped to `proposed` on import.
- `amount` is in major units as the model reads it; converted to integer minor units on import (`Math.round(amount * 100)`), never stored as a float.

## Extraction pipeline (Block 2)
- **Server is a thin proxy; prompt and output schema live on the server.** The browser sends only `{ participants, lines, retryError? }`. Combined with structured outputs (`output_config.format: json_schema`), the endpoint can only return extraction JSON, which limits abuse of the public URL.
- **Structured outputs + zod.** The API constrains the JSON shape; the browser still validates every response with zod (AI output is untrusted) and does the single retry with the validation error.
- **Model:** `MODEL_CHUNK` env var, default `claude-opus-5-5` (current default per Anthropic docs, Nov 2026), `effort: "low"` to keep each chunk fast. Server-side refusal fallback (`fallbacks: "default"`) is enabled for models that support it.
- **`MODEL_MERGE` is unused.** Merge is deterministic (word-overlap dedupe), per the one-day scope cut. No second model call.
- **Chunks:** 300 lines, 30 overlap, also capped at 120k characters per request; each message truncated to 1,000 chars. 3 chunks in parallel.
- **Evidence is sanitised client-side:** indexes outside the chunk are dropped; items left with no evidence are dropped (treated as invented).
- **Vercel duration:** Hobby with Fluid compute allows up to 300 s (checked Nov 23, 2026). `maxDuration: 120` set for `/api/extract`.
- **Anonymize** replaces full names, unique first names (3+ letters), phone numbers (10+ digits) and emails. It does **not** replace a surname used on its own (e.g. "Sharma Caterers"), and other details stay in the text; the consent modal says so.
- **Consent** is per chat (keyed by a hash of the chat text), stored in localStorage; `extractChat()` checks it before anything else. Tested.
- **Metrics:** precision = correct ÷ (correct + wrong) over all reviewed items; also task-only precision. Recall = task correct ÷ (task correct + missed), since "missed" is asked about tasks only.
- **Wrong items are kept but hidden** on the dashboard, so totals behind the accuracy numbers don't change after review.

## Prompt versions
- **v1** (Nov 23): CLAUDE.md §6 prompt plus three lines: "⏎ marks a line break", `budget_cap` rule, roles = lasting responsibilities, and "empty arrays when nothing found". Known participants are sent in the user message (keeps the system prompt stable). First live run on the synthetic sample (Nov 24): 11 tasks, all matching the hand-made key; but a ₹3,000 advance was listed as its own budget item on top of the ₹11,000 it belonged to, inflating totals.
- **v2** (Nov 24): added "an advance, deposit or partial payment toward a cost already listed is not a separate budget item; totals and recaps are not new items either."
