# 09 · Guests, rethought

> Part of the [release set](00-README.md). Status: **decided 9 October 2026: option C, built in Phase 10.5.** Asked for on 9 October, when "require current password when updating" was kept off because it could break the guest upgrade ([`../website/07-FACT-CHECK.md`](../website/07-FACT-CHECK.md) D10). Code read 9 October.

---

## 1. How a guest works today

- **Every launch without a session makes an account.** Start-up calls `ensureGuestSession()` (`app/_layout.tsx:191`), which signs in anonymously (`src/lib/auth.ts:12-19`). Supabase creates a user, and a trigger (`handle_new_user`) creates a profile row with `is_guest` true. Deleting an account does the same at the end (`auth.ts:128`).
- **A guest saves nothing.** `submit-run` refuses an anonymous session ("Guest runs are not saved", `supabase/functions/submit-run/index.ts:62`); friends, clubs and chat refuse non-members (`pom_is_member()`, `supabase/friends.sql:18`). Everything a guest reads (Ranks, runs, profiles) is readable without any session (`runs_public_read`, `profiles_public_read`).
- **Making an account upgrades the guest in place** (`upgradeGuestAccount`, `auth.ts:40-80`): the anonymous user gets the internal address and a password, the profile's `is_guest` turns false.
- **So the anonymous session does one job:** it makes sign-up an upgrade instead of a new account.

## 2. What that costs

| # | Cost | Evidence |
|---|---|---|
| G1 | **An account per browser and per install, forever.** 99 guest accounts against 11 real ones today; every visitor the website sends to the browser game adds one, and a private window adds another | `readings-phase10.sql`, 9 Oct; nothing deletes them |
| G2 | **The anonymous sign-in limit is 30 an hour per address.** A school's or an event's shared wifi stops making guests at the 31st new device | Supabase Auth rate limits (07 F12) |
| G3 | **When that sign-in fails on the web, start-up stops halfway.** The steps after it are skipped: the web chrome, the Esc-to-go-back key, the flag font and the database warm-up (`app/_layout.tsx:191-197`; the error is only logged) | Read 9 Oct |
| G4 | **"Keep my runs" doesn't keep them.** After a guest's run, Home offers *Keep my runs* (`app/(tabs)/index.tsx:187`, `:213`); making the account keeps nothing, because the run was never saved | `submit-run:62` |
| G5 | **Password safety settings can't be turned on** ("require current password when updating"), because the upgrade sets a password on an account that has none | 07 D10 |
| G6 | Guests count as monthly active users and as rows in `profiles`, which is public to read in full (07 D2) | |

## 3. The options

| | A · Keep it, clean up | B · No session until sign-up | C · B, and keep the runs |
|---|---|---|---|
| What a guest is | An anonymous account, as now | Nobody, to the server: the app plays without a session | B, and the guest's finished runs wait on the phone |
| Sign-up | The upgrade | A plain sign-up (`signUp` with the internal address and password); the trigger makes the profile | B, then the waiting runs are sent under the new account |
| G1 accounts piling up | A weekly job deletes guest accounts older than 30 days (`pg_cron` is available, not installed) | **Gone** | **Gone** |
| G2 shared wifi | Still hits it | **Gone** | **Gone** |
| G3 half start-up | Fixed separately (the sign-in moved last, or not awaited) | **Gone** (no sign-in at start) | **Gone** |
| G4 "Keep my runs" | Still untrue; the button's words change | Still untrue; the words change | **True** |
| G5 password settings | Still blocked | Can be turned on | Can be turned on |
| Work | Small (a job, a reorder) | Medium: every place that assumes a user id for a guest has to cope with none (the user store, the notices badge, the run queue's guest check, crests) | Medium plus: the run queue already holds payloads; a guest's get their user id filled in at sign-up, and `submit-run`'s 10-a-minute limit and backdating rule (`rate-limit.sql`, `runs-queue.sql`) already handle a batch |
| Risk | Low | Sign-up and sign-in paths change; tested on both platforms | B's risk, and a check that a guest's waiting runs can't be sent under someone else's account (the queue already refuses a payload whose user doesn't match, `src/db/queries/runs.ts:154`) |

**Decided (9 Oct): C.** It removes every cost in §2 and makes the one promise the guest flow makes (*Keep my runs*) true. It reuses what already exists: the offline queue (Phase 9.75), its user check and `submit-run`'s limits. B alone is the same work minus the queue step, and leaves the button's promise to be reworded.

**A limit for C** *(dropped 11 Oct, see §4a)*: the plan kept at most the last 10. Built that way, the eleventh run lost the oldest; the maintainer: it "doesn't make quite a lot of sense". The rate limit was never a reason (the queue takes a 429 as "not now" and sends the rest a minute later), so every run is kept.

## 4. Where it fits

Not Phase 10: the website plan doesn't depend on it (the site has sign-in only, [`../website/08-HOLES.md`](../website/08-HOLES.md) H21). **Decided: Phase 10.5**, the PC sweep, because it changes start-up on the web, which that phase walks screen by screen anyway. Until then: "require current password when updating" stays **off** (decided 9 Oct), and a one-off clean-up of guest accounts with no runs can be run by hand whenever it's wanted.

## 4a. As built (11 October 2026)

- **No guest session.** Start-up no longer signs in; an older version's anonymous session is signed out locally (`dropAnonymousSession`, `src/lib/auth.ts`), and its failure can't stop the rest of start-up. Deleting an account leaves you a guest with no session.
- **Sign-up is a new account** (`registerAccount`): the taken and moderation checks first, then `signUp` with the internal address; the profile comes from `handle_new_user`, the name's casing is written after.
- **A guest's runs wait on the phone.** Every save passes `insertRun` (`src/db/queries/runs.ts`); with no account the run goes into the guest list (`src/lib/guestRuns.ts`, the rule `withGuestRun` in `src/lib/runQueue.ts`: every run, never twice, oldest first; no cap, changed 11 Oct after the maintainer: a first version kept the newest 10 and dropped older ones, which makes no sense for *Keep my runs*; a full browser storage fails the save with a retry instead of losing a run; checked in `verify-run-queue`, 25 runs sent in three rounds of ten a minute), and the result's save line says it's waiting on the phone. At sign-up `adoptGuestRuns` gives each the new account's id and puts it in the ordinary run queue, which sends it once the account is known, dated when it was played (submit-run keeps that date up to 14 days back).
- **Only at sign-up**, not when signing in to an existing account: on a shared phone a stranger's runs mustn't land on someone's account. Runs waiting when someone signs in stay on the phone for the next sign-up.
- **Not carried over:** the career (`mergeCareerFromRun`) of a guest's runs; the career counts from the first run played on the account.
- **Words:** Home's guest line now shows while runs wait, with the count; Runs, Career, Achievements and the save line say the runs wait on the phone; the privacy page's guest section is rewritten (both languages, `UPDATED` 2026-10-11).
- **The clean-up:** `supabase/guests-cleanup.sql`, look first, then one transaction, run after the new version is out everywhere.

## 5. Done when (for C)

- A fresh install and a fresh browser make **no** account (the readings' guest count doesn't move).
- A guest who finishes three runs and then makes an account finds those three runs in Runs and on Ranks, dated when they were played.
- Shared-wifi start-up: with anonymous sign-ins switched off in the dashboard, the app starts and plays as a guest.
- "Require current password when updating" turned on, and sign-up, sign-in and changing a password still work.
- The old guest accounts are deleted once, by a reviewed SQL statement (guests with no runs, which is all of them).
