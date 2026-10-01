# 07 · Asking Transfermarkt

> Part of the [release set](00-README.md). Status: **draft, not sent.** Rewritten 29 September 2026 (evening). The maintainer sends it himself.
>
> **What changed:** the first draft asked "I've used your data; is that okay?". The maintainer asked for it to become **a request about a future licence or partnership** instead, because the game's data is being rebuilt from open sources now ([06](06-OUR-OWN-DATA.md)) whatever Transfermarkt answers. The email asks whether PoM could **license** Transfermarkt data for a later version. It doesn't depend on the answer.

## 1 · What their site says

- **The legal notice** (copied by the maintainer, 29 September): all rights reserved; reproduction, even in part, needs Transfermarkt's prior written consent; commercial resale is prohibited.
- **The Terms of Use, §11.1** (read 29 September, [transfermarkt.com/intern/anb](https://www.transfermarkt.com/intern/anb)): no access or copying by bots, spiders, screen scraping or other automated processes; no AI training; text and data mining rights reserved under §44b UrhG.
- **The maintainer's notes say Transfermarkt has a data-licensing team** that sells database access (market values, transfer histories) to companies. No public page for it was found this session; the contact page's "Marketing / collaboration" address is the way in.

## 2 · Who to send it to

From [transfermarkt.us/intern/tmteam](https://www.transfermarkt.us/intern/tmteam) (read 29 September):

| Address | Listed as | Use |
|---|---|---|
| **`sales@transfermarkt.com`** | Marketing / collaboration | **To.** Licensing and partnerships; the team page lists a *Marketing & Partnerships Manager* and a *Sales & Partnership Manager* |
| `info@transfermarkt.us` | General | Optional CC |
| `press@transfermarkt.com` | PR and media | Not for this |

**Send from `perfectionormisery@gmail.com`**, the project's contact address, so the reply lands with the project. Address the team, not guessed personal addresses. If there's no reply in three weeks, one short follow-up in the same thread. No reply means no licence; the open database goes ahead anyway.

## 3 · The email (English)

Fill in the `[…]` parts. Short on purpose.

> **Subject:** Licensing enquiry: Transfermarkt data for a free student football game (Slovakia)
>
> Hello Transfermarkt team,
>
> My name is [your name]. I'm a secondary-school student in Slovakia, and for my final school project (the *maturita* practical exam, March 2027) I'm building a football game called **Perfection or Misery**. You draft an XI from real club-seasons and play a league, a European cup or a World Cup. It's free, with no ads and no purchases, on Android and in the browser.
>
> I'd like to ask whether Transfermarkt offers a **data licence or partnership** that a small, non-commercial project like this could use, now or for a later version. The data that would matter most is:
>
> - squads per club and season (name, position, age, nationality),
> - appearances, minutes, goals and assists,
> - market values, as the basis for player ratings.
>
> The game stores its data inside the app so it works offline, so I'd need to know whether that's possible under a licence. I wouldn't use crests or logos.
>
> In return I'd credit Transfermarkt clearly in the app and on the website, with a link, in whatever form you prefer.
>
> Could you tell me whether this is something you offer, and on what terms or at what cost? Even a short "not for projects of this size" helps me plan.
>
> Thank you for your time. I've used Transfermarkt for years.
>
> Kind regards,
> [your name]
> [school name], Slovakia

**German?** Optional. The address is on the international domain, so English is fine. Send one language, not both.

## 4 · Being straight, without volunteering a confession

The email asks about the future and says nothing untrue. It doesn't describe how the current version got its data, and **it must not claim the game has never used Transfermarkt data.** If they ask, answer honestly: an early version was built from their pages; after reading their terms, that data is being replaced with public-domain sources; the licence question is about using their data properly. Doing the rebuild ([06](06-OUR-OWN-DATA.md)) before or while the email is sent is what makes that answer comfortable.

## 5 · After the answer

| Answer | What happens |
|---|---|
| **A licence on terms that fit** (price, offline storage allowed) | Record the exact wording and date in [`../maturita/06-NOTES.md`](../maturita/06-NOTES.md); licensed data can be added to the open database later (market values, fuller coverage) under the licence's terms, with their credit |
| **Only for companies, or too expensive** | The open database stays. A good point for the thesis's economics part: what data costs |
| **No, or no reply** | Same |

Whatever the answer, the question and the reply go into the presentation's legal section (L5).

## 6 · What not to put in the email

- No promise about monetisation ([`../maturita/04-LICENSING-AND-RELEASE.md`](../maturita/04-LICENSING-AND-RELEASE.md) L5 isn't decided). "It's free" describes today.
- No argument that any past use was allowed.
- No request for crests or logos; the game drops them anyway.
