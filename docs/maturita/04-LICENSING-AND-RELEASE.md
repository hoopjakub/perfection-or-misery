# 04 · Licensing, rights and release

> Part of the maturita set. Start at [`00-README.md`](00-README.md).
> Status: **issue list, not legal advice.** Each item names the question, what's true in the repo today, and the options. Anything marked **verify** must be checked against the current primary source (the law, the terms of service, the store policy) and cited with the date read. For a commercial release, a lawyer's review of §1–§4 is worth the money.

Two separate audiences care about this:

- **The committee:** the thesis should show the author understood the rights involved (criteria 2c, 3b, 3d). An honest "here's the risk and here's what I decided" scores better than silence.
- **A public release:** Google Play and a public website make every item below real.

---

## 1. Player and club data

**Today.** Player data comes from scraping Transfermarkt (`scripts/lib/transfermarkt.ts`, `scripts/scrape-*.ts`) into `assets/db/players_v5.db`, which ships inside the app. Player OVR is computed from Transfermarkt market values, age and minutes.

**Questions:**
- **Terms of service.** Does Transfermarkt's ToS forbid automated scraping and reuse of its data? **Verify** the current wording.
- **Database right.** The EU gives makers of databases a *sui generis* right against extraction of a substantial part (Directive 96/9/EC, implemented in Slovakia in the copyright act, zákon č. 185/2015 Z. z. **verify section**). Bundling a large extracted dataset into a distributed app is the case this right targets.
- **Market values** are Transfermarkt's own editorial estimates, not neutral facts, and the OVR model is built on them.

**Options, lowest risk first:**
1. Replace the source with openly licensed data (check licences of open football datasets) or data you compile yourself.
2. Keep names and seasons, rebuild ratings from facts that aren't one site's editorial work (minutes, goals, appearances).
3. Ask Transfermarkt for permission.
4. Keep as is for a private or school build only, and say so in the thesis.

**For the CD:** the handover includes "other relevant files". Decide whether the CD carries the built database or the scripts only.

---

## 2. Player names and likeness

**Today.** Real player names appear throughout. No player photos ship (only two files in `assets/logos/`).

**Questions:** names used in a commercial game can touch personality rights (in Slovakia, protection of personality in the Civil Code, **verify**). Big publishers license names collectively (through players' unions such as FIFPRO) for exactly this reason.

**Options:** keep names in a non-commercial release and document the decision; add a fictional-names mode; never add photos or likenesses without a licence.

---

## 3. Clubs, competitions and marks

**Today.**
- Club names and colours are used; colours were extracted from crest images.
- `assets/modes/world-cup.png` is the official FIFA World Cup 26 emblem; the Champions League mode uses a UEFA mark (found in `docs/ui-overhaul/02-VIBECODE-AUDIT.md`, TRU-12).
- Mode names use "UEFA Champions League" and "FIFA World Cup".

**Questions:** crests and competition emblems are protected trademarks and artworks. Using a name to *describe* what a mode simulates is a different, lower-risk act than using the emblem as your branding. **Verify** how each organisation treats unofficial games.

**Options:** remove the emblems and use the Kit Drop colourway tapes instead (already the plan in `docs/ui-overhaul/05-STYLE-GUIDE.md`); use descriptive names ("European Cup", "World Tournament") in a public release; keep club crests out. Colours alone aren't a mark. This is the first open decision in `docs/ui-overhaul/00-README.md` as well.

---

## 4. Inspiration: 38-0.app

The About screen credits 38-0.app as the inspiration. Ideas and game mechanics aren't protected by copyright; text, graphics and code are. Keep PoM's own text, art and code, cite 38-0.app as an inspiration in chapters 1 and 2.1, and don't reproduce its screens in the thesis beyond a cited comparison screenshot if needed.

---

## 5. Third-party code, fonts and assets

**Found in the repo today:**

| Item | Finding | Action |
|---|---|---|
| **`LICENSE`** | It's the Expo template's MIT licence, *"Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)"*. It claims Expo owns this project's code | Replace with your own: either "All rights reserved" (keeps options open for monetisation) or an open licence you actually choose |
| `assets/fonts/TwemojiCountryFlags.woff2` | Twemoji artwork is released under CC-BY 4.0, which requires attribution (**verify** the specific package's licence) | Add attribution in About and Appendix E |
| `assets/countries-110m.geo.json` | Country shapes, likely derived from Natural Earth via world-atlas (**verify** origin) | Record source and licence |
| npm dependencies | Mostly MIT/BSD/Apache; attribution notices required for some | Generate a licence report (for example `npx license-checker --summary`) and include it as Appendix E and an in-app "Licences" screen |
| Future fonts (Archivo, Martian Mono) | SIL Open Font License | Keep the licence text with the font files |

---

## 6. The declaration of honesty and AI assistance

**The template's declaration** says the work was prepared *independently, using the literature sources listed*. Criterion 2b awards 10 points for independence, and 3b/3d test understanding in questioning.

A large part of this project's code and documentation was produced with an AI coding assistant (Claude). That's normal professional practice now, but the declaration and 2b make it a question to settle **before** writing, not after.

**Known so far (15 September 2026):** the teacher has said in class that she expects students use AI and doesn't mind, provided they understand what it writes. She likely prefers self-written code. That makes disclosure plus demonstrated understanding the right approach; it still needs confirming for this specific project and for the thesis text.

**Recommended:**
1. **Ask the consultant early** (at the October assignment meeting) what the school's policy is on AI tools for the PČOZ project and how it should be disclosed.
2. **Disclose it plainly in *Materiál a metodika*** as a tool, like the IDE or Expo: what it was used for, and what the author did (the game concept, design decisions, directing and reviewing the work, testing on devices, choosing between options, rejecting wrong output).
3. **Cite it** in the bibliography in the form the consultant accepts.
4. **Be able to explain every part** of the app without notes: the match formula, seeding, the data pipeline, the architecture. That's 20 of the defence points, and it's also the best evidence of independence.
5. Keep the design-decision history (the `docs/` folder, direction logs) as proof of the author's own choices; it can go on the CD.

---

## 7. Personal data (GDPR)

**Today.** Supabase auth with email accounts and guest sessions; `runs` and `career_stats` tables; public leaderboard with usernames. The vibecode audit found **no privacy policy and no account deletion**.

**Required before a public release:**
- A **privacy policy** at a public URL: what's collected (email, username, runs), why, where it's stored (Supabase region, **verify**), how long, how to delete it, contact.
- **Account deletion** in the app and via a web request (Google Play requires both for apps that create accounts, **verify** current policy).
- **Age:** the age at which a child can consent to online services in Slovakia (**verify**, under GDPR Art. 8 and zákon č. 18/2018 Z. z.). Decide whether the app asks for age or states a minimum.
- **Usernames** on a public leaderboard need a basic filter and a report/removal path.
- **Tracking:** if the web build adds no analytics or ad cookies, no cookie banner is needed for tracking; storage used purely for login is treated differently (**verify**).

---

## 8. Google Play

**Verify each against the current Play Console Help pages:**
- Developer account eligibility, including **minimum age** and identity verification, and the one-time registration fee.
- For new personal developer accounts: the **closed testing requirement** (a minimum number of testers over a minimum number of days) before production access.
- **Target API level** requirement for the year of release.
- **Data safety form**, content rating questionnaire, target audience declaration.
- Store listing assets: icon (not the Expo template), feature graphic, screenshots.
- The current package name `com.yolotime4564.perfectionormisery` is permanent once published; decide if it's the one you want.

---

## 9. Website

- Privacy policy and terms pages (also needed by Google Play).
- Hosting provider terms; a contact method.
- The same data-rights decisions as the app, since the web build ships the same database.

---

## 10. Decision table to fill in

| # | Decision | Options | Needed by |
|---|---|---|---|
| L1 | Data source | keep TM (private only) · open data · own data · permission | before public release |
| L2 | Real player names | keep (non-commercial) · fictional mode · licence | before public release |
| L3 | Competition names and emblems | remove emblems · descriptive names · keep (private only) | before public release |
| L4 | Project licence | all rights reserved · open licence | now (replace Expo's file) |
| L5 | Monetisation | none · ads · purchase · donations | after L1–L3 |
| L6 | AI disclosure form | per consultant | October 2026 |
| L7 | Database on the CD | include · scripts only | before March 2027 |
