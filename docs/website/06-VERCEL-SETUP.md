# 06 · Vercel setup, step by step

> Part of the [website set](00-README.md). Status: **plan**, 29 September 2026. The maintainer: "add full notes what to do in Vercel to have a proper setup." Written for the Hobby (free) plan. Items marked **check** depend on Vercel's dashboard as it is when you do it.

## 1 · The two projects

| Project | Folder | Address | What it serves |
|---|---|---|---|
| **The game** (exists) | the repo root (Expo web export) | `perfection-or-misery.vercel.app` | The app, run links `/r/<id>`, `/.well-known/assetlinks.json` for App Links |
| **The site** (new) | `landing/` | a new project name, e.g. `perfectionormisery.vercel.app` (**check** it's free) | The landing page, the community, `latest.json` |

Why the game keeps its address: App Links are verified for that host (`app.json:26`), so every shared run link opens the installed app. A `play.` subdomain isn't possible on `vercel.app` without a custom domain (Q2, [05](05-OPEN-QUESTIONS.md)). If a domain is bought later: the domain for the site, `play.` for the game, and the App Links host updated in `app.json` and `assetlinks.json` with a new build.

## 2 · Creating the site's project

1. Vercel → **Add New… → Project** → import the same GitHub repository.
2. **Project name:** the address you want (`perfectionormisery`).
3. **Framework preset:** Astro. **Root directory:** `landing`.
4. **Build command / output:** Astro's defaults (`astro build`, `dist`).
5. **Environment variables** (Production and Preview): `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` (the same public values the app uses). **Never** the service-role key: nothing on the site needs it.
6. Deploy once to see the address works.

## 3 · Build only what changed

Both projects build from one repo, so a change to the game shouldn't rebuild the site and the reverse:
- Site project → **Settings → Git → Ignored Build Step:** `git diff --quiet HEAD^ HEAD -- landing/` (skips the build when nothing in `landing/` changed).
- Game project → the same with a path list that excludes `landing/` (**check** the current game project's settings first so its existing build command from P8-179 is kept).

## 4 · Production branch and previews

- **Production branch:** `main` for both.
- **Preview deployments:** on for pull requests; set **Deployment Protection → Vercel Authentication** on previews so a preview of an unfinished page isn't public (**check** it's available on Hobby).

## 5 · Analytics and Speed Insights

On the site's project, **Analytics → Enable** and **Speed Insights → Enable**, then deploy ([Web Analytics & Speed Insights](<../Web%20Analytics%20%26%20Speed%20Insights.md>) §5). In the site's code, exclude the admin route from analytics (`beforeSend` dropping that path), so its address never appears in the dashboard.

## 6 · Headers (in `landing/vercel.json`)

| Header | Value (starting point) | Why |
|---|---|---|
| `Content-Security-Policy` | scripts from `'self'` and Vercel's analytics only, connections to the Supabase URL, no inline script, `frame-ancestors 'none'` | Stops injected script from running ([04](04-SECURITY-AND-ABUSE.md) §6) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS only |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Addresses don't leak to other sites |
| `Permissions-Policy` | camera, microphone, geolocation off | The site uses none |
| `X-Robots-Tag` | `noindex` **on the admin route only** | Not in search results (never listed in `robots.txt`) |

The game's project already serves `assetlinks.json` as JSON (P8-174); leave that rule in place.

## 7 · The download and updates

- `landing/public/latest.json` written by the release script ([`../release/05-UPDATES-AND-THE-APK.md`](../release/05-UPDATES-AND-THE-APK.md)); served with `Cache-Control: no-cache` so the app sees a new release at once.
- The APK itself on GitHub Releases, linked from the download page.

## 8 · Protection and spend

- **Hobby is free and doesn't bill overages**; when a limit is hit, the feature pauses (Web Analytics' event allowance, as recorded for P8-179).
- **Firewall:** Vercel's firewall has managed protection on every plan and a small number of custom rules on Hobby (**check** the number). Add one rule that rate-limits requests to the admin route by address, as a layer in front of the database checks.
- **Attack Challenge Mode:** know where it is (Firewall settings) to switch on during an attack.

## 9 · Checklist before launch

- [ ] Both projects build independently (the ignored-build step works both ways).
- [ ] The site's environment has only public values.
- [ ] Headers present on the live site (check the response).
- [ ] Analytics and Speed Insights on, admin route excluded.
- [ ] Previews protected.
- [ ] `latest.json` reachable and not cached.
- [ ] Run links from a chat still open the app (the game's address unchanged).
