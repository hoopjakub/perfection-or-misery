# 04 · Languages: Slovak, natively

> Part of the [release set](00-README.md). Status: **decided** (the maintainer's answers in §4, 29 September 2026); nothing built.

The maintainer: "Add the Slovak language to the app, to the game itself, natively. Propose ways we can do it and let me answer them." And (website Q23): English and Slovak natively, every Slovak line through the humanizer and checked by him; other languages when players ask.

## 1 · How much text there is (measured 29 September)

| Kind | Size | Notes |
|---|---|---|
| Screen text written as plain literals (labels, titles, buttons, confirms, placeholders) | **about 800 strings in 76 files** (a scratch count of text between tags and in label-like props; template strings aren't counted, so the real number is higher) | The bulk of the work, and mechanical |
| The press (`src/engine/press.ts`, 642 lines) | Dozens of story templates built from fragments ("{club} and {other} meet…") | Hard: Slovak inflects names by case (Barcelona, Barcelony, Barcelone), so a template can't just drop a club name in |
| Commentary (`src/engine/commentary.ts`, 372 lines) | Event lines built from fields | Same problem, and runs every match |
| Pundits' lines, award explanations, tier names and lines (`src/data/tiers.ts`), the rulebook (`src/data/explainers.ts`), the guide, the version history | Prose | Needs a writer, not a translator |
| Numbers and dates | Everywhere | `Intl` already exists; Slovak uses a decimal comma and different ordinals ("21." not "21st") |
| Plurals | Everywhere a count appears | Slovak has **three** forms (1 gól, 2–4 góly, 5+ gólov); English has two |

## 2 · The ways to do it

### 2.1 The library

| Option | What it is | For | Against |
|---|---|---|---|
| **A · i18next + react-i18next + expo-localization** | The most used React translation stack, one of the libraries Expo's localisation guide lists | Plurals through `Intl.PluralRules` (Slovak's three forms), interpolation, namespaces per area, lazy loading, language switch at runtime, huge ecosystem (extraction tools, editors) | A dependency and a small runtime; keys in code (`t('draft.spin')`) |
| B · i18n-js + expo-localization | The lighter library Expo's guide uses in its example | Small, simple | Weaker plural and formatting support; less tooling |
| C · Lingui | Messages written in the code in English, extracted at build | Readable source, compile-time checks | A build step (Babel/SWC macro) in an Expo project that already has a careful Babel setup |
| D · Our own dictionary | A typed object per language, a `t()` of our own | No dependency | Plurals, interpolation and extraction all hand-made; this is the "reinventing" option |

**Recommendation: A.** Expo lists it; it handles Slovak plurals properly; it has the tooling to find untranslated strings.

### 2.2 How the language is chosen

| Option | Behaviour |
|---|---|
| **1 · Follow the phone, overridable in Settings** | First launch picks Slovak on a Slovak phone, English otherwise; Settings has *Language: System / English / Slovenčina*. Android 13+ can also set it per app from system settings (`supportedLocales` in the `expo-localization` plugin) |
| 2 · Ask on first launch | A one-time choice screen |
| 3 · Settings only | English until changed |

**Recommendation: 1.**

### 2.3 What gets translated

| Thing | Proposal |
|---|---|
| Every screen string | Yes |
| Tier names (PERFECTION, ABSOLUTE MISERY…) | Yes, but the name "Perfection or Misery" stays English (it's the brand). Proposed Slovak tier names are the maintainer's to write |
| Club, player and competition names | No (they're names); the legal build's altered names ([01](01-NAMES-MARKS-AND-THE-LAW.md)) get Slovak forms only if needed |
| Country names | Yes (Slovensko, Anglicko) |
| The press, the commentary | Yes, **rewritten as Slovak templates, not translated line by line**, because of case endings: templates avoid putting a club name where it would need a case other than the nominative ("Zápas: Barcelona – Real" rather than "proti Barcelone"), or carry the few case forms a line needs |
| The rulebook, the guide, the version history, privacy and terms | Yes; legal pages carefully (the Slovak version must say the same as the English) |
| Numbers, dates, ordinals | Through `Intl` with the language's locale |
| The website | Yes, the same two languages (website Q23) |

### 2.4 How the work is done
1. **Extract** every string into `en` keys, area by area (setup, season, results, clubs, the engine's writers last). The app stays English throughout; nothing changes for players.
2. **Write Slovak** per area: a first draft, then the humanizer skill in Slovak (its Slovak rules keep diacritics as the input has them and hold one register), then the maintainer's check.
3. **Ship per area** or all at once (§4, S5).
4. **A check that can fail:** a script that lists keys missing in `sk`, keys unused in code, and interpolation placeholders that differ between the two (a `{club}` in English with no `{club}` in Slovak).

## 3 · Risks

| Risk | Answer |
|---|---|
| Slovak text is longer and breaks layouts | The responsiveness pass (Phase 8.5) tests in Slovak too; supers already cap their scaling |
| The press reads badly because of case endings | Templates written for Slovak (§2.3), reviewed as prose |
| Strings added in English later and never translated | The missing-key check in CI; a string without a key fails the check |
| Two sources of truth for legal pages | The shared legal file ([`../website/05-OPEN-QUESTIONS.md`](../website/05-OPEN-QUESTIONS.md) Q25) holds both languages |

## 4 · The maintainer's answers (29 September 2026)

| # | Question | Answer |
|---|---|---|
| S1 | The library (§2.1) | **i18next** (with react-i18next and expo-localization) |
| S2 | How the language is picked (§2.2) | **Follow the phone, changeable in Settings:** *Language: System / English / Slovenčina* |
| S3 | Slovak tier and mode names | **I draft, he changes and gives feedback**, at build time, not now |
| S4 | Formal or informal | **Informal (ty)** |
| S5 | Area by area, or all at once | **All at once, in one release**, so nobody sees a half-Slovak app. Areas are still extracted and written one by one behind the scenes; the switch appears only when every area is done |
| S6 | Football terms | **The words Slovak TV commentators use.** At build time I collect them (from commentary and match reports, with where each was found) and show him the list; he gives feedback before any text uses them |
| S7 | Web build at the same time | **Yes** |
