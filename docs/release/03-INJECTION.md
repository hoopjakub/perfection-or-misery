# 03 · Injection

> Part of the [release set](00-README.md). Status: **fixed 1 October 2026** (§4; `scripts/verify-no-string-queries.ts` keeps it fixed). Originally **findings and plan**, from a scan of every `.ts` and `.tsx` file under `src/` and `app/` and the SQL in `supabase/`, 29 September 2026. The maintainer: "is the app safe from SQL injections? If not, add it to early Phase 8.5 and note it down for the website as well."

## 1 · The short answer

**Mostly safe by construction, with three places to fix.** The app never sends SQL to the server: it talks to Supabase through the query builder (`supabase.from(...).select().eq(...)`), which sends values as parameters, and through database functions called with named arguments (`.rpc(...)`). The server-side SQL files (`clubs.sql`, `friends.sql`, `profile*.sql`, `pin.sql`) contain no dynamic SQL (no `execute`, no `format()` building a statement). The local database is read-only and bundled, and almost every local query passes values as `?` parameters.

What's left is where a query is built by gluing text together.

## 2 · Findings

| # | Where | What | Risk | Fix |
|---|---|---|---|---|
| I1 | `src/db/queries/clubs.ts:74`, `searchClubs` | The search text is put inside a PostgREST filter string: `.or(\`name.ilike.%${q}%,tag.ilike.%${…}%\`)`, with `%`, `,`, `(` and `)` stripped by hand | Low: the stripped characters are the ones that could add a filter, and the table is public-read anyway. But hand-escaping a filter language is the pattern that breaks when someone adds a character to it; `_` (a wildcard) isn't escaped | Two separate `.ilike()` calls (the builder escapes values), or a `search_clubs(q)` function |
| I2 | `src/lib/friends.ts:130`, the friend-state lookup | `.or(\`and(from_user_id.eq.${me},to_user_id.eq.${targetId}),…\`)`, where `targetId` comes from the route (`/u/[id]`), i.e. from a link anyone can craft | Low to medium: a crafted id could reshape the filter; row-level security still limits what comes back to the caller's own requests. It's the one place a value from a URL reaches a filter string | Check `targetId` is a UUID before the query (reject otherwise), or move the lookup into a function |
| I3 | `src/db/queries/seasons.ts:224`, `getClubSeasonsForMode` | The local SQLite query puts `leagueId` straight into the SQL: `l.id = '${leagueId}'` | Low: the database is local and read-only, and the value comes from the league picker. But it's the one local query that isn't parameterised | A `?` parameter, as the rest of the file does |

Two more `.or()` strings use the caller's own id from the session (`src/lib/friends.ts:77`, `src/lib/versus.ts:70`, and the three in `supabase/functions/delete-account/index.ts`). They're safe because the id comes from the token, not from input; they should still validate it's a UUID so the rule is simple: **no value reaches a filter string unchecked.**

## 3 · The rule going forward

- **Values go through the builder's methods or as function arguments, never into a string.**
- A filter string (`.or()`) is allowed only with values that were checked (UUID, number, or from a fixed list).
- SQL functions don't build statements from text; if one ever must, it uses `format()` with `%I`/`%L`.
- Local SQLite: `?` parameters only.
- Rendering is the other half: text from players (club names, chat messages, profile about lines, and the website's questions) is always rendered as text, never as HTML. React Native and a framework's text nodes do that by default; the website's plan forbids `innerHTML` for player text ([`../website/04-SECURITY-AND-ABUSE.md`](../website/04-SECURITY-AND-ABUSE.md) §6).

## 4 · Step (Phase 8.5, early)

Fix I1 to I3; add a `scripts/verify-no-string-queries.ts` that fails if any `.or(`, `.filter(` or SQLite call contains `${` with a value not in an allow-list of checked helpers, and if any `.sql` file contains `execute ` outside a `format(`.

**Done when.** The scan finds zero unchecked interpolations; it fails when one is added back (tested by adding one).

## 5 · For the website

The website uses the same Supabase project and the same rules. Its plan already routes every write through checked functions with fixed parameters and renders questions as text; this document's §3 is added to its security checklist and to what the upgraded `vibecode-audit` skill checks.
