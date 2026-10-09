# 10 · The audit addendum

> Part of the [website set](00-README.md). Status: **plan, 9 October 2026.** Step 0 of the build order was to upgrade the `vibecode-audit` skill so its security pass covers a site on a shared Supabase project ([04](04-SECURITY-AND-ABUSE.md) §9). That never happened ([07](07-FACT-CHECK.md) F8), and the skill is managed by a plugin, so an edit to it could be overwritten. **This document is the upgrade instead:** the audit runs the skill's 216-point checklist, then this addendum. Every item says how it's checked and what a failure looks like.

---

## 1. How to run the whole audit

1. **The skill's mechanical scan** on the site's build output (`landing/dist`): `scan_static.py`.
2. **The skill's manual passes**, all sections. Marked not applicable for this site: LOC-1 and LOC-2 (no premises), CNV-10 and CNV-11 (no prices), TRU-16 to TRU-22 (reviews, case studies, team photos, guarantees: a free hobby game has none and invents none), SEO-10 (no address), SEO-13 (no blog). DEP-1 (`vercel.app`) is accepted (Q1) and listed, not failed.
3. **This addendum**, §2 to §4.
4. **The report** in the skill's format, saved as `docs/website/audit-<date>.md`.

## 2. The database, deeper than SEC-10

Each check is a query or a script, with its failing case.

| # | Check | How | Fails when |
|---|---|---|---|
| 2.1 | Row-level security on every table in `public` | `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'` | Any row says false |
| 2.2 | Every policy read, not just counted | `select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public'`; each `qa_`/`site_` table's policies compared with [04](04-SECURITY-AND-ABUSE.md) §2.2 | A `qa_`/`site_` table has any `insert`, `update` or `delete` policy, or a `select` policy other than the published view's |
| 2.3 | Functions: definer, search path, grants | For every `qa_`/`site_` function: `prosecdef`, `proconfig` (a fixed `search_path`), and the grants (`has_function_privilege('anon', …)`) | A definer function without a fixed `search_path`; an admin function executable by `anon` that doesn't start with `site_is_admin()` |
| 2.4 | The admin check needs the second factor | `site_is_admin()` reads `auth.jwt()->>'aal' = 'aal2'` (Supabase's documented form) and a `site_admins` row | Called with a password-only session of the admin account, it returns true |
| 2.5 | Who's asking comes from the token | Grep the `qa_` SQL: every function takes the caller from `auth.uid()`, never a parameter | A function with a user-id parameter that decides whose row it touches |
| 2.6 | The limits hold | The `qa` test file ([04](04-SECURITY-AND-ABUSE.md) §11 step 3): second active question, edit inside the cooldown, the day's cap, the global breaker, a guest asking, a **banned** account asking, a non-admin calling an admin function | Any of them is accepted |
| 2.7 | Deletion covers everything | For every table with a user column: on `delete-account`'s list, or a foreign key to `profiles(id)` with `on delete cascade` | A `qa_`/`site_` table that keeps a deleted player's rows (the updates' `author_id` is set null on purpose and listed as such) |
| 2.8 | The shared project | `pg_policies` and the function list for **every** schema-public object, read once: nothing `qa_`/`site_` names a `gaf_` table or Become a Legend's | Any cross-reference |
| 2.9 | No real names leak | Build the site, then grep `landing/dist` for every left-column name of `src/data/legal-names.js` | One appears |
| 2.10 | The counters expose only counts | As `anon`: `select * from site_counters` refused; `site_counters()` returns two numbers (or one, below the users threshold) | Anything else comes back |

## 3. The site, beyond the skill

| # | Check | How | Fails when |
|---|---|---|---|
| 3.1 | The two-account test | Account A asks a private question; account B (signed in, not admin) tries to read it through every public function and the published view, edit it, reply to it, and open the admin address | B sees or changes anything of A's |
| 3.2 | Stored script | A question whose text is `<img src=x onerror=alert(1)>` and a `javascript:` link, opened in the admin's inbox and (once answered and public) on the public page | Anything runs or is clickable |
| 3.3 | The content security policy | The live response's headers ([06](06-VERCEL-SETUP.md) §6); an inline `<script>` added to a preview build | The inline script runs |
| 3.4 | The admin route isn't advertised | `robots.txt`, `sitemap.xml`, the analytics dashboard's page list, the built JS of public pages | The address appears in any of them |
| 3.5 | The admin bundle isn't public | Load a public page and the admin shell without signing in; list every JS file fetched | The admin interface's code is among them |
| 3.6 | Source maps | Request `*.map` for every built JS file | Any is served |
| 3.7 | `hreflang`, canonical, structured data | The Rich Results test and a crawl of both languages | A page without its pair, or invalid JSON-LD |
| 3.8 | The counter's honesty | Block the Supabase host in devtools and reload | The page shows 0, a dash, or no date beside the built number |
| 3.9 | The download | `/download`'s APK address and checksum against the GitHub release and `latest.json` | They differ, or it's a personal-flavour build |
| 3.10 | In-app browsers | Open the poster and *Play* inside Instagram's and Facebook's browsers on Android | The game fails without telling the visitor what to do |

## 4. Couldn't verify from the repo (the maintainer checks, and writes the answer here)

| Item | Where | Answer |
|---|---|---|
| `unaccent` and `pg_trgm` enabled | Supabase → Database → Extensions | `unaccent` 1.1 installed; **`pg_trgm` not installed** (available 1.6): `qa.sql` enables it (07 D6) |
| The MFA enrolment screen and the `aal` claim on a real login | Supabase → Auth → MFA; decode a token | TOTP on, no factor enrolled yet, AAL1 sessions limited to 15 min (07 D8). The token is decoded once the admin enrols |
| Whether Auth locks an account after repeated failures | Supabase → Auth settings | No lockout setting; the limit is per address, 30 sign-ins per 5 min (07 D10) |
| Leaked-password protection (on paid plans only, so likely off) | Supabase → Auth → Passwords | Off (Pro only); minimum length 6 (07 D10) |
| The site project's Node version | Vercel → Settings → General | The game's is 24.x; the site's will be 24.x (07 V2) |
| Deployment Protection on previews | Vercel → Settings → Deployment Protection | Vercel Authentication, Standard Protection, protected source maps: on (07 V4) |
| The Web Analytics event allowance left this month | Vercel → Usage | 50,000 a month, 0 used: **Analytics and Speed Insights aren't enabled on the game's project** (07 V7) |
| Row-level security, policies, functions, buckets (§2.1–2.3, 2.7, 2.8) | `supabase/readings-phase10.sql` | All 21 tables RLS on; findings D2–D5, D11 (07 §5.1) |

## 5. Done when

- Every row in §2 and §3 passes, and each was seen failing at least once (a deliberate break in a preview or a test database) so it's known to work.
- §4 has an answer in every row.
- The skill's report has no blocker.
