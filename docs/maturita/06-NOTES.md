# 06 · Maturita notes

> Part of the maturita set. Start at [`00-README.md`](00-README.md).
> Status: **a running log**, started 29 September 2026. Whenever the maintainer says something is worth using in the thesis or the defence, it goes here, dated, with where the detail lives. Newest at the bottom. Nothing here is thesis text yet; it's the raw material.

## How to use this file

- One entry per event or decision: the date, what happened, why it matters for the thesis, and links.
- Keep the evidence: quote exact replies (emails, answers) with their date, because the committee may ask to see them.
- Mark each entry with the chapter it feeds (see [`02-THESIS-MAP.md`](02-THESIS-MAP.md)).

---

## 2026-09-29 · The legal side becomes a big part of the presentation

**What.** The maintainer decided the presentation shows the personal build (real names and crests, on his own phone, private and non-commercial) and **raises the legal questions openly as one big part**: what a football game may and may not show, why the public build ships without crests and competition logos, the two build flavours, and the Transfermarkt question below.

**Why it's worth it.** It shows the committee the author understood the rights involved and made choices on purpose ([04](04-LICENSING-AND-RELEASE.md), criteria 2c, 3b, 3d).

**Where the detail is.** [`../release/01-NAMES-MARKS-AND-THE-LAW.md`](../release/01-NAMES-MARKS-AND-THE-LAW.md) (the law, the risks, the flavours, how 38-0 does it), [`../release/06-OUR-OWN-DATA.md`](../release/06-OUR-OWN-DATA.md) (a public-domain alternative to scraped data).

**Chapters.** Materiál a metodika (data sources), Výsledky (the two flavours), Diskusia (the risks and the choices).

---

## 2026-09-29 · Scraping turns out to be a real problem; the data gets rebuilt

**What.** Transfermarkt's legal notice requires prior written consent for any reproduction, and its Terms of Use (§11.1, read 29 September) forbid access or copying by "bots, spiders, screen scraping or other automated processes" and reserve text and data mining (§44b UrhG). Further research by the maintainer added the EU database right and the GDPR (the Dutch regulator's May 2024 guidance that scraping personal data is "almost always" illegal). FotMob's terms also forbid it; Sofascore has no public licence. The maintainer concluded that the data **has to change now**, not after an answer from Transfermarkt.

**Decision.** Stop scraping; rebuild the database from public-domain sources (Wikidata, openfootball) with a rating model of our own; switch the public web build first. Plan: [`../release/06-OUR-OWN-DATA.md`](../release/06-OUR-OWN-DATA.md).

**A correction worth mentioning in the defence.** One source cited *Ryanair v PR Aviation* (CJEU 2015) as enforcing the database right against scraping facts. The ruling says that a database **without** that protection can still be closed by the site's terms (contract). Checking a source rather than repeating it is itself a good point for criterion 3b.

**Decided (29 Sept): present on the open-data build.** The line for the presentation: *"I started with web scraping, but realised that for most good data sources it isn't allowed, so I built my own."* ("Started with" rather than "wanted to", because the first version was built on scraped data and the repo shows it.) Chosen: public-domain data, **Wikipedia as the main source** (its API rules allow automated access, which is exactly the contrast with Transfermarkt and FotMob), a rating of our own with league strength built in, gaps filled by editing Wikidata/Wikipedia, player-editable names in the public build. The options that replaced scraping are in [`../release/06-OUR-OWN-DATA.md`](../release/06-OUR-OWN-DATA.md) §5.2, which is a ready-made slide.

**Chapters.** Materiál a metodika (data sources, then and now), Výsledky (the rebuild, coverage, the calibration against the old ratings), Diskusia (law, ethics, what data costs).

---

## 2026-09-29 · A licensing enquiry to Transfermarkt

**What.** The first draft asked whether past use was okay. **Rewritten as a forward-looking licensing and partnership enquiry:** does Transfermarkt license its data to a small, free, non-commercial project, including storing it offline in the app, and on what terms. The rebuild goes ahead whatever the answer.

**The email.** [`../release/07-ASKING-TRANSFERMARKT.md`](../release/07-ASKING-TRANSFERMARKT.md), to `sales@transfermarkt.com` (marketing and collaboration).

| | |
|---|---|
| Sent | *not yet* (fill in the date) |
| Reply | *waiting* (paste the reply here, with its date) |
| What it changed | *after the reply* |

**Why it's worth it.** A documented licensing enquiry and its answer, whatever it is, belongs in the legal part of the presentation and in the economics part (what data costs).

**Chapters.** Diskusia; the business plan's distribution and licensing section (8.3); the email and reply as an appendix.

---

## 2026-09-30 · The open-data rebuild, measured

**What.** The player database was rebuilt from Wikipedia and Wikidata (public, and their rules allow automated access) with a rating model of our own. Numbers worth showing:

| | |
|---|---|
| Coverage probe, England 2018–19 | 20 of 20 clubs with a full squad; 92% of players confirmed by a career-table row |
| Local-language Wikipedias (Slovak, Italian) | added almost nothing (Slovakia 64% → 64% of players with an article), so the build stays English-only: a measured "no" |
| Rating, England 2018–19 | same scale as the game (mean 81.1 vs 81.2), correlation 0.84 with the old market-value ratings, from facts alone (club position, playing time, goals by position, age); no constant fitted to the old data |
| La Liga, 8 seasons | 3,879 player-seasons, about 80% of the old squad sizes (the old ones also counted unused players) |

**Worth telling in the defence:** the model was judged on real output and corrected three times (one-game squad players rated too high; scoring defenders over-rewarded; a 17-year-old ever-present, Lamine Yamal, pushed down by an age rule that ignored playing time), each with the player who exposed it. The review sheet is in `docs/release/open-data/`.

**Chapters.** Materiál a metodika (sources, rules), Výsledky (coverage, calibration), Diskusia (what open data can't give: assists, minutes).
