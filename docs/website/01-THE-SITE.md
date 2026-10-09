# 01 · The site

> Part of the [website set](00-README.md). Status: **plan, answers applied**, 29 September 2026. Design direction still to be rolled: `impeccable` critique first (with the maintainer's existing feedback), then shape (Q7; [`WEBSITE-BRIEF.md`](WEBSITE-BRIEF.md) §5 to §7). The site is in **English and Slovak** from launch (Q23), in **dark and light** (Q8).

## 1 · What the site is

One page that turns a stranger into a player in a minute (the brief's §1), with a second, quieter job added on 29 September: somewhere to ask a question and read what's new, for the people who already play. The first job sets every priority. If a community feature makes the poster slower, louder or busier, it loses.

## 2 · The order of the page

> **9 October 2026:** the page's final order, the hero (a live spin), the counter and the wireframes are in [09](09-LANDING-SHAPE.md), which replaces this table where they differ. Two corrections to the table below: the modes are shown in the **legal flavour's names** (European Cup, Europa Cup, Conference Cup, World Cup; [07](07-FACT-CHECK.md) F7), and the users counter is **hidden until it passes a threshold** ([08](08-HOLES.md) H18).

Read top to bottom. The brief's section list (poster, four frames, verdicts, modes, proof, ranks, footer) stands; two things change.

| # | Section | Note |
|---|---|---|
| 1 | The poster | Logo, the one-line promise, two plates: **Play in your browser** (opens the game's address) and **Download for Android** (the official APK, [`../release/05-UPDATES-AND-THE-APK.md`](../release/05-UPDATES-AND-THE-APK.md)), with a small "Google Play: coming soon" tag beside it (Q5) |
| 2 | The live counters | **"Runs played"** and a live **users** count (Q12), real, from `public_counters` rows (brief §3) |
| 3 | How a run goes | Four frames, real screenshots |
| 4 | The verdicts | The ladder as garment labels |
| 5 | The modes | **Now includes the Europa League, the Conference League and the European Full Path** ([`../europe/07-THE-EUROPEAN-PATH.md`](../europe/07-THE-EUROPEAN-PATH.md)); the brief predates them |
| 6 | Proof it's deep | Awards Night, the pundits, the press, the match sheet |
| 7 | The ranks | Live if cheap; never faked |
| 8 | **What's new** | One line, the latest update from the updates channel, linking to it. The only community feature above the footer, and the only thing on the page that changes without a deploy |
| 9 | Footer | Privacy, Terms, the version, "Made in Slovakia", the language switch (EN / SK), a contact (the questions page; an address per [05](05-OPEN-QUESTIONS.md) §2), and **Community** as one plain link |

**Where the community sits.** In the footer and on its own pages under `/community`. Not in a navigation bar, not on the poster, not as a section with a heading. A visitor who never needs it never sees it; a player looking for it finds it in one guess. The app links to it from About and from You ("Questions").

## 3 · The pages

| Route | What | Who sees it |
|---|---|---|
| `/` | The landing page | Everyone |
| `/community` | The updates channel and the public Q&A, with a way in | Everyone |
| `/community/updates/[id]` | One update | Everyone |
| `/community/questions/[id]` | One published question and its answer | Everyone |
| `/community/ask` | Ask: write it, tick public or private, send (accepts a pre-filled text from search) | Signed-in players |
| `/community/mine` | Your questions as an inbox ([02](02-COMMUNITY-AND-QUESTIONS.md) §4b) | Signed-in players |
| `/download` | The APK, its version and checksum, "Google Play: coming soon" | Everyone |
| ~~`/latest.json`~~ | **Not the site's** ([07](07-FACT-CHECK.md) F3): the app reads it from the game's address, where the release script writes it. `/download` reads it from there | — |
| `/privacy`, `/terms` | The app's legal pages, shared | Everyone |
| The admin routes | Not listed here on purpose | See [03](03-ACCOUNTS-AND-THE-ADMIN.md) §4 |

**The addresses (Q1, Q2, decided 29 Sept):** the game stays at `perfection-or-misery.vercel.app`, the site gets its own project such as `perfectionormisery.vercel.app`. The maintainer asked for `play.perfectionormisery.vercel.app`, but Vercel's free addresses can't nest a `play.` name; that needs a custom domain. Run links (`/r/<id>`, P8-121, App Links P8-174) keep pointing at the game, so every link opens the game rather than the landing page, as he wanted. Setup: [06](06-VERCEL-SETUP.md).

## 4 · The logo

**The files.** `assets/Group 3.png` (533 × 528). `assets/Group 3.svg`, re-exported 9 Oct ([07](07-FACT-CHECK.md) F1); its wordmark is one `fill="white"` path. The design: a volt triangle over a red one, PERFECTION OR MISERY in white between them, the orange pin at the top right. Colours in the SVG: `#D5FF3F`, `#E1141F`, `#FF5A00`, white, and black for the pin's hole.

**What the site needs from it** (measured with `scripts/contrast.py`, 29 September):

| On | Wordmark | Verdict |
|---|---|---|
| Nylon `#141416` | white | fine |
| Cotton `#F3F3F0` | white, 1.11:1 | invisible: needs an ink wordmark |
| The volt triangle | white, not applicable (it sits between the shapes) | n/a |

So on cotton (the light mode) the wordmark is ink. **Decided (Q10): the build tints it**, swapping the SVG's white wordmark fill for the ink token in light mode, so there's one logo file and no second export. The favicon is the two triangles and the pin without the wordmark (the wordmark is unreadable at 16 px). The link preview (1200 × 630) sits on nylon.

**Colours, decided (Q9):** the logo's volt `#D5FF3F` and red `#E1141F` become the colours of the app and the site, replacing `#4FFF3F` and `#FF2E4D`. The red's contrast shortfall is accepted as the one exception ([`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §2.2 and §3.3).

## 5 · The stack

The brief left it open: Astro or Next.js. What the plan now needs decides it.

| Need | Astro | Next.js |
|---|---|---|
| A static poster that's fast on a mid-range phone | Static by default, no JavaScript unless asked | Ships a React runtime even for a static page unless carefully trimmed |
| One live island (the counter) | Made for it | Possible, heavier |
| Sign-in and a question form | An island each, on the pages that need them | Native |
| The maintainer's existing know-how | New | The Colorbound site is Next.js |
| Vercel hosting, analytics and Speed Insights | Supported | Supported |

**Decided (Q3): Astro,** with three small islands (the counter, the sign-in form, the question form) and the Supabase JavaScript client loaded only on the pages that use them. The landing page then ships no client JavaScript except the counter, which matches the brief's "under 100 KB before images". If the maintainer would rather use Next.js because it's the stack he knows, the page can still be held to that budget; it's more work to keep it there.

**Astro 7 needs Node 22.12 or newer** ([07](07-FACT-CHECK.md) F9); the site's Vercel project and the maintainer's machine both move to Node 22.

**One Vercel project for the site,** separate from the game's (the roadmap's recommendation), from the same repo in a `landing/` folder. The `EXPO_PUBLIC_…` variables don't apply; the site has its own `PUBLIC_SUPABASE_URL` and anon key, which are public by design ([`../ui-overhaul/02-VIBECODE-AUDIT.md`](../ui-overhaul/02-VIBECODE-AUDIT.md) SEC-1).

## 6 · Measurement

As decided: Web Analytics and Speed Insights on the site's own project ([Web Analytics & Speed Insights](<../Web%20Analytics%20%26%20Speed%20Insights.md>) §5). Two additions from this plan:
- The **admin routes are excluded** from analytics and from the sitemap ([03](03-ACCOUNTS-AND-THE-ADMIN.md) §4), so the analytics don't publish their address either.
- The community pages carry no per-user tracking. A question's text never goes to analytics, and the free plan's page-view events group `/community/questions/[id]` as one page.

## 7 · Answers

All 31 questions were answered on 29 September; they're recorded in [05](05-OPEN-QUESTIONS.md) §1. Screenshots come from the maintainer on request, by name (Q11). Crests and competition logos never appear on the site (Q28, [`../release/01-NAMES-MARKS-AND-THE-LAW.md`](../release/01-NAMES-MARKS-AND-THE-LAW.md)), so screenshots are taken from the legal build.
