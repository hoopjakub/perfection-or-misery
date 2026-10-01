# 02 · Community and questions

> Part of the [website set](00-README.md). Status: **plan, maintainer's answers applied** (Q12–Q16, Q19, Q22, Q24, Q26, Q27), 29 September 2026. The questions page is also the site's contact (Q24). It reads as a feedback and tips tool more than a chat, in the maintainer's words: "more of a tip/feedback kind of app". Nothing here is a live conversation.

## 1 · The two channels

| Channel | Who writes | Who reads | What it is |
|---|---|---|---|
| **Updates** | The admin | Everyone, signed in or not | The main channel. Release notes, what's being worked on, a season's start. A newest-first list, one page per update |
| **Questions** | Signed-in players | The asker and the admin; everyone once the admin publishes an answer | A player asks; the admin answers; the answer can become public |

No third channel until the first two are used. A chat, replies, reactions and profiles-in-threads are all left out (§8).

## 2 · Who can ask, and how often

| Rule | Value | Why |
|---|---|---|
| A real account | Yes; guests (anonymous sessions) can read, not ask | A guest's session is throw-away; the game already treats them so (`pom_is_member()` in `supabase/friends.sql`) |
| Has played | At least one saved run | A cheap wall against sign-up spam: a throw-away account doesn't have one ([04](04-SECURITY-AND-ABUSE.md) §3) |
| One **active** question | Active means status `open` or `seen` | The maintainer's rule, and it keeps the inbox to one thread per person |
| Length | 10 to 1,000 characters, plain text | Enough for a proper question, too short for a wall |
| After an answer | Ask again once the last question is closed and 1 hour has passed | Stops a run of one-line questions the minute an answer lands. **Provisional:** the hour is a guess |
| Per day | At most 3 questions and 10 edits | A ceiling under the other rules, so a bug can't run away |
| Edit | While `open` or `seen`, at most once every **10 minutes**, at most 5 times | The maintainer's "edit every x minutes when it's not yet answered". **Provisional:** 10 minutes is a guess |

"x minutes" was the maintainer's placeholder, so the values in this table are defaults for him to change, in one file (a constants row in the database, [04](04-SECURITY-AND-ABUSE.md) §2.4), not in code.

## 3 · A question's life

```
        ask                      admin opens it               admin decides
 (none) ────▶ OPEN ───────────────▶ SEEN ──┬──▶ PLANNED ──▶ ANSWERED
                ▲   edit (10 min)    │      ├──▶ ANSWERED
                └────────────────────┘      ├──▶ DECLINED
                  an edit puts it           └──▶ DUPLICATE  → links to the question it repeats
                  back to OPEN
```

| Status | Set by | What the asker sees | Active? |
|---|---|---|---|
| **Open** | The system, on ask or edit | "Sent. Not seen yet." | Yes |
| **Seen** | The admin (also automatically the first time the admin opens it) | "Seen." | Yes |
| **Planned** | The admin | "We're going to do this." | No: the asker may ask again after the cooldown |
| **Answered** | The admin, with an answer | The answer, in place, with a link to its own page | No |
| **Declined** | The admin, with a reason (optional) | "Not doing this" and the reason | No |
| **Duplicate** | The admin, pointing at another question | A link to the question it repeats, if that one is public | No |

- **Seen isn't a promise.** It says a person read it. The admin's inbox marks it automatically on open, so it can't be forgotten.
- **An edit resets to Open** and stamps `edited_at`, so the admin sees it changed since they last looked, and a question can't be made into something else after it was seen and planned. Editing stops at Planned.
- **A link to your question.** The asker's own page at `/community/questions/[id]` works for them and the admin only, until it's published. That is the "when you click a link it takes you to the question" the maintainer described.
- **Closed means** Answered, Declined or Duplicate: the admin's last word is in and nothing more happens unless the admin reopens it. Planned is not closed (it becomes Answered when the thing ships). **Closed questions are kept always** (Q26): nothing is deleted on a timer, only by the admin for abuse or by the asker deleting their account.
- **No email**, because accounts have none. The status shows wherever the player looks: on `/community/ask`, and as a small mark on the app's You tab (a later step, [05](05-OPEN-QUESTIONS.md) build order).

## 4 · Public or private

**Decided 29 Sept (Q26, Q27): the asker chooses.** The ask form has one tick, **Public** or **Private** (Private by default, so nothing goes public by accident).

| The asker ticked | What happens |
|---|---|
| **Private** | Only the asker and the admin ever see it. It never appears on the public Q&A |
| **Public** | It appears on the public Q&A **once the admin answers it** (an unanswered question is never public, so the public list is never a wall of waiting questions). No asker name (Q19) |

- **The admin can make any question private** (Q27), for personal details, abuse, or something not worth showing. The admin can't make a Private question public; only the asker's tick allows that.
- The admin can edit a public question's wording for the public page (the asker's original is kept and shown to the asker).
- Why the asker decides and not the admin alone: it's their question, and a player who wants a quiet answer shouldn't have to trust that it won't be shown.

## 4a · Private conversations

The maintainer (Q24): the admin can **start a private conversation** on a question, **which only the asker and the admin can see.** It's for "can you send me the run id?" or "would you translate the app?", the times one answer isn't enough.

| Rule | Value |
|---|---|
| Who starts it | **Only the admin**, from a question. A player can never open one, so it can't become a DM channel into the admin |
| Who sees it | The asker and the admin. Never public, even on a Public question |
| Who writes | Both, turn about, plain text, the same length limits as a question |
| Limits | The asker: at most 10 messages a day in conversations; the admin can close a conversation, after which it's read-only |
| Where | Under the question on the asker's own page, and in the admin's inbox |

## 4b · Your questions, like an inbox

Every question you've asked, newest activity first, each with its status tag and a mark when something changed since you last looked (an answer, a status, a conversation message). Open one to see the question, the answer and any conversation (Q26).

## 5 · The admin's inbox

The admin sees one list, newest activity first:

| Column | |
|---|---|
| Status | The six above, as tags |
| Asker | Username and a mark if they have a recent verdict, so the question has context |
| Question | The first line, the whole text on open |
| Age | Since asked, and since last edited |
| Flags | `EDITED` since last seen; a count of the asker's earlier questions |

Filters: status, and "edited since I looked". Actions on a question: set the status, write the answer, make it private, start or close a private conversation, mark as a duplicate of another, delete (for abuse). The admin's writing an update is a separate, plain form.

There is no count of "unanswered" that the public sees. The inbox is private.

## 6 · The screens

Phone first, then the wide layout. Kit Drop's grammar: tags for statuses, a riveted plate for the one primary action, hairline rules between rows.

```
/community  [nylon or cotton, per the site's direction]
┌──────────────────────────────────────┐
│ COMMUNITY                            │
│ UPDATES · QUESTIONS                  │  two tabs, tape under the active one
│ ──────────────────────────────────── │
│ 27 SEP · "Europe is in"              │  an update: date tag, title
│ The Europa and Conference Leagues…   │
│ 24 SEP · "Seasons and badges"        │
│ …                                    │
│                                      │
│ ┌•──────────────────────────────────•┐│
│ │  ASK A QUESTION                    ││  the one plate; signs you in first if needed
│ └•──────────────────────────────────•┘│
└──────────────────────────────────────┘

/community/ask   (signed in, no active question)
┌──────────────────────────────────────┐
│ ASK                                   │
│ One question at a time. You'll see    │
│ here when it's been seen and answered.│
│ ┌──────────────────────────────────┐ │
│ │ Question anything, even how my   │ │  the placeholder (Q27)
│ │ day was and how rocket science   │ │
│ │ works, I'll always try to        │ │
│ │ reply. :)                        │ │
│ └──────────────────────────────────┘ │
│ 0 / 1000        ( ) PUBLIC  (•) PRIVATE │
│ ┌•─────────────────────────────────•┐│
│ │  SEND                              ││
│ └•─────────────────────────────────•┘│
└──────────────────────────────────────┘

/community/ask   (active question)
│ YOUR QUESTION            [SEEN]      │
│ "How do I…"                          │
│ Sent 14 min ago · seen 3 min ago     │
│ EDIT  (available in 6 min)           │  the disabled plate names what's missing
```

**States, all possible / in use at launch**

| Screen | All possible | In use |
|---|---|---|
| Ask | signed out · guest · no saved run yet · cooling down (says when) · active question · over the daily limit · couldn't send | signed out · guest · no run · cooling down · active · couldn't send |
| A question | open · seen · planned · answered · declined · duplicate · deleted · not yours | all but deleted, which is a 404 |
| Updates | none yet · list · one update · couldn't load | all |

The daily-limit and edit-cooldown states name the missing step ("Available in 6 minutes"), the kit's rule for a disabled plate.

## 7 · The public Q&A

Answered Public questions, newest first. **The admin's answer is the bigger text** (Q24): the question sits above it smaller, as the prompt, and the answer is what the page is for. Plain text or a tiny whitelist ([04](04-SECURITY-AND-ABUSE.md) §6), and the date.

**Search** (Q24) takes whole sentences, not just keywords: Postgres full-text search (`websearch_to_tsquery` over the question and answer, English and Slovak configurations; **check** Slovak stemming support, and fall back to `pg_trgm` similarity if it's missing), run through a function with a length cap. When nothing matches:

> Didn't find an answer? Come and ask it yourself.

That line is a link to the ask form with the search text **pre-filled as the question** (the first 100 characters; the player can keep writing up to the normal limit). Signed-out visitors are asked to sign in first and land back on the pre-filled form.

## 8 · Left out, and when to add it

| What | Why | When |
|---|---|---|
| Live chat, public replies, threads (beyond the admin-started private conversation, §4a) | Not a feedback tool; a moderation burden | If the maintainer wants a community rather than a feedback desk |
| Voting on questions | Invites brigading, and one admin can't act on a ranking | With more than one admin |
| Email or push notifications | No emails exist on accounts | If accounts ever get an optional email |
| Attachments and screenshots | An upload path to secure; the app's storage bucket already needs auditing | If a bug-report flow is wanted (a separate feature) |
| More than one admin | One is the maintainer's decision | If the volume needs it: the table takes more rows already ([03](03-ACCOUNTS-AND-THE-ADMIN.md) §3) |
| Tags and categories | Six statuses are enough to triage one person's inbox | If the inbox outgrows a list |

## 9 · Documents to update when this is built

- The app's `app/privacy.tsx`: questions are stored, the admin can read them, deleting your account deletes them.
- `supabase/`: a `qa.sql` file, run once by the maintainer.
- [`../ui-overhaul/07a-SCREENS-SHELL.md`](../ui-overhaul/07a-SCREENS-SHELL.md) A4 (You): the row that opens the community.
