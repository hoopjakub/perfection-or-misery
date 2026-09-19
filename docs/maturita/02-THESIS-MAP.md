# 02 · Mapping Perfection or Misery onto the thesis

> Part of the maturita set. Start at [`00-README.md`](00-README.md).
> Status: **plan.** Chapter titles follow the template ([`01-REQUIREMENTS.md`](01-REQUIREMENTS.md) §3.3). Every number about the app (players, leagues, matches, checks) is to be **re-measured on the day the chapter is written**; project docs already disagree with the code in places (`PROJECT_STATE.md` says DB v10, `src/db/setup.ts` says 13).

The thesis is written in Slovak. Titles below are given in Slovak with English notes.

---

## 1. Topic and assignment text

The assignment sheet has blank *Téma* and *Zadanie* fields that are agreed with the consultant. A proposal to bring to that conversation:

**Téma (proposal):**
> Návrh a vývoj multiplatformovej simulačnej hry *Perfection or Misery* s deterministickým generovaním zápasových štatistík

*(Design and development of the cross-platform simulation game Perfection or Misery with deterministic generation of match statistics.)*

A shorter alternative if the school prefers: *Vývoj multiplatformovej futbalovej manažérskej hry pre Android a web.*

**Zadanie (proposal):**
1. Analyzujte existujúce futbalové manažérske a simulačné hry a technológie na multiplatformový vývoj mobilných a webových aplikácií.
2. Navrhnite herný systém (draft zostavy, umiestnenie do súťaže, simulácia sezóny, hodnotenie) a architektúru aplikácie.
3. Vytvorte dátový kanál na získanie a spracovanie údajov o hráčoch a kluboch do lokálnej databázy.
4. Implementujte simulačné jadro vrátane deterministického generovania štatistík zápasov a overte jeho správnosť automatizovanými testami.
5. Navrhnite a implementujte používateľské rozhranie pre Android a web s dôrazom na použiteľnosť a prístupnosť.
6. Pripravte aplikáciu na verejné vydanie vrátane licenčných, právnych a ekonomických aspektov.
7. Zhodnoťte výsledky a navrhnite ďalší rozvoj.

Each numbered point becomes a goal in chapter 3 and gets checked off in chapter 6, so criterion 2a ("meeting the goals") is visibly answered. Point 6 exists so the licensing and economics work counts toward the grade rather than sitting outside it. Drop it if the consultant wants a narrower brief.

---

## 2. Length budget

The minimum is 20 pages without appendices. At Times New Roman 12 with 1.5 spacing, a full page of text is roughly 300–350 words, and figures and tables take a good share of each page. **Target 32–38 pages of body**, which leaves room to cut without dropping under 20.

| # | Chapter | Pages |
|---|---|---|
| 1 | Úvod | 1–2 |
| 2 | Problematika a prehľad literatúry | 7–9 |
| 3 | Ciele práce | 1 |
| 4 | Materiál a metodika (with results) | 16–19 |
| 5 | Diskusia | 3–4 |
| 6 | Závery práce | 1–2 |
| 7 | Zhrnutie | 1 |

---

## 3. Chapter by chapter

### 1 · Úvod (Introduction)

- The idea in one paragraph: draft an XI from random real club-seasons, get placed into a real competition, simulate it, get a verdict between *Perfection* and *Misery*.
- Why: the author's interest in football and simulation; inspiration from 38-0.app and what this project set out to do differently (stated as an inspiration, cited).
- What the reader will find in each chapter, one sentence each.

### 2 · Problematika a prehľad literatúry (Background and literature review)

This is where the non-programming viewpoints earn their place. Each sub-chapter cites real sources; [`03-PERSPECTIVES.md`](03-PERSPECTIVES.md) lists what to read for each.

| § | Sub-chapter | Content |
|---|---|---|
| 2.1 | Football management and simulation games | Genre history (Football Manager, FIFA/EA FC career mode, browser managers, 38-0.app); roguelike structure; what makes short-session sims replayable |
| 2.2 | Game design foundations | Core loop, meaningful choices, risk and reward, randomness vs skill, difficulty and fairness, feedback. **Game design viewpoint** |
| 2.3 | Simulation of sports results | Probabilistic match models (Elo-style ratings, Poisson goal models), why PoM decides the result first and generates statistics after |
| 2.4 | Pseudo-random number generation and determinism | Seeds, PRNGs (mulberry32), reproducibility, floating-point differences between JavaScript engines |
| 2.5 | Cross-platform development | Native vs web vs cross-platform; React Native, Expo, the new architecture, Hermes; one codebase for Android and web |
| 2.6 | Data for games: acquisition and storage | Web scraping, its legal limits, SQLite as a bundled read-only database, Supabase as a backend |
| 2.7 | Interface and digital media design | Usability heuristics (Nielsen), accessibility (WCAG), design systems and tokens, motion design, visual identity. **Digital media design viewpoint** |
| 2.8 | Publishing an application | Google Play requirements, web deployment, licences and intellectual property, personal data (GDPR). **Licensing viewpoint** |
| 2.9 | Economics of digital products *(if the consultant agrees)* | Business models for games, costs of running and publishing, pricing. **Economics viewpoint**, built on the literature you'll provide |

### 3 · Ciele práce (Goals)

The seven assignment points from §1, each rewritten as one measurable goal. Example: *"Overiť deterministickosť generovania štatistík: rovnaký seed musí na každej platforme viesť k identickému výstupu."*

### 4 · Materiál a metodika (Materials and methods, with results)

The largest chapter. Methods and results together, per area, so the template stays unchanged.

| § | Sub-chapter | What to show | Figures |
|---|---|---|---|
| 4.1 | Použité technológie a nástroje | Expo SDK 54, React Native 0.81, TypeScript, expo-router, Zustand, expo-sqlite, Supabase, react-native-svg, Reanimated; EAS builds; why each | stack diagram |
| 4.2 | Návrh herného systému | The run: mode → difficulty → formation → draft → placement → simulation → result. Modes and their rules. Difficulty model (screw levels, player-only tilt, fairness). Scoring and tiers | flow diagram of a run; difficulty table |
| 4.3 | Architektúra aplikácie | Folder structure, engine separated from UI, state, routing, platform differences | architecture diagram |
| 4.4 | Dátový kanál | Transfermarkt scrapers → seed JSON → build-db → bundled SQLite; the OVR model from market value, age and minutes; club colours from crests; DB versioning | pipeline diagram; OVR formula; DB schema (7 tables) |
| 4.5 | Simulačné jadro | `simulateMatch` (sigmoid over rating difference, draw probability, score generation); fixtures; Swiss-format UCL league phase; World Cup with 48 teams; knockouts, extra time, shootouts with early stop | formulas; win-probability graph |
| 4.6 | Deterministické štatistiky zápasu | Seeded generation of possession, xG, shots, ratings, MOTM; "attribute once, store on match"; Deep Match minute-by-minute timeline | example match sheet screenshot; seed → sheet diagram |
| 4.7 | Overovanie správnosti | The `verify-*` scripts: thousands of simulated matches, invariants and aggregate checks; results in a table | table of checks and results |
| 4.8 | Používateľské rozhranie | Screens and navigation; the UI critique (22/40) and native audit (8/20); the Kit Drop redesign plan and what of it is built by March | before/after screenshots; heuristic score table |
| 4.9 | Webová verzia | The same codebase on web: database loaded into memory, flag font workaround, wide layouts. **Website viewpoint** | web screenshot at desktop width |
| 4.10 | Príprava na vydanie | Licensing decisions, privacy, store listing, economics summary (details in §5 discussion and appendices) | cost table |

Everything in 4.8–4.10 depends on what is built by March. Write only what exists; plans go to chapter 5 or 6 as future work.

### 5 · Diskusia (Discussion)

- What worked: result-first engine + deterministic texture; the verification idiom.
- What didn't or is limited: `simulateMatch` uses `Math.random()` (results aren't replayable, only statistics); ratings derived from market value are an approximation; data licensing limits a public release; the run lives in memory.
- Comparison with the games from 2.1.
- Honest account of development tools, including AI assistance (see [`04-LICENSING-AND-RELEASE.md`](04-LICENSING-AND-RELEASE.md) §6).

### 6 · Závery práce (Conclusions)

Each goal from chapter 3 with a sentence on whether and how it was met. Future work: full World Cup route, more competitions, diagnostics screen, run persistence.

### 7 · Zhrnutie (Summary)

One page, the whole work in plain terms. Ask the consultant whether an English abstract is also expected.

---

## 4. Figures and tables

Criterion 1b (5 points) marks their quality. Rules for all of them:

- every figure and table numbered and captioned, and listed in *Zoznam tabuliek, grafov a ilustrácií*,
- every one referenced in the text before it appears,
- diagrams drawn as vector (draw.io, Figma or Mermaid exported to SVG/PDF), never phone photos,
- screenshots from a real device or the web build at a consistent size, with the status bar cleaned,
- formulas typeset with Word's equation editor.

Planned: run flow, architecture, data pipeline, DB schema, win-probability curve, seed → match sheet, verification results table, screen map, before/after UI, cost table. About 10–14 items.

---

## 5. Appendices

| Appendix | Content |
|---|---|
| A · Zdrojový kód | Not the whole repository. Selected listings (the match function, the seed generator, one verify script) plus the repository link and structure. Full source on the CD/USB |
| B · Fotodokumentácia → Snímky obrazovky | Screenshots of every main screen, Android and web |
| C · Používateľská príručka | Short user guide (install, play a run) |
| D · Výsledky testov | Full verify-script output |
| E · Licencie tretích strán | Dependency and asset licence list ([`04`](04-LICENSING-AND-RELEASE.md) §5) |

Adding C–E is allowed by the template's structure; confirm naming with the consultant.

---

## 6. Abbreviations to collect as you write

API, CSS, DB, EAS, GDPR, HTML, JS, JSON, MOTM, OVR, PRNG, RLS, SDK, SQL, TS, UCL, UI, UX, WC, WCAG, xG. Keep a running list; alphabetise at the end.
