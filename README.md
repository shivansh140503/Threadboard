# ThreadBoard

**Paste your group chat, get a to-do board that shows who's doing what.**

ThreadBoard turns an exported WhatsApp group chat into a project dashboard: who owns which task, what's pending or done, key people and their roles, and a budget tracker. Every item links back to the message it came from.

**Live demo:** https://threadboard-sigma.vercel.app. Tap **Try with a sample chat** to see the whole flow with no sign-up and no AI calls.

> **Status: prototype.** It was built and deployed in one day for a product-management portfolio. A native app with share-sheet import and a store release is the planned next step; neither exists yet.

<!-- Screenshots: add after phone check -->
<!-- ![Review screen](docs/img/review.png) ![Dashboard](docs/img/dashboard.png) -->

## Who it's for

Students and club organisers who run a group project or event in a WhatsApp group and lose track of who agreed to do what.

## How it works

```
Export chat (.txt / .zip)
   │
   ▼
Parse on your device ──► Summary: people, message count, dates
   │
   ▼
Consent screen: what is sent, to whom, why  (optional: anonymize names and numbers)
   │  declined → manual board, nothing is sent
   ▼
/api/extract (serverless) ──► Claude, in chunks of 300 messages, returns structured JSON
   │
   ▼
Review screen: each item shows its source message, ✓ Correct / ✗ Wrong
   │            → live precision and recall
   ▼
Dashboard: Overview · Tasks · People · Budget · Settings
```

1. **Import.** Choose or drop the file WhatsApp exports ("Export chat → Without media").
2. **On-device parsing.** No AI is involved at this step. It detects Android and iOS formats, 12-hour and 24-hour clocks, and DD/MM vs MM/DD dates (asking you when it can't tell). It joins multi-line messages and filters out system messages such as "Media omitted", deletions and joins.
3. **Consent.** Nothing leaves the device until you allow it for that specific chat.
4. **Extraction.** Messages go to Claude in overlapping chunks. The response is constrained to a JSON schema and validated again in the browser with zod. Any item that cites a message outside its chunk, or cites nothing, is dropped.
5. **Review.** You mark each item right or wrong and say how many tasks were missed. Those answers produce the accuracy numbers in [docs/RESULTS.md](docs/RESULTS.md).
6. **Dashboard.** Tick tasks off with a 5-second Undo, filter and search, edit people's roles, and see budget totals.

## Privacy approach

- **Parsing happens on your device.** The chat file is never uploaded.
- **Explicit, per-chat consent** before any chat text is sent. The app enforces this in one function, and a test proves that no network request happens without it.
- **Optional anonymization.** Full names, unique first names, phone numbers and emails are swapped for tokens ("Person A", "Phone 1") before sending, then swapped back on the device. Limits: a surname used on its own, and other details inside messages, are still sent.
- **The server is a thin proxy.** It holds the API key and prompt, never logs request bodies (only status and duration), only accepts requests from the app's own site, and has a size limit plus best-effort rate and daily caps. The provider's monthly spend limit is the real cost protection.
- **No accounts.** Boards are saved in your browser's `localStorage`, and **Delete all my data** wipes everything, including consent records.
- **AI never completes a task by itself.** A task the AI thinks is done shows "Suggested done — confirm?"

## Run it locally

Requires Node 20+.

```bash
npm install
npm test          # parser, consent guard, merge, metrics, dashboard logic, API safeguards
npm run dev       # http://localhost:5173. The sample chat works without any API key.
npm run build
```

To try real extraction locally, run it on Vercel (`vercel dev`) with the variables from [.env.example](.env.example). Never commit a real key.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Server-only. Set in Vercel project settings. |
| `MODEL_CHUNK` | Model for extraction (default `claude-opus-5-5`) |
| `MAX_REQUEST_BYTES` | Request size limit (default 200000) |
| `DAILY_REQUEST_CAP` | Best-effort daily cap per server instance (default 300) |
| `ALLOWED_ORIGIN` | The deployed site's URL; requests from other sites are refused |

`scripts/live-extract.ts` runs the bundled **synthetic** sample chat through the deployed endpoint and compares it with a hand-written answer key (one paid API call).

## Tech

Vite · React · TypeScript (strict) · Tailwind CSS · zod · fflate (zip) · lucide-react · Vercel serverless function · Anthropic TypeScript SDK (structured outputs) · Vitest.

```
src/parser/   WhatsApp parsing and format detection (pure TS, unit-tested)
src/ai/       consent-guarded client, chunking, anonymization, merge, zod schema
src/lib/      board model, storage, metrics, money (integer minor units), dashboard logic
src/components/  screens
api/extract.ts   serverless proxy
fixtures/     synthetic test chats
docs/         CASE_STUDY.md, RESULTS.md, decisions.md
```

## Limits

- WhatsApp exports only. It does not read WhatsApp directly; unofficial access would break WhatsApp's terms.
- Deadlines are kept as the chat's own words ("kal tak"). Only dates you set by hand count towards "overdue".
- Budget is read-only in this build. Items in a second currency are listed but not added up.
- Extraction quality on long, Hindi-heavy or very informal chats is measured in [docs/RESULTS.md](docs/RESULTS.md), not assumed.
- All data in this repo (sample chat, test chats) is synthetic. No real chats are included.

## Docs

- [docs/CASE_STUDY.md](docs/CASE_STUDY.md): problem, decisions, results
- [docs/RESULTS.md](docs/RESULTS.md): user-test numbers
- [docs/decisions.md](docs/decisions.md): design decisions and prompt versions
