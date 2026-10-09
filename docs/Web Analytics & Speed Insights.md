# Web Analytics & Speed Insights

> Status: **built in code** for the app's web build (P8-179, 27 September 2026), **but not enabled in the dashboard** (read 9 October 2026: both tabs show *Get started* and 0 events; `docs/website/07-FACT-CHECK.md` V7). Press *Enable* on both and redeploy; **plan** for the Phase 8.5 audit (§4) and the Phase 10 landing page (§5).
> Vercel's own pages were read on 27 September 2026 for every limit and command below; they change, so check them again before relying on a number.

## 1 · What's on, and where

The web build (perfection-or-misery.vercel.app) sends two things to Vercel. The phone app sends nothing: neither package runs on native, and the native build doesn't include them.

| Package | What it measures | Where it's seen |
|---|---|---|
| `@vercel/analytics` (Web Analytics) | Page views and visitors: which pages, where visitors came from (referrer), country, device, browser, OS. No cookies; a visitor is told apart by a hash that's discarded after 24 hours. | The project's **Analytics** tab |
| `@vercel/speed-insights` (Speed Insights) | How the pages perform for real visitors (field data): LCP, INP, CLS, FCP, TTFB, rolled into a Real Experience Score | The project's **Speed Insights** tab |

**The code**

- **The component:** one component, `src/components/WebInsights.web.tsx`, mounted once in `app/_layout.tsx`. `WebInsights.tsx` is the empty native twin.
- **One row per page:** pages are reported by **route**, so every player page is one row (`/u/[id]`), as is every run link (`/r/[id]`). The route comes from expo-router's segments, less their groups (`(tabs)`).
- **No query strings:** the query string is cut before anything is sent (`beforeSend`), so `/game/result?runId=…` arrives as `/game/result`. No run or user id reaches Vercel through a query.
- **The script address:** version 2 of both packages loads its script from an address Vercel picks at build time (`VERCEL_OBSERVABILITY_CLIENT_CONFIG`). The packages only look for it under a framework's prefix that Expo doesn't inline, so `vercel.json`'s build command passes it on as `EXPO_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG`. Without it, they fall back to `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js`.
- **Privacy page:** `app/privacy.tsx` says what the website measures, and that the phone app sends none of it. Anything added here goes there too.

## 2 · Turning it on, and the free plan's limits

1. In the Vercel project, open the **Analytics** tab and press **Enable**.
2. Open the **Speed Insights** tab and press **Enable**.
3. Redeploy. Data arrives with the first real visitors; an ad blocker hides your own visits.

On the **Hobby** (free) plan, as of 27 September 2026:

| | Web Analytics | Speed Insights |
|---|---|---|
| Allowance | 50,000 events a month, **shared by every project on the account** | 10,000 events over a **rolling 30 days**, shared by the team |
| Past the allowance | a 3-day grace period, then collection pauses | collection pauses for **at least 14 days** |
| History | 1 month | 24 hours and 7 days |
| What the dashboard shows | page views, visitors, pages, referrers, countries, devices, bounce rate | **Real Experience Score only**, with page and route counts in Great and Needs Improvement. The individual vitals (LCP, INP, CLS…), Poor entries and countries are Speed Insights Plus (Pro) |
| Custom events (`track('run finished')`) | Pro only | n/a |

**What that means for us**

- **Nothing is charged on Hobby.** When an allowance runs out, collection pauses; the site keeps running.
- **The allowances are shared.** The other projects on the account draw from the same allowances if they turn analytics on too.
- **Speed Insights is the one to watch.** An event is one vital from one page load, so 10,000 goes faster than it sounds. If it ever pauses, set `sampleRate` on `<SpeedInsights>` (for example `0.5`) rather than switching it off.

## 3 · Reading the numbers

**The dashboard** is enough for a look: the Analytics and Speed Insights tabs, filtered to production.

**The CLI** lets a person or a model pull exact numbers into a document, which is what the audit needs (§4). It's `vercel metrics`, and Vercel's docs say it works without Observability Plus. It needs the Vercel CLI, signed in (`npx vercel login`) and linked to the project (`npx vercel link` in the repo). The project's name in Vercel is assumed to be `perfection-or-misery` below; use whatever `vercel link` shows.

- **Find out first:** `npx vercel metrics schema vercel.speed_insights` lists the metrics this account can query. Do this before the audit relies on anything. On the free tier the dashboard shows only the overall score, so whether the CLI returns the individual vitals has to be tried, not assumed.
- **Slowest pages by LCP (P75):**
  `npx vercel metrics vercel.speed_insights.lcp_ms --aggregation p75 --group-by route --since 7d --order-by value --order desc --limit 10 --project perfection-or-misery --prod`
- **Responsiveness, phone against computer:**
  `npx vercel metrics vercel.speed_insights.inp_ms --aggregation p75 --group-by deviceType --since 7d --project perfection-or-misery --prod`
- **How much data each figure stands on:** the same query with `--aggregation count`. A P75 from a dozen page loads isn't a finding.
- **Page views by page:**
  `npx vercel metrics vercel.analytics.page_view.count --group-by route --since 7d --project perfection-or-misery --prod`
- **Where visitors come from:** group by `referrer` (check the name against `vercel metrics schema vercel.analytics`).
- **Devices:** group by `deviceType`, or by `country`.
- **Every project side by side** (the app and, later, the landing page):
  `npx vercel metrics vercel.speed_insights.lcp_ms --all --aggregation p75 --group-by projectId --since 7d --prod`
- **Dashboard only:** Real Experience Score and bounce rate can't be queried.

**The thresholds** are Google's "good", at the 75th percentile of visits: **LCP ≤ 2.5 s**, **INP ≤ 200 ms**, **CLS ≤ 0.1**. Past **4 s**, **500 ms** and **0.25** they're poor. The FCP and TTFB figures explain a slow LCP; they're not goals of their own.

## 4 · For the Phase 8.5 audit

The audit's performance and "what do people use" questions start from these numbers, not from guesses. This is its measuring step, done first.

1. **Snapshot before anything else.** The free plan keeps a week of Speed Insights and a month of Web Analytics, and the audit takes longer than that. Copy the numbers into the audit's own documents with their date and data-point counts:
   - the queries in §3, or screenshots of the dashboard if the CLI can't give them;
   - the Real Experience Score per route;
   - the top pages, referrers and devices.

   A number that isn't in the documents is gone in a week.
2. **Rank the web work by use times slowness.** A slow page nobody opens matters less than an ordinary page everyone opens. Put the two lists side by side: page views by route, and P75 by route.
3. **Split phone from computer.** The web build is played on phones too; `deviceType` shows how many, and whether their numbers are the problem.
4. **Name the reason before fixing.** A poor LCP on `/game/simulation` is a symptom. Profile it (the Diagnostics screen, Phase 9) and make the code say why before touching a constant; see the "name the reason" and "profile before tuning" rules.
5. **Know what this doesn't cover.** None of it measures the phone app, which is where most play happens. The native numbers come from Phase 9's Diagnostics screen and its budgets. The web figures are the web's, and the audit says so wherever it uses them.
6. **After fixes, measure again** with the same query and window, and write down both numbers. A fix whose number doesn't move isn't a fix.

## 5 · For the Phase 10 landing page

Phase 10 plans the landing page as its own small static site (a second Vercel project, plain HTML and CSS, the game at `play.`). The P8-154 website brief is its creative brief. It measures itself the same way, set up like this:

- **Enable both on the new project.** Web Analytics and Speed Insights are switched on per project; enabling them on the app doesn't cover the landing page. Its events come out of the same account allowances (§2).
- **Use the plain-HTML snippet**, not the packages: the landing page has no React. Copy the two `<script defer>` tags the dashboard shows when you press Enable. Version 2 gives each project its own script address, so don't copy the app's. Both scripts load deferred and are small.
- **The one exception to "no client JavaScript":** Phase 10's engineering rule allows only the optional live ranks. These two scripts are the other exception, deliberately: they're how the page's own "done when" gets checked on real visitors.
- **Lab and field, both.** Phase 10's done-when asks for Lighthouse 95+ on a throttled phone, which is a lab test run once. Speed Insights is the same page on real phones afterwards. Record both, and treat a gap between them as a finding.
- **Measuring the two plates without paid events.** "Play in your browser" leaves for the app's web build: the app's Web Analytics shows the landing page as a **referrer**, so its visits to the app are counted by the app, for free. "Get it on Android" goes to the Play Store or the APK: count it on the store's side (Play Console acquisition), or with a custom event if the account is ever on Pro. Don't add UTM tags to the links: the app cuts query strings before sending (§1), and UTM reporting is a paid add-on anyway.
- **Say it on the page.** The landing page's footer links the same privacy page, which already covers the website. If the landing page ever measures anything the app doesn't, the privacy page says that too.
- **Compare the two projects** with the `--all --group-by projectId` query in §3.
