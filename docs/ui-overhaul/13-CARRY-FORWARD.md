# 13 · Carry-forward: what this set still asks of Phases 8.5, 9 and 10

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md).
> Status: **findings and plan**, 29 September 2026, from a full re-read of all sixteen documents in this folder against the app as it stands after Phase 8. The companion re-audit of the code's duplication is [`../centralisation/08-RE-AUDIT.md`](../centralisation/08-RE-AUDIT.md).

This set was written on 14 September as a plan for Phases 0 to 7, and Phase 8 added a hundred and eighty notes on top of it. Much of it is built now, some of it is stale, and some of it was never done and still matters for the three phases left: **8.5** (the audit), **9** (mobile performance and Diagnostics) and **10** (the landing page). This document reads each file once and says which of the three.

---

## 1 · File by file

| # | Document | State on 29 Sept | Still asks of 8.5 | Of 9 | Of 10 |
|---|---|---|---|---|---|
| 00 | README | The decision log stops at 16 September | Log the decisions since (§2) | | |
| 01 | Critique | Snapshot of 14 Sept (22/40); Phase 7 re-scored 31/40 ([12](12-OVERVIEW.md)) | **Re-score** all ten heuristics as the audit's first act, with the "corporate" criticism (§3.2) as evidence for #8 | | |
| 02 | Vibecode audit | Most blockers closed (privacy page, account deletion, RLS exported to `supabase/policies.sql`); some items now false (§2.3) | | | **The site's audit, with the upgraded skill** (§4); TRU-12 (official marks) decided before a public release |
| 03 | Dugout comparison | Largely realised: the press, zones, pundits, Awards Night, the broadcast draw | The Dugout's cup "belongs to the country" (whole pyramid, giant-killings); PoM's has only the top flight ([`../europe/06-CUPS-FOR-EVERY-NATION.md`](../europe/06-CUPS-FOR-EVERY-NATION.md)) | | |
| 04 | Direction | Locked; still the direction | The colour question (§3.2) and the grounds question (§3.1) both reopen parts of §2.3 and §2.2 | | The site speaks the same world ([`../website/WEBSITE-BRIEF.md`](../website/WEBSITE-BRIEF.md)) |
| 05 | Style guide | Became `DESIGN.md` in Phase 1; some values drifted (§2.2) | Reconcile volt; §9's brand mark brief is replaced by the new logo (§3.3) | | The logo's files and colours (§3.3) |
| 06 | Motion | Mostly built; §7's haptics map is stale (§2.3) | "Alive" motion (P8-145) as a named principle | The 60 fps checks of §10 on a mid-range phone | Motion on the site follows §2 |
| 07a | Screens: shell | Built; A1's four destinations become five (Clubs, P8.5-07) | You wears the profile card (P8.5-02) | | |
| 07b | Screens: setup | Built; B8's pundits exist for every mode but the full path | The full path's pundits (P8.5-15) | | |
| 07c | Screens: season | Built; C4's berth tapes are on the full path's tables (now for all three competitions). C2's pinned "you" row wasn't re-checked | The five-question test on each season screen, including C2's pinned row | | |
| 07d | Screens: results | Built as five screens, not one (P8-54 waits); D11's "username optional" reversed (§2.3) | D1's "one verdict for every mode" is P8-54, after centralisation step 6 | | D11's link preview for run pages |
| 08 | Components | The fate table is out of date (`AppModal` deleted, `TeamMark` and `BracketTree` exist) | Update the table (centralisation 10 §6) | List virtualisation (§3.2 of 10) | |
| 09 | Copy deck | Partly applied; the flags weren't re-checked | A copy pass on everything written since (clubs, profile, Europe, seasons) with the humanizer; re-check flags 5, 6 and 11 | | Every line on the site through the humanizer |
| 10 | Adapt, optimize, a11y | Size classes built; §3's lists, orientation and predictive back not | The responsiveness pass already in the roadmap | **All of §3.2** (lists, the season screen's state, the web database load, loops) | §6 web specifics for the site |
| 11 | Roadmap | Living | Phase 8.5's part zero (the playtest notes) | | |
| 12 | Overview | Phase 7's snapshot | The five-question test re-run per screen | | |

---

## 2 · Stale, contradicted or reversed

### 2.1 Decisions made since 16 September that aren't in the log
The log in [`00-README.md`](00-README.md) ends on 16 September. These were decided afterwards and live only in roadmap notes:

| Date | Decision | Where it was decided |
|---|---|---|
| 19 Sept | Quotes only where someone speaks (the press, the commentary) | P8-105 |
| 19 Sept | Misery red is a role; the hazard stripe means "not available", not "bad" | P8-74, P8-111 |
| 25 Sept | Haptics removed, and never added back | P8-145, the maintainer; memory `feedback_pom_alive_no_haptics` |
| 28 Sept | Clubs replace the letters on the ID tag | P8-181 |
| 29 Sept | Clubs become a fifth tab | P8.5-07 |
| 29 Sept | 1.0.0 only when the landing page is finished; 0.9.0 is Phase 8 | roadmap Phase 10 |
| 29 Sept | A new logo | roadmap Phase 10; §3.3 below |

### 2.2 Values that drifted from the documents

| What | Documents say | The code says | Evidence |
|---|---|---|---|
| Volt | `#D5FF3F` ([05](05-STYLE-GUIDE.md) §2.1, `DESIGN.md` line 44) | `#4FFF3F` | `src/theme.ts:323`. The new logo uses `#D5FF3F` |
| Icons | Material Symbols Sharp ([05](05-STYLE-GUIDE.md) §8) | Ionicons Sharp behind `Icon` | decided 16 Sept (log), guide never updated |
| The super face | Archivo ExtraCondensed ([05](05-STYLE-GUIDE.md) §3.1) | Barlow Condensed Black Italic | decided 16 Sept (log) |
| `userInterfaceStyle` | Match the grounds ([02](02-VIBECODE-AUDIT.md) DEP-7) | `"dark"` over mostly cotton screens | `app.json:8` (P8-65 noted it) |
| Orientation, predictive back | Unlock medium and expanded; re-enable predictive back ([10](10-ADAPT-OPTIMIZE-A11Y.md) §1) | `"portrait"`, `predictiveBackGestureEnabled: false` | `app.json:6, :20` |

Both computed volts pass on nylon (`#D5FF3F` 15.95:1, `#4FFF3F` 13.76:1, `scripts/contrast.py`), so this is an identity choice, not an accessibility one. Pick one in 8.5 and make the logo, `DESIGN.md` and `theme.ts` agree.

### 2.3 Claims that are no longer true

| Document | Claim | Why it's no longer true |
|---|---|---|
| [02](02-VIBECODE-AUDIT.md) N/A list | "SEC-13 · No file uploads" | Profile pictures and banner pictures are uploaded to Supabase Storage (P8-175, P8-178). The site's security audit has to cover the storage bucket's policies |
| [02](02-VIBECODE-AUDIT.md) TRU-12 | The official marks are one UEFA mark and the FIFA emblem | The competition marks now include the Europa and Conference League logos (`assets/crests/competitions/`, P8-172), and real club crests in the `real` brand mode. Still an open decision for a public release |
| [06](06-MOTION.md) §7, [10](10-ADAPT-OPTIMIZE-A11Y.md) §5, [07a](07a-SCREENS-SHELL.md) A4 | A haptics map, a haptics toggle | Haptics are gone for good |
| [07d](07d-SCREENS-RESULTS.md) D11 | "No private data: username optional" on the share label | The maintainer, 29 Sept: the shared picture should say whose run it is (P8.5-04) |
| [07a](07a-SCREENS-SHELL.md) A1, [04](04-DIRECTION.md) pitch 9 | Four destinations | Five, with Clubs (P8.5-07) |
| [08](08-COMPONENTS.md) §1 | `AppModal`, `TeamLabel`, `PenShootout`… with their fates | `AppModal` is deleted; `PenShootout` is unused; `TeamLabel` has one user (`wc-result.tsx:40`) |

---

## 3 · Three questions the maintainer's notes reopen

### 3.1 Light and dark
**The note (29 Sept):** the globe sits on "that black box", and "since light and dark mode don't yet exist… for phase 8.5 all components need dark and light variants."
**What this set decided (14 Sept):** two grounds set by the scene, not a theme toggle ([04](04-DIRECTION.md) §2.2), and a player-facing "night grounds" preference considered after launch, not before ([02](02-VIBECODE-AUDIT.md) POL-1).
**What the code shows:** sixteen shared components fix their ground at module level, and the globe panel is painted nylon by hand ([`../centralisation/09-NEW-ITEMS.md`](../centralisation/09-NEW-ITEMS.md) N-12). So a bracket or a globe is a black box on any cotton page, whatever the scene.
**Two readings, both compatible with the direction:**
1. **Every component works on both grounds** and takes the ground of the page it's on. This is within the locked direction, fixes the black box, and is the prerequisite for anything else.
2. **A player chooses light or dark** for the whole app. That reverses the 14 September decision and needs its own design pass: which screens stay nylon regardless (the floodlit half is part of the story), and what "lights on" means in a dark theme.

**Default:** reading 1 in Phase 8.5 (centralisation step 1); reading 2 is the maintainer's call, after reading 1 exists. Logged as D8 in [`../centralisation/10-PHASE-TWO-REVISED.md`](../centralisation/10-PHASE-TWO-REVISED.md).

**Decided 29 Sept: reading 2,** "dark mode and light mode of the app like any other app… every component has a dark and light variant." Reading 1 is its first step. This reverses the 14 September "grounds set by the scene" rule and POL-1's deferral; the design pass still has to say which moments keep their scene's ground in both modes (the floodlit reveal, the verdict), or whether nothing does.

### 3.2 "Corporate" and colourless
**The note (28 Sept):** the game feels "corporate", not like a football app; too colourless.
**Why it's that way, from this set:** [04](04-DIRECTION.md) §2.3 is explicit. Ink and cotton are "everything else. Most of every screen", and colour appears only as data: orange for you, volt for Perfection, red for Misery, colourways as location. That rule is what makes the screens read cleanly, and it's also exactly what makes them read as corporate. The criticism is the direction's own rule working as written.
**What 8.5's design lens should weigh (proposals, not decisions):**
- The colourway allowed to fill more than a 4px tape on the scenes that are about a competition: the draw, the league phase's lights-on moment, the verdict.
- Club colours as surfaces where a club is the subject (the club page, the draw's reveal), with the ink-on-colour rule (N-15 in the centralisation set) keeping text readable.
- The new logo's three colours (volt, red, orange) as the app's own signature, not just the data roles.
- Matchday texture: the pitch green, crowd noise as pattern, the 2014 advert's scale jumps, which [04](04-DIRECTION.md) §2.1 named and the screens mostly haven't used.
Run it through `impeccable` (colorize, bolder) with a critique before and after, and record what the maintainer rejects.

**A line to design by (recorded 29 Sept at the maintainer's request):**

> "A game for everyone is a game for no one."

**Attribution, fact-checked:** it's **Arrowhead Game Studios' motto** (the studio behind *Helldivers 2*; it's shown on arrowheadgamestudios.com), **popularised by Johan Pilestedt**, the studio's creative director and former CEO, who used it publicly in June 2024 defending *Elden Ring: Shadow of the Erdtree*'s difficulty (reported by gamepressure), and by CEO Shams Jorjani, who called it the studio's philosophy (May 2024). Search results also say it's in Pilestedt's X bio; that wasn't checked directly. So: credit **Arrowhead Game Studios**, and mention Pilestedt as the one who made it widely known; don't attribute it to him as its author. Candidate uses: the About page, the website's footer or "why it's hard" line, or an epigraph on the rulebook.

**Release name.** 1.0.0 goes out under a football name rather than "1.0.0" alone: *First Touch*, *The Academy*, *Kick-off*, *Matchday One* or *The First Whistle*; the maintainer picks ([`../website/05-OPEN-QUESTIONS.md`](../website/05-OPEN-QUESTIONS.md) Q13).

### 3.3 The new logo
**The files:** `assets/Group 3.png` and the maintainer's `Group 3.svg` (533 × 528): a volt triangle pointing up over a red triangle pointing down, the wordmark PERFECTION OR MISERY between them in white, and the orange pin at the top right.
**What it replaces:** [05](05-STYLE-GUIDE.md) §9's brief (a `P/M` plate with the zip tag) and the mark shipped in Phase 1. It keeps the brief's one fixed idea, the orange tag meaning *you*, and adds the two ends of the ladder as shapes.
**Measured, against the app's colours** (`scripts/contrast.py`):

| Pair | Ratio | Reads as |
|---|---|---|
| The logo's volt `#D5FF3F` on nylon | 15.95:1 | fine |
| The logo's red `#E1141F` on nylon | 3.79:1 | large shapes only; fails as text |
| Ink on the logo's red | 4.02:1 | large text only |
| The app's misery red `#FF2E4D` on nylon | 5.04:1 | text |
| The white wordmark on cotton `#F3F3F0` | 1.11:1 | invisible |

**So:** the mark needs a nylon ground, or an ink version of the wordmark for cotton; the logo's red is a mark colour, not the misery role (keep `#FF2E4D` for text and states unless the maintainer wants one red, in which case the role moves and every text use is re-checked). Volt is §2.2's question.

**Decided 29 Sept:** **one volt and one red, the logo's.** `#D5FF3F` replaces `#4FFF3F` and `#E1141F` replaces `#FF2E4D` across the app and the site. The red's 3.79:1 on nylon is **accepted as the one exception** to the contrast rule; every text use of the misery red is still listed during the swap so the maintainer sees where it lands (and where a larger size or a tag behind it helps). The wordmark on cotton is tinted to ink by the build (website Q10).
**Sibling check** ([04](04-DIRECTION.md) §2.8): Become a Legend's world uses shirt devices, and chevrons are one of them. The two triangles are arrowheads (up is Perfection, down is Misery), not a chevron band across a surface, so they don't break rule 1. Keep them as a mark and never repeat them as a pattern on screens.
**Deliverables** (as [05](05-STYLE-GUIDE.md) §9 listed): launcher icon, adaptive foreground, background and monochrome layers, splash, favicon, apple-touch icon, web manifest icons, and a 1200 × 630 link preview.

---

## 4 · For Phase 10: what the vibecode audit must grow into

The roadmap's Phase 10 now says the `vibecode-audit` skill is upgraded before it's run against the site. From this set and the website plan ([`../website/04-SECURITY-AND-ABUSE.md`](../website/04-SECURITY-AND-ABUSE.md)), the upgrade has to add at least:
- **Row-level security, checked, not assumed:** every table's policies read from `pg_policies`, and a two-account test that one user can't write another's rows.
- **Rate limits on writes**, since Supabase has none on the database by default, only on sign-in and sign-up (per IP).
- **Storage bucket policies** (avatars, banners), which this audit's first run marked N/A.
- **An admin area:** a real role check on the server, the admin route kept out of analytics, sitemaps and robots, and no reliance on the URL being secret.
- **Shared-project hygiene:** the Supabase project also holds The Dugout's and Become a Legend's tables; a policy or function added for the site must never touch theirs.
- **Forms:** input limits enforced in the database, not only in the page.

## 5 · Documents to update

- [`00-README.md`](00-README.md): the decisions of §2.1 into the log; this document in the table.
- `DESIGN.md`: the volt value once chosen; the logo.
- [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md) §9: a pointer to the new logo.
- [`07d-SCREENS-RESULTS.md`](07d-SCREENS-RESULTS.md) D11: the owner on every share.
- [`06-MOTION.md`](06-MOTION.md) §7: struck, with the reason.
