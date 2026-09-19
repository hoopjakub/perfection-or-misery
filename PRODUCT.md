# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Primary:** the maintainer and his friends. Football fans who already know how a run works, playing short sessions on Android phones and in a browser, comparing tiers and scores with each other.
- **Secondary:** portfolio viewers judging the craft of a solo developer's work (the About screen tells that story).
- **Built as if public:** strangers arriving from the Play Store or the web must meet a credible, finished product. The maintainer's own words: the store and web need high credibility, and the web side currently has none.

## Product Purpose

Perfection or Misery is a football-management roguelike. A run is: choose a mode and difficulty, pick a formation, draft an XI (plus up to five substitutes) by spinning random real club-seasons, get placed at random into a real competition, watch it simulate, and receive a tier on a ladder from Absolute Misery to Perfection, plus a score.

Success means a run is short, dramatic and replayable; its outcome can be read, explored and argued about; and the whole thing looks finished enough to publish.

## Positioning

Openly inspired by 38-0.app. What PoM can claim that a neighbour cannot copy:

- Real scraped club-seasons across roughly fifty leagues, bundled into an offline database.
- Real competition formats: domestic seasons, the UEFA Champions League Swiss league phase, a custom path that simulates all 53 UEFA leagues and their real qualifying routes, and a 48-team FIFA World Cup with best-third-place ranking.
- A deterministic, FotMob-depth stat sheet for every simulated match, reproducible from a stored seed.
- The Deep Match: the player's final played out live, minute by minute, then a win or loss ceremony.
- The tone. The game is named for its two outcomes and talks like it.

## Operating Context

- One run takes minutes: mode select → formation → draft → placement globe → simulation → result, season stats and match sheets.
- Guest play is the default. An account (username and password, with no password recovery) saves runs to a shared leaderboard, lifetime career stats and achievements via Supabase.
- The maintainer uses a hidden Quick Sim Tester (About → tap the version eight times) to reach results fast.
- Native Android needs a development build, not Expo Go. The game itself runs offline.

## Capabilities and Constraints

- **Modes:** All Time, League, Chaos, Cursed; UEFA Champions League (full path with qualifying), UEFA Champions League (finals only), FIFA World Cup (finals). A full World Cup route with confederation qualifying is announced in-app and not built.
- **Difficulty:** easy, medium, hard and custom (rerolls, ratings on or off, a 1–10 screw level). The tilt applies only to the player's own matches.
- **Data:** read-only bundled SQLite. Top-five leagues 2018–2025, Champions League 2024 and 2025, World Cup 2026, around fifty leagues feeding the custom UCL path.
- **Stack:** Expo SDK 54, React Native 0.81, expo-router, Zustand, react-native-svg, Reanimated 4 (installed), Supabase.
- **Engine truth the UI must respect:** results are decided before they are shown, and deep stats are regenerated from a seed. Any surface that plays a match back must show state as of the current minute. Nothing may spoil what the player has not seen yet.
- **Decided direction for depth:** deepen each single run with The Dugout's league stories and news, award ceremonies and information design. No multi-run career carry-over beyond the career stats that already exist.
- **Open decisions:** store listing content and screenshots; web hosting and domain; whether official competition marks can ship in a public release (see Evidence on Hand).

## Brand Commitments

- **Name:** Perfection or Misery.
- **Voice:** punchy, dark-humoured, football-literate. "Ready to suffer?", "Absolute Misery", the tier ladder itself.
- **Credit:** inspired by 38-0.app, stated on the About screen.
- **Full World Cup mode colours**, set by the maintainer: `#3CAC3B`, `#2A398D`, `#E61D25`.
- Per-mode palettes already in code (World Cup gold, Champions League blue, Chaos molten red, Cursed violet) are incumbent evidence, not pinned commitments.

## Evidence on Hand

- The scraped player and club database, and club trivia in `scripts/club_facts.json`.
- `assets/modes/world-cup.png` is the official FIFA World Cup 26 emblem; `assets/modes/champions-league.png` is a white competition mark; `assets/logos/brazil_nt.png` is a single national-team crest.
- The maintainer's own story on the About screen.
- **Absent, and not to be fabricated:** a real app icon or brand mark (icon, favicon and splash are unmodified Expo template art), store listing copy, store screenshots, player counts, reviews, testimonials, press.
- Official UEFA and FIFA marks are trademarks. Shipping them in a public release is an open decision; the maintainer has said not to worry about trophy imagery for a personal build.

## Product Principles

1. **The drama is the product.** Every run should carry a readable story with a peak and an ending.
2. **Never spoil the unseen.** A result, a scorer or a rating appears only once the player has reached it.
3. **Depth you can walk.** A number with a subject leads to that subject.
4. **An honest world.** Difficulty bends only the player's own matches; everyone else plays straight.
5. **Publishable by default.** Nothing ships that reads as a template, a placeholder or a demo.

## Accessibility & Inclusion

- WCAG AA contrast on both platforms; the codebase already holds muted text to at least 4.5:1 on cards.
- Results, ratings and qualification states are never shown by colour alone.
- Reduced motion is honoured, while still delivering the outcome.
