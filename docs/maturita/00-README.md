# Maturita project (PČOZ MS): the plan

> Written 15 September 2026. Status of the set: **plan.** No app code has changed. Economics waits for the literature Martin is providing.
> Related sets: [`../ui-overhaul/00-README.md`](../ui-overhaul/00-README.md), [`../diagnostics/00-README.md`](../diagnostics/00-README.md).

## What this is

Perfection or Misery becomes Martin's practical maturita project at SPŠE Hálova, field **2573 M programovanie digitálnych technológií**, school year 2026/2027. The school supplied two files, saved unchanged in [`zdroje/`](zdroje/) with plain-text copies: the Word template for the written part, and the sample assignment sheet with the marking criteria.

This set reads both files closely, maps the app onto the template chapter by chapter, adds the viewpoints beyond programming (game design, digital media design, the website, economics), lists the licensing and release issues a public upload raises, and lays out a timeline to the 22 March 2027 handover and the defence.

## The short version

| | |
|---|---|
| Assignment issued | 15 October 2026 |
| Handover | **22 March 2027, 13:00**: bound documentation with the assignment inside, the product, a CD |
| Written part | **at least 20 pages** without appendices, in the school template; STN 01 6910 |
| Defence | **20 minutes**, electronic presentation |
| Marking | documentation 25 · professional level of the project 40 · defence 35 |
| Grade bands | 90+ výborný · 73+ chválitebný · 56+ dobrý · 45+ dostatočný |
| Missing a handover item | counts as failing the PČOZ MS |

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [`01-REQUIREMENTS.md`](01-REQUIREMENTS.md) | Everything the two files require: instructions, marking sheet, measured template formatting, chapter order, gaps in the template |
| 02 | [`02-THESIS-MAP.md`](02-THESIS-MAP.md) | A proposed topic and assignment text, page budget, what goes in every chapter, figures, appendices |
| 03 | [`03-PERSPECTIVES.md`](03-PERSPECTIVES.md) | Programming, game design, digital media design, the website and economics: what each adds, what exists, what to read |
| 04 | [`04-LICENSING-AND-RELEASE.md`](04-LICENSING-AND-RELEASE.md) | Data rights, names and marks, third-party licences, AI disclosure, GDPR, Google Play, website; a decision table |
| 05 | [`05-TIMELINE-AND-DEFENCE.md`](05-TIMELINE-AND-DEFENCE.md) | Phases to submission, handover checklist, formal check, questions for the consultant, defence structure and question bank |

## Worth knowing now

1. **The defence is worth more than the written formatting.** 35 points against 25. Twenty of those are answering questions and explaining terms, so understanding every part of the app out loud is as important as the app.
2. **The template has no Results chapter.** Results go inside *Materiál a metodika* unless the consultant allows an extra chapter.
3. **The honesty declaration says "independently".** With criterion 2b (independence, 10 points), how AI assistance is disclosed has to be agreed with the consultant in October, not discovered in March. See 04 §6.
4. **The repo's `LICENSE` names Expo as the copyright holder.** It's the untouched template file. Replace it now.
5. **Data rights are the biggest release question.** The bundled database is scraped from Transfermarkt, and the World Cup mode ships the official FIFA emblem. Fine to discuss honestly in a school project; not fine to upload publicly without a decision. See 04 §1–3.
6. **Freeze features at the end of December.** The thesis can only describe what exists; January to March is for measuring, writing and printing.

## Decisions taken in this plan

- Results are written as sub-chapters of chapter 4, so the template stays unchanged until the consultant says otherwise.
- Target 32–38 body pages, safely over the 20-page minimum.
- Licensing and economics enter the grade through a proposed assignment point ("prepare the app for public release"), rather than sitting outside the brief.
- Every figure is vector or a clean screenshot; every price and policy is cited with the date read.

## Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| M1 | Topic wording | the proposal in 02 §1 |
| M2 | Results chapter | inside chapter 4 |
| M3 | Citation standard | STN ISO 690, numbered |
| M4 | AI disclosure | disclosed as a tool in chapter 4.1 and discussed in 5 |
| M5 | Economics depth | sub-chapter 2.9 plus a cost table in 4.10 |
| M6 | CD or USB, and whether the database is on it | CD as required; scripts and source, database only if L1 allows |
| L1–L7 | Licensing decisions | see 04 §10 |

## How this was made

Both `.docx` files were read with a small script that keeps paragraph styles and tables, and the template's page setup and styles were measured from its XML (margins, fonts, sizes, spacing). Repo facts come from the code and existing docs as of 15 September 2026. Legal and store-policy points are questions to verify against primary sources, not conclusions; nothing was looked up online yet. No economics literature has been read yet.
