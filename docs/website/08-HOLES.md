# 08 · Holes in the plan, and how to close them

> Part of the [website set](00-README.md). Status: **plan, 9 October 2026.** What the set didn't cover, found by reading it against the code, the vibecode checklist and the services' limits. Each hole has a proposal, labelled as one, and where it's now specified. The fact-check behind several of them is [07](07-FACT-CHECK.md).

---

## 1. The list

| # | Hole | Why it matters | Proposal | Specified in |
|---|---|---|---|---|
| H1 | **How the counter reaches the page.** The brief has every visitor subscribe over Realtime; nobody wrote the migration | Realtime's free quota is 200 concurrent connections, shared with the app's club chat (07 F14). A busy day on the poster would refuse the chat's sockets | §2 below: a `site_counters` row kept by triggers, read by one public function, **polled** every 30 s while the tab is visible. No socket | §2 |
| H2 | **Where the spin's club-seasons come from.** The hero is a live spin (decided 9 Oct), and the site has no database of its own | The reel needs real (legal) club-seasons, their seasons and their drawn colours, with no crests | A build script in this repo writes `landing/src/data/reel.json` from `players_legal.db` and `src/lib/markColours.ts`: a few hundred club-seasons, name, season, two colours. Rebuilt with each release | [09](09-LANDING-SHAPE.md) §4.1 |
| H3 | **Real names on a public page.** Runs saved from the personal build store real competition names, and the site reads `runs` for the ranks | The legal flavour exists so the public never sees them (07 F7) | Everything the site prints from the database passes through the same `renameText` table the legal app uses (`src/data/legal-names.js`), shared as a module, and the reel uses the legal database only. A check fails the build if a real competition name appears in the built HTML | [09](09-LANDING-SHAPE.md) §6, [10](10-AUDIT-ADDENDUM.md) §2.9 |
| H4 | **Banned players could ask questions** | `banned_at` and `must_rename` arrived with moderation on 1 Oct (07 F16) | `qa_ask`, `qa_edit` and `qa_reply` refuse a banned account, and an account that must rename, with the same `BANNED` error the game's functions raise | [02](02-COMMUNITY-AND-QUESTIONS.md) §2, [04](04-SECURITY-AND-ABUSE.md) §2.3 |
| H5 | **Telling a player their question changed** | 00 finding 4 said there's no way; the app has notifications now (07 F4) | A status change, an answer and an admin's message insert a `notifications` row (type `qa`) through the admin function, so the existing badge on You lights up and the notice opens the question on the site | [02](02-COMMUNITY-AND-QUESTIONS.md) §3 |
| H6 | **Search and preview basics** the set didn't list: a custom 404, `hreflang` between English and Slovak, structured data, a canonical on every page, the site's own `llms.txt`, Search Console. And the game's `llms.txt` is stale (07 F21) | vibecode SEO-1–SEO-11, NAV-9; a two-language site without `hreflang` competes with itself in search | The site: `/` and `/sk/`, `hreflang` both ways plus `x-default`, `VideoGame` JSON-LD on the poster (name, genre, platforms, `offers` free, no rating it can't back), a canonical per page, a branded 404 in both languages, `llms.txt` describing the game in legal names, a sitemap without the admin route, verified in Search Console. The game's `llms.txt` rewritten in legal names with the Europa and Conference Cups | [09](09-LANDING-SHAPE.md) §7, [10](10-AUDIT-ADDENDUM.md) §3 |
| H7 | **The FAQ was dropped, and iPhone visitors have no answer** | The brief asked for a short FAQ; 01 §2 lost it. The two plates are *browser* and *Android*; an iPhone visitor isn't told the browser is their way in | Five questions, folded, in the footer's band: Is it free? Do I need an account? Is there an iPhone app? (No: play in the browser, it works the same.) Are the clubs real? What do you keep about me? And the poster's browser plate carries the line *Any phone or computer* | [09](09-LANDING-SHAPE.md) §3.8 |
| H8 | **The new logo isn't on the app yet** | The site would launch on the new logo while the APK it offers still wears the P/M plate (07 F20) | A step of its own before the site's launch: the SVG re-exported (07 F1), then every deliverable of [`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §3.3 from it (launcher, adaptive layers, splash, favicon, apple-touch, manifest icons, the 1200 × 630 preview) | [05](05-OPEN-QUESTIONS.md) §3 step 1a |
| H9 | **The footer's small print** | vibecode BLD-7, BLD-8, LEG-1–3, MOB-10: a footer without a year, a "last updated" or a disclaimer reads abandoned, and 38-0's disclaimer is the one thing the release set said to copy | The footer carries the year (built, not typed), the legal pages' own date (`UPDATED` in `src/data/legal.ts`), the disclaimer *Not affiliated with any player, club, league, UEFA or FIFA* (the game's own words, `public/llms.txt`), and the contact address behind a copy button | [09](09-LANDING-SHAPE.md) §3.9 |
| H10 | **No minimum age anywhere** | Slovakia keeps the GDPR's 16 for a child's own consent (07 F25); the questions channel stores free text | **Decided 9 Oct: 15.** The terms say the game is for everyone and that writing in the community needs a player of 15 or over; the ask form repeats it in one line. Nothing is verified. **What 15 means:** Slovakia's age for a child's *own consent* is 16 (07 F25), so the questions channel shouldn't rest on consent. Its basis is providing the service the player asked for (a question and its answer, GDPR Art. 6(1)(b)), which Article 8 doesn't cover; the privacy text says so when the community is added. Worth a sentence to a lawyer with the names question | [02](02-COMMUNITY-AND-QUESTIONS.md) §2, `src/data/legal.ts` when built |
| H11 | **A player can't take a question back** | Only account deletion removes one; vibecode DES asks for an undo on the reversible things | *Withdraw* while a question is open or seen: it's deleted, and it counts against the day's cap (so withdrawing doesn't reset the one-active rule's cooldown). After it's seen and answered it stays, as the set already says | [02](02-COMMUNITY-AND-QUESTIONS.md) §3 |
| H12 | **The build's Node version** | Astro 7 needs Node 22.12+ (07 F9) | The site's Vercel project is set to **Node 24.x**, as the game's already is (07 V2); locally, Node 24 LTS, one version for both | [06](06-VERCEL-SETUP.md) §2 |
| H13 | **The one firewall rate-limit rule** | The plan spent it on the admin route, which is a static shell (07 F10) | Leave it unused at launch. If a scraper ever hammers the site, spend it on that path. The admin's real protection is in the database | [06](06-VERCEL-SETUP.md) §8 |
| H14 | **Two copies of the sign-in rule** | The site's sign-in must turn a username into `<name>@pom.internal` exactly as `src/lib/auth.ts:26` does (lower case, trimmed); if one changes, the other silently signs people in as nobody | The rule moves into one small shared module the app and the site both import; a check compares them | [03](03-ACCOUNTS-AND-THE-ADMIN.md) §1 |
| H15 | **The screenshots, by name** | Q11: the maintainer supplies them on request, and the set never made the list | The named list, every one from the legal build, with the state each needs | [09](09-LANDING-SHAPE.md) §5 |
| H16 | **The poster ships before the community** | Step 2 (the poster) comes before step 3 (the database); the poster's *What's new* line reads the updates table | Until `qa_updates` exists, the line is left out of the page, not shown empty | [09](09-LANDING-SHAPE.md) §3.7 |
| H17 | **A counter that can't load** | A failed read showing `0 RUNS PLAYED` is a fake number | The page is built with the count as of the build and the date beside it (*as of 9 Oct*); the live read replaces it. On failure, the built number stays, labelled; it never shows 0 or a spinner | [09](09-LANDING-SHAPE.md) §3.2 |
| H18 | **The users counter at launch** | Decided 9 Oct: hidden until it's worth showing | A threshold in the counters row (start 100 accounts); below it the public function returns no users figure at all, so the page can't show it by mistake | §2 below |
| H19 | **Who can't play in the browser** | The web build needs a modern browser and WebAssembly for SQLite; an old in-app browser (Instagram's, Facebook's) may fail where most visitors arrive from | The browser plate opens the game in a new tab; the game's own boot error says what to do ("open this in Chrome or Safari"). A probe on a real in-app browser before launch | [09](09-LANDING-SHAPE.md) §8 |
| H21 | **Making an account on the site** (03 §3.4 step 2 said "the site's or the app's sign-up") | An account is a guest upgraded in place: a guest session first, the taken-name check, the moderation name check (`checkName`), the email change, the profile's `is_guest` flip (`src/lib/auth.ts:40-80`). A second copy on the site would drift from the first | **The site has sign-in only.** *Make an account* opens the game's own sign-up at its address and comes back; the admin account is made in the game too | [03](03-ACCOUNTS-AND-THE-ADMIN.md) §1, [11](11-PAGES-COMMUNITY-DOWNLOAD.md) §2 |
| H20 | **The download offers which APK?** | Two flavours exist; the site is public | The site only ever links the **legal** APK (`preview`/`production` flavours), as the release set says; a check in the release script refuses to write a personal build's address into `latest.json` | [`../release/05-UPDATES-AND-THE-APK.md`](../release/05-UPDATES-AND-THE-APK.md), [09](09-LANDING-SHAPE.md) §3.10 |

---

## 2. The counters, specified (H1, H17, H18)

**The table.** `site_counters`, one row, readable by nobody directly:

| Column | Kept by |
|---|---|
| `runs` | A trigger `after insert on runs`, `security definer`, adding one. It fires for `submit-run`'s inserts (service role) like any other |
| `users` | Triggers on `profiles`. **A guest has a profile too** (`profiles.is_guest`): making an account upgrades the guest's own profile, `is_guest` going to false (`upgradeGuestAccount`, `src/lib/auth.ts:40-80`). So the count is real accounts: +1 when a row's `is_guest` turns false (or a row is inserted with it false), −1 when a real account's row is deleted |
| `users_shown_from` | The threshold, 100 to start (H18) |
| `updated_at` | Each trigger |

A one-off backfill sets `runs` from `count(*)` and `users` from the profiles where `is_guest` is false when the table is made, so the counter starts at the truth.

**The read.** `site_counters()`, a `security definer` function granted to `anon`: returns `runs`, and `users` only when it's past `users_shown_from` (null otherwise). Nothing else.

**On the page.** The built page carries the counts as of the build (H17). In the browser, a small script calls `site_counters()` on load and then every 30 s **while the tab is visible** (`visibilitychange`), and flips only the digits that changed. One small HTTP request every 30 s per open tab costs nothing on the free plan and touches no Realtime quota. The split-flap digits still turn while you watch whenever anyone finishes a run in the minute you're reading.

**Why not Realtime:** the 200-connection quota is shared with the club chat (07 F14). Polling is the honest version of "live" at this size. If the site ever needs true push, Realtime's *broadcast* from the trigger (one message to one channel) is the upgrade, and it still costs a connection per viewer.

**Check (when built):** `scripts/verify-counters.sql` (or a step in the `qa` tests): a run inserted through the service role moves `runs` by one; a guest sign-in moves `users` by nothing and the same guest making an account moves it by one; below the threshold `site_counters()` returns null users; `anon` can't `select` the table.

---

## 3. Left out, and when to add it

| What | Why not now | When |
|---|---|---|
| A real domain | Q1: `vercel.app` for now; vibecode DEP-1 is accepted | When one is bought: the site on the domain, `play.` for the game, App Links moved with a new build ([06](06-VERCEL-SETUP.md) §1) |
| Push for the counter | Polling covers it (§2) | If the site outgrows the free plan anyway |
| A blog | A blog with one post is worse than none (vibecode SEO-13); updates already cover news | If the maintainer writes regularly |
| Cookie banner | No cookies are set (analytics are cookieless; the session is local storage, only for players who sign in) | If anything ever sets a non-essential cookie |
| An iOS app | Not built | The FAQ says so (H7) |
