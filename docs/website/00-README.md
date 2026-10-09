# The Perfection or Misery website: the plan

> Written 29 September 2026; **re-audited 9 October 2026** (Phase 10 began): every claim checked again ([07](07-FACT-CHECK.md)), the holes listed ([08](08-HOLES.md)), the landing page and the other pages shaped ([09](09-LANDING-SHAPE.md), [11](11-PAGES-COMMUNITY-DOWNLOAD.md)), the audit's additions written ([10](10-AUDIT-ADDENDUM.md)). Status of the set: **plan, shape confirmed**, nothing built. No code changed to produce it. App-wide release topics the site depends on (names and marks, offline, injection, languages, the APK and updates) are in [`../release/`](../release/00-README.md).
> Companion: [`WEBSITE-BRIEF.md`](WEBSITE-BRIEF.md) (24 September: the creative brief, the live counter, the design bar, the prompts). Where this set and the brief differ, this set is newer. Phase: the roadmap's **Phase 10**.

## What this is

The brief says what the site is for: make a football fan who has never heard of the game play a run within a minute. On 29 September the maintainer added three things to it: a **new logo**, a **community section** (an updates channel and a questions channel, with an admin who answers), and the rule that the site is **a landing page first**, with the community features quiet. He also said the site "needs a lot of questions answered". This set is those answers where the code and the research can give them, and the questions where they can't.

The central design fact is that the site uses **the same accounts as the app**. The game's Supabase project already has sign-in, profiles, row-level security and a place for server functions, so the community section is a few tables and functions on infrastructure that exists, not a second system. That's cheaper and better than anything a separate service would give, and it puts the security burden squarely on the database, which is where this set spends most of its effort.

## The short version

| Question | Answer | Where |
|---|---|---|
| What is the page? | A landing page: poster, how a run goes, the verdicts, the modes, the live counter, the two play plates. The community is one quiet link in the footer and a page of its own | [01](01-THE-SITE.md) |
| What's in the community? | An **updates** channel (the admin writes, everyone reads) and a **questions** channel (one active question per player; the asker ticks public or private; admin-started private conversations; sentence search). It's also the site's contact | [02](02-COMMUNITY-AND-QUESTIONS.md) |
| Who can ask? | A signed-in player with a real account (not a guest) who has played a saved run, one active question at a time | [02](02-COMMUNITY-AND-QUESTIONS.md) §2, [04](04-SECURITY-AND-ABUSE.md) |
| The status a question shows | open, seen, planned, answered, declined, duplicate | [02](02-COMMUNITY-AND-QUESTIONS.md) §3 |
| The admin | One PoM account, marked in a one-row table. The secret URL only hides the login form; the real check is on the server, with a second factor | [03](03-ACCOUNTS-AND-THE-ADMIN.md) |
| Rate limiting | In the database: every write through a checked function, per-account limits, a global daily breaker. Supabase has no rate limit on database calls by default | [04](04-SECURITY-AND-ABUSE.md) |
| What must change first | The new logo on the app and the site (step 1a; the SVG is in, 9 Oct). The audit's additions are written ([10](10-AUDIT-ADDENDUM.md)); the skill itself is plugin-managed and stays as it is | [05](05-OPEN-QUESTIONS.md) §3 |
| The answers | All 31, recorded with what each changed | [05](05-OPEN-QUESTIONS.md) |
| Vercel | Two projects from one repo, headers, analytics, previews, the firewall | [06](06-VERCEL-SETUP.md) |
| The hero (9 Oct) | **A live spin**: the draft's reel of club-seasons lands on one each visit, in the legal flavour's names | [09](09-LANDING-SHAPE.md) §4 |
| The counter (9 Oct) | Runs played, from a `site_counters` row kept by triggers, **polled** every 30 s (not Realtime); users hidden until past a threshold | [08](08-HOLES.md) §2 |
| The dashboards (9 Oct) | RLS on all 21 tables; **server secrets sitting in the game's Vercel project** (remove them); the avatars bucket has no size or type limit; `pg_trgm` not installed; Analytics and Speed Insights never enabled | [07](07-FACT-CHECK.md) §5 |
| What was wrong (9 Oct) | 26 findings: no logo SVG in the repo, `latest.json` is the game's, notifications exist, the audit skill was never upgraded, the public site must use legal names, Astro needs Node 22 … | [07](07-FACT-CHECK.md) |

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [The site](01-THE-SITE.md) | The page, its order, where the community sits, the logo, the stack |
| 02 | [Community and questions](02-COMMUNITY-AND-QUESTIONS.md) | The two channels, a question's life, the inbox, the screens |
| 03 | [Accounts and the admin](03-ACCOUNTS-AND-THE-ADMIN.md) | One login for app and site, the single admin, the secret route, what you type |
| 04 | [Security and abuse](04-SECURITY-AND-ABUSE.md) | Threats, rate limits, policies, what the audit skill must learn |
| 05 | [Answers and build order](05-OPEN-QUESTIONS.md) | What the maintainer decided on 29 Sept; the contact address; the steps |
| 06 | [Vercel setup](06-VERCEL-SETUP.md) | What to click and set in Vercel, step by step |
| 07 | [The fact-check](07-FACT-CHECK.md) | What the set said on 29 Sept against the code and the services on 9 Oct, and where each is fixed |
| 08 | [Holes](08-HOLES.md) | What the plan didn't cover, with proposals; the counters specified |
| 09 | [The landing page, shaped](09-LANDING-SHAPE.md) | The page top to bottom, the spin, the screenshots, names, metadata, states, wireframes, motion, the never-list |
| 10 | [The audit addendum](10-AUDIT-ADDENDUM.md) | The database and site checks the audit skill lacks, each with how it fails |
| 11 | [The other pages, shaped](11-PAGES-COMMUNITY-DOWNLOAD.md) | Sign-in, download, the community's additions, the 404 |

## Findings worth knowing up front

1. **A secret URL is not a lock.** The admin page's code ships to every visitor; a hidden address only stops casual discovery. What protects the admin is a server-side check that the signed-in account is the admin, plus a second factor. Everything in [03](03-ACCOUNTS-AND-THE-ADMIN.md) is built so that knowing the URL is worth nothing.
2. **Supabase does not rate-limit database calls.** Its documented limits cover sign-in and sign-up (30 requests per five minutes per IP), tokens, emails and anonymous sign-ins, and nothing for inserts (checked 29 September and 9 October). So "one question at a time, edit every X minutes" has to be enforced in a database function; a page that merely disables a button enforces nothing.
3. **Accounts here are cheap:** a username and a password, no email, so no verification, and guests are anonymous sessions. Spam via throw-away accounts is the real threat, and the answer is to ask for something a throw-away account doesn't have (a saved run) and to cap the whole site, not only each account ([04](04-SECURITY-AND-ABUSE.md) §3).
4. **There's no way to email anyone,** but the game has notifications now (corrected 9 Oct, [07](07-FACT-CHECK.md) F4): a question's status change raises a notice on You, through the same function-only insert the friends system uses.
5. **Captcha can't simply be turned on.** Supabase's captcha protection applies to the whole project, including the Expo app's sign-in, which would then need a token it can't produce natively without a web view. Still not recommended: checked 9 Oct, nothing documents a native exemption ([04](04-SECURITY-AND-ABUSE.md) §5).
6. **The Supabase project is shared** with Become a Legend and The Gaffer (`gaf_*`) (corrected 9 Oct: The Dugout has no Supabase, [07](07-FACT-CHECK.md) F2). Every table and function here needs a `site_` or `qa_` prefix and must never touch theirs.
7. **The new logo is white on transparent.** On cotton it vanishes (1.11:1), so the build tints the wordmark to ink in light mode ([`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §3.3). The SVG it needs was missing; **re-exported on 9 Oct** (`assets/Group 3.svg`, the wordmark one white path, [07](07-FACT-CHECK.md) F1).
8. **`play.` can't nest under a `vercel.app` address.** The game keeps `perfection-or-misery.vercel.app` (where App Links are verified) and the site gets its own project name ([06](06-VERCEL-SETUP.md) §1).
9. **The site is public, so it speaks the legal flavour** ([07](07-FACT-CHECK.md) F7): "European Cup", altered club names ("Barcelona Navy"), no crests. Anything read from the database passes through the legal app's rename table.
10. **The audit skill was never upgraded** ([07](07-FACT-CHECK.md) F8); its additions are [10](10-AUDIT-ADDENDUM.md).
11. **A Realtime socket per visitor** would hit the free plan's 200 connections, shared with the club chat ([07](07-FACT-CHECK.md) F14), so the counter polls.

## Decisions taken in this plan

- **Landing page first.** The poster is the page; the community is a footer link and its own page (01 §2).
- **One account system:** the game's, with the existing internal-email login (03 §1).
- **One admin,** created by the maintainer from the SQL editor (03 §3).
- **The asker ticks public or private; a public question shows only once answered; the admin can make any question private** (02 §4). Closed questions are kept always.
- **Astro**, **dark and light**, **the logo's colours**, **English and Slovak**, **security and performance day one** (05 §1).
- **Every write is a checked function; the tables are closed to direct writes** (04 §2), the pattern `supabase/friends.sql` and `supabase/clubs.sql` already use.
- **Plain text only** in questions (no markdown, no links); the admin's updates use a tiny whitelisted markup (04 §6).
- **9 Oct, with the maintainer:** the hero is **a live spin**; the users counter **stays hidden until past a threshold**; **1.0.0 comes after Phase 11**, so the site launches in early access. And in this pass: sign-in only on the site (08 H21), `latest.json` stays on the game (07 F3), the counter polls (08 §2), the audit's additions live in this set (10).

## Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| O1 | ~~Re-export the logo as SVG~~ | **Done 9 Oct** (`assets/Group 3.svg`) |
| O2 | ~~The Slovak headline~~ | **Decided 9 Oct:** *Zostav jedenástku zo skutočných klubových sezón. Preži sezónu.* ([09](09-LANDING-SHAPE.md) §3.1) |
| O3 | ~~A minimum age for writing in the community~~ | **Decided 9 Oct: 15**, stated, not verified ([08](08-HOLES.md) H10) |
| O4 | Real club names in the public build | Unchanged: altered until a lawyer says otherwise ([`../release/01-NAMES-MARKS-AND-THE-LAW.md`](../release/01-NAMES-MARKS-AND-THE-LAW.md) L1) |
| O5 | A domain | `vercel.app` until one is bought (Q1) |

## How this was made

- **Read.** The website brief, the whole UI overhaul set (for the design language), the Supabase files in the repo (`clubs.sql`, `friends.sql`, `policies.sql`), the auth code (`src/lib/auth.ts`, `src/store/userStore.ts`), and the memory notes on sibling projects.
- **Researched, primary sources:** Supabase's documentation on [rate limits for Auth](https://supabase.com/docs/guides/auth/rate-limits), [role-based access control](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) (the custom access token hook and its refresh caveat) and [TOTP multi-factor](https://supabase.com/docs/guides/auth/auth-mfa/totp) (free on every project); a community walk-through of [database-level rate limiting](https://dev.to/supabase/rate-limiting-supabase-requests-with-postgresql-and-pgheaderkit-409j) (IP-based, `db_pre_request`, an unlogged table); Supabase's page on rate limiting Edge Functions (seen in search results, not read in full).
- **Not verified:** OWASP's Broken Access Control guidance (the category this design leans on) failed to load this session, so it's cited by name only. Everything about the Supabase dashboard's own settings (captcha, MFA enrolment screens, the exact custom-hook toggle) is listed as *couldn't verify* with what to check.
- **Skills.** `impeccable` and `frontend-design` are for the build, not this plan; the security part is where the `vibecode-audit` skill's upgrade comes in (04 §9). Every new document was scanned against the humanizer skill's tell list (no em dashes, no puffery words) and left otherwise as written, since they are plain planning text.
- **Not done (29 Sept):** no SQL applied, no page built, no design roll.
- **9 October, the re-audit.** Read again: the code the site depends on (auth, the update check, the legal flavour and both databases, the brand assets, the web build's public files), every `supabase/*.sql`, the release set, the roadmap, `PRODUCT.md`, `DESIGN.md`, memory. Researched: Supabase's Auth rate limits, MFA and Realtime quotas, captcha; Vercel's Deployment Protection, firewall and `vercel.app` names; Astro on npm; PostgreSQL text search; GDPR Article 8 (Slovakia through a law-firm guide, not the statute). Skills: `vibecode-audit`'s checklist held against the plan (it found the 404, `hreflang`, FAQ, password toggle and footer gaps), `impeccable` `shape` inside the locked Kit Drop world (no re-roll: the site speaks the app's world), with three questions answered by the maintainer. **Not done:** no SQL, no page, no dashboard read (the *couldn't verify* rows in [10](10-AUDIT-ADDENDUM.md) §4), no legal advice.
