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

## Prompt versions
- **v1** — the system prompt in CLAUDE.md §6, unchanged. (Not yet sent to a model.)
