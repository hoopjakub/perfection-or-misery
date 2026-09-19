# 01 · What the school asks for

> Part of the maturita set. Start at [`00-README.md`](00-README.md).
> Status: **read from the source files** on 15 September 2026. Originals and text copies are in [`zdroje/`](zdroje/).

Two files:

- **`Vzorové zadanie PČOZ MS_PDT_2026 2027.docx`**: the sample assignment sheet and the marking sheet for the practical part of the vocational maturita (*praktická časť odbornej zložky maturitnej skúšky*, PČOZ MS), field **2573 M programovanie digitálnych technológií**, school year 2026/2027.
- **`KOP_sablona_2026.docx`**: the Word template the written documentation must use, from SPŠE Hálova 16, Bratislava.

---

## 1. The assignment sheet

| Item | Value |
|---|---|
| Form | defence of your own project (*obhajoba vlastného projektu*) |
| Assignment date | **15 October 2026** |
| Submission deadline | **22 March 2027, 13:00**, to the consultant |
| Defence length | **20 minutes** |
| Topic number and assignment text | blank on the sample; filled in per student |
| Aids | digital technology; **STN 01 6910** (rules for writing and formatting documents) |

### 1.1 Instructions (*Pokyny*), in order

1. Follow the assignment.
2. Use digital technology.
3. Write the documentation on a computer, meeting the language and administrative requirements for final theses, **at least 20 pages excluding appendices**, in the prescribed template.
4. Work with your consultant at agreed consultation dates and follow their advice.
5. Prepare an electronic presentation following the rules for presentations.
6. Submit the bound documentation together with a **CD** containing the text of the work and other relevant files.

### 1.2 What gets handed in on 22 March 2027

- the **bound written part**, with the assignment sheet bound inside it,
- the **product** (the sheet's examples: a physical product, DVD, USB and so on),
- the CD from instruction 6.

**Not following the submission instructions counts as failing the PČOZ MS.** That line is on the sheet, so the handover checklist in [`05-TIMELINE-AND-DEFENCE.md`](05-TIMELINE-AND-DEFENCE.md) §3 treats every item as mandatory.

**Open question for the consultant:** in 2027 a CD may be hard to produce. Ask whether a USB drive is accepted in place of the CD, or in addition to it.

---

## 2. The marking sheet

100 points in three blocks. The weights show where the effort should go.

### 2.1 Graphic level of the project, use of literature and sources: 25

| | Criterion | Points |
|---|---|---|
| a | formal level of the documentation | 0–5 |
| b | quality of tables, images, graphs and diagrams | 0–5 |
| c | clarity and logical structure of the text | 0–10 |
| d | correctness of citations and the bibliography | 0–5 |

### 2.2 Professional level of the project: 40

| | Criterion | Points |
|---|---|---|
| a | meeting the goals and the assignment | 0–10 |
| b | independence in solving the problem (*samostatnosť*) | 0–10 |
| c | practical usefulness of the results | 0–10 |
| d | creativity and contribution of the solution | 0–10 |

### 2.3 The defence: presentation and professional terminology: 35

| | Criterion | Points |
|---|---|---|
| a | substance and clarity of the presentation | 0–10 |
| b | ability to answer the committee's questions | 0–10 |
| c | manner of speaking and presence | 0–5 |
| d | ability to explain technical terms and connections | 0–10 |

### 2.4 Grade bands

| Points | Grade |
|---|---|
| 90–100 | výborný (1) |
| 73–89 | chválitebný (2) |
| 56–72 | dobrý (3) |
| 45–55 | dostatočný (4) |
| 0–44 | nedostatočný (5) |

### 2.5 What the weights mean for this project

- **The defence is worth 35.** More than the whole written formal side (25). Criteria 3b and 3d (20 points together) are about answering questions and explaining terms, so understanding every part of the app out loud matters as much as the app.
- **The app itself mostly scores through 2a–2d (40).** PoM is strong on 2c (usefulness: a playable, released product) and 2d (creativity: the simulation depth, the deterministic stats, the design direction).
- **2b, independence, needs a deliberate answer.** See [`04-LICENSING-AND-RELEASE.md`](04-LICENSING-AND-RELEASE.md) §6 on AI assistance and the honesty declaration.
- **1d, citations (5), is easy to lose and easy to win.** It needs a consistent citation standard from the first draft, not a cleanup at the end.

---

## 3. The template

### 3.1 Page setup (measured from the file)

| Setting | Value |
|---|---|
| Paper | A4 |
| Margins | top, right, bottom **2.5 cm**; left **3.5 cm** (binding edge) |
| Header / footer distance | 1.25 cm |
| Page numbers | in the footer |

### 3.2 Styles (measured from the file)

| Style | Use | Formatting |
|---|---|---|
| `text` | body text | Times New Roman **12 pt**, **1.5 line spacing**, first-line indent **1.25 cm**, justified, no space after |
| `Kapitola` | numbered chapter and sub-chapter headings | Times New Roman **14 pt, bold, all caps**, 1.5 spacing, automatic numbering |
| `Obsah 1`, `Obsah 2` | table of contents | generated by a Word TOC field, which is already in the file |
| Word defaults | anything not styled | Aptos/Calibri theme font 11 pt. **Every paragraph must use `text` or `Kapitola`**, or it will quietly break formal criterion 1a |

### 3.3 Required order of parts

**Front matter**

1. Cover: school name and address, `<Názov práce>`, field number and name, author, city, year, year of study.
2. Title page: the same, plus the supervisor (*školiteľ*).
3. **Čestné vyhlásenie** (declaration of honesty). The template text reads, in translation: *"I declare that I prepared the PČOZ MS work on the topic … independently, using the literature sources listed."*
4. **Poďakovanie** (acknowledgements), optional in content.
5. **Obsah** (table of contents).
6. **Zoznam skratiek, značiek a symbolov** (abbreviations, alphabetical).
7. **Zoznam tabuliek, grafov a ilustrácií** (list of tables, graphs and illustrations).

**Body**

| # | Chapter (as in the template) | English |
|---|---|---|
| 1 | Úvod | Introduction |
| 2 | Problematika a prehľad literatúry | Background and literature review |
| 3 | Ciele práce | Goals of the work |
| 4 | Materiál a metodika | Materials and methods |
| 5 | Diskusia | Discussion |
| 6 | Závery práce | Conclusions |
| 7 | Zhrnutie | Summary |

**Back matter**

- **Zoznam použitej literatúry** (bibliography), numbered `[1]`, `[2]`…
- **Prílohy** (appendices): the template lists *Príloha A – Zdrojový kód* (source code) and *Príloha B – Fotodokumentácia* (photo documentation).

### 3.4 Things noticed in the template

- **There is no Results chapter.** The body jumps from *Materiál a metodika* to *Diskusia*. For a software project, the built app has to be described somewhere. Either results sit as sub-chapters inside *Materiál a metodika*, or a *Výsledky práce* chapter is added between 4 and 5. **Ask the consultant which.** Until then, [`02-THESIS-MAP.md`](02-THESIS-MAP.md) treats it as sub-chapters of chapter 4, which needs nobody's permission.
- **The list-of-figures page has a placeholder copied from the abbreviations page** (`<Zoznam skratiek, značiek a symbolov>` under the *Zoznam tabuliek* heading). Replace it with a generated list of captions.
- **The chapter headings are all caps** through the style, so type them in sentence case and let Word capitalise them. Retyping in caps breaks the TOC's appearance.
- **"Fotodokumentácia"** assumes a physical product. For an app, Appendix B becomes screenshots, with their captions in the list of illustrations.
- **Citation standard isn't named** in either file. STN 01 6910 covers formatting; citations in Slovak schools normally follow **STN ISO 690**. Confirm with the consultant before the first draft.
