# The Perfection or Misery website — brief and prompts

> **29 September 2026:** the plan that builds on this brief is [`00-README.md`](00-README.md) (the community and questions section, the admin, the security design, 31 open questions). The modes list below predates the Europa League, the Conference League and the European Full Path, and the new logo (`assets/Group 3.png`).

*Written 24 September 2026, from the maintainer's note: "This website is something you cannot undershoot." Nothing here is built yet. This file is the brief, the skills to run it through, a Claude Design prompt to see how it could look, and the prompt for the build itself.*

---

## 1. What the site is for

One job: make a football fan who has never heard of the game **play a run within a minute**, and make one who has played want to come back. Everything on the page earns its place against that. It is not a documentation site; the guide already lives in the app.

Who arrives: people from a clip on football social media, a friend's shared run (P8-121's links land here), a search for "football draft game", and the maturita panel (PoM is the maturita project), who will judge the craft.

## 2. What to take from 38-0.app, and what not to

Studied 24 September 2026. 38-0 is the nearest game to ours (spin a club-season, draft into a formation, simulate, chase a record), and its page is the standard template for one: hero with a Play button, a grid of modes, app-store badges, a band of big numbers ("As seen across football social media"), four numbered steps with emoji, a "What is it?" paragraph, an FAQ, cards to SEO pages, a final call to action, a long legal footer.

**Take one idea only, and do it differently:** the live proof. Theirs is a static band of claims ("10,877,438 Seasons Simulated", "46M+ Impressions on X"). Ours is **a counter that is actually live** — it ticks while you watch, because it is counting real rows.

**Take nothing else.** Not the layout, not the grid of cards, not the emoji steps, not the tone. The maintainer, 24 September: "besides that learn nothing, the design must be exceptional, like truly exceptional."

## 3. The live counter

- **What it counts:** runs finished, from Supabase's `runs` table (a league run is a season: "seasons played"). Only real numbers, ever — the project's rule is *measured, not invented*; no impressions, no "5M+ players" we can't show. Other honest counters if wanted: runs finished today, perfections (runs that reached the top tier), miseries.
- **How, safely:** don't open `runs` to anonymous reads or realtime (that would stream every player's rows). Keep a one-row `public_counters` table updated by a trigger on `runs` insert (security definer), and enable Realtime on that table only. The site reads the row once, then listens for its updates. No row of player data ever leaves the database.
- **How it looks:** not a number printed in a band. A mechanical counter in the Kit Drop world — a split-flap or stadium scoreboard of digits in the super face, each digit flipping on its own as the count moves, the way a ground's scoreboard changes. When a run finishes anywhere in the world, the visitor sees the last digit turn. Under reduced motion it just changes.
- **Needs:** a migration (the table, the trigger, the Realtime publication) — see roadmap P8-153.

## 4. The design bar

The site is the app's world, not a generic landing page. Read `DESIGN.md` and `PRODUCT.md` first; the site speaks Kit Drop:

- **The grounds:** cotton (white twill) and nylon (black floodlit), not a gradient in sight.
- **The type:** the super face (Barlow Condensed Black Italic) for the loud words, Martian Mono for tags, Archivo for reading.
- **The marks:** tags, plates with rivets, tapes, the zip tag (orange means YOU, only ever), volt for Perfection, misery red for Misery.
- **The motion:** stamps rather than fades, one overshoot in the whole system (the swing), things that live and move on their own now and then (the pundits' sparkle, P8-145), everything still under reduced motion.
- **What it must never look like:** a template — no hero-left-phone-right, no three feature cards with icons, no purple gradient, no emoji bullets, no "Trusted by" logo strip, no stock football photography.
- **What could make it unforgettable** (to explore, not to prescribe):
  - The page is a **matchday**. Scrolling is the season playing: a table that moves as you go down, a verdict stamped at the end.
  - The hero is a **real spin**: the reel of club-seasons from the draft, landing on a real club each visit.
  - A visitor's **"prove them wrong"** moment: the pundits' tip for a random XI, and a button to play it.
  - **Perfection and Misery** as the two ends of the page, the verdict tiers laid out like a league table.
- **Both platforms equal:** the phone first (most arrive from social), the desktop exceptional too, not a stretched phone.
- **Performance and craft:**
  - A static page with one live island, fast on a mid-range Android on 4G.
  - Real metadata and share images.
  - Accessibility checked, and no console errors.

## 5. The skills, and in what order

1. **`impeccable`**: the design direction and critique. Run shape (the direction) and critique before anything is built, then colorize/animate/delight/bolder as the build lands. It carries the anti-template rules.
2. **`frontend-design`**: the build, for distinctive production UI rather than generic AI output.
3. **`ui-ux-pro-max`**: a second opinion on layout, hierarchy and interaction for each section, and the responsive rules.
4. **`dataviz`**: the counter and any number on the page (it's a stat tile, and the skill has the rules for those).
5. **`humanizer`**: every line of copy, so none of it reads as machine-written.
6. **`vibecode-audit`**: before it goes live. Its 216 points cover exactly the tells this site must not have (template layouts, missing metadata, console errors, fake social proof, security of the Supabase read).
7. **`react-best-practices`**: if the build is React or Next.js, for the performance pass.
8. **Claude Design** (the prompt in §6): to see a direction before a line of code, and to iterate on it with the maintainer.

## 6. Prompt for Claude Design (to see how it could look)

> Design the website for **Perfection or Misery**, a football roguelike for phones and the web. You spin a real club-season (say, Barcelona 2010/11), draft one player from it into your formation, repeat until you have an XI, then your team is dropped into a real league, the Champions League or the World Cup, and the whole season is simulated. At the end you get a verdict, from Perfection (38 wins from 38) to Misery. Pundits tip where you'll finish before a ball is kicked; the game dares you to prove them wrong.
>
> **The visual world is "Kit Drop":** the interface is made from football kit and matchday material.
> - **Two grounds:** cotton (white twill, #F3F3F0, ink #0C0C0D) and nylon (black floodlit, #141416, cotton text).
> - **Type:** Barlow Condensed Black Italic for loud words (all caps), Martian Mono for small tags and labels, Archivo for reading.
> - **Marks and colours:**
>   - Square corners everywhere.
>   - Tags like care labels; plates like riveted metal buttons with a hard offset shadow.
>   - Woven tapes in a competition's colours; an orange zip tag that always means "you" (#FF5A00).
>   - Volt (#4FFF3F) for Perfection, a pinkish misery red (#FF2E4D) for Misery, gold (#FFD23F) only for an exact call.
>   - A dark floodlit pitch green (#14271B) with faint markings.
> - **Motion:** things stamp into place; one element in the whole system swings with an overshoot (the zip tag); a few things live on their own, like a gold sparkle that twinkles now and then on a correct prediction.
>
> **The page must not look like a template.** No hero with text on the left and a phone on the right, no row of three feature cards with icons, no gradients, no emoji, no stock photos, no logo strip. It should feel like a matchday: I want to see ideas such as the page scrolling like a season being played (a league table that reshuffles as you scroll, a verdict stamped at the end), a hero that is a live spin of club-seasons landing on one, and the two ends of the page as Perfection and Misery.
>
> **One live element matters most:** a stadium-scoreboard counter of every season ever played in the game, counting real runs. Its digits flip one by one, like a split-flap board, when anyone anywhere finishes a run. Place it where it feels like proof, not decoration. Label it plainly ("seasons played").
>
> **Also needed:**
> - How a run works, in four beats, shown rather than listed: spin, draft, simulate, verdict.
> - The modes: league, Champions League, the full Champions League path, the World Cup, plus chaos and cursed.
> - The ranks and seasons with badges (Top 1000 down to #1).
> - Play buttons for the web version and the app stores.
> - A short FAQ.
> - A footer with the not-affiliated-with-any-league disclaimer.
>
> Design the phone layout first (390 px wide) and the desktop layout second (1440 px), and make the desktop exceptional in its own right, not a stretched phone. Show both.

## 7. Prompt for the build

> Build the Perfection or Misery website from `docs/website/WEBSITE-BRIEF.md` in this repo. Read `DESIGN.md` and `PRODUCT.md` first: the site speaks the app's Kit Drop design language, with the same tokens (`src/theme.ts`) and fonts.
> - **Direction first:** use the `impeccable` skill to set the direction and critique it, `frontend-design` for the build, `ui-ux-pro-max` for layout and interaction per section, and `dataviz` for the live counter.
> - **Copy:** every line goes through `humanizer`.
> - **The counter:** it is live and honest. A `public_counters` row kept by a trigger on `runs`, with Supabase Realtime on that one table only, never the `runs` rows themselves. It renders as a split-flap scoreboard whose digits flip individually, and it's static under `prefers-reduced-motion`.
> - **Priorities:**
>   - Phone first, desktop exceptional.
>   - A static page with one live island, a Lighthouse performance score of 95+ on mobile, real metadata and share images, no console errors.
> - **Before calling it done:** run `vibecode-audit` against it and fix what it finds, then run `impeccable`'s critique once more.
> - **Never:** fake numbers, a template layout, gradients, emoji as icons, stock photos.

## 8. Open questions for the maintainer

- **Where it lives:** its own repo and domain, or a route on the app's web build? A separate static site is faster and freer to design; the app's web build already hosts the game itself.
- **Analytics:** decided, not open: the site measures itself with Vercel Web Analytics and Speed Insights, set up as [`docs/Web Analytics & Speed Insights.md`](../Web%20Analytics%20%26%20Speed%20Insights.md) §5 says (its own Vercel project, the plain-HTML snippet, the two plates measured without paid events). The site is built as the roadmap's Phase 10.
- **The stack:** Astro (static, one island) or Next.js (the Colorbound site's stack, so shared know-how)?
- **Counter labels:** is "seasons played" the right name for the live number when it counts every mode's runs? The alternative is "runs played", with seasons as one line under it.
