# 05 · Questions, answers and build order

> Part of the [website set](00-README.md). Status: **answered by the maintainer on 29 September 2026**; this page records each answer and what changed because of it. Where a question led to research, the result is here or linked.

## 1 · The answers

### Hosting and stack

| # | Question | Answer (29 Sept) | What it changed |
|---|---|---|---|
| Q1 | The domain | `vercel.app` for now | Nothing to buy; the vibecode "vercel.app" tell is accepted |
| Q2 | Where the game lives | Game and run links on a *play* address, the landing page on the main one | **Research:** Vercel doesn't allow a nested name like `play.perfectionormisery.vercel.app` on its free addresses (third-level names under a project's `vercel.app` aren't supported; nesting needs a custom domain; Vercel community answers, 29 Sept). And App Links are verified for `perfection-or-misery.vercel.app` (`app.json:29`, `public/.well-known/assetlinks.json`). **So: the game stays at `perfection-or-misery.vercel.app`, where run links already open the app, and the landing page takes a new project name such as `perfectionormisery.vercel.app`** ([06](06-VERCEL-SETUP.md) §1). Moving the game would need a new App Links setup and a new build |
| Q3 | Astro or Next.js | **Astro** | [01](01-THE-SITE.md) §5 settled |
| Q4 | Repo layout | A `landing/` folder in this repo, its own Vercel project | [06](06-VERCEL-SETUP.md) |
| Q5 | "Get it on Android" | Play Store: "coming soon"; plus an official APK download on the site, with a silent update check in the app | **Research and plan:** [`../release/05-UPDATES-AND-THE-APK.md`](../release/05-UPDATES-AND-THE-APK.md) (over-the-air updates for JavaScript, a "new build" check and installer hand-off for the APK, hosted on GitHub Releases) |
| Q6 | The browser game at launch | Yes | |

### Design

| # | Question | Answer | What it changed |
|---|---|---|---|
| Q7 | Who sets the direction | `impeccable`, **critique first** (with the feedback the maintainer already has, such as "corporate"), then shape | Build order step 1 below |
| Q8 | Light or dark | **Dark mode and light mode, like any app**, every component with both variants | The app's D8 ([`../centralisation/10-PHASE-TWO-REVISED.md`](../centralisation/10-PHASE-TWO-REVISED.md)); the site follows the same pair |
| Q9 | Colours | **The logo's volt `#D5FF3F` and red `#E1141F` become the app's and the site's**, the red's contrast accepted as the one exception | [`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §2.2, §3.3 |
| Q10 | An ink wordmark for cotton | The build tints it | The site and app recolour the SVG's white paths at build time (the SVG's wordmark is one `fill="white"` path, easy to swap); nothing to export |
| Q11 | Screenshots | The maintainer supplies the screens asked for; the code base can also be used | The build asks for a named list |
| Q12 | The counter's label | **"Runs played"**, and a live **users** counter beside it | Two honest counters: runs from `runs`, users from a count of real (non-guest) accounts, both through `public_counters` rows kept by triggers, never by reading tables publicly |
| Q13 | The first update | A welcome update announcing the first public version, with a football name rather than "1.0.0" | Name ideas: **First Touch**, **The Academy**, **Kick-off**, **Matchday One**, **The First Whistle**. The maintainer picks |

### The community

| # | Question | Answer | What it changed |
|---|---|---|---|
| Q14 | Signed-out visitors read | Yes | |
| Q15 | Published answers public | Yes | |
| Q16 | "Has played" | One saved run | |
| Q17 | The admin's username | The maintainer generates the username and password himself and never shares them; the plan only says where they go. Passwords are hashed | [03](03-ACCOUNTS-AND-THE-ADMIN.md) §3.4 rewritten as "where to type what". Supabase Auth stores only a bcrypt hash of every password; nobody, including the admin, can read one |
| Q18 | Second factor on day one | Yes. **Security and performance are day-one; features can wait** | Recorded as a rule for the whole release |
| Q19 | Asker's name on published answers | No | |
| Q20 | Admin byline | "The developer", with no way to link it to an account | The byline is a fixed string; updates store no author id visible to the public |
| Q21 | The limits | Accepted as starting values; **security gets its own long session** that learns everything to the last detail | [04](04-SECURITY-AND-ABUSE.md) marked as a first draft for that session |
| Q22 | Declined reasons shown | Yes | |
| Q23 | Language | **English and Slovak natively**, through the humanizer and checked by the maintainer; other languages on request, with volunteers credited as lead or sole contributors in a public update | [`../release/04-LANGUAGES.md`](../release/04-LANGUAGES.md). **The contact question:** see §2 |

### Safety and law

| # | Question | Answer | What it changed |
|---|---|---|---|
| Q24 | Contact | **The questions page is the contact.** The admin can open a **private conversation** on a question, which only the asker and the admin see. The admin's answer is shown larger than the question. Search matches whole sentences, not only keywords; with no match: "Didn't find an answer? Come and ask it yourself.", which starts a question with the search text pre-filled (the first 100 characters; the player can then write more) | [02](02-COMMUNITY-AND-QUESTIONS.md) §4a, §5, §7 |
| Q25 | Privacy and terms | **One shared file used by both the app and the site**, started in Phase 8.5 | Roadmap Phase 8.5; the file holds both languages |
| Q26 | Keeping questions | **Closed questions are kept always.** The asker ticks **public or private**; your questions and their answers read like an inbox; the admin can also make a question private | [02](02-COMMUNITY-AND-QUESTIONS.md) §3, §4; [04](04-SECURITY-AND-ABUSE.md) §7 retention line replaced |
| Q27 | What may be asked | Anything. The placeholder: "Question anything, even how my day was and how rocket science works, I'll always try to reply. :)" | [02](02-COMMUNITY-AND-QUESTIONS.md) §6 |
| Q28 | Names and marks | Researched: [`../release/01-NAMES-MARKS-AND-THE-LAW.md`](../release/01-NAMES-MARKS-AND-THE-LAW.md). A public build ships without crests and competition logos, and two build flavours (`personal`, `legal`) come from one codebase | The site shows no official marks and uses the legal flavour's names |

### Measurement and launch

| # | Question | Answer |
|---|---|---|
| Q29 | Analytics | As decided |
| Q30 | Launch vs version | ~~1.0.0 = Phases 8.5, 9, 10 and finishing~~ **Changed 9 Oct: 1.0.0 comes after Phase 11** (the phase order now has 10.5 and 11 after 10). The site launches with the game in 0.9.x and says *early access*; the welcome update and the football release name (Q13) wait for 1.0.0 |
| Q31 | Play Store listing | Separate |

## 2 · An address people can write to

The maintainer wants a way for people (a would-be translator, for example) to reach him privately, and asks for a free address that sounds professional.

- **The questions page with private conversations covers most of it** (Q24): a player asks, the admin opens a private conversation. No address is published at all.
- **For people without an account** (a journalist, a school), a published address is still useful. Free options:

| Option | Needs a domain? | Notes |
|---|---|---|
| A dedicated Gmail (e.g. `perfectionormisery.game@gmail.com`) | No | Free, reliable, and keeps the personal address private. Reads as a hobby address, which is honest for now |
| Proton Mail free | No | Same, with a `proton.me` address |
| Cloudflare Email Routing, ImprovMX, Zoho Mail's free plan | **Yes** | An address at your own domain (`hello@perfectionormisery.com`) forwarded to the Gmail; the professional option, available once a domain is bought |

(From general knowledge, not re-checked this session; confirm each service's current free terms when choosing.)

**Decided 29 Sept: `perfectionormisery@gmail.com`** is the project's contact address (site footer, privacy page, the Wikipedia tool's User-Agent, the Transfermarkt enquiry). The earlier recommendation, for the record: a dedicated Gmail now, shown on the site behind a "copy address" button rather than as a plain link (to slow scrapers), and a domain address later if a domain is bought. Never the personal address.

## 3 · The build order

### Step 0 · The audit's additions
~~Upgrade the `vibecode-audit` skill.~~ Never done, and the skill is plugin-managed (9 Oct, [07](07-FACT-CHECK.md) F8). The additions are [`10-AUDIT-ADDENDUM.md`](10-AUDIT-ADDENDUM.md) instead; the audit runs the skill, then the addendum.
**Done when.** (Done 9 Oct as a document.) Each of its checks says how it fails.

### Step 1a · The new logo, everywhere (added 9 Oct, [08](08-HOLES.md) H8)
`assets/Group 3.svg` is in (re-exported 9 Oct, [07](07-FACT-CHECK.md) F1); every deliverable of [`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §3.3 is made from it: the app's launcher icon and adaptive layers, the splash, the favicon, the apple-touch and manifest icons, the ink wordmark for cotton and the 1200 × 630 link preview.
**Done when.** The app and the site show the same mark, and the preview shows in WhatsApp and Discord.
*(Built 9 Oct 2026: `scripts/brand-logo.cjs` writes the icon, the adaptive and monochrome layers, the splash, the favicon, the touch and manifest icons (maskable) and `public/og.png` from `assets/Group 3.svg`; small sizes use the compact mark, the gap closed (the maintainer's choice); the app opens from that mark to the full logo (`src/components/brand/LogoIntro.tsx`, on the phone); the web build's preview is now the 1200 × 630 card (`PageMeta`). `verify-brand` checks the parts and the splash width. The phone and a pasted link are the maintainer's checks: checklist 975-44 to -46.)*

### Step 1 · The design direction
`impeccable` **critique first** (the app as it is, with the maintainer's existing feedback), then shape, then Claude Design from the brief's prompt with the new modes, the logo and the two counters.
**Done when.** The maintainer has picked a direction and the rejected ones are written down.

### Step 2 · The static poster
Astro (Node 22), the page of [09](09-LANDING-SHAPE.md): the live spin from `reel.json`, the counter (the `site_counters` migration of [08](08-HOLES.md) §2 comes with this step), the four frames and the three proofs from the named screenshots (09 §5), the logo (ink on light), dark and light, `/` and `/sk/`, the metadata of 09 §7, the 404 of [11](11-PAGES-COMMUNITY-DOWNLOAD.md) §5.
*(9 Oct, after the first deploy: Vercel's build failed resolving the app's tsconfig (`expo/tsconfig.base`), because the site imported two of the app's files. They're copied into `landing/src/lib/game/` by the data script now, and `npm run check` fails on any import from outside `landing/`. The header's mark opens into the full logo on hover and keyboard focus, the app's opening in CSS.)*
**Done when.** Lighthouse 95+ on every category on a throttled mobile profile; under 100 KB before images; the counter real and its failure state seen (block Supabase: the built number stays, dated); no real name in the built HTML (10 §2.9).
*(Built 9 Oct 2026, waiting on the maintainer for three things: the screenshots, `supabase/site-counters.sql` run once, and the Vercel project. In `landing/`: Astro **5.18.2** (Astro 7 needs Node 22.12+, this machine has 20.17; one version bump once it has Node 24), `/` and `/sk`, the 404, `robots.txt`, `sitemap.xml` with the language pair, `llms.txt`, the CSP and the other headers in `landing/vercel.json`. The page's data is made in the repo by `node scripts/build-landing-data.cjs`: the reel (221 club-seasons from the legal database), the ladder, the modes and every tier name from the game's own i18n through the rename table, the version, the icons and the fonts (subset WOFF). `npm run check` in `landing/` (after `npm run build`): no real competition name in anything a visitor reads, one h1, lang, canonical and the language pair on every page, no inline script, links that resolve, the weight; it failed on the first build (Vite had inlined the scripts, rename table and all) and passes: the front page is 12.1 KB gzipped, the fonts 116 KB. Found on the way and fixed in the app: the legal rename skipped "Európska liga" and "Konferenčná liga" (`verify-legal-build` now checks); the full path's English line now names the three cups in full. Not yet: the screenshots (each frame shows an honest numbered tile until `landing/public/shots/<en|sk>/s1–s7.webp` exist), the counter (absent until the SQL is run and the site has the public Supabase values), Lighthouse (the maintainer's, on the deployed site).)*

### Step 3 · The database
`qa.sql` and its test file ([04](04-SECURITY-AND-ABUSE.md) §11), including private conversations and public/private questions.
**Done when.** Every rule has a test that fails without it.
*(Written 9 Oct 2026: `supabase/qa.sql` (tables, settings row, every player, public and admin function, the moderation wrapper, grants; `pg_trgm` enabled) and `supabase/qa-tests.sql`, one block that plays sixteen groups of rules as a guest, two players, a member with no run and the admin, then raises an error on purpose so nothing it made stays. Both parse with Postgres's own parser (libpg_query, PL/pgSQL bodies included; it rejects a broken copy). Not yet run against the database: the maintainer runs `qa.sql`, then `qa-tests.sql`, and expects `ALL QA TESTS PASSED`. Each test was written to fail against the missing rule; seeing one fail in the real database (for example with `daily_questions` raised) is part of that run.)*

### Step 4 · The community pages
Updates, questions with search and the prefilled ask, the inbox of your questions, in both languages.
*(Built 9 Oct 2026, after `qa-tests.sql` passed: `/community` (updates), `/community/questions` (the Q&A and its search; no match links to `ask?q=` with the search pre-filled), `/community/ask` (every state of 02 §6 from `qa_can_ask()`), `/community/mine`, `/community/question?id=` (yours with edit, withdraw and the conversation, or a published one), `/community/signin`, each under `/sk/` too. Sign-in talks to Supabase Auth's REST endpoints directly (`landing/src/lib/session.ts`, no supabase-js); the session is kept in the browser's storage. `qa.sql` gained `qa_can_ask()` and `qa_published_one()`, with tests. Left for later: one page per update (they're shown whole in the list), the app's privacy page line (step 8), Phase 11's redesign of all of it.)*

### Step 5 · The admin
The account (created and stored by the maintainer), the row, TOTP, the route, the inbox, private conversations, and the moderation tab: the app's reports and unsure names ([02](02-COMMUNITY-AND-QUESTIONS.md) §5a, added 1 Oct 2026).

### Step 6 · The APK and updates
The download page, `latest.json`, GitHub Releases ([`../release/05-UPDATES-AND-THE-APK.md`](../release/05-UPDATES-AND-THE-APK.md)). The releases repo exists: [hoopjakub/perfection-or-misery-release](https://github.com/hoopjakub/perfection-or-misery-release) (1 Oct 2026).

### Step 7 · The audit
The upgraded audit, the two-account test, the critique again.

### Step 8 · The app's side
The community link, the "your question changed" mark, the shared legal file.

## 4 · Documents to update when this is built

- [`WEBSITE-BRIEF.md`](WEBSITE-BRIEF.md): the modes, the logo, the counters, the first update's name.
- [`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md): Phase 10.
- The shared legal file and both apps' privacy pages.
- [Web Analytics & Speed Insights](<../Web%20Analytics%20%26%20Speed%20Insights.md>) §5: the admin exclusion.
