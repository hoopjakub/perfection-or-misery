# 01 · Names, marks and the law

> Part of the [release set](00-README.md). Status: **research**, 29 September 2026. **Not legal advice.** It sets out what's known, where the risk sits, and a build setup that lets the maintainer choose. Before a public release, a lawyer who knows EU trade mark and personality rights should read §5.

The maintainer (Q28): "names of competitions, logos of competitions, official names, names of clubs and crests of clubs: what can I and what can I not use. We are going for a full public build, meaning most probably crests and competition logos would need to be gone", with a build switch between a *legal* build and a *personal* one.

## 1 · What the game uses today

| Thing | Where it comes from | In every build? |
|---|---|---|
| Club crests (772 files; the `assets/crests` folder is 6.3 MB) | Downloaded from Transfermarkt's image host (`scripts/scrape-crests.ts`) | **Yes.** `src/lib/logoMap.ts` `require()`s every file, so Metro bundles them all even when `EXPO_PUBLIC_BRAND_MODE` isn't `real` and they're never shown |
| Competition logos (Champions, Europa, Conference League, five leagues) | Transfermarkt | Yes, same reason |
| Club names, player names, ages, positions, ratings | Transfermarkt scrapes, ratings computed | Yes, in the bundled database |
| Competition names ("UEFA Champions League"), the tier "Champions League" | Written in the code | Yes |
| Flags | Bundled flag images | Yes; national flags are generally free to use |
| The Kit Drop drawn crests | The game's own | The default when the brand mode isn't `real` (`src/lib/brand.ts`) |

**Finding:** the brand switch (P8-12) decides what's **shown**, not what **ships**. A build meant to carry no crests still carries every crest inside the APK and the web bundle.

## 2 · The law, as far as research can take it

**Trade marks.** Club names, crests and competition names and logos are commonly registered trade marks (UEFA's competition names and the starball, most clubs' names and crests). Under the EU trade mark regulation, a mark's owner can't stop a third party using it "for the purpose of identifying or referring to goods or services as those of the proprietor", but the Court of Justice has read that exception narrowly: it covers use necessary to indicate a product's intended purpose (the spare parts case), and the Commission's IP helpdesk summarised the 2024 rulings (Audi, Zara) in the same direction ([Regulation 2017/1001, Art. 14](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R1001); [EC IP helpdesk, Feb 2024](https://intellectual-property-helpdesk.ec.europa.eu/news-events/news/cjeu-rules-trade-mark-referential-use-exception-zara-and-audi-cases-2024-02-09_en)). A game using a club's crest as its crest isn't referring to the club's products; it's using the mark as part of its own. That's the use the owners license to EA and others.

**The nearest real case.** In 2020 Manchester United claimed against Sports Interactive and Sega that *Football Manager* used its name and a simplified version of its crest without a licence ([reporting](https://www.si.com/soccer/2020/05/22/manchester-united-sues-football-manager-video-game)). That game has licences for much of its content and still drew a claim over a *simplified* crest. The outcome wasn't researched this session; the claim itself is the point.

**Crests and logos are also artworks,** protected by copyright independently of trade mark registration. Downloading them from Transfermarkt doesn't grant a licence to redistribute them.

**Player names and likenesses.** In several EU countries a person's name and image in a commercial product are protected by personality or image rights; football games license them collectively through players' unions (FIFPRO) and leagues. The game shows names, not faces, which lowers the risk but doesn't remove it.

**The data itself.** The game's squads, ages and positions are a scrape of Transfermarkt, whose Terms of Use (§11.1) forbid access or copying by bots and screen scraping. Add the EU database right and the GDPR, and **the data is replaced now**: [06](06-OUR-OWN-DATA.md) §1 (the law, researched 29 September evening) and §4 (the open-data plan).

**What's generally safe:** national flags; factual references in text ("inspired by European club football"); the game's own drawn marks; fictional names.

## 3 · Where the line sits, in practice

| Element | Risk in a public build | Why |
|---|---|---|
| Competition logos | **High** | Registered marks and artworks; no referential need |
| Club crests | **High** | Same; *Football Manager*'s claim was over a simplified crest |
| Official competition names ("UEFA Champions League") | High | Registered word marks, used as the name of a mode |
| Descriptive names ("the European Cup", "the Champions League" as plain words) | Medium | Still close to the marks |
| Club names | **Medium to high** | Registered word marks; the main thing a licence buys |
| Player names | Medium | Personality rights; unlicensed games use altered names |
| Stats, ages, positions | Low to medium | Facts, but the database right and scraping terms apply |
| Flags, drawn crests, fictional names | Low | |

Football games without licences have historically handled this with **altered names** ("Man Red", fictional player names) and **editable names** that players replace themselves, for exactly these reasons. That's a design question, not only a legal one: the game's appeal is real club-seasons.

## 4 · The build flavours

The maintainer proposed `eas build --profile development -p android --legal legal`. EAS has no custom flags, but **build profiles** do the same job: each profile in `eas.json` sets its own environment variables, and a profile can `extends` another.

| Profile | Brand | What ships | Who it's for |
|---|---|---|---|
| `personal` (development, preview, production variants) | `EXPO_PUBLIC_BRAND_MODE=real` | Everything, as today | The maintainer, friends, the maturita panel |
| `legal` (preview, production variants) | `EXPO_PUBLIC_BRAND_MODE=original`, `EXPO_PUBLIC_NAMES=…` (§5) | No crest or competition logo files at all; names per §5 | The public: the website's download, the Play Store, the web build |

So the command becomes `eas build --profile production-legal -p android` or `eas build --profile production-personal -p android`.

**Two things the code needs, so a legal build really is one:**
1. **Crests out of the bundle, not just off the screen.** `logoMap.ts` is generated (`scripts/scrape-crests.ts` writes it). Generate two versions, and pick one at bundle time: a Metro resolver alias on the profile's variable, so the legal build's `logoMap` has no `require()`s and the images never enter the APK. The check that proves it: unzip the legal APK and count `.png` files under the crest path (expect zero), and the web build's bundle has no crest images.
2. **One source for names.** Club and competition names shown on screen go through one function (like crests go through `crestFor`), so the legal flavour can swap them.

The web build (Vercel) is public by definition, so it builds as `legal`.

## 5 · Questions for the maintainer (and a lawyer)

**All five answered by the maintainer, 29 September 2026.**

| # | Question | Answer |
|---|---|---|
| L1 | Public builds: real club names, altered names, or names the player can edit? | Real names in the personal flavour; **the legal flavour keeps real names only after a lawyer says so**, otherwise altered names. The maturita presentation uses the personal build. Research how 38-0 does it (§5.1), without changing this plan |
| L2 | Competition names in the legal flavour | Plain descriptive names: "European Cup", "Europa Cup", "Conference Cup", and "World Cup" or "Nations Cup" ("World Cup" is a common noun; "FIFA World Cup" isn't) |
| L3 | Player names in the legal flavour | As L1 |
| L4 | The scraped data (squads, ratings) in a public build | **Revised the same evening: replace it now** with public-domain data and a rating of our own ([06](06-OUR-OWN-DATA.md)); send Transfermarkt a forward-looking licensing enquiry ([07](07-ASKING-TRANSFERMARKT.md)) |
| L5 | The maturita presentation | Was: the personal flavour on the maintainer's phone. **The legal side is one big part of the presentation** ([`../maturita/06-NOTES.md`](../maturita/06-NOTES.md)). **Decided 29 Sept: presented on the open-data build** ([06](06-OUR-OWN-DATA.md) §5.1) |

### 5.1 How 38-0 does it (research only; the plan above stands)

38-0 ([38-0.app](https://38-0.app/), the game PoM credits as its inspiration), read 29 September 2026:

- **Real player and club names, text only.** Its footer and terms say it uses no official logos, crests, player images, likenesses or other official branding, and that clubs, players and seasons are referred to descriptively and don't imply any official association.
- **An independence statement:** a fan-made game, not affiliated with, endorsed, sponsored or licensed by any league, club, governing body or ratings provider; all trade marks remain their owners'.
- **Ratings are its own:** described as an independent interpretation of publicly available data, for descriptive purposes, which may differ from any official source.
- **No formal takedown process** in its terms; complaints go to a support address, and it reserves the right to change or remove any name.

**What that tells us:** 38-0's approach is the same line this document draws (no crests, no logos, no faces, a clear disclaimer, their own ratings). It keeps real names **on the risk side of that line**, as the unlicensed games before it did. That's a business risk it has chosen, not proof that it's allowed; nothing public says whether it has been challenged. So the plan doesn't change: the legal flavour keeps real names only once a lawyer says so. Worth copying from 38-0 regardless: the **disclaimer text** (in PoM's own words) on About, the website footer and the terms, and a **name-removal path** (a request through the questions page) in the terms.

**Questions to take to a lawyer:** referential use for club names in a game; the *Football Manager* claim's outcome; personality rights in Slovakia and the EU for names without images; the database right for scraped squads; whether a free, ad-free game changes the analysis.

### 5.2 Decided 30 September 2026: what each flavour shows

| | Personal ("presentation / friends") | Legal (public: web, APK download, Play) |
|---|---|---|
| Club crests | Yes | **None at all**: not hidden, not shipped; the drawn marks only |
| Competition logos | Yes | None |
| Competition names | Real ("UEFA Champions League") | The generic names of L2 ("European Cup", "Europa Cup", "Conference Cup", "World Cup"/"Nations Cup") |
| League names | Real | Generic (still to write, in the L2 style: "the English top flight"…) |
| Club and player names | Real | Altered unless a lawyer clears real ones (L1); **the altered-name tables aren't written yet** |
| Player data | The open data (both flavours: the Transfermarkt database is gone from the app) | The same |

### 5.3 As built (1 October 2026)

| Piece | How |
|---|---|
| Which flavour | `EXPO_PUBLIC_BRAND_MODE`: `real` is personal, anything else legal. EAS: `preview` and `production` are legal, `preview-personal` / `production-personal` personal, `development` personal. The public web build is forced legal in `vercel.json` |
| Crests and competition logos | `metro.config.js` resolves `brand.ts`'s `./logoMap` to `logoMap.legal.ts` (empty) in the legal build: a legal web export has **0** crest files, a personal one **780** |
| Names in the app's text | `scripts/babel-legal-names.js` rewrites our own string literals, template text and JSX text with the table in `src/data/legal-names.js` (never comments, never the table itself) |
| Names in the data | `npm run build-db` writes `assets/db/players_legal.db` beside `players_v5.db` (leagues by country, "England League"; the four competitions by L2), and Metro bundles it instead in the legal build (`src/db/dbAsset.legal.ts`) |
| Names stored as text | `club_facts.json` (JSON, which Babel never sees) and `runs.league_name` from Supabase (written by both flavours) are renamed on read: `src/lib/clubFacts.ts`, `src/lib/shownNames.ts` |
| Check | `scripts/verify-legal-build.ts` (the legal database, the empty logo map, the swaps, the plugin on a sample and on its own table) |
| Not yet | The altered club and player names (tables to draft for the maintainer), and the independence disclaimer (§5.1). Switching flavour locally needs `npx expo start --clear` |

## 6 · Steps (Phase 8.5, early)

1. Two `eas.json` profiles per build type (`-personal`, `-legal`) with the brand variable.
2. Two generated `logoMap` files and the resolver alias; the APK check above.
3. One name function for clubs and competitions; the legal flavour's name table (the L2 competition names now; altered club and player names unless a lawyer clears real ones).
4. An independence disclaimer (§5.1) on About, the website footer and the terms, in English and Slovak.
5. The web build set to `legal`.

**Done when.** The legal APK contains no crest or competition-logo image (checked by unzipping), shows no official competition name, and the personal APK is unchanged.
