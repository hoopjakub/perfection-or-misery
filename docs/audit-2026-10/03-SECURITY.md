# 03 · Security: what a cheater or a stranger can do

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **findings, read 2 October 2026.** A short pass on top of the release set ([`../release/00-README.md`](../release/00-README.md)) and the moderation work ([`../MODERATION.md`](../MODERATION.md)), which already cover names, marks, the APK and bad words. No secret values are printed here.

For a game like this the threat is mostly **cheaters on the leaderboard** and **people being unpleasant to each other** (names, club chat), not attackers after data. The only personal data is an email, a username, an optional picture and an "about me".

---

## 1. Findings

| # | Finding | Severity | Evidence | Fix |
|---|---|---|---|---|
| S-1 | `.env` is tracked in git | **Low** | `git ls-files` lists `.env`; it holds six `EXPO_PUBLIC_*` values: the Supabase URL and **anon** key (public by design: they ship in every client), the scoring flag, a contact address, the site URL and the brand mode. No service-role key anywhere in `app/` or `src/` (grep, 2 Oct) | Fine as it is, but name it in the README so nobody later adds a secret to the same file. If a non-public value ever appears, it goes in `.env.local` (already ignored, `.gitignore:34`) |
| S-2 | **The server scores what the client claims** | **High** for a public leaderboard | `submit-run` recomputes the score with the shared formula (`supabase/functions/submit-run/index.ts:66`), so the score can't be inflated directly. But the facts it scores from (position, wins, goals, tier) come from a season simulated on the device with `Math.random()` (02 G-L5); `invalidRun` can only reject what's implausible. A modified client can submit an unbeaten 38-win season | Short term: tighten `invalidRun` with what the server can know (the team OVR against the league, matches played, a win rate bounded by difficulty) and flag outliers for review rather than reject. Long term: idea I-6 (seeded results the server can replay) |
| S-3 | Direct inserts into `runs` depend on a SQL file having been run | **Couldn't verify** | `supabase/policies.sql:21` drops `runs_own_insert` so only the edge function inserts. Whether it was run on the live project can't be read from the repo | The maintainer checks in the dashboard: Authentication → Policies → `runs` has no INSERT policy for `authenticated` |
| S-4 | Moderation functions callable only from the SQL editor | **As built** | `mod_inbox`/`mod_act` revoked from `public`, `anon`, `authenticated` (Wave D follow-up) | Phase 10's website wraps them behind `site_is_admin()` |
| S-5 | Analytics posts paths, never queries | **As built** | `beforeSend={stripQuery}` (`WebInsights.web.tsx:22`); `/u/[id]`, `/r/[id]` grouped by route | — |
| S-6 | Hashed assets revalidated on every visit | Low (performance, not security) | see [`04-PERFORMANCE.md`](04-PERFORMANCE.md) P-2 | — |

## 2. Still open from earlier sets

- **Legal pages exist in both languages** (P8.5-29, `src/data/legal.ts`, Slovak written in Wave E). The website serves them from `public/legal/*.json`.
- **Account deletion exists** (`supabase/functions/delete-account`), which a store listing requires.
- **The vibecode audit's five blockers** ([`../ui-overhaul/02-VIBECODE-AUDIT.md`](../ui-overhaul/02-VIBECODE-AUDIT.md), Sept), where they stand on 2 October:

  | Blocker | Today |
  |---|---|
  | LEG-1/3 no privacy policy or terms | **Closed**: `src/data/legal.ts`, both languages, linked in the app and exported for the site (P8.5-29) |
  | DES-6 no account deletion | **Closed**: `supabase/functions/delete-account` |
  | SEC-7 the leaderboard trusts the client's score | **Partly**: the server computes the score (`SERVER_SCORING=1`, direct inserts dropped by `policies.sql`), but from facts the client claims: S-2 |
  | SEC-6/10 RLS can't be confirmed from the repo | **Partly**: the policies are in the repo now (`supabase/policies.sql`, `clubs*.sql`, `moderation.sql`, `profile.sql`); whether the live project matches is S-3 |
  | TRU-12 official competition marks | **Closed for the public build**: the legal flavour ships no crests or competition logos and generic names (P8.5-30); the personal build keeps them, by decision |

  The audit wasn't rerun in full: its credibility and web checklist fit Phase 10's landing page better, and rerunning it there is cheaper than twice.

## 3. Couldn't verify (dashboard checks for the maintainer)

| Check | Where |
|---|---|
| `runs` has no INSERT policy for `authenticated` (S-3) | Supabase → Authentication → Policies |
| Leaked-password protection and email confirmation are on | Supabase → Authentication → Providers / Settings |
| A spend cap on the Supabase project | Supabase → Billing |
| `submit-run` has the latest shared score deployed (hunting multiplier, Wave B) | Supabase → Edge Functions → submit-run → deployed version date ≥ 1 Oct 2026 |
