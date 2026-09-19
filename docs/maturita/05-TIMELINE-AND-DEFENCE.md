# 05 · Timeline, handover and defence

> Part of the maturita set. Start at [`00-README.md`](00-README.md).
> Status: **plan.** Fixed dates come from the assignment sheet; everything else is a proposal to adjust with the consultant. The defence date isn't in either file.

---

## 1. Fixed dates

| Date | What |
|---|---|
| 15 October 2026 | assignment issued; topic and *Zadanie* agreed |
| 22 March 2027, 13:00 | bound documentation, product and CD handed to the consultant |
| not stated | the 20-minute defence (practical part of the maturita, usually in spring) |

From today (15 September 2026) to submission is about 27 weeks. The plan keeps the last three weeks free for printing, binding and mistakes.

---

## 2. Phases

### Phase A · Before the assignment (15 Sep – 15 Oct 2026)

- Bring the topic and *Zadanie* proposal from [`02-THESIS-MAP.md`](02-THESIS-MAP.md) §1 to the consultant.
- Ask the consultant the open questions (§5 below).
- Replace the Expo `LICENSE` file (decision L4).
- Set up a reference manager (Zotero is free) with the citation style the consultant confirms, and start adding sources the moment they're read.
- Collect the literature for [`03-PERSPECTIVES.md`](03-PERSPECTIVES.md), including Martin's economics sources.

### Phase B · Build what the thesis will describe (mid Oct – end Dec 2026)

The thesis can only report what exists. Priorities, in order:

1. **UI overhaul Phase 0** (`docs/ui-overhaul/11-ROADMAP.md`): save runs on arrival, false copy, Android tab bug. Cheap and visible.
2. **Release credibility:** real icon and splash, privacy policy, account deletion, removal of official emblems (L3).
3. **Kit Drop Phase 1** on the most-shown screens (Home, draft, simulation, verdict), so before/after screenshots exist.
4. **Web presentation site** (landing page plus legal pages).
5. Diagnostics, if time allows. It makes excellent material for chapter 4.7.

**Freeze features at the end of December.** January onwards is writing, fixing and measuring only.

Alongside: write chapter 2 (literature review) as sources are read. It doesn't depend on the build.

### Phase C · Measure and write the core (Jan 2027)

- Run every verify script and record results for 4.7.
- Re-run the heuristic critique and native audit on the built app (for 4.8).
- Playtest with 5–8 friends; record observations (for 2.2 and 5).
- Draw all diagrams; take all screenshots at consistent sizes.
- Write chapter 4.

### Phase D · Complete the draft (Feb 2027)

- Write chapters 1, 3, 5, 6, 7 (introduction last, once the rest is true).
- Front matter, abbreviations, list of figures, bibliography, appendices.
- **Full draft to the consultant by mid February**, leaving time for their comments.

### Phase E · Finish (1 – 20 Mar 2027)

- Apply the consultant's comments.
- Formal check (§4).
- Print, bind (book the binding service in advance; it can take several days), burn the CD or prepare the USB.
- Hand in **before** 22 March, ideally by 19 March, not at 12:55 on the day.

### Phase F · Defence preparation (after submission)

Slides, rehearsals, the question bank (§6).

---

## 3. Handover checklist (22 March 2027)

Missing an item counts as failing the PČOZ MS, so every line is mandatory.

- [ ] Written part, **bound**, with the **assignment sheet bound inside**
- [ ] Signed *Čestné vyhlásenie*
- [ ] **Product**: the app (APK on the medium, plus the Google Play and web links if published)
- [ ] **CD** (or accepted replacement) containing: the thesis as DOCX and PDF, the source code, the APK, the presentation if ready, a `README` explaining the contents
- [ ] Handed to the consultant **before 13:00**

---

## 4. Formal check before printing

Criterion 1a (5 points) and 1c (10) are won or lost here.

- [ ] Every body paragraph uses the `text` style; every heading uses `Kapitola`
- [ ] Table of contents, list of figures and page numbers regenerated after the last edit
- [ ] Margins untouched (left 3.5 cm for binding)
- [ ] At least 20 pages of body, excluding appendices
- [ ] Every figure and table numbered, captioned, listed and referenced in the text
- [ ] Every source cited in the text appears in the bibliography and vice versa; one citation style throughout
- [ ] Abbreviations list alphabetical and complete
- [ ] Slovak spelling and grammar checked (a second reader helps)
- [ ] No placeholder text left from the template (`<Názov práce>`, Lorem ipsum, the duplicated list heading)
- [ ] Declaration and acknowledgements personalised and dated

---

## 5. Questions for the consultant (October)

1. Is a Results chapter allowed between *Materiál a metodika* and *Diskusia*, or should results sit inside chapter 4?
2. Which citation standard: STN ISO 690, and with numbered references as the template shows?
3. What is the school's policy on AI coding assistants, and how should their use be disclosed?
4. Is a USB drive accepted instead of or alongside the CD?
5. How much space may the economics and licensing parts take?
6. Is an English summary expected?
7. Can appendices beyond A and B be added (user guide, test results, licences)?
8. For the defence's 20 minutes: how long is the presentation, and how long are questions? Is a live demo allowed, and will a projector, internet and phone mirroring be available?
9. Is the defence date known?

---

## 6. The defence (20 minutes, 35 points)

### 6.1 Structure (assuming about 10–12 minutes of talk; adjust to §5 answer 8)

| Min | Part | Slides |
|---|---|---|
| 1 | The problem and the idea | title, one screenshot |
| 2 | Goals | the goals from chapter 3 |
| 3 | How a run works (game design) | run flow |
| 3 | How it's built: architecture, data, simulation, determinism, verification | 3–4 diagrams, one formula |
| 2 | Live demo or short recording: one run from draft to verdict | video fallback on the laptop |
| 1 | Results and design: before/after, scores | 1–2 |
| 1 | Release, licensing, economics, what's next | 1 |

Slides follow the Kit Drop identity: little text, large figures, no reading from slides.

**The demo always has a recorded fallback.** A frozen dev build in front of the committee costs 3a and 3c.

### 6.2 Question bank to rehearse

Answers should fit in under a minute each and use correct terms (criterion 3d).

- Why React Native and not native Android?
- What is Expo, and what's the difference between Expo Go and a development build?
- How does the match simulation decide a result? Why a sigmoid?
- What is a seed? What is a PRNG? Why is the output deterministic, and what isn't?
- How do you verify thousands of matches are correct?
- Where does the data come from? Is that legal? (§1 of [`04`](04-LICENSING-AND-RELEASE.md))
- How is user data stored and protected? What is row-level security?
- What would you change if you started again?
- How did you use AI tools, and what was your own contribution?
- How would the app make money, and what does it cost to run?
- What is WCAG contrast, and how did you measure it?
- How does the same code run on the web?

### 6.3 Rehearsal

- Three full timed rehearsals, at least one in front of someone who asks unexpected questions.
- Record one and watch it for filler words and pace (criterion 3c).
