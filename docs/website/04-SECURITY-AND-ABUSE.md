# 04 · Security and abuse

> Part of the [website set](00-README.md). Status: **first draft**, 29 September 2026. Nothing applied. The maintainer asked for it to be "secure in a real way", and for the `vibecode-audit` skill to be upgraded so it can say so (§9).
>
> **Decided 29 Sept:** security and performance are **day one**; features can wait (Q18). The limits below are accepted as starting values, but **security gets its own long, dedicated session** (Q21) that re-reads this draft, learns every part to the last detail, and replaces it with the final version before anything is built. Injection is covered for the app and the site in [`../release/03-INJECTION.md`](../release/03-INJECTION.md); its §3 rules are part of this plan.

## 1 · What's worth protecting, and who might abuse it

Not money, not payment details, not email addresses (accounts have none). What there is:

| Asset | Why it matters |
|---|---|
| **The admin's session** | It can read every question and write the public updates. The highest-value target on the site |
| **The admin's attention** | One person reads the inbox. A flood of junk is a denial of service against a person |
| **Players' question text** | Free text is personal data: it can contain a name, a school, anything |
| **The shared Supabase project** | It also holds the game's runs, profiles and clubs, and The Dugout's and Become a Legend's tables. A mistake here reaches all of them |
| **The site's reputation** | Published answers and updates appear under the game's name |

Who abuses it, in the order they're likely: **a spammer with throw-away accounts** (accounts are a username and a password); **a player who loops** (a bug or a bored person hitting Send); **a curious visitor** probing for the admin; **someone who wants to harm the admin's browser** by putting script in a question (the admin is the one reader who opens everyone's text); **a scraper** reading everything readable.

## 2 · The data, and who can touch it

### 2.1 The rule
**Every write goes through a function that checks who's asking and what already exists; the tables refuse direct reads and writes to anyone else.** It's the pattern `supabase/friends.sql` and `supabase/clubs.sql` already use, for the same reason: an open insert policy lets anyone write anything, and a check written in the page enforces nothing, because the page is the attacker's to change. (This is also the one place the site can say "deny by default": with row-level security on and no policy, nobody but the database's owner can touch a table.)

### 2.2 The tables (a sketch, in words)

| Table | Holds | Direct access |
|---|---|---|
| `qa_settings` | One row of limits: the edit cooldown, the daily cap, the length limits, the global breaker's number | None (read by the functions) |
| `qa_questions` | `id`, `user_id` (references `profiles`, cascades), `body`, `status`, `answer`, `visibility` (`public` or `private`, the asker's tick), `admin_private` (the admin's override), `created_at`, `edited_at`, `edit_count`, `seen_at`, `answered_at`, `duplicate_of` | None: the asker reads their own through a function, everyone reads answered public ones through a view |
| `qa_messages` | Private conversations ([02](02-COMMUNITY-AND-QUESTIONS.md) §4a): `id`, `question_id` (cascades), `from_admin`, `body`, `created_at` | None: read and written only through functions that check the caller is the question's asker or the admin, and that the admin opened the conversation |
| `qa_updates` | The updates channel: `id`, `title`, `body`, `author_id` (set null on delete), `created_at` | Public read; write only through an admin function |
| `qa_events` | One row per limited action (`user_id`, `kind`, `at`), the counter every limit reads | None |
| `qa_admin_log` | Who did what and when | None, except the admin's read function |
| `site_admins` | The one admin row | None |

`qa_` and `site_` prefixes throughout: the project also holds tables of two other apps that this work must never touch.

### 2.3 The functions

| Function | Who | Checks |
|---|---|---|
| `qa_ask(body)` | A member | A real account, not a guest; has a saved run; no active question; the cooldown since the last one; the daily cap; the global breaker; length; then inserts |
| `qa_edit(id, body)` | The asker | It's theirs; status is open or seen; the edit cooldown; the edit and daily caps; length; resets status to open |
| `qa_mine()` | A member | Returns their questions only |
| `qa_published()`, `qa_search(text)` | Anyone | Answered, public, not admin-private only; search text length-capped and passed as a parameter to `websearch_to_tsquery`, never built into SQL |
| `qa_reply(question_id, body)` | The asker | It's theirs; the admin opened a conversation and it isn't closed; the message cap; length |
| `qa_admin_*` | The admin | `site_is_admin()` first, then the action, then a log row |
| `site_is_admin()` | Anyone | True only for the admin row, at the second factor |

All are `security definer` with a fixed `search_path`, and each begins by reading `auth.uid()`, never a parameter, for who's asking. That is the same discipline `delete-account` uses ("resolved from their token, never from the request body").

### 2.4 The limits live in the database
The numbers in [02](02-COMMUNITY-AND-QUESTIONS.md) §2 are a row in `qa_settings`, so the maintainer can change a cooldown in the SQL editor without a deploy, and the functions and the pages read one source.

## 3 · Rate limiting

**The facts (Supabase documentation, read 29 September).** Its limits cover Auth only: sign-up and sign-in 30 requests per five minutes per IP, token refresh 150 per five minutes per IP, anonymous sign-ins 30 an hour per IP, one-time-code resends 60 seconds per user, and emails and texts per project. The page says nothing about database or REST calls ([rate limits](https://supabase.com/docs/guides/auth/rate-limits)). Supabase's own material describes rate limiting the database in three ways: an Edge Function in front, with a store such as Redis; a Postgres pre-request hook counting requests per IP in an unlogged table ([the pgheaderkit walk-through](https://dev.to/supabase/rate-limiting-supabase-requests-with-postgresql-and-pgheaderkit-409j), which skips reads and needs a nightly cleanup job); or logic inside the functions themselves.

**The choice: inside the functions,** with `qa_events` as the counter. Reasons:
- The thing to limit is a small number of *writes by an account*, not requests by an address. Per-account limits can't be dodged by changing address, and shared addresses (a school, a phone network) aren't punished together, which the per-IP approach does ("shared IPs count toward the same quota", the walk-through's own caveat).
- No new service, no cost, and the rules are readable SQL next to the data.
- An Edge Function in front would add a hop and a second deployment for the same result. It's kept as the upgrade if per-address limits ever matter.

**Four layers, cheapest first:**

| Layer | Limit | Stops |
|---|---|---|
| Account | The rules in 02 §2 (one active, cooldown, 3 a day, 5 edits) | A looping or bored player |
| Eligibility | Real account with a saved run | Throw-away accounts. Making one costs a whole run, which is slower than a script can post |
| Global | A daily ceiling on new questions across the site (start: 100), which stops new questions with a clear message and tells the admin | A coordinated flood, even from many good-looking accounts. The admin's inbox can't be drowned |
| Sign-up | Supabase's 30 per five minutes per IP, unchanged | Bulk account creation from one address |

**Provisional:** every number is a starting guess. The global breaker's number is the one to watch in the first month.

**What still gets through, and why that's accepted:** a patient person with a few real accounts and a few real runs can post a few questions a day. The daily cap, the one-active rule and the ability to delete make that a nuisance, not an outage.

## 4 · The admin's functions

- **Every one starts with `site_is_admin()`** ([03](03-ACCOUNTS-AND-THE-ADMIN.md) §3), so it fails for anyone else even if they call the function directly.
- **They have limits too:** a generous per-hour cap on admin actions, so a stolen admin session can't wipe the inbox in a second, and a delete keeps the row in the log.
- **The log is append-only:** the admin can read it, and nothing (including the admin's own functions) can edit or delete a row.

## 5 · Captcha, and why not yet

Supabase can put a captcha (Cloudflare Turnstile or hCaptcha) in front of sign-up and sign-in. The setting is **per project**, and this project's sign-in is also used by the Expo app, whose sign-in screen doesn't send a captcha token and can't produce one natively without a web view. Turning it on could stop every sign-up in the app. **Not recommended** without first checking that native clients can be exempt.

**Couldn't verify:** the captcha setting's scope and whether native clients can be excluded; check the dashboard's documentation before any decision.

## 6 · What's in a question, and what the admin's browser sees

The most damaging realistic attack is not on the database: it's **a question that carries script, opened by the admin**. It would run in the admin's session, at the moment they're signed in with the power to read everything.

| Rule | How |
|---|---|
| **Plain text only.** No markup, no links, no images | Questions are stored as text and rendered as text (the framework's text node, never `innerHTML`/`dangerouslySetInnerHTML`). A link in a question is shown as characters and isn't clickable |
| **Strip what has no place in a sentence** | Control characters and zero-width characters removed in the function that stores it; length counted after |
| **The admin's own writing** (updates, answers) | A tiny whitelist: paragraphs, bold, a link to the game's own domain. Rendered by a small function that builds elements, not from a string of HTML |
| **A content security policy** on the site | No inline script, scripts only from the site's own origin and the analytics it uses. If a script does slip into a page, the browser refuses to run it |
| **No source maps** in the production build | The vibecode audit's own BLD item |
| **The session token** | Supabase's browser client keeps it in the page's local storage, which script on the page can read. That's why the policy above matters more here than on a site with cookies |

## 7 · Privacy

- **A question is personal data.** The privacy page (`app/privacy.tsx`, shared with the site) says what's stored, that the admin can read it, that a published answer can appear publicly without a name unless the asker agrees, and that deleting your account deletes your questions.
- **Cascade, not memory.** Every table here references `profiles(id)` with `on delete cascade`, because the game's deletion function removes an explicit list and relies on cascades for the rest ([03](03-ACCOUNTS-AND-THE-ADMIN.md) §6).
- **Retention.** Decided (Q26): **closed questions are kept always.** They go only when the admin deletes one for abuse or the asker deletes their account (the cascade). The privacy page says so.
- **The asker's choice.** A question ticked Private is never shown publicly; the admin can make a public one private but never the reverse ([02](02-COMMUNITY-AND-QUESTIONS.md) §4).
- **The log** holds ids, not question text.
- **No tracking** of what a player reads in the community, and the analytics don't see question text.

## 8 · Threats and what answers them

| Threat | Likelihood | What happens | Answer |
|---|---|---|---|
| Spam via throw-away accounts | High | The inbox fills | Saved-run gate, global breaker, one-active rule |
| A looping client | Medium | Hundreds of writes | Per-account caps in the function |
| Stored script in a question | Medium | The admin's session runs it | Plain text, text nodes, CSP |
| The admin address leaks | High over time | A stranger sees a sign-in box | It's only a convenience ([03](03-ACCOUNTS-AND-THE-ADMIN.md) §4); the check is on the server |
| Admin password stolen | Low | A session as the admin | TOTP; instant revocation by deleting the row |
| A policy or function that touches another app's tables | Low, high impact | The other apps break | Prefixes, a review of every statement, run once by hand |
| Someone reads all questions | Low | Private text exposed | No direct table reads; the view exposes published answers only |
| A direct call to an admin function | Certain to be tried | Nothing | `site_is_admin()` first |
| Oversized or malformed input | Medium | Errors, slow pages | Length checks in the function, not the page |
| Harassment in a question | Medium | The admin reads abuse | Delete; the asker's account can be flagged in the inbox; a block list is left for later |

## 9 · What the `vibecode-audit` skill has to learn

The roadmap (Phase 10) says the skill is upgraded before it's run against the site. The skill's own security pass is a 20-point checklist for a site, and this design is the case it doesn't cover. It needs at least:

1. **A database-first section for sites on Supabase (or similar):** list every table, read its policies from `pg_policies`, and confirm row-level security is on for each (`relrowsecurity`). "RLS is enabled" isn't evidence without the policies (the audit references' own trap).
2. **A two-account test:** the procedure and the expected refusals, written out so it can be run by hand.
3. **Rate limits on writes,** not only on sign-in: for every function a signed-in user can call, the per-account and global limit, or a written reason there's none.
4. **Admin areas:** the check must be server-side; the address is not a control; the admin's session needs a second factor; the admin route is excluded from robots, sitemaps and analytics; admin actions are logged.
5. **Stored-content safety:** every place user text is rendered, how, and the site's CSP.
6. **Storage buckets:** policies for uploads (the first audit marked uploads not applicable, and the game now has avatar and banner uploads, [`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §2.3).
7. **Shared-project hygiene:** what else lives in the project and confirmation that nothing here can reach it.
8. **Account deletion coverage:** every table with a user id is either on the deletion list or cascades.
9. **Injection:** every query built from text (PostgREST filter strings, SQLite, `format()` in SQL), per [`../release/03-INJECTION.md`](../release/03-INJECTION.md) §3.
10. **Third-party settings that can't be read from the repo,** listed as *couldn't verify* with exactly what to open in the dashboard, and a place to record the answer.

Then the skill's honesty rule applies to this plan too: anything above that depends on the dashboard is a checklist item for the maintainer, not a claim.

## 10 · Couldn't verify

| Item | What to check |
|---|---|
| Row-level security is on for every existing table | `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'` (already in `supabase/policies.sql`'s header) |
| The token's `aal` claim at the second factor | A real login with an enrolled account, decoding the token |
| Whether Supabase Auth locks an account after repeated failures | The dashboard's Auth settings and documentation |
| Whether captcha can exclude native clients | The dashboard's documentation |
| That no policy in the shared project exposes another app's tables | List `pg_policies` for the whole project once and read it |
| The site's headers (CSP, HSTS, frame options) | The deployed response, once it exists |

## 11 · Implementation order

1. The audit skill's upgrade (§9) **before** the build, so the build is written to it.
2. `qa.sql`: tables, settings, functions, policies, run once by hand.
3. A `scripts/verify-qa.ts` (or SQL test file) that plays the rules: a second question while one is active is refused, an edit inside the cooldown is refused, the daily cap holds, a non-admin call to an admin function is refused, a guest can't ask.
4. The site's pages.
5. The two-account test (§9.2) on the deployed site, then the upgraded audit on the whole.

**Done when.** Each refusal in step 3 fails before its check is written and passes after; the two-account test passes on the live site; the audit reports no blocker.
