# The PC sweep (Phase 10.5), 11–12 October 2026

Every screen of the public web build on a computer (1440×900 and 1024×768,
mouse and keyboard, light and dark), from a local static export
(`EXPO_PUBLIC_BRAND_MODE=original npx expo export -p web`). Checklist rows
975-97 to 975-104 cover what was fixed. Layout findings go to Phase 11, whose
overhaul redraws these screens anyway.

## 1 · Fixed

| What | Cause | Fix |
|---|---|---|
| A screen opened directly in dark mode showed a light ground | React's production hydration keeps the server's styles when they differ from the client's | `app/_layout.tsx` remounts the tree once hydrated (`groundKey`) |
| A second tab never loaded runs, silently | expo-sqlite's web worker holds the one OPFS handle per site; the second tab's open failed and the failure was cached | `src/lib/dbTab.ts`: a Web Lock; the second tab says so (OfflineStrip) and opens the moment the first closes |
| Closing or reloading the tab mid-run lost the run without a word | no `beforeunload` on the web | `useSimBackGuard` asks first while a run is live |
| The public build still read UCL / UEL / UECL (table zones, Ranks' "UCL Finals") | `renameText`'s quick pre-test only let through strings with UEFA/League/…, so a bare abbreviation never reached the table | the pre-test includes the abbreviations; `verify-legal-bundle` checks for them (the rename table itself excepted) |
| "You have a bye" with no round | the cup line reused `season.bye` | `season.byeInto` names the round (EN + SK) |
| Versions printed a source line nobody needs | | removed with its keys |
| Run labels like "Cursed · Cursed" | `runMeta` printed the mode next to a league of the same name | dropped when they match |
| "Phone" in copy a computer reads | | "device" (EN *device*, SK *zariadenie*) |

## 2 · Fixed on 12 Oct: browser Back landed on the run hub

The report: on a fresh result, open a player page or the hub, press the
browser's Back, and you were on the run hub with the URL still `/game/result`.

The cause, read from expo-router's history records: a push into the game stack
from outside it (Home → mode select, Runs → a saved run, the tester → a result)
is recorded before the game stack exists, as "game, screen=result" with no
state of its own, and expo-router never rewrites that record. Back restores it,
and the game stack starts again from its first route, which is `run`. So it hit
the first game screen after any entry from outside, not only results.

The fix (`app/game/_layout.tsx`, web only): once the stack is up, one no-op
change of params makes expo-router record the entry again with the stack's real
state. Checked on the export: result → player → Back, and result → hub → Back,
both return to the same result, and a second Back to where the run started.

## 3 · Open: layout, for Phase 11

- Home: the wordmark twice (rail and page); content uses a third of the width.
- Clubs and You are centred; Runs and Ranks are left-aligned.
- The run hub is capped near 820 px; its table shows only P / GD / PTS.
- Inputs have no placeholders (Go to place, Compare with, Search players).
- The pundits' card row can't be scrolled sideways with a mouse.
- Confirm screens put the buttons far below the question.
- Draft: names over flag emblems; the club watermark over the bench; cramped hanger tags.
- Fixture dates truncated; the form strip clipped.
- Screens outside the tabs have no rail.
- The live season's columns are cramped at 900 px tall.
- The result screen's figures row is uneven.
- Quick Sim tester failures are silent (dev only).

## 4 · Checked and fine

Keyboard focus ring and order; drafting with the mouse; the formation, draw,
season and result layouts at both widths; the site's security headers
(Mozilla Observatory A+).
