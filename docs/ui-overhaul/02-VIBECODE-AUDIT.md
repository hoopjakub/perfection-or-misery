# 02 · Audit: Perfection or Misery — 14 September 2026

Scope: the repository (Expo app source, `app.json`, the web document shell, assets, the Supabase edge function) and the git history. There is no deployed web build and no built `dist/`, so anything that needs a live URL sits under "Couldn't verify".
Sections run: DEP, SEO, SEM, PERF, BLD, SEC, TRU, CNV, NAV, FRM, MOB, POL, LEG, ANL, DES. Skipped as not applicable: LOC.

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md).
> The audit judges PoM as what PRODUCT.md says it must be: built for friends and a portfolio, but credible enough to ship to the Play Store and the open web.

---

## Verdict

Yes, it reads as vibecoded, and almost entirely because of the edges rather than the game. The launcher icon, favicon and splash are Expo's untouched template art, the web document has no title or share preview, and 143 emoji glyphs stand in for an icon set. The single worst thing is not visual though: nothing a store reviewer asks for exists yet (no privacy policy, no way to delete an account), and the leaderboard accepts whatever score the client sends.

---

## Blockers (5)

These stop a public release. For the friends-and-portfolio build they are not urgent, but each one has to be closed before the Play Store listing goes live.

- **[LEG-1, LEG-3] No privacy policy or terms.** The app creates accounts (username and password) and stores every saved run in Supabase, yet there is no policy page, no terms and no link from sign-up.
  Fix: publish a short privacy policy and terms on the future web domain, link both from the register screen and the Profile menu, and fill in the Play Console data-safety form to match.

- **[DES-6, LEG] No way to delete an account.** Google Play requires apps that let users create an account to offer account deletion both inside the app and from the web. PoM has sign-out only.
  Fix: a "Delete account" row at the bottom of Profile, off the happy path, with the destructive flow from DES-1/2/5 (hold to confirm, a verb label like "Delete my account", a short cooldown), plus a web page that does the same.

- **[SEC-7] The leaderboard trusts the client's score.** Tiers and scores are computed on the device and written straight to the `runs` table. Any signed-in user can post any number. `supabase/functions/submit-run` exists to do this server-side, but nothing calls it, and its tier ladder no longer matches the app's (`title_contender` is top-4 there, top-3 in `src/engine/tier.ts`).
  Fix: route saves through the edge function, recompute tier and score on the server from the submitted result, and delete the stale copy of the ladder. Until then, label the leaderboard "friends" rather than global.

- **[SEC-6, SEC-10] Row-level security can't be confirmed from the repo.** The anon key ships in the client (correct, it is designed to be public), which is only safe if RLS is on for `runs`, `profiles` and `career_stats`. There are no migrations or policies in `supabase/`, so nothing here proves it.
  Fix: export the current policies into the repo, and test directly that user A cannot update or insert rows owned by user B.

- **[TRU-12, legal] Official competition marks.** `assets/modes/world-cup.png` is the official FIFA World Cup 26 emblem, and the Champions League mode uses a UEFA mark. Using marks you have no relationship with is the same kind of exposure as a fake "trusted by" strip, and in a store listing it invites a takedown.
  Fix: the maintainer's call, recorded as open in PRODUCT.md. For public release, replace them with original marks in the Kit Drop system (a woven tape in the mode's colourway) and keep competition names as plain text.

---

## Credibility (14)

Cheap to fix, disproportionate payoff. This is where the real value of the audit sits.

- **[DEP-6] Framework-default icon set.** `assets/icon.png`, `favicon.png`, `android-icon-foreground.png` and `splash-icon.png` are the unmodified Expo template (a blue "A" on a construction grid; a wireframe target). `app.json` keeps Expo's adaptive-icon background `#E6F4FE`. There is no apple-touch-icon and no web manifest.
  Fix: a real mark (see [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md) §Brand mark) exported as launcher icon, adaptive foreground and monochrome layers, splash, favicon, apple-touch-icon and manifest icons.

- **[DEP-4] Text-only logo.** The only "logo" is the words PERFECTION / MISERY in the system font with a text shadow.
  Fix: a wordmark with its own type, and a compact mark for small sizes.

- **[DEP-7] Template leftovers.** `app/+html.tsx` sets no `<title>`, no description and no `theme-color`. `app.json` contains a nested `expo` object that points at `players_v4.db` and a background colour, and none of it takes effect. `userInterfaceStyle` is `"light"` on a dark app. `public/index.html` still carries `%WEB_TITLE%` from an older template.
  Fix: delete the nested block and the old `index.html`, set real document metadata, set the interface style to match the grounds.

- **[SEM-7] Emoji used as icons.** 143 emoji glyphs across 25 UI files. The worst offenders are controls and section headers: "📊 View Stats", "📖 How this competition works", "🏆 Biggest Win", "💔 Worst Loss", "⚠️ Shock Defeats", "⏩ Skip All", "😬" as an empty state.
  Fix: one icon set drawn in the Kit Drop grammar; flags stay as flags.

- **[BLD-6] Developer copy visible to players.**
  - Mode select: "Global glory (Not full route for now)".
  - Placement: "Run the database seeder first.", "Seed at least 8 clubs to play."
  - Formation 3-4-1-2: "…behind a two strikers. All out attack. PM Special."
  - Register: `setError(e.message) // show real error for now`.
  Fix: rewrite each (see [`09-COPY-DECK.md`](09-COPY-DECK.md)); a missing-data state should say what the player can do next.

- **[BLD-3, BLD-4] Debug leftovers.** Six `console.log` calls in `app/`, including every Continue on formation select. The Quick Sim Tester ships in production behind eight taps on the version number.
  Fix: strip the logs; gate the tester behind `__DEV__` or a build flag. (It already suppresses saves, which is correct.)

- **[BLD] Version mismatch.** About says 1.0.0; `app.json` says 0.0.1.
  Fix: read the version from the app config so it can't drift.

- **[NAV-5] Six top-level destinations.** Play, Ranks, Profile, Runs, Guide, About. Runs, Guide and About are repeated again as rows inside Profile.
  Fix: four destinations (see [`07a-SCREENS-SHELL.md`](07a-SCREENS-SHELL.md)).

- **[NAV-9] No custom 404.** There is no `app/+not-found.tsx`, so a bad web URL shows expo-router's default unmatched-route page.
  Fix: a branded not-found screen with a route back into a run.

- **[NAV-2] Buttons that lie.**
  - Home's recent-run cards open the Runs tab, not the run.
  - Runs for guests says "Sign in to view your run history" with no button.
  - Mode select's Continue sits at 40% opacity without saying what's missing.
  Fix: each card opens its own run; every empty state carries its action; a disabled button names the missing step.

- **[FRM-4, FRM-5, FRM-6] Errors that aren't messages.** Register shows raw error strings and never clears its spinner after a failure. A failed leaderboard fetch renders "No runs yet. Be the first!". A failed save disappears into the console.
  Fix: human error copy next to the field; a distinct "couldn't load, retry" state; a visible save state on the verdict.

- **[FRM-7] No confirmation before losing work.** Draft back wipes every pick. "Skip — play with no bench this run" is one tap. Sign-out on an account with no password recovery is one tap.
  Fix: confirmations with verb labels ("Discard 7 picks", "Play without a bench", "Sign out"), and a reminder that there is no recovery before signing out.

- **[FRM-8] No password visibility toggle.** Three password fields, and the account cannot be recovered if a typo slips into Confirm Password.
  Fix: a show/hide toggle on each field.

- **[TRU-5, TRU-6] Generic copy and the em-dash tic.** Tier descriptions read like generated praise ("Your name is etched in glory and your fans will celebrate for decades", "A legendary achievement that will never be forgotten!", "Simply sensational!"). 29 em dashes in in-app strings.
  Fix: the rewrites in [`09-COPY-DECK.md`](09-COPY-DECK.md).

---

## Growth (8)

Costs nothing today and everything over six months.

- **[DEP-1, DEP-2] No web home.** The maintainer confirmed the web side has no presence. A game shared in group chats needs a short, memorable domain; for a darkly funny game, `.gg` or `.app` reads as intentional.
- **[BLD-1] Empty view-source.** `app.json` sets no `web.output`, so the web build is a single client-rendered shell. Static output gives each route real HTML and lets the metadata below exist.
- **[SEO-6, SEO-7] No per-route titles or descriptions.** Every route would share one blank title.
- **[SEO-8] No share preview.** Pasting a link into Discord or WhatsApp shows nothing. For a game that spreads by "look what I got", this matters more than any other SEO item. Each saved run could have its own preview image showing the verdict.
- **[SEO-1, SEO-2, SEO-4, SEO-5] sitemap, robots.txt, llms.txt, canonical.** Add once a domain exists.
- **[ANL-1] No analytics.** For a friends-and-portfolio build, a consent-free counter (Plausible or Umami) is enough to learn which modes get played.
- **[FRM-9 spirit] No way to share a run.** `react-native-view-shot` and `expo-sharing` are both installed and used nowhere. A shareable verdict label is the obvious use (see [`07d-SCREENS-RESULTS.md`](07d-SCREENS-RESULTS.md)).
- **[Store] No listing material.** No screenshots, feature graphic or store copy exist. They must come from real captures of the redesigned app, never mock-ups presented as the real thing.

---

## Polish (6)

- **[PERF-3] Dead assets.** `assets/modes/upscalemedia-transformed.jpeg` (1.65 MB) and `players_v3.db` / `players_v4.db` (155 KB each) are referenced nowhere. They don't ship in the bundle, but they bloat the repo.
- **[PERF-1] The web build loads the whole player database into memory.** `players_v5.db` is 10.9 MB and is deserialized on first load. Worth measuring once a web build exists; a loading state that reads as deliberate softens it either way.
- **[PERF-4] Spin animation cost.** Each club spin sets React state 20 times over about 2.1 seconds on a 1,700-line screen. It works; it is also the least efficient way to draw a reel.
- **[MOB-2] Touch targets under 44px.** Draft MOVE buttons (3px vertical padding), simulation speed buttons (~20px tall), matchday arrows (~26px), the LIVE pill, StepSlider steppers (30px), the back button (34px).
- **[TRU-7 spirit] Decorative glows.** The scanner's purple hits in `achievements.tsx` and `mode-select.tsx` are the Cursed mode's deliberate violet, a false positive. The real tell is on web: blue and red radial "stadium light" blobs behind the app column in `+html.tsx`.
- **[POL-1] Theme preference.** The redesign moves to two grounds set by phase (white for setup and reading, black for live play). A player-facing "night grounds" preference is worth considering after launch, not before.

---

## Passes worth recording

- **[SEC-1, SEC-2, SEC-3]** The only client-side secrets are `EXPO_PUBLIC_SUPABASE_URL` and the anon key, both public by design. `.env` is tracked in git, which is harmless for these two values. Git history holds no service-role key: the one reference is `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` inside the edge function.
- **[SEM-3]** `<html lang="en">` is set.
- **[TRU-10, 11, 13, 14, 15]** No fake reviews, testimonials, visitor counts or invented metrics anywhere.
- **[TRU-20]** About tells a real story: who made it, why, and what inspired it (38-0.app, credited).
- **[DEP-3]** No builder badge.

---

## Not applicable

- **LOC-1, LOC-2** No physical location.
- **CNV-10, CNV-11** Free game, no pricing or checkout.
- **CNV-12, CNV-13** An FAQ would duplicate the in-game guide.
- **CNV-15** No conversion funnel.
- **MOB-7, MOB-8, MOB-10, MOB-11** No phone line or support desk. (The scanner's MOB-8/MOB-9 hits on `public/index.html` and an Android build report are false positives.)
- **SEO-10, SEO-13, SEO-14** No local business, no blog, no deep document hierarchy.
- **SEC-12** No paid API.
- **SEC-13** No file uploads.
- **TRU-1 to TRU-4, TRU-19, TRU-21 to TRU-24** No generated imagery, stock photos or services to prove.

---

## Couldn't verify

- **SEC-6, SEC-10.** Are RLS policies enabled on `runs`, `profiles` and `career_stats`, and does an insert with someone else's `user_id` fail?
- **SEC-11.** Is sign-up rate limited beyond Supabase's defaults? Usernames are enumerable through "That username is already taken."
- **SEC-14 to SEC-18.** HTTPS, headers and cookies depend on the host, and there isn't one yet.
- **PERF-1, PERF-2.** What does the production web bundle weigh, and what are LCP, CLS and INP on a throttled phone?
- **BLD-2, BLD-3.** Are source maps published, and is the console clean on every route in a production build?
- **NAV-1.** Do all links resolve once deployed?
