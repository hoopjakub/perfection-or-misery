# 04 · Checks: self-test, integrity and the scripts behind the screen

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md).
> Status: **plan.**

Budgets say how fast. Checks say whether the thing is right. The Dugout's screen is mostly budgets plus a world count. PoM's is richer here, because PoM has failure modes The Dugout doesn't: seeded sheets that have to replay identically across two JavaScript engines, a bundled database copied by version number, a run that lives only in memory, and saves that happen on a button press.

---

## 1. The self-test

One button, `RUN SELF-TEST`. It runs these steps in order and shows each as it finishes.

| # | Step | Result shape | Typical time |
|---|---|---|---|
| 1 | Benchmarks (`bench:*`, see [`03`](03-BUDGETS.md) §5) | a figure per key with its status | 3–6 s |
| 2 | Engine fingerprint (§2) | `MATCH`, `RAW DIFFERS` or `SHOWN DIFFERS` | under 2 s |
| 3 | Invariants over 200 random seeds (§3) | `200/200` or the first violation | 2–4 s |
| 4 | Database check (§4) | versions, counts, `quick_check` | under 1 s |
| 5 | Backend ping (§6) | reachable and latency, or the error category | the network |

**Rules.**

- **It yields between steps and inside long loops** (`await` a zero-delay timeout every 100 iterations), so the progress list paints and the Cancel button works. The simulation is synchronous and there's no worker; without yields, the screen would freeze for ten seconds and the stall detector would record the test itself as the app's worst stall.
- **Stalls recorded while the self-test runs are tagged `selftest`** and left out of the `stall:js` verdict.
- **It never touches a run.** Synthetic teams are never `isPlayer`, so `activeTilt` in `src/engine/match.ts` doesn't apply to them, and the test reads nothing from `gameStore`.
- **It can be run with no network.** Step 5 then reads `offline` and every other step still completes.
- **Results carry the time they ran** and stay on screen until the app restarts.

---

## 2. Engine fingerprint

### 2.1 Why

A saved run stores seeds, not sheets. Every time a match sheet opens, `generateMatchDetail` rebuilds it from the seed. That promise ("reopening a match always shows identical numbers", as About puts it) holds only if the same code gives the same numbers everywhere it runs.

It might not. `match-detail.ts` makes 15 calls to `Math.exp`, `log`, `pow`, `sqrt` and trigonometric functions, and `deep-match.ts`, `knockout-match.ts` and `stats.ts` make five more. The ECMAScript specification lets engines return slightly different results from those functions. Hermes on Android and V8 on web are different engines. A difference in the sixteenth digit usually disappears in rounding. Occasionally it pushes a value over a threshold (a rating from 6.849 to 6.851) and a player sees a different number on their laptop than on their phone. Nothing in PoM measures this today.

### 2.2 What it covers, and what it can't

**Covered:** the seeded layer. `generateMatchDetail`, `buildDeepMatchTimeline`, and the lineup functions that take a seed (`lineupSeed`, `selectLineup`).

**Not covered:** `simulateMatch`, which rolls outcomes with `Math.random()`. Results are decided once and stored, so this doesn't break replay, but it means the fingerprint can't claim "the whole run is reproducible", and the screen doesn't say it.

### 2.3 How

1. **Fixed inputs.** A deterministic builder in `src/diag/checks.ts` makes 50 synthetic match inputs from seeds 1 to 50: two synthetic squads with fixed ratings and positions, a scoreline and scorers per seed. No database rows, so a data rebuild never changes the fingerprint.
2. **Two canonical strings per seed.**
   - **raw:** the sheet serialised with every number at full precision.
   - **shown:** the sheet serialised the way screens display it (ratings to one decimal, xG to two, percentages and counts as integers).
3. **Hash** each string with FNV-1a (32-bit, a few lines, no dependency).
4. **Compare** with `src/diag/golden.ts`, generated under Node by `scripts/diag-golden.ts`. It holds `ENGINE_VERSION`, 50 raw hashes, 50 shown hashes, and the full shown sheets for seeds 1–3 so a mismatch can name a field.

### 2.4 Results

| Status | Meaning | Verdict |
|---|---|---|
| `MATCH` | every raw and shown hash equals the golden values | OK |
| `RAW DIFFERS` | at least one raw hash differs, every shown hash matches | WARN: the engines disagree, but nothing a player sees |
| `SHOWN DIFFERS` | at least one shown hash differs | FAIL: a player can see different numbers on different devices |
| `STALE` | the golden file's `ENGINE_VERSION` differs from the app's | NO DATA: the build shipped without regenerating the golden file |

On a mismatch, the result line names the first differing seed, and for seeds 1–3 the first differing field: `seed 2 · away.players[7].rating 6.8 ≠ 6.9`.

### 2.5 The side effect worth having

`scripts/verify-diag-golden.ts` recomputes the fingerprint under Node and fails if it differs from the committed file. So **any change to seeded output becomes a deliberate act**: bump `ENGINE_VERSION`, regenerate, commit. That matters beyond diagnostics. Old runs in the history rebuild their sheets from seeds with today's engine, so tuning `match-detail.ts` quietly rewrites every past run's stats. The check doesn't prevent that, but it makes sure somebody decided it. Storing `ENGINE_VERSION` on saved runs is a follow-up worth having; it's out of scope here.

---

## 3. Invariants on the device

### 3.1 One implementation

The `verify-*` scripts already hold the rules PoM trusts. They move into `src/engine/invariants.ts` as pure functions that return a list of violations:

```ts
checkMatchDetail(detail: MatchStats, input: MatchDetailInput): string[]
checkTimeline(timeline: DeepMatchTimeline, detail: MatchStats): string[]
```

`verify-match-detail.ts` and `verify-deep-match.ts` then call these functions and keep their own aggregate checks (averages, correlations), which need thousands of samples and don't belong on a phone.

### 3.2 What runs in the app

200 matches from random seeds. The starting seed comes from the clock and is printed, so any failure can be replayed exactly:

```bash
npx tsx scripts/verify-match-detail.ts --seed 1726398112
```

Checks included (all already in the scripts): possession sums to 100; shots on target ≤ shots; every scorer and assister was on the pitch at the minute; a red card ends that player's minutes; substitutes come on at 46' or later; ratings sit within 0–10; exactly one Player of the Match; the timeline's final frame equals the sheet; counters never decrease; nobody appears on the pitch before kick-off with a rating above zero.

**Result:** `200/200` (OK), or the first violation with its seed (FAIL).

---

## 4. Data check

| Row | How | Verdict |
|---|---|---|
| Bundled DB version | `DB_VERSION` exported from `src/db/setup.ts` | shown |
| Installed DB version | Android: `pom.db.version` in the documents folder. Web: always the bundled file | FAIL if lower than bundled after boot (the copy failed) |
| `_meta` version | `SELECT value FROM _meta WHERE key = 'db_version'` | FAIL if it disagrees with the installed version (the wrong file was bundled) |
| Integrity | `PRAGMA quick_check`, self-test only | FAIL on anything other than `ok` |
| Counts | `COUNT(*)` on `leagues`, `clubs`, `club_seasons`, `players`, `player_seasons` | shown, compared with the counts `build-db` writes to `_meta` if present |
| Logo coverage | clubs in the database with no entry in `src/lib/logoMap.ts` | shown as `412/520 clubs have a crest` |
| Flag coverage | national teams with no flag in `src/lib/flagMap.ts` | shown; WARN above zero, because a missing flag is a blank circle on a World Cup draw |
| Club facts | entries in `scripts/club_facts.json` as bundled | shown; FAIL at zero (an empty file already broke a Hermes build once) |

**Found while writing this:** `app.json` lists `assets/db/players_v4.db` inside a nested `expo.expo.assets` block. The app loads `players_v5.db`. The nested block is almost certainly ignored, so this isn't a runtime fault. It's a stale claim in the build config, and `verify-diag.ts` (§7) flags any database filename in `app.json` that doesn't exist on disk.

---

## 5. Run and session shape

PoM's version of The Dugout's "What the world is made of". Computed once when the screen opens, from `gameStore` and the session.

### 5.1 This run

| Row | Source |
|---|---|
| Mode, difficulty, formation | `mode`, `difficultyLabel(...)`, `formation` |
| Squad | `draftedPlayers.length` + `benchPlayers.length`, subs on or off |
| Rerolls used | `rerollsUsed` |
| Matches simulated | results present in `simResult`, `clResult` or `wcResult` |
| Matches with a stored seed | the same, counting `seed` |
| Matches on a fallback seed | counting those without; `effectiveSeed` hashes clubs and score for these, so two identical fixtures with the same score get the same sheet. Above zero is WARN |
| Scorers attributed | goals with a named scorer ÷ goals |
| Knockout ties · extra time · shootouts | counted from the result |
| Run in memory | bytes of `JSON.stringify` of the current result object, as KB |
| Tester flags | `quickSim`, `testForceWinUntilFinal`. WARN if the second is on while the first is off, which should never happen |

### 5.2 What a reload loses

`gameStore` has 26 data fields and none is persisted; `src/lib/mmkv.ts` is a stub. The screen says so in one line, in plain words:

> Your run is kept in memory only. Closing the app or refreshing the page mid-run loses it.

When run persistence lands, the line becomes a count (`24 kept · 2 rebuilt on open`) driven by the same list the reload script checks (§7).

### 5.3 Storage

`AsyncStorage.getAllKeys()`: the number of keys and total bytes. Key names are shown with anything that looks like a project reference masked (`sb-…-auth-token`). Values are never read.

---

## 6. Account, backend and saves

| Row | How | Notes |
|---|---|---|
| Session | `none`, `guest` or `account` | Nothing else. No id, email or name |
| Backend | `bench:net` in the self-test | `reachable 312 ms`, `offline`, `auth error`, `server error` |
| This run's save | a small in-memory save ledger written by the four `save*Run` functions and the result screens | One of: `not attempted`, `saved`, `failed · network`, `failed · schema` (the column-missing retry fired), `skipped · tester`, `skipped · guest`, `skipped · from history` |
| Career merge | the same ledger for `mergeCareerFromRun` | |
| Schema retries | count of `[saveRun] column missing` retries this session | WARN above zero: the database schema is behind the app |

**Why the save row matters.** The critique's top finding is that a run saves only when Play Again or Home is pressed ([`../ui-overhaul/01-CRITIQUE.md`](../ui-overhaul/01-CRITIQUE.md)). Until that's fixed, `not attempted` on a finished run is the truth, and the screen shows it with the reason: `saves when you leave the result screen`.

**What it can't check.** Row-level security runs on the server, so the client can't prove it. The screen doesn't have a row for it. The vibecode audit tracks it.

---

## 7. The scripts that keep the screen honest

The Dugout's hardest lesson: its diagnostics screen was wrong for months, and only a script that read the source found out. PoM starts with the scripts. All run with `npx tsx`, follow the house style (`check()`, a failure count, `✅ ALL CHECKS PASSED`, exit code), and join the other `verify-*` files.

### `scripts/verify-budgets.ts`

Reads every `.ts`/`.tsx` under `app/` and `src/`, finds calls to `time`, `timeAsync`, `sample`, `measure`, `frame` and the private recorder, and checks:

1. Every runtime budget is recorded somewhere. **`mark()` doesn't count** (01 §2.4).
2. No `planned` budget is recorded (a stale flag).
3. No `bench:*` key is recorded outside `src/diag/checks.ts`, and no other key is recorded inside it (01 §2.2).
4. No key is recorded from more than two call sites.
5. `hardFail > target` for every budget.
6. `platforms` holds only `android` and `web`.
7. Keys recorded with no budget: reported, not failed.

### `scripts/verify-diag-golden.ts`

Recomputes the fingerprint (§2) under Node and fails if it differs from `src/diag/golden.ts`, or if `ENGINE_VERSION` changed without regenerating.

### `scripts/verify-reload.ts`

Parses the `GameStore` type in `src/store/gameStore.ts`, takes every field that isn't a function, and checks each is either in the persisted list or in `TRANSIENT` with a written reason. **Reported, not gated, while the persisted list is empty**; a constant at the top flips it to gated in the same commit that adds persistence. The Dugout's rule, unchanged: not saving something is allowed, not saying so isn't.

### `scripts/verify-report.ts`

Builds a report from a worst-case fake state (every budget sampled and failing, 300 log entries with long payloads, every check failed) and checks:

1. Under 4,000 characters.
2. Environment lines come first.
3. No emoji and no ANSI colour codes.
4. No string matching an email, a UUID, a JWT or a Supabase URL.
5. Sections were dropped whole: no table is cut mid-row.

### `scripts/verify-diag.ts`

Small static checks that don't fit elsewhere: every database filename in `app.json` exists; `scripts/club_facts.json` parses and isn't empty; no `console.log` remains in `app/` or `src/`.

### `scripts/perf-size.ts`

Weighs the build-time budgets from an `eas build --local` APK and `npx expo export --platform web` output, prints pass or fail, and appends a dated row to `docs/PERF-LOG.md`.
