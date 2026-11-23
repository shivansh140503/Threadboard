# ThreadBoard: turning group chats into a to-do board

*Prototype · built and deployed Nov 23–24, 2026 · [Live demo](https://threadboard-sigma.vercel.app) · [Code](https://github.com/shivansh140503/Threadboard)*

<!-- DRAFT: every [bracketed] value must come from docs/RESULTS.md. Do not fill in estimates. -->

## Problem

Student and club projects run in WhatsApp groups. Commitments ("I'll book the hall by Monday") get buried under hundreds of messages, and nobody can say who owns what, what's done, or how much money has been committed. The organiser ends up re-reading the chat or chasing people.

## User

A student or club organiser running a group project or event in WhatsApp, often in English mixed with Hindi (Hinglish), usually on a phone.

## What I built

A web app that takes a WhatsApp chat export and produces a dashboard. It shows tasks with owners and deadlines, people and roles, decisions, open questions and a budget, and every item links to the message it came from. The chat is parsed on the device. With the user's consent, the messages are sent in chunks to Claude through a small serverless proxy, and the response is constrained to a JSON schema and checked again in the browser. A review step asks the user to mark each item right or wrong; that's what produces the accuracy numbers below. A sample chat lets anyone try the whole flow with no AI calls.

<!-- screenshot: review screen + dashboard -->

## Three decisions and their trade-offs

1. **Parse on the device; send to AI only what's needed.** File reading, format detection and system-message filtering all run in the browser, so the file is never uploaded and photos and files are never read. *Trade-off:* every export-format quirk has to be handled in code, which meant 9 synthetic test chats covering Android/iOS formats, 12/24-hour clocks, ambiguous dates, invisible characters and Hinglish.
2. **Explicit per-chat consent, with an option to anonymize.** Before anything is sent, a screen says what is sent, who receives it and why. One function enforces it, and a test proves no request is made without consent. Anonymize swaps names, phone numbers and emails for tokens and maps them back on the device. *Trade-off:* an extra step before the "wow" moment, and anonymization is partial (a surname on its own still goes through). I chose to say so plainly in the consent screen rather than over-promise.
3. **"Suggested done — confirm" instead of auto-complete.** When a later message suggests a task is finished, the AI flags it, but only the user can tick it off. *Trade-off:* one more tap per task, in exchange for never quietly marking someone's work done because of a misread message. Trust matters more than speed in a tool that assigns responsibility to named people.

## How I measured it

On the review screen, each extracted item gets ✓ or ✗, and the user enters how many real tasks the tool missed.
- **Precision** = correct ÷ (correct + wrong), across all item types.
- **Recall** (tasks) = correct tasks ÷ (correct tasks + missed tasks).
- Time from import to dashboard is recorded by the app.

Testers copied a numbers-only summary; no chat content was ever shared with me.

## Results

Tested with **[N] people** on their own group chats (**[M] items** extracted in total).

- Precision: **[X]%** · task recall: **[Y]%** · median time from import to dashboard: **[T] min**
- [Sample-chat-only sessions: N, reported separately in RESULTS.md]

[One sentence on what the numbers mean, e.g. which item type was weakest.]

## What failed and what I changed

- **Found before testing:** in the first live run, the model counted an advance payment as a separate budget item, inflating totals by ₹3,000. I added one rule to the prompt (v2) and confirmed the fix on the same chat.
- **Found in testing:** [most common failure type from RESULTS.md] → [change] → re-tested with 3 people: [before] → [after].

## What I'd do next

- A native app that imports via the share sheet, since export-then-upload is the biggest friction point, then a store release.
- Turn deadlines in the chat's own words ("kal tak", "by Friday") into real dates, so overdue tracking works without manual entry.
- **Metric to watch:** the share of extracted tasks users keep (✓) without editing, measured per prompt version, alongside week-2 return rate.

---
*All screenshots and examples use a synthetic chat. No real conversations appear anywhere in this project.*
