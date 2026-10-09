# 04 · The independent audit: security and release

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **findings, 7 October 2026.** Defensive review of the maintainer's own project. No secret value appears here; variables are named, not printed. Anything only the Supabase dashboard can show is under **couldn't verify**, with the exact check.

---

## 1. Findings by severity

| # | Finding | Severity | Evidence | Fix |
|---|---|---|---|---|
| S-1 | **A submitted run's results are the app's word.** `submit-run` re-scores the run on the server, but from the wins, draws, tier and figures the app sends (`invalidRun` checks they're plausible). A modified client can send a plausible great run. The results themselves can't be re-run on the server because they come from `Math.random` ([`03-INDEPENDENT-LOGIC.md`](03-INDEPENDENT-LOGIC.md) L-1). | High for a public leaderboard; known | `supabase/functions/submit-run/index.ts` | The real fix is L-1 (a seeded run the server can replay). Until then, the leaderboard is "as reported" and the plausibility rules are the only line; say so in the Terms |
| S-2 | **No rate limit on `submit-run`.** An account can post runs as fast as it likes. | Medium | the function has none | A per-user limit in the function (count this user's runs in the last minute; refuse above, say, 10) or a database rule. *Built 8 Oct (step 8): 10 a minute by arrival, `supabase/rate-limit.sql`; run it, then redeploy* |
| S-3 | **Server errors go back verbatim.** `submit-run` and `delete-account` return `error.message` and `String(err)` to the app. | Low | both functions | A fixed message to the app; the detail to the function's log |
| S-4 | **CORS `*` on the functions.** Fine for a public anon-key API called from the app and the web build; noted, not changed. | Low | `Access-Control-Allow-Origin: '*'` | none needed while the functions check the caller's token, which both do |
| S-5 | **`.env` is in git.** Every variable in it is an `EXPO_PUBLIC_` one, bundled into the app by design (the project URL, the anon key, flags), so nothing secret leaks. But it sets the personal build (`EXPO_PUBLIC_BRAND_MODE`) for anyone who clones it, which is how a wrong-flavour export was weighed on 6 Oct. | Low (hygiene) | `git ls-files` | Keep a committed `.env.example` with safe defaults (the legal build); ignore `.env` |
| S-6 | **Dependencies: 48 production advisories** (1 critical, 29 high, 18 moderate) from `npm audit --omit=dev`, 7 Oct. Nearly all are in the build chain (Metro, the Expo CLI, Jest's helpers via React Native, `shell-quote`, `node-forge` under the updates signing), not in code the app runs on a phone. | Medium to triage | `npm audit` | Triage once: which reach the shipped bundle (none found by name), then `npx expo install --check` for what the SDK allows; record the rest as accepted with the reason. *Triaged 8 Oct, §5* |
| S-7 | **Debug lines in a release build reach Android's log** (Phase 9, by request). Nothing personal is logged: rows are logged without their label, the report blanks emails, ids, tokens and the backend's address. But a tap's label and a screen's route are visible to anything reading the phone's log over USB. | Low | `src/diag/log.ts` | Accepted for testing builds; for the public build, decide D4 (keep, or mirror only warnings and errors) |
| S-8 | **The Diagnostics screen is in every build** (decided, read-only, nothing personal). The tester is not (redirect checked in code). | none | `app/diagnostics/tools.tsx` | none |

## 2. Couldn't verify (the dashboard)

| What | Why it matters | How to check |
|---|---|---|
| `supabase/policies.sql` applied | With server scoring on, the app's direct insert into `runs` must be gone, or S-1 is wide open | Dashboard → Authentication → Policies → `runs`: no INSERT policy for `authenticated` |
| `runs-queue.sql` applied (`client_id`, `played_at`, the unique index) | Without the unique index a re-sent queued run can save twice | Table editor → `runs`: the columns exist; Database → Indexes: unique on `client_id` |
| `submit-run` deployed at the latest version | An older copy rejects `client_id`/`played_at`, which would look exactly like P9.75-06 | Edge Functions → `submit-run` → deployed date after 1 Oct |
| The storage bucket's policies (profile and banner pictures) | Uploads are allowed; read and write rules decide who can overwrite whose | Storage → Policies |
| A spend cap on the project | An abused function costs money | Billing → spend cap on |

The third row is also on the offline trail: an outdated `submit-run` answering 400 would produce D-1 exactly ([`01-PHONE-FINDINGS.md`](01-PHONE-FINDINGS.md) §7, Q3). **Check it before debugging the queue.**

## 3. Release requirements, re-checked

- Privacy and Terms exist, open, and carry the clubs, the offline queue, updates, names and reports (D-7, checked on the phone 7 Oct).
- Account deletion: `delete-account` checks the caller and deletes their runs and their user.
- Content: user names, club names and the chat go through the moderation list (P8.5-44).
- **Not covered here, and when:** the public website's own audit, with the vibecode checklist, is Phase 10's ([`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §4); this pass didn't run that skill on the app, because its checklist is a website's.

## 4. Order

The dashboard checks first (an hour, and one of them may be P9.75-06's cause), then S-3 and S-5 (small), then S-2, then S-6's triage. S-1 is L-1's decision.

## 5. S-6, the advisories triaged (8 October 2026)

`npm audit --omit=dev`, 8 Oct: 48 (1 critical, 29 high, 18 moderate), the same as on 7 Oct. Every "fix" npm offers is a downgrade across major versions (`expo@44`, `react-native@0.75`, `expo-updates@0.11`), so none is taken. Sorted by whether the code can reach a phone:

| Where it lives | Packages | Reaches the app on a phone? | Verdict |
|---|---|---|---|
| The bundler and its file watching | `metro`, `metro-*`, `@expo/metro*`, `jest-haste-map`, `micromatch`, `braces`, `image-size`, `postcss` | No: they run on the build machine (or EAS), and the bundle they produce has none of their code | Accepted; they move with the SDK |
| React Native's test helpers | `babel-jest`, `@jest/*`, `jest-message-util`, `jest-environment-node` | No: pulled in by `react-native`'s package, never imported by the app | Accepted |
| The Expo CLI and config plugins | `@expo/cli`, `@expo/config*`, `@expo/prebuild-config`, `xcode`, `uuid` (via xcode), `@xmldom/xmldom`, `js-yaml`, `argparse`, `sprintf-js`, `fast-uri`, `shell-quote` (the one critical: command building in dev tooling) | No: prebuild and the CLI, on the build machine | Accepted; `shell-quote` only parses commands the CLI itself writes |
| Update signing | `node-forge` via `@expo/code-signing-certificates` | No: the CLI signs updates; the phone verifies in native code. The app doesn't sign its updates yet | Accepted; revisit if code signing is turned on |
| URL parsing at run time | `query-string` 7.1.3 → `decode-uri-component` (installed 0.2.2, the fixed version), under `expo-router` and `@react-navigation/core` | Yes, on deep links | Not exposed: 0.2.2 is the patched release; npm flags the range `query-string` declares |
| Ids at run time | `nanoid` 3.3.12 under `expo-router` | Yes | Not exposed: the advisory is for custom generators (`customAlphabet` with a bad alphabet); expo-router uses the default |

`npx expo install --check` asks for nothing older to be updated: it lists `react-native-svg`, `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@types/react` as *newer* than the SDK's pins, as they were at the 6 October build, which runs. Left as they are.

**Re-run** `npm audit --omit=dev` at each SDK upgrade; a new advisory in a package of the last two rows is the one to read.
