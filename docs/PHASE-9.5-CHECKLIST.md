# Phase 9.5 · The check-everything list

*Started 1 October 2026.* From Wave D on, the maintainer stopped making native builds for each wave (each one costs a free EAS build and about two hours). Features are built, typechecked and, where possible, verified by scripts; the maintainer tests on the **web** as he goes. Everything he hasn't seen working goes **here**, with its wave and date, and Phase 9.5 (after Phase 9) is going through this list on a phone and fixing what doesn't work.

**How to read it.** Each row is one thing to check. *Where* says what you need to see it:
- **web**: the web build (`npm run web`) shows it. You may already have checked it; tick it.
- **native**: only a phone build shows it (a native module, Android behaviour, the installer).
- **SQL**: needs a Supabase file run first (listed in *Before you start*).

*Status* starts at **unchecked**. You set it to **works**, **broken: …** or **partly: …**; Phase 9.5 fixes everything that isn't **works**.

**The rule for me (Claude):** every feature or fix I build from now until Phase 9 gets a row here in the same turn, and my report says that it was added, which wave, and the date.

## Before you start

| Done? | What | Why |
|---|---|---|
| ☐ | Run `supabase/runs-queue.sql` | The offline queue (P8.5-24) |
| ☐ | Re-run `supabase/clubs-2.sql` | Club scores (P8.5-45) |
| ☐ | Run `supabase/moderation.sql`, then `supabase/moderation-words.sql` (after `clubs-2.sql`) | Moderation (P8.5-44) |
| ☐ | Redeploy the `submit-run` edge function | The queue's `client_id` and `played_at`, bans, hunting |
| ☐ | A native build (any profile) | Every **native** row: it adds expo-system-ui, expo-network, expo-updates, expo-application, expo-intent-launcher, expo-crypto, and `userInterfaceStyle: automatic` |
| ☐ | `npx expo start --clear` once | DB version 20 and the Metro swaps |

## Carried from earlier waves (they need the native build)

| # | Wave · date | What to check | Where | Status |
|---|---|---|---|---|
| C-1 | C · 1 Oct | **System appearance follows the phone.** Settings → Appearance → System: switch the phone between dark and light; the app follows on the next open (it was stuck dark: `app.json` had `userInterfaceStyle: dark`) | native | unchecked |
| C-2 | C · 1 Oct | **No dark flash between screens in light mode** (P8.5-38): the frame after the pundits' Play, and the window behind every screen at start-up, are light in light mode | native | unchecked |
| C-3 | C · 1 Oct | **Achievement toasts** (P8.5-36) slide down at the top on a phone, in both modes, once per achievement | web, native | unchecked |

## Wave D · Release plumbing (built 1 October 2026)

### P8.5-24 · Offline

| # | What to check | Where | Status |
|---|---|---|---|
| D-1 | Finish a run with the network off: the result says it's **queued**, not failed | web (devtools → Network → Offline), native (flight mode) | unchecked |
| D-2 | Turn the network back on: the run saves by itself within a few seconds, the result flips to **saved**, and it appears **once** in Runs (no duplicate) | web, native | unchecked |
| D-3 | Close the app while a run is queued, reopen online: it's sent on start | native | unchecked |
| D-4 | The queued run's date in Runs is when you **played** it, not when it was sent | web, native | unchecked |
| D-5 | Offline, the strip says so with the queue count; Ranks, Clubs, chat, Friends and profiles say they need a connection; Sign in and Make an account say "You're offline" | web, native | unchecked |
| D-6 | Signed in as one account with a queued run, switch to another: the run is **not** sent under the second account | web, native | unchecked |

### P8.5-29 · One legal file

| # | What to check | Where | Status |
|---|---|---|---|
| D-7 | Privacy and Terms open, read right, and include the new sections (clubs, offline queue, updates, names and reports) | web | unchecked |

### P8.5-31 · Updates and the APK

| # | What to check | Where | Status |
|---|---|---|---|
| D-8 | **Appearance switches at once:** changing Settings → Appearance reloads the app into the new look straight away, not on the next launch | native (web reloads too: check it there as well) | unchecked |
| D-9 | **Over-the-air update:** publish one (`eas update --channel <profile>`), reopen the app twice; it runs the new JavaScript | native | unchecked |
| D-10 | **New build offered:** put a `latest.json` with a higher build on the site (`scripts/release-latest.ts`); a legal Android build shows the update strip on Home | native | unchecked |
| D-11 | Tapping it downloads the APK from the releases repo with progress, checks its SHA-256, and opens Android's installer (Android asks to allow installs from this app the first time) | native | unchecked |
| D-12 | A `latest.json` with a wrong `sha256` is refused, nothing is installed | native | unchecked |
| D-13 | `minBuild` above yours makes the strip say the update is required | native | unchecked |

### Altered names (P8.5-30's last part)

| # | What to check | Where | Status |
|---|---|---|---|
| D-14 | The public (legal) build shows the altered club and player names from `scripts/legal-names/*.csv` everywhere: draft, tables, brackets, match sheets, results, Runs | web (the deployed site, or `npm run web` without `EXPO_PUBLIC_BRAND_MODE=real`) | club names reviewed 1 Oct: work |
| D-15 | Stadiums read "<city> Stadium", club facts are off, the holders of each European cup still show | web | unchecked |
| D-16 | The personal build still shows the real names | web (`EXPO_PUBLIC_BRAND_MODE=real`) | unchecked |

### P8.5-44 · Moderation (see [`MODERATION.md`](MODERATION.md))

| # | What to check | Where | Status |
|---|---|---|---|
| D-17 | Making an account with a swear in the name (try "f4ck", "Lafuckda", "kokot") is refused with one of the lines; the account is **not** half-made (you can still sign up with a clean name) | web, SQL | unchecked |
| D-18 | Slovak lines when the phone or browser is in Slovak ("A ty tu čo skúšaš, môj?") | web (browser language sk), SQL | unchecked |
| D-19 | Club name, tag or description with a swear: refused with a line | web, SQL | unchecked |
| D-20 | Profile status, pronouns, about, favourite player with a swear: refused with a line | web, SQL | unchecked |
| D-21 | Real names pass: Scunthorpe, Montenegro, Picasso, a real footballer as your favourite | web, SQL | unchecked |
| D-22 | Club chat with clean language on: "what the fuck" becomes "what the fudge", "kurva" becomes "kukurica", no line under it; with clean language off it's left alone | web, SQL | unchecked |
| D-23 | "IslamHater2121" as a username is **allowed**, and appears in `select * from mod_inbox();` | web, SQL | unchecked |
| D-24 | **Report:** the quiet button at the foot of someone's profile and of another club; pick a reason, send, "Thanks"; it shows in `mod_inbox()` with your reason | web, SQL | unchecked |
| D-25 | `mod_act(id, 'rename')` on a player: their name becomes "player-…", the You tab asks them for a new one, and the new name saves | web, SQL | unchecked |
| D-26 | `mod_act(id, 'ban')`: the You tab says banned; runs don't save; chat, joining clubs and reporting refuse | web, SQL | unchecked |

### P8.5-45 · Clubs

| # | What to check | Where | Status |
|---|---|---|---|
| D-27 | Invite by username suggests players after 3 letters, about half a second after you stop typing | web | unchecked |
| D-28 | An error clears as soon as you change what caused it | web | unchecked |
| D-29 | The loading bar shows at the top while club screens load | web | unchecked |
| D-30 | In another club, every place you could join a second says one club at a time | web | unchecked |
| D-31 | In a club, the Clubs tab **is** your club (no separate page); joining or creating stays on the tab | web | unchecked |
| D-32 | A club's score shows on its page and in search | web, SQL (clubs-2 re-run) | unchecked |
| D-33 | Creating a club sets who can join (open, invite, password) and clean language; Edit the club holds those, Invite, Hand it over, and a **red** Delete the club | web | unchecked |

### Wave C's playtest notes, the small ones

| # | What to check | Where | Status |
|---|---|---|---|
| D-34 | P8.5-46: Ranks says **Weekly** | web | unchecked |
| D-35 | P8.5-47: the You page's greeting stays the same until you close the app | web, native | unchecked |
| D-36 | P8.5-48: sub-pages (Versions, About, Settings, Friends, Edit profile, Achievements, Career, the crest editor, the Guide) have their title centred in the back arrow's row | web | unchecked |
| D-37 | P8.5-49: mode names stay whole after tapping a mode (ALL TIME, EUROPEAN FULL PATH) | native (it was an Android measuring fault; check web too) | unchecked |
| D-38 | P8.5-50: a two-legged tie opened from a result's bracket can switch between both legs | web | unchecked |

## Wave E · Slovak (1–2 October 2026)

Finished 2 October: every screen is on keys and the switch now shows in every build (`EVERY_SCREEN_MOVED = true` in `src/i18n/index.ts`). E-1 to E-12 were added 1 Oct, E-13 onward 2 Oct. To check the engine's words without the app: `POM_LANGUAGE=sk EXPO_PUBLIC_DEV_TOOLS=1 npx tsx scripts/verify-press.ts` (also commentary, schedule; add `SAMPLE=1` to verify-press to read one story of each kind).

| # | What to check | Where | Status |
|---|---|---|---|
| E-1 | Settings → Language shows System / English / Slovenčina (dev only for now); choosing one reloads the app in that language | web (dev) | unchecked |
| E-2 | **System** follows the browser's or phone's language: Slovak (or Czech) gets Slovak, anything else English | web (browser language), native | unchecked |
| E-3 | The language survives closing and reopening the app | web, native | unchecked |
| E-4 | Slovak counts read right: 1 člen, 2 členovia, 5 členov; 1 hra, 2 hry, 5 hier (Clubs, the offline strip) | web | unchecked |
| E-5 | Ordinals in Slovak are "21." (World rank on You, a profile, Friends) | web | unchecked |
| E-6 | Numbers in Slovak use a space for thousands (12 345) in club scores and pinned runs | web | unchecked |
| E-7 | In Slovak, these are fully Slovak: Settings (but the European target lines, waiting for the terms), sign-in and new account, You, a player's page (but tiers and run labels), Edit profile, Clubs (tab, page, form, chat), Friends, Report, New name, the offline and update strips, confirmations, the tab bar | web | unchecked |
| E-8 | A refused name in Slovak gets a Slovak line ("A ty tu čo skúšaš, môj?") | web, SQL | unchecked |
| E-9 | Privacy and Terms in Slovak, dated "1. októbra 2026" | web | unchecked |
| E-10 | **Slovak plurals on the phone.** Hermes may not have `Intl.PluralRules`; a small fallback handles en and sk. Check E-4 on the phone | native | unchecked |
| E-11 | **The phone's language on the phone.** System reads it through `Intl`, not expo-localization (no native module added). Check E-2 on the phone | native | unchecked |
| E-12 | Changing the language on the phone reloads at once (it uses the appearance reload, so it needs expo-updates from Wave D) | native | unchecked |
| E-13 | Settings → Language now shows in a normal (non-dev) web build too | web | unchecked |
| E-14 | In Slovak, every screen of a run is Slovak: mode select, difficulty, formation, draft, the draw and globe, the pundits, the season and knockouts, the live match and the final, Awards Night, the verdict and every result screen (league, CL, full path, World Cup) | web | unchecked |
| E-15 | The match sheet in Slovak: tabs, every stat name, lineups, the player sheet, the timeline breaks, the shot map and heat map, the penalty shoot-out, form and next match | web | unchecked |
| E-16 | The engine's labels read Slovak wherever they show: "3. kolo", "Osemfinále · Odveta", "Skupina B · 2. kolo", qualifying rounds, cup rounds, "pen." and "pp" | web | unchecked |
| E-17 | The press in Slovak: headlines, standfirsts and the opened story; names stay as written ("Debakel: Arsenal"), never declined, never gendered | web | unchecked |
| E-18 | Commentary in Slovak, live (Deep Match final) and on the sheet's Comms tab, including VAR, fouls and the added-time boards | web | unchecked |
| E-19 | Kick-off dates in Slovak ("So 23. aug · 15:00") on the match sheet and fixtures | web | unchecked |
| E-20 | National teams and countries in Slovak (Brazília, Anglicko, Južná Kórea) in tables, results, brackets, the match sheet, the reveal and the pundits; flags still show beside them. Saved runs and the leaderboard keep the English names on purpose | web | unchecked |
| E-21 | Awards in Slovak: every award's name and how it's decided, the score breakdown rows, team of the season or tournament | web | unchecked |
| E-22 | The run hub, player, club and story pages, career, achievements (feats too), the guide, the rulebook and "How it works" bubbles, About, versions (the history has its own Slovak text), the crest editor | web | unchecked |
| E-23 | Achievement toasts in Slovak ("Výhra na úrovni Ťažká"); one already seen in English doesn't pop up again in Slovak (the keys stayed English) | web | unchecked |
| E-24 | Seasons, ranks and the 100 season names in Slovak | web | unchecked |
| E-25 | The legal build in Slovak: competition names still renamed (the Babel table has Slovak pairs) | legal web build | unchecked |
| E-26 | English got gender-neutral on the way ("they" where it said "he" about a player, "The season" for "His season"): read a few player pages and award notes in English too | web | unchecked |

## Wave G · Step 0 (2 October 2026)

The audit's quick fixes ([`audit-2026-10/09-ROADMAP.md`](audit-2026-10/09-ROADMAP.md), [`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §2).

| # | What to check | Where | Status |
|---|---|---|---|
| G-1 | On every result screen (league, Champions League, World Cup, full path) **Play again and Home sit right under the verdict and its figures**, not at the bottom; the save line ("Saving your run…") shows with them | web | unchecked |
| G-2 | A saved run opened from Runs shows **Back** in the same place | web | unchecked |
| G-3 | The pundits screen in Slovak writes places as "3." (it said "3rd") | web | unchecked |
| G-4 | Shirt names keep their particles: "van Dijk", "De Bruyne", "de Ligt" on the draft card, the reveal's steal line, the shot map's dots and the awards pitch | web | unchecked |
| G-5 | The guide's difficulty page says Medium leans slightly against you (both languages) | web | unchecked |
| G-6 | Nothing missing after the dead code went: a classic Champions League and a World Cup result screen still show their bracket and tables | web | unchecked |
| G-7 | **Maintainer action (M-1):** open the production site and move between two pages, then tell me; I re-run the page-view query to see whether analytics arrives | production web | unchecked |
| G-8 | After the next deploy, the database under `/assets/` is cached for a year (`curl -I` shows `immutable`) | production web | unchecked |

## Phase two · Step 1 (3 October 2026)

Team marks, grounds and the leftovers the new capitals check found ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §3).

| # | What to check | Where | Status |
|---|---|---|---|
| S1-1 | The match sheet shows each side's **mark beside its name** everywhere it names a side: the header, the top bar once you scroll, the lineups, the stat headers, top rated, the shootout's columns, form, next match and the bracket. A club shows its crest (it showed nothing before), a nation its flag, your side your own crest | web | checked (maintainer, 3 Oct) |
| S1-2 | The live final's two finalists show their crest or flag | web | checked (maintainer, 3 Oct) |
| S1-3 | The World Cup draft's spin card and the World Cup reveal still show the nation's flag | web | checked (maintainer, 3 Oct) |
| S1-4 | A Europa League or Conference League run (classic or full path) wears **its own colour**, orange or green, not the Champions League's blue: the classic screen, the qualifying ladder, the `?` bubbles, the live final | web | checked (maintainer, 3 Oct) |
| S1-5 | **Sign-in and new account on Android: the keyboard no longer covers the fields** (one `KeyboardSafe` with the chat's fix) | native | checked (maintainer, 3 Oct) |
| S1-6 | A flag with no image shows a three-letter code in its circle; a screen reader says the whole name | web, native (TalkBack) | checked (maintainer, 3 Oct) |
| S1-7 | Slovak, the bits Wave E missed: the qualifying ladder ("VÍŤAZI DO 2. PREDKOLA", "3 DVOJZÁPASY", POSTUP / KONIEC), the draft's VÝMENA / LAVIČKA, PENALTY on the live shootout, SÚČET on a second leg, SKUPINY on the venue map, SKRYŤ / UKÁZAŤ, ZAP. / VYP., the profile badge's SEZÓNA n and ÚČASŤ, "TVOJA HRA" / "HRÁ", the graphs' NAJLEPŠIE / NAJHORŠIE, NAŽIVO on a live bracket, KONIEC after a shootout in the feed, the points tag on a story, TY on a default crest | web | checked (maintainer, 3 Oct) |

## Phase two · Step 2 (3 October 2026)

Engine helpers, the ratings fix and one strength scale ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §4, [`audit-2026-10/02-LOGIC.md`](audit-2026-10/02-LOGIC.md) §3).

| # | What to check | Where | Status |
|---|---|---|---|
| S2-1 | **Strength feels right.** A league run with an elite draft (XI around 88–90) now fights for the title; a modest one (around 78) fights relegation. Measured: an XI of 90 wins its league 63% of the time (was 22%), an XI of 86 finishes 5th on median (was 7th), an XI of 78 finishes 18th (was 17th) | web, native | checked (maintainer, 3 Oct) |
| S2-2 | **The database re-copies** (`DB_VERSION` 21): club ratings in the draft and placement are new, e.g. the 2024 Premier League runs 81–91 (it was 80–94) | native (installed build), web | checked (maintainer, 3 Oct) |
| S2-3 | Slow, Normal and Fast play at the **same pace** in a league season, the classic cups and the full path (the full path's Normal was 900 ms, now 400) | web | checked (maintainer, 3 Oct) |
| S2-4 | A **brace in a defeat** reads as a good game (around 8 or more), and wins man of the match more often than not when it's the match's top score | web | checked (maintainer, 3 Oct) |
| S2-5 | Tables with **level points** order the same way on every screen (league, Champions League phase, World Cup groups, the run hub): points, goal difference, goals scored | web | checked (maintainer, 3 Oct) |
| S2-6 | Labels on club colours (crests' initials, kit tags, profile) stay **readable** on light and dark kits | web | checked (maintainer, 3 Oct) |
| S2-7 | The pundits' **expected points** still look plausible next to the final table | web | checked (maintainer, 3 Oct) |

## Phase two · Step 3 (3 October 2026)

The stage model: one way to open a match sheet, one tie row, the full path's season kept ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §5).

| # | What to check | Where | Status |
|---|---|---|---|
| S3-1 | **Full path:** a domestic or league-phase match sheet shows the table as it stood, both sides' form and the next match (it showed none of them) | web | checked (maintainer, 3 Oct) |
| S3-2 | **Full path, substitutes on:** a knockout tie's sheet and the live final show your substitutes coming on, the same as the result screen's copy | web | checked (maintainer, 3 Oct) |
| S3-3 | Tie rows and bracket cards read the same everywhere: both legs from the left-hand side's view, then AET and "pens 4–3". A **qualifying** tie's second leg now reads that way too. In Slovak: "pp" and "pen. 4–3" | web | checked (maintainer, 3 Oct) |
| S3-4 | Classic Champions League result: a league-phase game opened from a sheet's form rows shows a **league-phase date**, not a domestic one | web | checked (maintainer, 3 Oct) |
| S3-5 | A live two-legged Champions League tie opens with the competition's form, bracket and next match (it had a one-tie bracket) | web | checked (maintainer, 3 Oct) |
| S3-6 | **Full path:** your domestic season counts in the run: player pages, the game log, the teams of the matchday and the season totals include the league games. The European awards don't change | web | checked (maintainer, 3 Oct) |
| S3-7 | A cup tie's sheet shows its own small bracket; a two-legged cup semi-final still switches between legs | web | checked (maintainer, 3 Oct) |
| S3-8 | The maintainer's check from the plan: a match sheet opened from the full path's league phase shows the same lineup as the run hub's copy of that match | web | checked (maintainer, 3 Oct) |

## Phase two · Step 4 (3 October 2026)

The live screens on shared parts: one header, one abandon, one speed, one control row, the World Cup and the full path brought level, your match live everywhere ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §5). Decisions on their defaults: your match live everywhere and Fast skips to the card (D2); a stage starts on a tap (D5); one speed setting (D7).

| # | What to check | Where | Status |
|---|---|---|---|
| S4-1 | **The stage strip.** In a Champions League, Europa League, Conference League or World Cup run the pundits screen says "6 TOURNAMENT" (it said Season, then Tournament one tap later). In Chaos and Cursed every screen marks stage 2 as set | web | checked (maintainer, 3 Oct) |
| S4-2 | **Abandon.** The full path has the X in its header on every phase after setting up, and it asks first. The league season's confirm now reads like every other ("Everything played so far is lost…"). Tapping Back on the confirm keeps you in the run | web, native (Back) | checked (maintainer, 3 Oct) |
| S4-3 | **The full path's header** is the run's six-stage strip with its road under it (domestic, the other leagues, qualifying, league phase, knockouts). Its tape is orange in a Europa League run and green in a Conference League run (it was always blue) | web | checked (maintainer, 3 Oct) |
| S4-4 | **Speed chips** on the league season, the Champions/Europa/Conference League phase, the World Cup groups and the full path's domestic season and league phase. The Champions League and World Cup were locked to slow. The choice carries to the next stage and the next run, and survives closing the app. A first run starts on Normal | web, native (kept after restart) | checked (maintainer, 3 Oct) |
| S4-5 | **World Cup groups:** the matchday strip can be tapped to look back, with a back-to-live tag; a standing figure with up/down movement; a team of the matchday under the results; your match as a scoreline card after it's played | web | checked (maintainer, 3 Oct) |
| S4-6 | **Full path:** the standing figure in the domestic season and the league phase shows the move since the last matchday | web | checked (maintainer, 3 Oct) |
| S4-7 | **A Fixtures tab** on every table and group stage (league season, league phase, World Cup groups, full path domestic and league phase): your matches with dates, results filled in as they're played. In Slovak the tab is "Rozpis" | web | checked (maintainer, 3 Oct) |
| S4-8 | **Your match plays live** at Slow and Normal in the league season, the league phase and the full path's two stages (it arrived as a finished card). Until it ends, nothing gives the score away: the table, the other results, the form strip, the press ticker and your standing wait | web | checked (maintainer, 3 Oct) |
| S4-9 | **The last matchday:** "See the verdict" / "To the knockouts" / the knockout draw appear only once your last match has finished | web | checked (maintainer, 3 Oct) |
| S4-10 | **Fast** skips your match straight to the card, on every stage including the World Cup groups; switching to Fast mid-match jumps to the card. Pause stops a live match; Skip ends it with the rest | web | checked (maintainer, 3 Oct) |
| S4-11 | Looking back at an earlier matchday while your match plays doesn't restart it; it carries on when you go back to live | web | checked (maintainer, 3 Oct) |
| S4-12 | A red card shown in a live match names the same player the match sheet does (the World Cup's live reds could differ) | web | checked (maintainer, 3 Oct) |
| S4-13 | **Wide window** (desktop browser): the full path's domestic season and league phase show their panes side by side; every knockout (Champions League, World Cup, full path) shows the bracket beside the rounds, with no See-the-bracket button | web (wide) | checked (maintainer, 3 Oct) |
| S4-14 | After the pundits, a **league season waits for your first tap**, like the cups (it started on its own) | web | checked (maintainer, 3 Oct) |

## Phase two · Steps 5 and 4b (3 October 2026)

One knockout view, one table-stage view, one matchday loop, one way a result goes into the table ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §5).

| # | What to check | Where | Status |
|---|---|---|---|
| S5-1 | **The full path's knockouts** look and behave like the classic Champions League's: the bracket preview, newest round on top, your tie live, the back-to-newest tag, the skip to the end of your run, the Deep Match final, See the bracket. The play-off round has its `?` bubble in the classic mode too now | web | unchecked |
| S5-2 | **One pace through the knockouts:** in the full path the next round opens 1.6 s after your match (it was 2.2 s) and on each round's own delay otherwise (it was 4.2 s) | web | unchecked |
| S5-3 | **Team of the round** under every knockout round once it's settled (Champions League, World Cup, full path), never over a final you haven't watched yet | web | unchecked |
| S5-4 | **The pundits' line** ("8 of 12 back …") above your live match in the league season, the league phase, the World Cup groups and the full path's domestic season, as in the knockouts | web | unchecked |
| S5-5 | **The live bracket** (See the bracket, or beside the rounds on a wide window) writes AET and penalties the way the tie rows do, in Slovak too ("pp", "pen. 4–3"), with both legs | web | unchecked |
| S5-6 | **The full path's domestic season** waits for your first tap after the pundits, like every stage | web | unchecked |
| S5-7 | **Every table and group stage looks the same in its parts** (the line under the header, where you stand, the strip, your match, the tabs) and on a desktop browser **Space plays and pauses, ← → scrub the matchdays**, on all five (only the league season had the keys) | web (keys on desktop) | unchecked |
| S5-8 | **Nothing changed in how seasons play:** tables, form and results behave as before in every mode (the table update and the matchday timer are now one shared piece each); a season of each mode played through, including a split league in the full path | web | unchecked |
| S5-9 | **Out of Europe on the full path** (qualifying exit, or never qualified): the result screen still shows the competition played out and the other two competitions, and the run is tiered as before | web | unchecked |

## Phase two · Step 6 / Wave F (3 October 2026)

One result screen for every mode, the depth in the run hub ([`audit-2026-10/08-RESULT-PAGES.md`](audit-2026-10/08-RESULT-PAGES.md) §6).

| # | What to check | Where | Status |
|---|---|---|---|
| S6-1 | **League result** (League, All Time, Chaos, Cursed): the verdict, one row of figures, "The story" (1–3 rows), "The rest of the run" doors. On a phone, Play again and Home sit in a bar pinned to the bottom and nowhere else; Chaos and Cursed keep their banner | web + phone width | unchecked |
| S6-2 | **Champions, Europa and Conference League (classic)** finish on the same screen: league-phase place, points, record, goals, knockout record, pot; the pundits' call against how far you got | web | unchecked |
| S6-3 | **World Cup** finishes on the same screen: group place, games, record, goals, knockout record; the meta line names your nation and group | web | unchecked |
| S6-4 | **Full path**: the verdict says how you got in (or where you went out), the hunt line when hunting, your domestic season under the title; a run that never reached the league phase shows the domestic record as its figures | web | unchecked |
| S6-5 | **The story rows open what they name:** the deciding match or final opens its match sheet, the star opens the player page, the rival opens the club page, a headline opens its story | web | unchecked |
| S6-6 | **The one that got away:** the best player you passed on in the draft shows as a story row on the result (new runs only) | web | unchecked |
| S6-7 | **Every door lands on its hub tab:** Table/Group, Bracket, Season, Cup, Pundits, Awards (opens the awards page, no ceremony), Squad, Europe | web | unchecked |
| S6-8 | **The hub's new tabs:** Pundits (league and cups), Cup (a league run's national cup), Europe (the full path's other competitions, ladder and tables); each appears only when the run has it | web | unchecked |
| S6-9 | **Squad tab** opens on the lineup pitch (with bench) and the medical table; **Bracket** on a World Cup shows the grounds | web | unchecked |
| S6-10 | **Saving:** a fresh run shows saving, then saved (or the failure line with retry); Play again waits for the save; a guest or quick-sim run never saves | web, signed in and guest | unchecked |
| S6-11 | **Saved runs** from Runs, Home, Ranks, Career and a profile all open on the same screen with the right family; an old cup run saved without its whole result shows its verdict and record only | web | unchecked |
| S6-12 | **Wide window:** verdict, figures and actions in the left pane; story and doors in the two panes beside it | desktop browser | unchecked |
| S6-13 | **Slovak:** every new line (story rows, doors, hub tabs) reads in Slovak, names in the nominative, the player never gendered | web, sk | unchecked |
| S6-14 | **Quick Sim Tester** (About, version ×8): League, UCL, UCL✦ and WC all land on the one result screen; UCL✦ shows the full path's verdict | web (dev) | unchecked |

## Trailer fixes (4 October 2026)

Found while filming the launch videos (`D:\Perfection or Misery\brag-output\brag-plan.md`): screens that didn't look right on the web build, fixed before recording.

| # | What to check | Where | Status |
|---|---|---|---|
| V-1 | **Draft club card in dark mode:** after a spin lands, the club's name, season and REROLL read in light text on the club's dark tint (they were ink on near-black) | web + phone, dark mode | unchecked |
| V-2 | **Draft player cards:** the name and nation sit on a dark shade rising from the card's foot, readable on white flag stripes (France, Italy, Ivory Coast, England) | web + phone | unchecked |
| V-3 | **One label per nation on draft cards:** a country name every time (SPAIN, FRANCE, ENGLAND, ARGENTINA), never SPAIN on one card and SPANISH on the next; in Slovak, the Slovak country name | web + phone, en + sk | unchecked |
| V-4 | **Long verdicts fit on a phone:** RESPECTABLE MEDIOCRITY (and the Slovak tiers) shrink to fit the card instead of running off its edge; short ones (PERFECTION, ABSOLUTE MISERY) stay full size | phone width, en + sk | unchecked |

## Phase two · Step 7 (4 October 2026)

The press in every stage ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §5).

| # | What to check | Where | Status |
|---|---|---|---|
| S7-1 | **Champions, Europa and Conference League (classic) league phase:** a Press tab beside Table, Results and Fixtures. From matchday 1 there's a report on your match when nothing else is news; on the last matchday a story says where you finished and your road (straight into the last 16, the play-off, out) | web | unchecked |
| S7-2 | **World Cup groups:** a Press tab. After matchday 3, your group decided (winners, second, third and waiting, out); finishing third adds the best-thirds story, and it agrees with whether you're in the round of 32 | web | unchecked |
| S7-3 | **Every knockout stage** (classic, World Cup, full path): the press under the rounds, newest first: your tie (through or out, penalties named), the round's upset, a shootout, the round's headline, and the winners after the final | web | unchecked |
| S7-4 | **Full path:** the domestic season has a Press tab with the league's own stories (a champion on the last day, unless the league splits: then nothing after the regular season); qualifying rounds and the league phase follow in the same press | web | unchecked |
| S7-5 | **Your injuries and bans** make a cup's press in the round they happen (league phase, groups, knockouts), and other clubs' don't | web | unchecked |
| S7-6 | **A cup story opens its page** from any press list; the line above the headline says the round ("Round of 16") or the stage and matchday ("League Phase · Matchday 3 of 8"); Share makes the card with the same line | web | unchecked |
| S7-7 | **The run hub's Press tab** on a finished cup run (classic, World Cup, full path), and on a cup run saved before today (its press is rebuilt from the saved result) | web | unchecked |
| S7-8 | **Slovak:** the new stories read in Slovak, names in the nominative, nobody gendered | web, sk | unchecked |
| S7-9 | **The league season's press** is unchanged, except a round with two logjams now writes one story about the bigger | web | unchecked |

## Phase two · Step 8 (4 October 2026)

The rest of phase two ([`centralisation/12-PHASE-TWO-FINAL.md`](centralisation/12-PHASE-TWO-FINAL.md) §5).

| # | What to check | Where | Status |
|---|---|---|---|
| S8-1 | **Manager of the tournament** on Awards Night in the classic Champions, Europa and Conference League and the World Cup: "Tipped: … · Reached: …" for the winner and the runners-up, with an explanation about rounds, not places. The full path has none | web, a cup run played to the end | unchecked |
| S8-2 | **Kolos Kovalivka** shows white and black (it was the grey placeholder), in the draft and on the match sheet | web, a Conference League run | unchecked |
| S8-3 | **The World Cup's mark**: a drawn globe on a plinth in the square badge, on the mode list and the World Cup placement | web, light and dark | unchecked |
| S8-4 | **The match sheet's colours**: a red card, an own goal, an injury and a missed penalty in the one misery red; a yellow card and VAR in the referee's yellow; the man of the match in gold; the rotation note muted | web | unchecked |
| S8-5 | **The match sheet's sections** have the kit's section heads, and the form going into a match reads like the story page's form rows (result tag, home or away, opponent, score) | web | unchecked |
| S8-6 | **The save line** on a result: a guest and an offline save read in Slovak too; a failed save is red with a square Retry | web, en + sk, guest and offline | unchecked |
| S8-7 | **A shared story** carries whose run it is (picture, name, club tag), like the verdict's card, and its text starts with "My run" or the owner's name | web, phone share sheet | unchecked |
| S8-8 | **The career screen** names the mode "European Full Path" | web | unchecked |

## Phase 9 · Diagnostics step 1 (5 October 2026)

The log, the recorder and the crash screen ([`diagnostics/06-IMPLEMENTATION.md`](diagnostics/06-IMPLEMENTATION.md) step 1). Nothing to see on a screen yet except P9-1 and P9-2; the log becomes visible with the Diagnostics screen (step 4).

| # | What to check | Where | Status |
|---|---|---|---|
| P9-1 | **A screen that throws** shows "Something broke on this screen" with Try again and Back to Play, not a red box or a blank page (in Slovak too). The quickest way to see it is a development build with a throw put in a screen by hand | phone + web, en + sk | unchecked |
| P9-2 | **Signing out keeps your settings** (appearance, speed, language, the no-bench question) **and any runs waiting to go up**; only the session goes. Before, on the web, a sign-out reset every setting | web first, then phone | unchecked |
| P9-3 | **Nothing changed for the player**: no new console noise in development, and the live match still logs its timing line (`sim/live … s, … ms a minute`) in Metro | phone dev build | unchecked |

## Phase 9 · Diagnostics step 2 (5 October 2026)

Everything is measured; nothing new to see until the screen (step 4), except in a development build's console and the web's `pomPerf.readings()`.

| # | What to check | Where | Status |
|---|---|---|---|
| P9-4 | **A run plays exactly as before** in every mode (league, a classic cup, the World Cup, the full path): matchdays, skips, the live match, knockouts, the result. The timing wraps every matchday and skip, so any change in behaviour is a bug | phone + web | unchecked |
| P9-5 | **The log reads like a run**: in a development build's console, `run/RUN STARTED …`, `screen/… drawn in N ms` on each screen, the matchday stamps, `run/RUN ENDED … finished` on the result (or `abandoned`), `save/run: saved` | phone dev build | unchecked |
| P9-6 | **The probes**: the console says where memory was read from ("memory read from HermesInternal: N MB" or "no memory reading on this engine") and whether long tasks are observed. Write the answers into `docs/diagnostics/02-POM-ARCHITECTURE.md` §1 | phone release build | unchecked |

## Phase 9 · Diagnostics step 3 (5 October 2026)

The self-test, before its screen (step 4).

| # | What to check | Where | Status |
|---|---|---|---|
| P9-7 | **The self-test runs from the web console**: `await runSelfTest()` returns five results (bench, fingerprint, invariants, data, backend), the fingerprint says MATCH, the invariants 200/200, and the page stays responsive while it runs. With the network off (devtools, Offline), backend says `offline` and the rest still finish | web | unchecked |
| P9-8 | **The fingerprint on the phone**: MATCH means the phone rebuilds every seed exactly as Node does. RAW DIFFERS is worth knowing, SHOWN DIFFERS is a bug a player could see (a sheet different on the phone and the laptop). Runs from the Diagnostics screen once step 4 is in | phone release build | unchecked |

## Phase 9 · Diagnostics step 4 (6 October 2026)

The screen ([`diagnostics/05-SCREEN-AND-REPORT.md`](diagnostics/05-SCREEN-AND-REPORT.md)).

| # | What to check | Where | Status |
|---|---|---|---|
| P9-9 | **The ways in**: About's Diagnostics row; eight taps on "Made in Slovakia" (in a release build too); Ctrl+Shift+D on any web screen; the crash screen's Diagnostics button | phone + web | unchecked |
| P9-10 | **The screen reads right**: first open says nothing's sampled yet; after a run, the budgets fill in and a group with a WARN or FAIL opens itself; the dev notice only on a development build; the self-test fills Checks step by step, Cancel stops it and says so; the wide web layout is two panes | phone + web, light and dark | unchecked |
| P9-11 | **Share**: on the phone the share sheet opens with the report (and "Shared" or "Share cancelled"); on the web Copy puts it on the clipboard ("Copied"), and if the browser refuses, the page scrolls to the report to select by hand. The report fits one chat message and shows no name, email or id | phone + web | unchecked |
| P9-12 | **The log screen**: newest first, the level and category chips and search narrow it, a tap opens a line's details, last session's lines are marked; share or copy sends the whole log | phone + web, en + sk | unchecked |

## Phase 9 · Diagnostics step 5 (6 October 2026)

| # | What to check | Where | Status |
|---|---|---|---|
| P9-13 | **The tester's new home**: Diagnostics → Tools → League, UCL, the full path, the World Cup and the Final all run as before; About has no tester at the bottom any more. In a production build there's no Tools row, and `pom://diagnostics/tools` opens Diagnostics | dev build, then a production build | unchecked |
| P9-14 | **The first reading**: on the POCO X6 5G with a release build, play a run, open Diagnostics, run the self-test, share the report, and paste it into `docs/PERF-LOG.md` (or send it over). Every provisional target in `docs/diagnostics/03-BUDGETS.md` is judged against it | phone release build | unchecked |

## Phase 9 · the rest of the phase (6 October 2026)

What changed for the player and for the maintainer's own testing ([`ui-overhaul/11-ROADMAP.md`](ui-overhaul/11-ROADMAP.md) Phase 9, *Built 6 October*).

| # | What to check | Where | Status |
|---|---|---|---|
| P9-15 | **The log on the PC**: with the phone on USB and a release build, `adb logcat -s ReactNativeJS` shows the app's lines live, each starting `POM` and a time: screens, taps, perf lines with memory, RUN STARTED / RUN ENDED | phone release build + PC | unchecked |
| P9-16 | **Taps that finish fast** press in and come back without the words "Waiting…"; a slow one (signing in, saving) shows them after a moment | phone + web | unchecked |
| P9-17 | **Loading outlines**: Friends, Clubs, a club, the chat, a profile and the career show breathing outline rows while they load (still with Less motion on), and content arrives after about half a second to a second, never later than the load itself | phone + web | unchecked |
| P9-18 | **The pundits' tournaments on a cup result** open at once with the panel's; the pundits fill the rail a moment later; switching between them is instant | phone, a World Cup or Champions League result | unchecked |
| P9-19 | **Runs** with many runs scrolls smoothly, the title and filters scroll away with the list, the wide two-column layout still works | phone + wide web | unchecked |
| P9-20 | **The live match's line** at full time (Diagnostics log, `sim` category, or logcat) says how its seconds split: clock, beats, between periods, shootout, stood still, other | phone | unchecked |
| P9-21 | **A cursed draft**: the scrambled names still change each second while drafting; nothing visible changes after the draft (the scramble stops underneath) | phone | unchecked |
| P9-22 | **The Diagnostics log**: "The last run only" narrows to the last run's lines; Share/Copy sends exactly the lines shown | phone + web | unchecked |
