# 09 · The landing page, shaped

> Part of the [website set](00-README.md). Status: **shape confirmed, 9 October 2026** (impeccable `shape`, inside the locked Kit Drop world; no direction was re-rolled). It replaces the section list in [01](01-THE-SITE.md) §2 where they differ. No code. The community, ask and download pages are in [11](11-PAGES-COMMUNITY-DOWNLOAD.md).
>
> Decided with the maintainer on 9 October: **the hero is a live spin**; **the users counter stays hidden until it's worth showing**; **1.0.0 comes after Phase 11**, so the site launches with the game in early access.

---

## 1. Job and audience

**Mode: Persuade.** The visitor decides and acts. One action wins: *Play in your browser*. The second, *Download for Android*, is for people who already want it on their phone.

| Who arrives | From | State of mind | What they need in ten seconds |
|---|---|---|---|
| A football fan who's never heard of it | A clip on football social, a search for "football draft game" | Curious, thumb on the back button | What the game is, that it's free, and the button |
| A friend of a player | A shared run's link (those open the game, not this page) or a word of mouth | Already half-sold | The button |
| The maturita panel, portfolio readers | A link from the maintainer | Judging craft | That it's real, deep and finished |
| An iPhone owner | Any of the above | "Is there an app for me?" | That the browser is the way in, and works the same |

**What's uniquely true** (and a template can't claim): real club-seasons you spin, real competition formats down to qualifying, a verdict ladder that names the outcome, a match sheet for every simulated match, and the tone. The page shows those things rather than saying them.

## 2. Outcome and proof

- **Success:** a stranger can say what the game is after ten seconds, and taps *Play*.
- **Proof on the page, all real:** the spin (real legal-flavour club-seasons), the counter (real runs), four screenshots (the legal build), the week's top five (live, or not shown).
- **Never:** a number nobody counted, a review nobody wrote, a logo of any club or competition (§6).
- **Early access.** Until 1.0.0 (after Phase 11) the poster carries a small tag, `EARLY ACCESS · 0.9`, read from the game's version at build time, never typed.

---

## 3. The page, top to bottom

Order and weight. One `h1` (the promise). Each section has one job and is short; nothing on the page needs a second scroll to understand.

| # | Section | Job | Weight |
|---|---|---|---|
| 1 | **The poster** | What it is, the spin, the two plates, the counter | The whole first screen |
| 2 | **How a run goes** | Four real frames: spin, draft, simulate, verdict | Loud |
| 3 | **The verdicts** | The ladder as labels: the stakes at a glance | Loud |
| 4 | **The modes** | Every way to play, each on its tape | Medium |
| 5 | **Proof it's deep** | Awards Night, the pundits, the match sheet | Medium |
| 6 | **The week's top five** | Live runs from Ranks | Quiet, and only when it can load |
| 7 | **What's new** | One line from the updates channel | Quiet |
| 8 | **Questions** | Five, folded | Quiet |
| 9 | **The footer** | Legal, language, contact, the disclaimer, Community | Quiet |

### 3.1 The poster

- **The ground follows the visitor's setting** (dark: nylon; light: cotton), as the app does. The poster's reel band is always nylon: it's a floodlit object on either ground, the way the app's spin is.
- **Top bar:** the logo at left (white wordmark on nylon; on cotton the ink version, F1), the language switch `EN · SK` at right. No navigation bar: the page is short, and the footer holds the rest.
- **The reel** (§4): club-season tags sliding past a marker, landing on one. Under it, one line: `LANDED · BARCELONA NAVY · 2010/11` (legal names, §6) and a quiet plate *Spin again*.
- **The promise (`h1`, super face, caps):** *Draft an XI from real club-seasons. Survive the season.* In Slovak (decided 9 Oct): *Zostav jedenástku zo skutočných klubových sezón. Preži sezónu.* Under it, the verdict in two words, volt and red: *Perfection or Misery.* (The wordmark already says the name; the line says what it means.)
- **The plates:** *Play in your browser* (primary: the one orange plate on the page, because orange means *you*), with the line *Any phone or computer. Free.* under it; *Download for Android* (secondary) with *Google Play: coming soon* as a tag beside it.
- **The counter strip** at the poster's foot: `12,481 RUNS PLAYED` in split-flap digits (§3.2), and `EARLY ACCESS · 0.9`.

### 3.2 The counter

- One figure on day one: **runs played**. The users figure appears only past its threshold (08 H18); below it the function returns nothing, so there's nothing to hide.
- **Split-flap digits** in the super face on nylon: each digit its own tile, a hairline across its middle. A digit that changes flips down once (stamp timing, no bounce). Only changed digits move.
- **Built with the number as of the build** and the date (*as of 9 Oct*) in a tag beside it; the live read replaces both. On a failed read the built number stays with its date (08 H17). It never shows 0, a dash or a spinner.
- **Thousands separated** by locale: `12,481` in English, `12 481` in Slovak.

### 3.3 How a run goes

Four frames, left to right on desktop, stacked on a phone, each a real screenshot in a phone-shaped crop with a tag above it: `1 SPIN`, `2 DRAFT`, `3 SIMULATE`, `4 VERDICT`. One sentence under each, no more:

1. *Spin a real club-season.*
2. *Pick one player from it. Eleven times.*
3. *Get dropped into a league or a cup, and watch it play out.*
4. *Get your verdict, from Perfection to Absolute Misery.*

### 3.4 The verdicts

The league ladder as a column of garment labels, best at the top, read in one glance: **Perfection** (volt edge), Almost Perfection, Champions, Title Contenders, the European places (legal names), Almost Matters, Respectable Mediocrity, **Absolute Misery** (red edge). Each label carries the one-line meaning from the game (`src/i18n` `tiers` and its descriptions, e.g. *Relegated, bottom three, after a disastrous season*). The cup ladders get one line: *Cups have their own ladder, from the trophy to going out in the groups.*

### 3.5 The modes

A row of mode labels, each on its colourway tape (location, never meaning, as in the app), in legal names: League, All Time, Chaos, Cursed; the European Cup, the Europa Cup, the Conference Cup, each finals-only or the full path from qualifying; the World Cup. Each label: the name, one line, nothing else. Chaos and Cursed keep their hazard edge.

### 3.6 Proof it's deep

Three screenshots, never more: **Awards Night** (a player award card), **the pundits** (their table against what happened), **the match sheet** (a shot map and ratings). One line each. This is the section the maturita panel reads.

### 3.7 What's new

One line: date tag, the latest update's title, a link to it. **Left out of the page entirely** until the updates table exists (08 H16), and when the newest update is older than 60 days (an old *What's new* reads abandoned).

### 3.8 Questions

Five, folded (a disclosure each, keyboard-operable):

1. **Is it free?** Yes. No ads, no purchases.
2. **Do I need an account?** No. Play as a guest; an account keeps your runs and puts them on Ranks.
3. **Is there an iPhone app?** No. Play in your browser on any phone; it's the same game.
4. **Are the clubs real?** The seasons and squads come from public football records. Club and competition names are changed, and no crests or logos are used.
5. **What do you keep about me?** Your username and your runs. Link: Privacy.

(Answer 4 follows the legal flavour; if a lawyer clears real names, it changes with them.)

### 3.9 The footer

`Privacy · Terms · Community · Download` · `EN · SK` · *Made in Slovakia* · the year (built) · *Not affiliated with any player, club, league, UEFA or FIFA* · the contact address with a *Copy* button (08 H9). The legal pages show their own *last updated* date from `src/data/legal.ts`.

### 3.10 The two plates' targets

- *Play in your browser* → `https://perfection-or-misery.vercel.app/` in the same tab (the game is the destination, the back button returns here).
- *Download for Android* → `/download` (11 §3), never the APK file directly: the page says what it is, its size and its checksum first.

---

## 4. The spin

### 4.1 Data (08 H2)

`landing/src/data/reel.json`, written by a script in this repo from `assets/db/players_legal.db` and `src/lib/markColours.ts`: a few hundred club-seasons with a squad, each `{ name, season, colours: [a, b] }`, legal names only. Rebuilt with each release. No crest file is read or shipped.

### 4.2 Behaviour, beat by beat

| Beat | What happens | Time |
|---|---|---|
| Load | The reel is drawn at rest on the build's landed tag (a real one, chosen at build) | 0 |
| Start | When the poster is in view and the page has painted, the reel spins: tags slide right to left, the band's edges take the passing tag's colour, the flapper clicks over each tag | 0–1.8 s, ease-out |
| Land | It brakes on a random club-season, the landed tag stamps (no bounce), the line under it reads `LANDED · <NAME> · <SEASON>` | ~1.8 s |
| Again | *Spin again* repeats from Start. A click on the reel while it spins lands it at once | on tap |

**Reduced motion:** no spin at all. The landed tag shows, *Spin again* swaps it for another with a cut.

**No JavaScript:** the build's landed tag shows, and *Spin again* isn't drawn.

### 4.3 The tag

Like the app's reel card: a rectangle in the club's first colour with its second as a band along the foot, the name in caps on a small ink label, the season in a tag. No crest, no initials standing in for a crest. Contrast on any club colour is guaranteed by the ink label, not by choosing a text colour.

---

## 5. The screenshots (08 H15)

From the **legal build**, at 1170 × 2532 (a phone's native size), light and dark versions of each where the screen follows the setting. The maintainer supplies them (Q11); this is the list.

| # | Screen | State |
|---|---|---|
| S1 | The draft | Mid-spin or just landed, three or four hangers filled |
| S2 | The draft | A player tag held over a lit hanger |
| S3 | The season | A league table mid-season, your row visible, the live match card |
| S4 | The verdict | A *Perfection* or a good result screen, the points shown |
| S5 | Awards Night | A player award card with its numbers |
| S6 | The pundits | Their table beside the final one |
| S7 | The match sheet | The shot map and the ratings |
| S8 | (Link preview) | Not a screenshot: the 1200 × 630 card on nylon with the logo and a verdict label (designed, Phase 10 step 1a) |

Each is checked before use: no crest, no real club or competition name, no other player's username without their consent (use the maintainer's own runs or a guest's).

---

## 6. Names and marks on the site

- **Legal flavour everywhere** ([07](07-FACT-CHECK.md) F7): generic competition names, altered club and player names, drawn marks only.
- **Anything read from the database** (the top five, a published question that names a club) passes through `renameText` (`src/data/legal-names.js`) before it's printed (08 H3).
- **The admin's own writing** (updates, answers) is written in legal names; the admin form warns when a known real name is typed (the same table, run in reverse as a check).
- **A build check** fails if the built HTML contains a real competition name from the table's left column.

---

## 7. Metadata and search (08 H6)

| Item | Value |
|---|---|
| Routes | `/` (English) and `/sk/` (Slovak); the community and download pages the same way |
| `hreflang` | `en`, `sk`, and `x-default` → `/`, on every page, both ways |
| Title | *Perfection or Misery · a football draft roguelike* / *Perfection or Misery · futbalový draft roguelike* |
| Description | One sentence per language, 140–160 characters, written for a click |
| Canonical | Every page, its own address |
| Open Graph, Twitter card | The designed 1200 × 630 card (S8); title and description per language |
| Structured data | `VideoGame` JSON-LD on `/`: name, description, genre, `gamePlatform` (web browser, Android), `offers` free, `inLanguage`. No `aggregateRating` (there's no rating to back it) |
| `robots.txt`, `sitemap.xml` | The public pages only; the admin route in neither (03 §4) |
| `llms.txt` | The site's own, in legal names |
| Search Console | Verified, sitemap submitted |
| 404 | Branded, both languages, the two plates and a link home (11 §5) |

---

## 8. States

**Every possible state:**

| Part | States |
|---|---|
| Ground | light (cotton) · dark (nylon) · forced colours (Windows high contrast) |
| Spin | resting on the build's tag · spinning · landed · reduced motion · no JavaScript · reel data missing (the build's tag only) |
| Counter | built number with its date · live · failed read (built number stays) · users below threshold (absent) · users shown |
| Top five | loaded · fewer than five runs this week · none this week · failed (section left out) |
| What's new | an update within 60 days · older (left out) · none yet (left out) · table not built (left out) |
| Plates | default · hover · focus · pressed · the browser plate's game address down (the game shows its own error) |
| Language | English · Slovak (strings about 30% longer: §9 sizes the poster for them) |
| Viewport | 320 · 390 · 768 · 1024 · 1440 · 1920+ (a capped column; the reel band runs full width) |
| Browser | modern · an in-app browser (Instagram, Facebook) where the game may not run (08 H19) |

**In use at launch:** all of the above except *users shown* (below its threshold at launch) and *What's new* with an update (the table comes in step 3).

---

## 9. Wireframes

### 9.1 Phone, 390 wide (the poster, then the sections)

```
┌──────────────────────────────────────┐
│ [▲▼ PERFECTION OR MISERY]     EN · SK│  logo; switch
│                                      │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  reel band, nylon, full bleed
│ ┌────────┐┌────────┐┌────────┐┌─────│
│ │MADRID  ││BARCELON││LIVERPOO││INTER│  tags slide ←
│ │NAVY    ││A NAVY  ││L CLARET││     │
│ │ 16/17  ││ 10/11  ││ 19/20  ││     │
│ └────────┘└───▲────┘└────────┘└─────│  marker + flapper
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ LANDED · BARCELONA NAVY · 2010/11    │  tag voice
│                        [SPIN AGAIN]  │  quiet plate
│                                      │
│ DRAFT AN XI FROM                     │  h1, super, 48
│ REAL CLUB-SEASONS.                   │
│ SURVIVE THE SEASON.                  │
│ Perfection or Misery.                │  volt / red words
│                                      │
│ ┌•────────────────────────────────•┐ │
│ │  PLAY IN YOUR BROWSER          → │ │  the orange plate
│ └•────────────────────────────────•┘ │
│ Any phone or computer. Free.         │
│ ┌──────────────────────────────────┐ │
│ │  DOWNLOAD FOR ANDROID          → │ │  secondary
│ └──────────────────────────────────┘ │
│ GOOGLE PLAY: COMING SOON             │  tag
│                                      │
│ ┌─┐┌─┐ ┌─┐┌─┐┌─┐                     │
│ │1││2│,│4│││8│││1│  RUNS PLAYED      │  split-flap
│ └─┘└─┘ └─┘└─┘└─┘  AS OF 9 OCT       │
│ EARLY ACCESS · 0.9                   │
├──────────────────────────────────────┤  first screen ends about here (844)
│ HOW A RUN GOES                       │
│ 1 SPIN                               │
│ ┌──────────┐  Spin a real            │  screenshot, phone crop
│ │  [S1]    │  club-season.           │
│ └──────────┘                         │
│ 2 DRAFT … 3 SIMULATE … 4 VERDICT     │  same shape, stacked
├──────────────────────────────────────┤
│ THE VERDICTS                         │
│ ┃PERFECTION        won every match   │  volt edge
│ │ALMOST PERFECTION unbeaten          │
│ │…                                   │
│ ┃ABSOLUTE MISERY   relegated         │  red edge
├──────────────────────────────────────┤
│ THE MODES          (labels on tapes) │
│ PROOF IT'S DEEP    (three frames)    │
│ THIS WEEK'S TOP FIVE (rows)          │
│ WHAT'S NEW · 27 SEP · Europe is in → │
│ QUESTIONS (five, folded)             │
├──────────────────────────────────────┤
│ Privacy · Terms · Community ·        │
│ Download · EN · SK                   │
│ Made in Slovakia · 2026              │
│ Not affiliated with any player,      │
│ club, league, UEFA or FIFA.          │
│ perfectionormisery@gmail.com  [COPY] │
└──────────────────────────────────────┘
```

**Fit check at 390 (and 320):** the `h1` at super 48 runs to three lines in English and four in Slovak (*Zostav jedenástku zo skutočných klubových sezón. Preži sezónu.*, decided 9 Oct, about 30% longer); at 320 the `h1` steps down to super 32. The plates are full width with 56 px height (T1 density). The first screen holds the reel, the `h1`, the browser plate and its line on a 390 × 844 phone in both languages; the Android plate and the counter may fall just below on the smallest phones, which is fine because the primary action is above.

### 9.2 Desktop, 1440 wide

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ [▲▼ PERFECTION OR MISERY]                                                EN · SK  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌───│ full-bleed reel
│ └─────┘└─────┘└─────┘└─────┘└─────┘└──▲──┘└─────┘└─────┘└─────┘└─────┘└─────┘└───│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│        LANDED · BARCELONA NAVY · 2010/11                       [SPIN AGAIN]       │
│                                                                                   │
│   DRAFT AN XI FROM REAL                    ┌•────────────────────────────────•┐   │
│   CLUB-SEASONS.                            │  PLAY IN YOUR BROWSER          → │   │
│   SURVIVE THE SEASON.                      └•────────────────────────────────•┘   │
│   Perfection or Misery.                    Any phone or computer. Free.          │
│                                            ┌──────────────────────────────────┐   │
│   ┌─┐┌─┐ ┌─┐┌─┐┌─┐                         │  DOWNLOAD FOR ANDROID          → │   │
│   │1││2│,│4│││8│││1│ RUNS PLAYED          └──────────────────────────────────┘   │
│   └─┘└─┘ └─┘└─┘└─┘ AS OF 9 OCT             GOOGLE PLAY: COMING SOON             │
│   EARLY ACCESS · 0.9                                                              │
├───────────────────────────────────────────────────────────────────────────────────┤
│  HOW A RUN GOES                                                                   │
│  1 SPIN        2 DRAFT        3 SIMULATE      4 VERDICT                           │ four frames in a row
│  [S1]          [S2]           [S3]            [S4]                                │
├──────────────────────────────────────┬────────────────────────────────────────────┤
│  THE VERDICTS (the ladder)           │  THE MODES (labels on tapes, 2 columns)    │ side by side
├──────────────────────────────────────┴────────────────────────────────────────────┤
│  PROOF IT'S DEEP  [S5]  [S6]  [S7]                                                │
├──────────────────────────────────────┬────────────────────────────────────────────┤
│  THIS WEEK'S TOP FIVE                │  WHAT'S NEW · QUESTIONS                    │
├──────────────────────────────────────┴────────────────────────────────────────────┤
│  footer, one band                                                                 │
└───────────────────────────────────────────────────────────────────────────────────┘
```

The reading column caps at 1200 px; only the reel band runs the full window, which is what makes the desktop its own layout rather than a stretched phone. At 1024 the poster's two columns hold; below 900 it stacks as the phone does.

---

## 10. Motion

| Moment | Motion | Reduced motion |
|---|---|---|
| The spin | Translate with ease-out over ~1.8 s; edge colour follows the passing tag; the flapper kicks per tag | No spin; cuts |
| The landed tag | Stamps (a scale from 1.04 to 1 in 120 ms, no overshoot) | Appears |
| A counter digit | Flips down once, 160 ms | Changes |
| Sections | Nothing on scroll. No fade-ups (vibecode PERF-5) | Same |
| Plates | Press moves into the 2 px offset, as in the app | Same (not motion, feedback) |

The swing (the zip tag's overshoot) isn't used on the site: it belongs to *you*, and the visitor hasn't played yet.

---

## 11. What must never appear

- A crest, a competition logo, a trophy image, a real club, competition or player name (§6).
- A number nobody counted: no impressions, no "players", no "5M+", no visitors-now (vibecode TRU-13–15).
- Reviews, testimonials, a "trusted by" strip, stock photos, generated imagery (TRU-1–12).
- The template: hero text left with a phone right, three feature cards with icons, gradients, emoji as icons, fade-up on every section, a sticky header with five links.
- Exclamation marks in system copy; *seamless*, *unlock*, *elevate* in any copy.
- Orange on anything but the one primary plate (orange means *you*); volt as text on cotton (1.04:1); red text on cotton below its 4.37:1 at body size.

---

## 12. Built from

| Thing | Source |
|---|---|
| Tokens | `src/theme.ts` (Kit Drop roles), copied into the site's CSS custom properties once, with a check that they match |
| Fonts | Barlow Condensed 900 Italic, Martian Mono 500/700, Archivo 400–800, self-hosted, subset to Latin + Latin Extended-A (Slovak's č, ď, ľ, ň, ŕ, š, ť, ž, ô, ä) |
| Contrast (computed 9 Oct) | ink on cotton 17.59 · white on nylon 18.40 · volt on nylon 15.95 · ink on volt 16.95 · ink on orange 6.25 · orange on nylon 5.88 · red on nylon 3.79 (large only) · red on cotton 4.37 (large only) · white on cotton **1.11**, so the wordmark is ink on cotton |
| Logo | `assets/Group 3.svg` (re-exported 9 Oct): the wordmark path's `fill="white"` on nylon, ink on cotton; the pin's black hole stays black on both. Favicon: the two triangles and the pin |
| Copy | Every line through `humanizer`; Slovak written, not translated, and read by the maintainer |

## 13. Open for the builder, not to invent

- The link preview's design (S8), from the new logo.
- Whether the top five links each run to its run page on the game (it can: run links are public).
