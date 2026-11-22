# CLAUDE.md — ThreadBoard PROTOTYPE (submission build)

> Rename this file to `CLAUDE.md` in a fresh repo. It replaces the full-app plan. **Hard deadline:** the build must be deployed, tested with real people and documented by **Monday, Nov 23, 2026**. The application closes Nov 24. Today is Saturday, Nov 21. This is a **web prototype**, not a store app. Do not build a native app, accounts, sync or payments.

---

## 1. What we are building

A web app that takes an exported WhatsApp group chat and turns it into a project dashboard: who owns which task, what is pending or done, key people and their roles, a budget tracker, contacts, decisions and open questions.

**Purpose of this build:** to be a credible product-management portfolio piece. It must (a) work from a public link, (b) be tested with real users, and (c) report measured accuracy honestly. A working link plus real results matters more than extra features.

**Target user:** a student or club member who runs a group project or event in a WhatsApp group and loses track of who agreed to do what.

**One-line pitch:** "Paste your group chat, get a to-do board that shows who's doing what."

---

## 2. Scope

### Must have (cut nothing here)

1. **Import:** drag-and-drop or choose a `.txt` or `.zip` WhatsApp export, plus "Try with a sample chat" (a synthetic chat bundled in the app).
2. **On-device parsing** of the export (no AI, in the browser).
3. **Consent step** before any chat text is sent to AI (Section 6).
4. **AI extraction** via a serverless proxy: tasks (owner, due), decisions, open questions, budget items, people and roles.
5. **Review screen:** each AI item shows its source message and has ✓ Correct / ✗ Wrong buttons. This produces the accuracy numbers for the case study.
6. **Dashboard:**
   - **Overview:** progress ring (done / total), overdue count, tasks per person, budget summary.
   - **Tasks:** checklist with tap to complete and **Undo**, filter by person and status, search, add/edit/delete a task.
   - **People:** cards with initials avatar, editable role, assigned and completed counts, key-people section.
   - **Budget:** cap, items with status (proposed / approved / paid), totals, remaining, manual add/edit.
7. **Persistence** in `localStorage` so a refresh keeps the work, plus a "Delete all my data" button.
8. **Deployed** at a public URL that works on phone and desktop.

### Should have (only if time remains, in this order)

- Contacts tab (phones and emails found by regex, tap to call or open `wa.me`)
- Decisions and open-questions tabs
- CSV export of tasks and budget
- Dark mode

### Won't build

Accounts, cloud sync, native apps, push notifications, media analysis, real-time collaboration, anything that reads WhatsApp directly (unofficial access violates WhatsApp's terms).

### Cut order if we fall behind

Dark mode → CSV export → contacts → decisions/questions → budget editing (keep read-only totals).
Never cut: import, consent, extraction, review/accuracy buttons, task checklist, people, deployment.

---

## 3. Tech stack (decided, optimise for speed)

| Concern | Choice |
|---|---|
| App | Vite + React + TypeScript (`strict`) |
| Styling | Tailwind CSS, mobile-first, system font stack |
| State | React state + a small `useLocalStorage` hook. No state library. |
| Validation | `zod` for every AI response and parsed file |
| Unzip | `fflate` |
| Icons / motion | `lucide-react`, CSS transitions (no heavy animation library) |
| Backend | One serverless function `/api/extract` (Vercel or Netlify) that calls the Anthropic API |
| Hosting | Vercel (free tier is fine) |
| Tests | Vitest for the parser, plus the consent guard and merge step |

**The API key lives only in a server environment variable. Never in the frontend, the repo or the browser.**

---

## 4. Repository layout

```
/src
  parser/       whatsapp.ts, detectFormat.ts, types.ts   (pure TS, unit-tested)
  ai/           extract.ts (client), schema.ts (zod), chunk.ts, merge.ts, anonymize.ts
  components/   Dashboard, TaskList, PeopleGrid, BudgetPanel, ReviewList,
                ConsentModal, ImportCard, Stepper, Toast, EmptyState
  data/         sampleChat.txt (synthetic), sampleResult.json (cached extraction for demo mode)
  lib/          storage.ts, money.ts, dates.ts, ids.ts, metrics.ts
  styles/       tokens.css (design tokens)
/api/extract.ts serverless proxy
/fixtures       parser test files (synthetic only)
/docs           CASE_STUDY.md, RESULTS.md, decisions.md
.env.example    empty values only
```

---

## 5. Parsing rules (browser, deterministic)

- Accept `.txt` or `.zip` (read the chat `.txt` inside, ignore media).
- **Detect the format** from the first ~200 lines. Support at least:
  - Android: `DD/MM/YY, HH:MM - Name: text` and the 12-hour AM/PM variant
  - iOS: `[DD/MM/YY, HH:MM:SS] Name: text` and the AM/PM variant
  - Date order DD/MM vs MM/DD (infer from the whole file: any number over 12 settles it; if still ambiguous, ask the user to confirm using one sample message), 2- and 4-digit years
  - Strip invisible characters exports often contain (U+200E, U+202F narrow no-break space before AM/PM, BOM).
- Join multi-line messages. Flag system messages (encryption notice, joins/leaves, deleted, media omitted) and **exclude them from AI input**.
- Never crash on a bad line: collect warnings, continue.
- Handle emoji, Hindi/Hinglish and other scripts, names with digits, and senders that are phone numbers.
- Unit tests with at least **8 synthetic fixtures** covering the formats above and edge cases.

### Parser output (`src/parser/types.ts`)

```ts
type Message = {
  idx: number;            // stable 0-based index, used as evidence reference
  ts: string | null;      // ISO 8601, null if unparseable
  sender: string | null;  // null for system messages
  text: string;
  isSystem: boolean;
};

type ParseResult = {
  format: 'android-24h' | 'android-12h' | 'ios-24h' | 'ios-12h';
  dateOrder: 'DMY' | 'MDY' | 'ambiguous';
  messages: Message[];
  participants: string[];
  warnings: { line: number; reason: string }[];
};
```

### Fixture list (minimum)

1. Android 24h, DD/MM/YY
2. Android 12h AM/PM with narrow no-break space
3. iOS 24h with seconds and brackets
4. iOS 12h AM/PM
5. MM/DD file (US locale) with a day over 12
6. Ambiguous dates (all days ≤ 12) → `dateOrder: 'ambiguous'`
7. Multi-line messages, emoji, Hindi/Hinglish text, phone-number senders
8. System messages, "<Media omitted>", "This message was deleted", plus one garbage line (must produce a warning, not a crash)

---

## 6. AI extraction and consent

**Consent (required, not optional):** before the first AI call, show a modal that says plainly:

- what is sent (message text, sender names, any numbers in the text),
- who receives it (our server, then the AI provider, named),
- why (to find tasks, decisions and budget items),
- what is not sent (media, other chats),
- and offers "Allow for this chat" and "Don't allow". If declined, the app still works with manual tasks.

Also offer an **"Anonymize names and numbers"** toggle (swap them for tokens before sending, map back locally). Store the consent in `localStorage`; no consent means no network call carrying chat text. Enforce this in one function (`ai/extract.ts`) and add a test.

### Extraction

- Send chunks of ~300 messages with a 30-message overlap and stable message indexes, never the whole chat in one request.
- Model returns JSON only, validated by `zod`:

```
{ tasks:[{title, owner|null, due_text|null,
  status_hint:"pending"|"done"|"unclear", evidence_idx:number[], confidence}],
  decisions:[{text, evidence_idx}], open_questions:[{text, evidence_idx}],
  budget:[{label, amount, currency|null, status_hint, evidence_idx}],
  roles:[{person, role, evidence_idx}] }
```

- Prompt rules: use only what is in the chat; never invent owners, dates or amounts; owner must match a name in the chat or be null; every item cites message indexes.
- Invalid JSON → one retry with the validation error; then show a friendly error and keep the parsed chat.
- **Merge step:** dedupe similar tasks; a later "done" message beats an earlier "will do"; link owners to people by name or alias.
- A task detected as "done" by AI is shown as **"Suggested done — confirm"**. Never auto-complete.
- Models are set by env var (`MODEL_CHUNK`, `MODEL_MERGE`). **[VERIFY current model IDs in Anthropic's docs before hardcoding.]**

### System prompt (starting point, version it in `docs/decisions.md`)

```
You extract project information from a WhatsApp group chat.
Each message is given as: [idx] sender: text

Return ONLY a JSON object matching the schema you are given. No prose.

Rules:
- Use only information stated in the messages. Never invent owners, dates, amounts or tasks.
- A task is a concrete action someone agreed to, was asked to do, or volunteered for.
  Ignore jokes, hypotheticals and general chatter.
- owner must be exactly one of the sender names provided, or null if unclear.
- due_text is the deadline in the chat's own words ("by Friday", "kal tak"), or null.
- status_hint is "done" only if a later message says it was completed; otherwise "pending" or "unclear".
- amount is a number in the stated currency; if no currency is stated, currency is null.
- Every item must include evidence_idx: the indexes of the messages that support it.
- Messages may be in English, Hindi or Hinglish. Write titles in clear English.
- confidence is 0 to 1. If unsure, use a low value rather than leaving the item out.
Known participants: {participants}
```

### Proxy safeguards (`/api/extract.ts`)

- Reject requests over a size limit (e.g. 200 KB body); cap `max_tokens`.
- Best-effort per-IP rate limit. In-memory limits are unreliable on serverless, so **the real protection is a monthly spend limit set in the AI provider's console. Set it before sharing the link.**
- Never log request bodies. Log only status and duration.
- Return a clear error if the daily cap is reached.
- Accept only `POST` with JSON; allow only the app's own origin (CORS).

**Demo mode:** "Try with a sample chat" must work with **zero API calls** by loading `sampleResult.json`. This keeps the public link working for recruiters even if the quota is exhausted or the key is disabled. Label it clearly as a sample.

---

## 7. App data model (stored locally)

```ts
type Person   = { id: string; name: string; aliases: string[]; role: string | null; isKey: boolean };
type Task     = { id: string; title: string; ownerId: string | null; dueText: string | null;
                  dueDate: string | null; status: 'pending' | 'done';
                  source: 'ai' | 'manual'; aiSuggestedDone: boolean; confirmed: boolean;
                  evidenceIdx: number[]; createdAt: string; completedAt: string | null };
type BudgetItem = { id: string; label: string; amountMinor: number; currency: string;
                  status: 'proposed' | 'approved' | 'paid'; evidenceIdx: number[]; source: 'ai' | 'manual' };
type Review   = { itemId: string; kind: 'task' | 'decision' | 'question' | 'budget' | 'role';
                  verdict: 'correct' | 'wrong' };
type Board    = { id: string; chatName: string; importedAt: string; isSample: boolean;
                  people: Person[]; tasks: Task[]; budget: { capMinor: number | null; items: BudgetItem[] };
                  decisions: { id: string; text: string; evidenceIdx: number[] }[];
                  questions: { id: string; text: string; evidenceIdx: number[] }[];
                  reviews: Review[]; missedCount: number; schemaVersion: 1 };
```

- One board per imported chat; a board switcher if more than one exists.
- `localStorage` key `threadboard:v1:boards`. Store the parsed messages only if the user ticks "Keep chat on this device" (default on, so evidence quotes work after refresh); "Delete all my data" clears everything.
- Money in minor units (paise, cents). Format with `Intl.NumberFormat`.

---

## 8. Screens

1. **Landing / Import:** one-line pitch, drop zone, "Choose file", "Try with a sample chat", a 3-step "How to export from WhatsApp" (Android and iPhone), privacy line ("Your chat is parsed on your device").
2. **Parse summary:** participants, message count, date range, warnings; confirm date order if ambiguous.
3. **Consent modal** (Section 6), with the anonymize toggle.
4. **Extracting:** progress by chunk ("Reading messages 300–600"), cancel button.
5. **Review:** grouped by type; each item shows the evidence message(s), ✓ / ✗, inline edit owner; "How many real tasks did we miss?" number input; live precision and recall; "Continue to dashboard".
6. **Dashboard:** tabs Overview · Tasks · People · Budget (· Contacts · Decisions if built). Bottom tab bar on mobile, side nav on desktop.
7. **Settings:** delete all data, export CSV (if built), about/privacy, AI disclaimer.

---

## 9. UI standards

- Mobile-first; works at 360px wide and on desktop.
- Three-step flow with visible progress: Import → Review → Dashboard.
- Completing a task: smooth strike-through animation, progress ring updates, an Undo toast for 5 seconds.
- Task rows show owner avatar (initials), due text, and an "AI" marker until the user confirms the item.
- Empty states, loading skeletons and friendly error messages on every screen. Never show a raw error.
- Design tokens in one file (colours, spacing, radius, type). Contrast ≥ 4.5:1, tap targets ≥ 44px, keyboard-usable, labels on icon buttons.
- Respect `prefers-reduced-motion`.
- Show a short disclaimer: "AI can make mistakes. Check items against the chat."

---

## 10. Hard rules

1. No secrets in code, repo, logs or the frontend. Provide `.env.example` with empty values.
2. No real chats anywhere in the repo, tests, screenshots or case study. Synthetic data only.
3. No network call with chat content without recorded consent.
4. AI output is untrusted: validate with `zod`; never render as HTML.
5. Never mark a task complete from AI output without user confirmation.
6. Money is stored as integers in minor units; no floats.
7. Don't add dependencies without saying why.
8. **Don't claim anything works until you ran it.** After each phase, run tests and the build, then report what works, what doesn't, and what is untested.
9. Never invent test results. All numbers in the case study come from real tests.

---

## 11. Environment and deployment

`.env.example`:

```
ANTHROPIC_API_KEY=
MODEL_CHUNK=
MODEL_MERGE=
MAX_REQUEST_BYTES=200000
DAILY_REQUEST_CAP=300
ALLOWED_ORIGIN=
```

Steps (Phase 4):

1. Push the repo to GitHub (check `git status` first: no `.env`, no real chats).
2. Import the repo in Vercel; framework preset Vite; build `npm run build`, output `dist`.
3. Add the environment variables in Vercel project settings (Production). Never commit them.
4. Set a monthly spend limit in the Anthropic console before sharing the link.
5. Deploy, then test on a real phone: sample mode, a real import, consent, extraction, refresh persistence, delete-all.
6. **[VERIFY]** current Vercel limits for serverless function duration on the free tier; keep each chunk request short enough to fit.

---

## 12. Build plan (timeboxed)

### Saturday Nov 21 (today)
- **Phase 1 (~2h):** project setup, parser, fixtures, tests, sample chat and cached sample result.
- **Phase 2 (~2h):** import screen, consent modal, serverless proxy, extraction, review screen with ✓/✗.
- Set the provider spend limit. Message testers (template in Section 14).

### Sunday Nov 22
- **Phase 3 (~3h):** dashboard (Overview, Tasks, People, Budget), persistence, delete-all.
- **Phase 4 (~1h):** deploy to Vercel, check on a real phone, fix layout bugs.
- **Phase 5:** run user tests (Section 14). Fix the single most common problem.

### Monday Nov 23
- Final fix, re-test with 3 people, write the case study, record the demo, update the resume, **submit**.

Each phase ends with: it runs, tests pass, and a short report. Work in small commits.

### Done means (check before moving on)

| Phase | Finished when |
|---|---|
| 1 | `npm test` passes on all 8+ fixtures; `npm run build` succeeds; sample chat parses with 0 crashes; `sampleResult.json` validates against the zod schema |
| 2 | With consent declined, no request to `/api/extract` happens (tested); with consent, a real chat produces items with evidence; invalid JSON path shows a friendly error; review ✓/✗ updates precision live |
| 3 | Complete/undo works and survives refresh; filters and search work; people counts are correct; budget totals and remaining are correct in minor units; delete-all empties storage |
| 4 | Public URL works on a phone at 360px; sample mode works with the API key removed; no secrets in the deployed bundle (search the built JS for `sk-`) |
| 5 | `RESULTS.md` has real numbers from 8+ testers; one fix shipped and re-tested with 3 people |

---

## 13. Prompts to give Claude Code

**Phase 1:**
> Read CLAUDE.md fully. We are building the prototype only, with a hard deadline of Monday, Nov 23. Start with Phase 1 only: set up Vite + React + TypeScript + Tailwind, build the WhatsApp parser with format detection and at least 8 synthetic fixtures, and add the bundled sample chat. Show me a short plan first, then implement, then run the tests and tell me exactly what works and what you haven't tested. Do not start Phase 2 until I say so.

**Phase 2:**
> Phase 2 only. Build the import screen, parse summary, consent modal with the anonymize toggle, the `/api/extract` proxy with the safeguards in Section 6, chunked extraction with zod validation and one retry, the merge step, and the review screen with ✓/✗ and the missed-count input. Write a test proving no chat text is sent without consent. Run tests and build, then report.

**Phase 3:**
> Phase 3 only. Build the dashboard (Overview, Tasks, People, Budget) following Sections 7–9, with localStorage persistence, Undo toast, "Suggested done — confirm", and delete-all. Check it at 360px and desktop widths. Run tests and build, then report what works and what is untested.

**Phase 4:**
> Phase 4 only. Prepare for Vercel: `.env.example`, `vercel.json` if needed, README draft. Confirm the build has no secrets. Give me the exact deploy steps; I will set the environment variables myself.

**Phase 5 fix:**
> Here are the failure logs from user testing: [paste]. Identify the most common failure type, propose the smallest fix, implement it, add a regression fixture or test, and report.

---

## 14. Testing with real people (this is the project's evidence)

- Recruit **8–10 testers** who have a real group chat and will use a chat they are a member of, with their group's consent. Offer the option to export a short, non-sensitive chat or a chat they've cleaned. Never ask them to send you their chat.
- Each tester: imports a chat, reviews every extracted item (✓/✗), and enters how many real tasks the tool missed.
- Record in `RESULTS.md`: number of testers, chat sizes, precision (correct ÷ (correct + wrong)), estimated recall (correct ÷ (correct + missed)), time from import to dashboard, and three open questions: "What was confusing?", "What would you use daily?", "What worried you about privacy?"
- Log failures by type (wrong owner, invented date, missed task, bad Hinglish handling, wrong format detection). Fix the most common one and re-test with 3 testers.
- If the numbers are bad, report them as they are and explain what you learned. Honest results beat impressive ones.

### Tester message (send Saturday)

> Hi! I've built a small web tool that turns a WhatsApp group chat into a to-do board (who's doing what, what's pending). Could you try it for 10 minutes on Sunday? You'd export a group chat you're in (only with the group's okay, and a short or harmless one is fine) and open it in the tool. Your chat is read on your own phone and is never sent to me. You then tick which extracted tasks are right or wrong. Link: [URL]. Thank you!

### Session script (per tester, ~10 min)

1. Note start time. Ask them to export a chat (WhatsApp → group → ⋮/info → Export chat → Without media) and import it.
2. Don't help unless they're stuck for 60 seconds; note where they got stuck.
3. They review every item with ✓/✗ and enter the missed count.
4. Note end time when they reach the dashboard.
5. Ask the three open questions; write down their exact words.
6. Copy the summary numbers from the review screen. Do not copy any chat content.

### `docs/RESULTS.md` template

```
# Results — ThreadBoard prototype
Test dates: …   Build/commit: …

| # | Messages | Items extracted | Correct | Wrong | Missed | Precision | Recall | Import→dashboard (min) |
|---|---------:|----------------:|--------:|------:|-------:|----------:|-------:|-----------------------:|
| 1 |          |                 |         |       |        |           |        |                        |

Totals: precision = Σcorrect / (Σcorrect + Σwrong) = …   recall = Σcorrect / (Σcorrect + Σmissed) = …

## Failures by type
| Type | Count | Example (paraphrased, no real names) |

## What testers said
- Confusing: …
- Would use daily: …
- Privacy worries: …

## Fix shipped
Problem: …  Change: …  Re-test (3 testers): before … → after …
```

---

## 15. Submission package (what we are producing)

1. **Live link** (Vercel URL) that works in demo mode with no login.
2. **GitHub repo** with a clear README: what it does, screenshots, how to run it, privacy approach, limits. Synthetic data only.
3. **One-page case study** (`CASE_STUDY.md`): problem, target user, 3 key decisions and why (e.g., on-device parsing, explicit consent, "suggested done" instead of auto-complete), what was built, test results, what failed, what you'd do next.
4. **60–90 second screen recording** of the flow using the sample chat.
5. **Resume bullet(s)** using only real numbers, e.g.: "Built and deployed a web app that converts exported group chats into task dashboards; tested with [N] users, [X]% precision on [M] extracted items; shipped [change] after feedback."
6. In the application, describe this as a **prototype**. Mention the native app and store release as a planned next step, not something done.

### `docs/CASE_STUDY.md` outline (one page)

1. **Problem** (2–3 lines): commitments get lost in long group chats; who it hurts.
2. **User:** student or club organiser running a project in WhatsApp.
3. **What I built:** one paragraph and one screenshot.
4. **Three decisions and trade-offs:** on-device parsing; explicit consent plus anonymize; "suggested done — confirm" instead of auto-complete.
5. **How I measured it:** review ✓/✗, missed count, precision and recall definitions.
6. **Results:** the real numbers from `RESULTS.md`.
7. **What failed and what I changed.**
8. **Next:** what I'd build with more time (e.g. native share-sheet import, store release) and the metric I'd watch.

### Demo recording script (60–90 s)

0–10 s problem → 10–25 s import the sample chat → 25–45 s review screen with evidence and ✓/✗ → 45–75 s dashboard: complete a task, undo, people, budget → 75–90 s privacy line and link.

---

## 16. Open decisions (ask before assuming)

| Decision | Default if not answered |
|---|---|
| App name and colour | "ThreadBoard", indigo accent |
| AI provider/model and monthly spend limit | Anthropic; model IDs from current docs [VERIFY]; spend limit chosen by the owner |
| Whether testers use their own chats or a shared sample | Own chats (with group consent); sample only as fallback, and report sample-based results separately |
| Currency default for budget | INR, editable per board |
