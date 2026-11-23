# Results: ThreadBoard prototype

Test dates: Nov 24, 2026 · Build: `1e9fc5a` or later, prompt **v2** · Live: https://threadboard-sigma.vercel.app

How each number was collected: each tester imported a group chat they are a member of (with the group's okay), marked every extracted item ✓/✗, entered how many real tasks were missed, then used **Copy results** on the review screen. That summary contains only numbers, no chat content. No tester sent their chat to the developer.

Definitions:
- **Precision** = correct ÷ (correct + wrong), over every reviewed item (tasks, budget, decisions, questions, roles).
- **Task precision** = task correct ÷ (task correct + task wrong).
- **Recall (tasks)** = task correct ÷ (task correct + missed). "Missed" is asked about tasks only.
- **Import→dashboard** = minutes from choosing the file to leaving the review screen (measured by the app).

## Real chats

| # | Messages | Items extracted | Correct | Wrong | Missed tasks | Precision | Task precision | Recall | Import→dashboard (min) |
|---|---------:|----------------:|--------:|------:|-------------:|----------:|---------------:|-------:|-----------------------:|
| 1 |      227 |              13 |      13 |     0 |            0 |      100% |    100% (8/8) |   100% |                    2.6 |
| 2 |          |                 |         |       |              |           |                |        |                        |
| 3 |          |                 |         |       |              |           |                |        |                        |
| 4 |          |                 |         |       |              |           |                |        |                        |
| 5 |          |                 |         |       |              |           |                |        |                        |
| 6 |          |                 |         |       |              |           |                |        |                        |
| 7 |          |                 |         |       |              |           |                |        |                        |
| 8 |          |                 |         |       |              |           |                |        |                        |

**Totals so far** (1 tester; pooled, not averaged): precision = 13 / (13 + 0) = 100% · recall = 8 / (8 + 0) = 100%. One chat is too few to draw conclusions; these will change as more testers report.

Row notes: #1: 8 tasks + 5 other items (budget, decisions, questions or roles); "missed" is the tester's own count.

## Sample-chat sessions (reported separately)

Testers who used the bundled synthetic sample instead of their own chat. These check usability only. They don't measure AI accuracy, because the sample's results are prepared in advance.

| # | Reached dashboard? | Import→dashboard (min) | Notes |
|---|---|---:|---|
| 1 | | | |

## Developer sanity check (not user testing)

A live run of the synthetic sample chat (52 messages) against a hand-written answer key. Both the chat and the key were written by the developer, so this is **not** an accuracy result.
- Prompt v1: 11 tasks; all 11 matched the key by meaning. The photographer item came back as an open question instead of a task. A ₹3,000 advance was double-counted as a separate budget item.
- Prompt v2: same 11 tasks; budget fixed (4 items, ₹26,500). One request, about 11–12 s.

## Failures by type

| Type | Count | Example (paraphrased, no real names) |
|---|---:|---|
| Wrong owner | | |
| Invented date | | |
| Missed task | | |
| Bad Hinglish handling | | |
| Wrong format detection | | |
| Not a task (chatter/joke) | | |
| Other | | |

## What testers said

- **What was confusing?**
  - …
- **What would you use daily?**
  - …
- **What worried you about privacy?**
  - …

## Fix shipped

Problem: … · Change: … · Re-test (3 testers): before … → after …
