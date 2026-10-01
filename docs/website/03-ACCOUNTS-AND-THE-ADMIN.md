# 03 · Accounts and the admin

> Part of the [website set](00-README.md). Status: **plan**, 29 September 2026. Read [04](04-SECURITY-AND-ABUSE.md) with this; the two are one design.

## 1 · One login for the app and the site

**Today (read 29 September).** A player picks a username and a password. The app turns the username into an internal address, `<username>@pom.internal`, and signs in with Supabase's email-and-password call (`src/lib/auth.ts:24-27`, `:44-60`). Usernames are letters, digits and underscores, up to 38 characters, passwords six or more. There's no real email, so **no verification and no password recovery**, and the sign-up screen says so and asks the player to confirm. A guest is an anonymous Supabase session (`signInAnonymously`, `auth.ts:15`); its account isn't kept, and the database can tell it apart (`is_anonymous` in the JWT, used by `pom_is_member()` in `supabase/friends.sql`).

**On the site.** The same call, the same rule: type your username and password. The website's sign-in form does what the app's does and nothing more (no "sign in with Google", no magic link, no email field). It's the same account, the same profile and the same runs.

Two things follow that the maintainer should know:

- **It's not single sign-on.** The site and the game's web build are different addresses, so they keep separate sessions (Supabase's browser client stores the session per origin). "Signed in on the app, so signed in on the web" means *the same username and password work*, not that one login carries over. Signing in on the site once is a one-time typing.
- **Nobody can recover a password.** That's already the game's rule. It's stated on the site's sign-in too, in one line.

**A guest can read the community, not write.** Guests are throw-away sessions, so asking a question needs a real account (02 §2). The page says so and offers to make one.

## 2 · What the site adds to the database

Three small tables and a handful of functions, all prefixed `qa_` or `site_` so nothing collides with The Dugout's or Become a Legend's tables in the shared project ([00](00-README.md) finding 6). The full design is in [04](04-SECURITY-AND-ABUSE.md) §2. In this document only the admin's part matters:

| Object | Job |
|---|---|
| `site_admins` | One row: the admin's account id |
| `site_is_admin()` | Says whether the caller is the admin, right now, at the second factor |
| The `qa_` admin functions | Every admin action, each starting with `site_is_admin()` |

## 3 · The admin

### 3.1 What "the admin" is
**One PoM account**, chosen by the maintainer, whose id is in `site_admins`. Nothing about the account is special in Supabase's eyes; what makes it the admin is one row the maintainer inserts by hand. The table is built to hold exactly one row (a unique index on a constant), so a second admin is a decision, not an accident.

**Recommendation: a separate account from the one the maintainer plays with.** A play account has a play-strength password, appears in Ranks and shows a username in runs. The admin account only administers, has a long password, and never plays. The maintainer's request was for one admin account, which this keeps.

### 3.2 Why a table, not a role in the token
Supabase's own recommendation for roles is a table of roles plus a *custom access token hook* that writes the role into the sign-in token, checked by an `authorize()` function in policies ([RBAC guide](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)). Its caveat, from that page: the hook changes the access token only, so **a changed role reaches the client only when the token refreshes**. For a team of admins that's the right shape. For one admin it's the wrong trade:

| | Custom access-token hook | A one-row table read at call time |
|---|---|---|
| Revoke the admin | Takes effect at the next token refresh | The moment the row is deleted |
| Moving parts | A hook function, a grant to `supabase_auth_admin`, a dashboard toggle | One table, one function |
| Extra cost per call | None | One indexed lookup |
| Failure mode | A misconfigured hook can lock everyone out of sign-in (it runs on every login) | A wrong function can only break the admin's own actions |

**Decision: the table.** It also means a leaked admin session can be cut off instantly from the SQL editor.

### 3.3 The second factor
Supabase's TOTP multi-factor is free and on by default for every project ([TOTP guide](https://supabase.com/docs/guides/auth/auth-mfa/totp)): the account enrols an authenticator app once (enroll, challenge, verify), and afterwards its sessions can reach the second assurance level. `site_is_admin()` requires it: the caller's token must carry `aal2`. So a stolen password gives an attacker a session that can't do anything as the admin.

**Couldn't verify:** the exact claim name and the dashboard's enrolment screen. The guide describes the two assurance levels (`aal1` after the password, `aal2` after the code) but gives no policy example; the claim in the token is `aal`, and the first build checks it with a real login before anything relies on it.

**Lost-authenticator plan.** The maintainer owns the Supabase project, so the recovery is from the dashboard: remove the factor for the account, or delete the `site_admins` row and re-point it at a new account. Write this down where he'll find it.

### 3.4 What you type, and where
Decided 29 Sept (Q17): **the maintainer generates the username and the password himself and never shares them**, not with a model, not in a chat, not in the repo. This section only says where each one goes.

**How passwords are kept.** Supabase Auth stores only a bcrypt hash of a password, never the password (it's handled inside the Auth service, not in our tables), so nobody, including the admin and the project owner, can read one back. If club passwords ever move server-side they get the same treatment through `pgcrypto`'s `crypt()` with `gen_salt('bf')`, compared in a function, never returned.

| What | Where it goes | Where it never goes |
|---|---|---|
| The admin username | Typed into the sign-up form once; then into the one SQL line in step 3, in Supabase's SQL editor (the editor's history is the project owner's only) | The repo, `qa.sql` (it holds a placeholder), a `.env`, a chat |
| The admin password | Typed into the sign-up and sign-in forms; kept in a password manager | Anywhere else |
| The secret route (§4) | The password manager, and the site's environment variable on Vercel (**check** at build time whether the route needs to be known at build or can be a runtime lookup) | The repo |
| The authenticator's secret | The authenticator app, scanned once | Anywhere else |

In order, once:

1. **Choose a username** for the admin account that isn't his play name, and a password of at least 16 random characters from a password manager.
2. **Create the account** through the site's or the app's sign-up.
3. **In Supabase's SQL editor**, run the one statement the build provides, which looks up that username's id and inserts it into `site_admins` (the build's `qa.sql` will carry it as a commented line with the username left to fill in). It's safe to run twice.
4. **Sign in** at the admin address (§4), **enrol the authenticator**, and sign in again to reach the second level.
5. **Check:** open the admin address from a second, normal account. It must show nothing.

## 4 · The secret route

The maintainer asked for a route that "you can't just access… you have to know it exists," built "a really complicated way." This is where a plan has to be careful, because there are two different things and only one of them is a lock.

**A hidden address is not a lock.** Everything the browser can load, an attacker can load too: the admin page's code is delivered to anyone who asks for it. Hiding the address stops casual discovery and automated scanners for the common admin paths (`/admin`, `/wp-admin`), which is worth having. It stops nothing else. Broken access control, meaning a page or action reachable by someone who shouldn't have it, was first on OWASP's 2021 list of web risks (cited by name; the page failed to load this session, so it isn't quoted). Two rules follow:

1. **The address is a convenience. Every admin action is checked on the server.** A visitor who guesses or finds the address gets a page that says nothing, and could call every admin function directly and be refused by `site_is_admin()`.
2. **Assume the address will leak** (a screenshot, a browser history, a shared link) and design so that costs nothing.

**What the route looks like.**

| Layer | Measure | What it buys |
|---|---|---|
| Address | A random path of 32 or more characters, generated once, kept in the maintainer's password manager, not in the repo | Not guessable, not scannable |
| Not advertised | Not linked; not in `sitemap.xml`; **not in `robots.txt`** (listing a path there tells the world it exists); `noindex` on the page; excluded from analytics | Doesn't appear in search or in anyone's logs by accident |
| The shell | The page at that address is one small, plain shell: a sign-in box and nothing else. It looks like a blank 404 until sign-in | Nothing to read if you find it |
| The bundle | The admin interface's code is fetched **only after** `site_is_admin()` returns true at the second factor | The admin screens aren't in the page a stranger downloads |
| The check | Every read and write goes through a function that starts with `site_is_admin()`; the tables refuse direct access to anyone else | The one layer that actually decides |
| Second factor | TOTP (§3.3) | A password alone isn't enough |
| Rate limit | Supabase limits sign-in attempts to 30 per five minutes per address; the admin's function calls add their own limit ([04](04-SECURITY-AND-ABUSE.md) §4) | Guessing the password is slow and loud |
| A trail | Every admin action is written to a log table (who, what, when) | If something goes wrong, there's a record |

"Really complicated" is the address and the shell. The complication that matters is the row check and the second factor, because they still work when the address is known.

## 5 · What the admin's account can and can't do

| Can | Can't |
|---|---|
| Read every question | Read anyone's password (nobody can) |
| Set statuses, write answers, make a question private, start and close private conversations, delete | Sign in as another player |
| Write, edit and delete updates | Touch the game's tables (`runs`, `profiles`, clubs): the admin functions don't reach them |
| Read the admin log | Change the admin log |

The admin never gets the service-role key in a browser; nothing in the site uses it (a public anon key is public by design, a service-role key in a page would be a blocker, [02-VIBECODE-AUDIT](../ui-overhaul/02-VIBECODE-AUDIT.md) SEC-1).

## 6 · If the admin account is deleted

The `delete-account` edge function (`supabase/functions/delete-account/index.ts`, read 29 September) deletes a player's rows table by table from an explicit list, then their avatar folder, then the auth user. Anything not on its list has to go with the account through a foreign key that cascades, as `supabase/clubs.sql` does. So **every new table here references `profiles(id)` with `on delete cascade`,** and a player's questions are deleted with them (which the privacy page says, 02 §9). The admin's row goes with the admin's account, and the site simply has no admin until the maintainer inserts another. Updates the admin wrote are kept: they reference the admin through an `author_id` set to null on delete.

## 7 · Decided

From [05](05-OPEN-QUESTIONS.md), 29 Sept: the maintainer makes and keeps the credentials (Q17, §3.4); the second factor is required from day one (Q18); the byline is "the developer" and **nothing links it to an account** (Q20): updates and answers show a fixed string, the public views of `qa_updates` and answers don't expose `author_id` or any admin column, and the admin account has no public profile row visible from the site (it never plays, so it never appears in Ranks or runs; the build checks that the admin id can't be read from any public view).
