# 05 · The screen and the report

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md).
> Status: **plan.** Visual rules come from [`../ui-overhaul/05-STYLE-GUIDE.md`](../ui-overhaul/05-STYLE-GUIDE.md). If Diagnostics is built before the overhaul's Phase 1, it uses today's theme tokens with the same structure, and gets restyled with everything else.

---

## 1. Where it sits in Kit Drop

Diagnostics is a reading screen, so it stands on **white cotton**, density tier **T3**, with figures in tabular workhorse and keys in the tag mono. It isn't a game surface, so it gets no colourway tape, no super-sized type beyond the title, and no motion beyond the defaults.

The status language maps onto the system's existing roles, which is why it needs nothing new:

| Status | Treatment | Why this role |
|---|---|---|
| `OK` | outlined tag, ink text | Fine is quiet. Volt means Perfection, and a diagnostics row isn't one |
| `WARN` | ink tag, cotton text | Heavier than OK, still not "out" |
| `FAIL` | hazard-striped edge, text on a solid inset | Out is a pattern, never red (style guide §2.3) |
| `NO DATA` | dashed 1px outline, `textMuted`, the row at 55% opacity | Present but not a result, as in The Dugout (01 §1.5) |
| `n/a` | the reason in `textMuted`, no tag | The platform can't measure it; not a gap |

**Orange doesn't appear on this screen**, except on the one primary action (`SHARE REPORT`). Orange means you, and nothing here is about the player.

Every status also carries its word, so nothing is colour-only.

---

## 2. Layout

### 2.1 Phone (Compact)

```
┌────────────────────────────────────┐
│ ‹  "DIAGNOSTICS"                   │  header, BackButton
│ Everything measured on this device │  body.l muted
├────────────────────────────────────┤
│ ▚ DEV BUILD — numbers run slow     │  StripedNotice, dev builds only
├────────────────────────────────────┤
│ [ SHARE REPORT ]  [ SELF-TEST ]  ⟳ │  primary plate, secondary, refresh icon
├────────────────────────────────────┤
│ SUMMARY                            │
│ 2 FAIL · 3 WARN · 20 OK · 4 NO DATA│  tag row, each a filter
│ worst  sim:customUcl:qualifying    │
│        2,410 ms  ▚ FAIL            │
├────────────────────────────────────┤
│ ENVIRONMENT                        │
│ app 0.0.1 · release · engine 1     │  tag mono, T3 rows
│ db 13 (installed 13)               │
│ android 35 · hermes · Pixel 7a     │
│ 412×915 @2.6 compact · font 1.3    │
│ reduce motion off · session 41 min │
├────────────────────────────────────┤
│ BUDGETS                  4 NO DATA │
│ ▸ Boot and data                    │  collapsible groups, open if any
│ ▾ Simulation                       │  row in the group isn't OK
│ ┌─────────────────────────────────┐│
│ │sim:skip:league          ⌐ OK ¬ ││  key + status
│ │ skip a league season            ││  label, muted
│ │ p50 512  p95 690  / 800  n 7    ││  figures, target after the slash
│ ├─────────────────────────────────┤│
│ │sim:customUcl:qualifying  ▚ FAIL ││
│ │ every association + qualifying  ││
│ │ p50 2,180 p95 2,410 / 1,500 n 3 ││
│ └─────────────────────────────────┘│
│ ▸ Match detail and stats           │
│ ▸ Frames   ▸ Save and network      │
├────────────────────────────────────┤
│ STALLS                             │
│ 14 over 50 ms · worst 840 ms       │
│ on /game/result during stats:league│
├────────────────────────────────────┤
│ CHECKS              last run 14:02 │
│ Engine fingerprint   MATCH      OK │
│ Invariants           200/200    OK │
│ Database             ok         OK │
│ Backend              312 ms     OK │
├────────────────────────────────────┤
│ THIS RUN                           │
│ World Cup · hard · 4-3-3 · subs on │
│ 7 matches · 7 seeded · 0 fallback  │
│ saved  not attempted               │
│ saves when you leave the result    │
│ Kept in memory only. Closing the   │
│ app mid-run loses it.              │
├────────────────────────────────────┤
│ DATA                               │
│ 520 clubs · 4,120 club seasons ... │
│ crests 412/520 · flags 48/48       │
├────────────────────────────────────┤
│ PROBLEMS              VIEW ALL LOG │
│ [wc R16] warn stats/pool load ...  │
│ LAST SESSION                       │
│ [ucl QF L2] error ui/render Type...│
├────────────────────────────────────┤
│ MEASURED, NO BUDGET                │  only if any
├────────────────────────────────────┤
│ TOOLS                            › │  developer builds only
├────────────────────────────────────┤
│ REPORT                             │
│ ┌─────────────────────────────────┐│
│ │### Perfection or Misery — diag..││  selectable mono, sunken label ground
│ └─────────────────────────────────┘│
└────────────────────────────────────┘
```

**Why budget rows are three lines on a phone, not a table.** Seven columns don't fit 412 points without horizontal scroll, and The Dugout's table uses `scroll-x` for exactly that reason. Stacking key, label and figures keeps every number visible and lets the status sit where the eye lands first.

**Why groups collapse.** Thirty runtime rows is a long scroll. A group opens by default only when something inside it isn't OK, so the screen opens on the problems. The group header shows its worst status.

### 2.2 Wide web (Expanded, 1024 and up)

Two panes in a 1440 max width.

```
┌──────────────────────────────┬───────────────────────────────────────┐
│ "DIAGNOSTICS"                │ BUDGETS                    4 NO DATA  │
│ [SHARE REPORT] [SELF-TEST] ⟳ │ key        label     p50  p95  max    │
│ SUMMARY                      │                      tgt  n    status │
│ ENVIRONMENT                  │ (a real table, T3, tabular figures,   │
│ CHECKS                       │  grouped with sticky group headers)   │
│ THIS RUN                     │───────────────────────────────────────│
│ DATA                         │ STALLS                                │
│ TOOLS (dev)                  │ PROBLEMS · LAST SESSION               │
│                              │ REPORT (selectable)                   │
└──────────────────────────────┴───────────────────────────────────────┘
```

The left pane is what you check first; the right pane is what you read. Keyboard: `Ctrl+Shift+D` opens it, `S` runs the self-test, `C` copies, `R` refreshes, `L` opens the log.

### 2.3 Sub-routes

- **`/diagnostics/log`**: the full ring, newest first. Filters by level and category as tags, a "this run only" toggle, and a text search. Rows are `FlatList` with a fixed height so 300 entries scroll without cost. Tapping a row expands its `data` payload.
- **`/diagnostics/tools`**: the Quick Sim Tester (League, UCL, UCL full route, WC, Final), with the copy it has today rewritten by the copy deck. Developer builds only. expo-router registers every file as a route, so in a release build the screen redirects to `/diagnostics` on mount; the tester code is never reachable from a link.

---

## 3. States

### 3.1 Every possible state

| Area | State | What shows |
|---|---|---|
| Screen | first open, nothing sampled | Summary reads `No samples yet. Play a match or run the self-test.` Budgets list every runtime row as NO DATA |
| | dev build | the striped notice at the top |
| | web, Chromium | memory row live |
| | web, Firefox or Safari | memory row `n/a · not available in this browser` |
| | Android without Hermes heap stats | memory row `n/a · not available on this build` |
| Share | idle | `SHARE REPORT` (Android) or `COPY REPORT` (web) |
| | done | the button reads `SHARED` or `COPIED` for 1.6 s, with a success haptic on Android |
| | cancelled | `SHARE CANCELLED`, no haptic |
| | failed | `COULDN'T COPY · SELECT THE REPORT BELOW` and the page scrolls to the report |
| Self-test | idle | the Checks section shows `Not run this session` |
| | running | the button becomes `CANCEL`; each step row shows `running`, then its result |
| | cancelled | completed steps keep their result; the rest read `cancelled` |
| | step failed to run | the row reads `error` with the message; later steps still run |
| | offline | Backend reads `offline`; not a FAIL |
| This run | no run in progress | `No run in progress.` Only session and storage rows show |
| | tester run | a `TESTER` tag beside the mode; save row reads `skipped · tester` |
| | viewing a run from history | `Viewing a saved run` and the save row is hidden |
| Problems | none | `None this session.` |
| | only last session | `None this session` plus the Last session list |
| Tools | release build | the section doesn't exist |

### 3.2 States in use at launch

Of the above, the first build will actually show: first open, dev build, both memory `n/a` rows, all four share results, all self-test states except "step failed to run" (which needs a fault to appear), every This run state, and both Problems states. Tools shows only in dev and preview builds.

---

## 4. Copy

Plain, short, and about the number. The Kit Drop voice rules apply: supers and tags in caps, sentences in sentence case, straight quotes only around the screen title.

| Key | Text |
|---|---|
| title | `"DIAGNOSTICS"` |
| subtitle | Everything measured on this device. |
| dev notice | Development build. Numbers run slower than a release build. |
| share (android) | SHARE REPORT |
| copy (web) | COPY REPORT |
| self-test | RUN SELF-TEST |
| no data note | `{n}` budget(s) nothing has measured yet |
| unbudgeted note | Recorded, with no target to judge against. Shown rather than dropped. |
| memory n/a (web) | Not available in this browser. |
| memory n/a (android) | Not available on this build. |
| run in memory | Kept in memory only. Closing the app mid-run loses it. |
| save not attempted | Saves when you leave the result screen. |
| fingerprint MATCH | Match sheets rebuild the same here as on the reference. |
| fingerprint SHOWN DIFFERS | Some match sheets show different numbers on this device. |
| crash screen title | `"SOMETHING BROKE"` |
| crash screen body | This screen hit an error. Your run may still be in memory. |
| crash screen actions | TRY AGAIN · DIAGNOSTICS |

---

## 5. Accessibility

- Every status tag has an accessibility label that reads the whole row: "sim skip league, 690 milliseconds at p95, target 800, OK".
- Group headers are buttons with `accessibilityState={{ expanded }}`.
- The report text is selectable and has `accessibilityRole="text"`; screen readers can read it line by line.
- Share results are announced with `AccessibilityInfo.announceForAccessibility`.
- Figures keep `maxFontSizeMultiplier` uncapped; at a font scale of 1.3 or more, budget rows wrap figures onto a second line rather than truncating.
- Nothing flashes; the self-test progress is text, not an animation.

---

## 6. The report

### 6.1 Format

```markdown
### Perfection or Misery — diagnostics
app 0.0.1 · release · engine 1 · db 13 (installed 13)
android 35 · hermes · Google Pixel 7a · 412x915 @2.6 compact · font 1.3 · motion on
session 41 min · account · run world_cup hard 4-3-3 · 7 matches

summary: 2 FAIL · 3 WARN · 20 OK · 4 NO DATA · 1 n/a

| budget | target | p50 | p95 | n | |
|---|---:|---:|---:|---:|---|
| sim:customUcl:qualifying | 1500 | 2180 | 2410 | 3 | FAIL |
| stats:league | 700 | 820 | 1310 | 4 | FAIL |
| ui:navigate | 150 | 48.0 | 172 | 88 | WARN |
| ... OK rows ... |
| db:fetch | 1500 | — | — | — | n/a android |

over budget: sim:customUcl:qualifying 2410 · stats:league 1310 · ui:navigate 172
never sampled: frame:bracket · save:career · net:leaderboard · net:runs
no budget: stats:customUcl 1120

stalls >50ms: 14 (worst 840ms on /game/result during stats:league)

checks (14:02): fingerprint MATCH · invariants 200/200 (seed 1726398112) · db ok · backend 312ms
self-test: match 0.09 · detail 6.10 · timeline 18.4 · season 212 · stats 480 · query 64 · net 312

run: 7/7 seeded · 0 fallback · scorers 9/9 · save not attempted · schema retries 0
data: clubs 520 · club seasons 4120 · players 24935 · crests 412/520 · flags 48/48

last problems:
  [wc R16] warn stats/pool load failed {"club":"Morocco"}
last session:
  [ucl QF L2] error ui/render TypeError: Cannot read property 'leg1' of undefined
```

### 6.2 Rules

The Dugout's six, kept word for word, plus four:

1. Under about 4,000 characters, so it survives a chat message intact.
2. Targets next to actuals.
3. p95, not just last.
4. OK, WARN and FAIL computed in the app.
5. Environment first.
6. Plain Markdown. No colour, no emoji.
7. **Worst first.** Budget rows sort by status (FAIL, WARN, NO DATA, OK), then by p95 ÷ target. The Dugout sorts alphabetically, which puts a FAIL wherever its name falls.
8. **A seed with every failure.** Any failed check prints the seed that reproduces it.
9. **Nothing personal.** No user id, email, username, run id, token or backend URL. Enforced by `verify-report.ts`.
10. **Cut by section, never mid-line.** See §6.3.

### 6.3 Staying under 4,000 characters

Build sections in priority order, measure, and drop from the bottom up until it fits. Never slice a string.

| Priority | Section | Dropped how |
|---|---|---|
| 1 | Title, environment (3 lines), summary | never |
| 2 | FAIL and WARN rows | never |
| 3 | Checks, stalls, this run | never |
| 4 | Last problems (5) and last session (3) | trimmed to 2 each, then payloads removed |
| 5 | NO DATA rows | collapsed into the `never sampled:` line |
| 6 | OK rows | collapsed into `ok: 20 budgets` |
| 7 | Self-test line, data line, no-budget line | dropped |

If a section was dropped, the last line says which: `(trimmed: OK rows, data)`.

### 6.4 The full report

The log screen's share action appends the whole ring as `### log`, one formatted line per entry, oldest first. It has no length limit and says so in its first line. On Android it goes through the share sheet; on web, the clipboard.
