# Play Store listing

Everything the Google Play listing needs, in one place. The screenshots must be captured from the real app on a phone, never mock-ups passed off as the real thing (Phase 6 rule, and Google's).

## What Google asks for

| Asset | Size | Notes |
|---|---|---|
| App icon | 512 × 512 PNG, 32-bit | From `assets/icon.png` (1024 × 1024), scaled down. Replace once the final logo (P8-74) exists. |
| Feature graphic | 1024 × 500 PNG or JPEG | Shown above the screenshots. The logo on nylon `#141416`, no screenshots, no small text. |
| Phone screenshots | 2–8, 9:16 portrait, each side 320–3840 px | PNG or JPEG, no transparency. Any modern phone's own screenshot is fine as it is. |
| Short description | up to 80 characters | Below. |
| Full description | up to 4,000 characters | Below. |
| Privacy policy URL | a public page | `https://perfection-or-misery.vercel.app/privacy` |

## The eight screenshots, in order

Take them on the phone (power + volume down), with the phone's status bar clean: full battery or charging hidden, no notifications. The fastest way into a finished run is the **Quick Sim Tester** (About → tap the version eight times, in a dev or preview build).

| # | Screen | How to get there | Caption idea (optional, top of the image) |
|---|---|---|---|
| 1 | **The draft**, mid-spin or with a club card open | Start a run → pick a mode → Spin | "Draft an XI from real club-seasons" |
| 2 | **The draw**, globe landed and "You're …" label showing | Finish the draft → the draw | "Get dropped into a real league" |
| 3 | **The live season**: strip, table with zone tapes, your scoreline | Start the season, pause around matchday 10 | "Survive a whole season" |
| 4 | **The match sheet**, the Facts tab with the timeline | Tap your result during the season | "Every match, stat by stat" |
| 5 | **Awards Night**, a winner on screen | Finish a league run | "Awards Night" |
| 6 | **The verdict**, ideally PERFECTION or ABSOLUTE MISERY | The result screen after Awards Night | "Perfection…" / "…or Misery" |
| 7 | **A cup**: the World Cup groups or the Champions League knockouts | A World Cup or UCL run | "Champions League. World Cup." |
| 8 | **Ranks** with a few real runs on it | The Ranks tab | "Climb the ranks" |

If you only take four, take 1, 3, 6 and 7.

Keep the eight raw captures. If captions are added later, add them as a band above the screenshot on a nylon background, in the app's own type, and never paint over the screenshot itself.

## Short description (80 characters max)

> Draft an XI from real club-seasons. Survive the season. Perfection or Misery?

(77 characters.)

## Full description

> Perfection or Misery is a football roguelike. Every run, you draft a starting XI from random real club-seasons, one spin at a time. Then you're dropped into a real league and a real season, replacing a real club, and you find out what your side is worth.
>
> **The draft.** Spin a club-season, pick one player from it, fill your shape. Rerolls are limited, and on the harder settings the ratings are hidden until the squad is done.
>
> **The season.** Watch it play out matchday by matchday: the table moves, the press writes about you, and every match has a full sheet of stats, ratings and a timeline.
>
> **The modes.** A domestic league, All Time, Chaos and Cursed, the UEFA Champions League (the finals, or the full path from your domestic season through the qualifiers), and the FIFA World Cup.
>
> **The verdict.** At the end, Awards Night hands out the player of the season and the team of the season, and your run gets its verdict, from PERFECTION down to ABSOLUTE MISERY, with a score that counts how hard you made it for yourself.
>
> **The ranks.** Keep your runs, build a career across them, and see where your best one sits against everyone else's.
>
> Free, no ads, no tracking. Play in the browser at perfection-or-misery.vercel.app or on Android.
>
> Player, club, league and competition names identify real footballing history. Perfection or Misery is not affiliated with, endorsed by or connected to any player, club, league, UEFA or FIFA.

## Before submitting

- Official marks: the listing and screenshots name UEFA and FIFA competitions. Decide whether they get renamed for the public release (Phase 6 open item); Google can reject apps that look endorsed by a brand.
- Data safety form: answer it from `/privacy`. Collected: a username, and the runs you play (no email, no location, no device IDs), stored with Supabase, never shared or sold. Deletion is in the app, under You → Delete account.
- Content rating: a sports game with no violence, gambling or user chat, and IARC should rate it Everyone / PEGI 3. Friends and versus exist in code but have no UI yet (P8-90); if they ship, the "users interact" answer changes.
