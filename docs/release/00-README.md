# Release readiness: the plan for 1.0.0

> Written 29 September 2026 (evening). Status: **research and plan, nothing built.** No app code changed.
> Companions: [`../website/`](../website/00-README.md) (the site, Phase 10), [`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md) (Phases 8.5, 9, 10), [`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md).

## What this is

The maintainer's rule since 29 September: **1.0.0 is Phases 8.5, 9 and 10 plus finishing up.** Version 0.9.0 is built and installed. A public 1.0.0 raises questions the game never had to answer while it was for friends: what it may legally show, what happens to a run played offline, how an Android build that isn't on the Play Store updates itself, whether the database can be tricked by what a player types, and how the game speaks Slovak. This set answers each from the code and from primary sources where they exist, and marks what needs a lawyer or a device.

## The short version

| Question | Answer | Where |
|---|---|---|
| Can a public build show real club names, crests, competition logos and player names? | Logos and crests: no, not without licences. Names: grey, with real risk. Hence two build flavours, *personal* and *legal*, from one codebase | [01](01-NAMES-MARKS-AND-THE-LAW.md) |
| Is a run played offline saved when the phone is back online? | **No.** A save that fails is retried only while the result screen is open; leave it and the run is gone. The phone app can't even tell it's offline (only the web build can) | [02](02-OFFLINE.md) |
| Is the app safe from SQL injection? | Mostly, by construction; **three places build a query from a string** and are fixed early in Phase 8.5 | [03](03-INJECTION.md) |
| How does the game get Slovak? | Decided: i18next, follow the phone (System / English / Slovenčina), informal, all at once, web too; about 800 plain strings in 76 files plus the press and commentary writers | [04](04-LANGUAGES.md) |
| Can we keep the scraped data? | **No, replace it now.** Transfermarkt's terms forbid scraping, the database right and the GDPR add to it, and the web build is already public. Wikidata and openfootball (public domain) cover identity, squads and results; the rating becomes our own model. Transfermarkt gets a licensing enquiry for later | [06](06-OUR-OWN-DATA.md), [07](07-ASKING-TRANSFERMARKT.md) |
| How does a downloaded APK update? | Two layers: over-the-air JavaScript updates, and a "new build available" check that downloads the APK and hands it to Android's installer | [05](05-UPDATES-AND-THE-APK.md) |

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [Names, marks and the law](01-NAMES-MARKS-AND-THE-LAW.md) | What a public build may show, and the `personal`/`legal` build flavours |
| 02 | [Offline](02-OFFLINE.md) | What works offline, what's lost, the save queue and the offline mode |
| 03 | [Injection](03-INJECTION.md) | Where a query is built from text, and the fixes |
| 04 | [Languages](04-LANGUAGES.md) | Slovak natively: the options and the maintainer's questions |
| 05 | [Updates and the APK](05-UPDATES-AND-THE-APK.md) | Silent update checks, over-the-air updates, and the website download |
| 06 | [Data of our own](06-OUR-OWN-DATA.md) | Which free sources are usable (Wikidata, openfootball: public domain), and a rating model built from facts instead of market values |
| 07 | [Asking Transfermarkt](07-ASKING-TRANSFERMARKT.md) | The permission email, who to send it to, what each answer changes |
| 09 | [Guests, rethought](09-GUESTS.md) | What a guest costs today (an account per browser, the 30-an-hour limit, "Keep my runs" that keeps nothing) and three options; **decided: C** (no session until sign-up, the guest's runs kept on the phone), built in Phase 10.5 (9 Oct 2026) |

## Decisions taken (by the maintainer, 29 September)

- **1.0.0 = Phases 8.5, 9, 10 and finishing.** 0.9.0 is the current build.
- **Dark and light mode for the whole app**, like any other app: every component has both variants (decision D8 in [`../centralisation/10-PHASE-TWO-REVISED.md`](../centralisation/10-PHASE-TWO-REVISED.md)).
- **The logo's colours are the app's colours:** volt `#D5FF3F` and red `#E1141F`, the red's lower contrast accepted as the one exception.
- **English and Slovak, natively,** every Slovak line through the humanizer and checked by the maintainer; other languages when players ask.
- **Security and performance are day-one requirements; features aren't.**
- **A public build without licensed marks,** and a personal build with everything, chosen at build time.

In the roadmap as **P8.5-23 to P8.5-32** ([`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md) Phase 8.5, Part zero): the data (P8.5-32) first, then injection.

## How this was made

Code read on 29 September (`src/db/queries/*`, `src/lib/friends.ts`, `src/lib/versus.ts`, `src/hooks/useRunSave.ts`, `src/components/OfflineStrip.tsx`, `src/lib/brand.ts`, `eas.json`, `app.json`). Sources: EU trade mark regulation 2017/1001 (Article 14, referential use), the European Commission's IP helpdesk note on the Court of Justice's 2024 referential-use rulings, reporting on Manchester United's 2020 claim against *Football Manager*, Expo's localisation and EAS Update documentation, Vercel's community answers on `vercel.app` subdomains. **This set is not legal advice**; [01](01-NAMES-MARKS-AND-THE-LAW.md) says where a lawyer is needed.
