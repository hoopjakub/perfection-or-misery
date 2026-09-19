# 03 · The five viewpoints

> Part of the maturita set. Start at [`00-README.md`](00-README.md).
> Status: **plan.** Sources marked *(confirm edition)* are well-known works to look up and cite from the copy actually used; nothing here has been quoted yet. Economics waits for the literature Martin is providing.

The committee is examining a programming field, but the project is a game, a digital product and something meant to be published. Each viewpoint below says what it contributes to the **thesis**, what it contributes to the **defence**, what already exists in the repo to draw on, and what still has to be done.

---

## 1. Programming and digital technologies (the field itself)

**Why it's central.** Field 2573 M is *programovanie digitálnych technológií*. Criteria 2a–2d and 3d are judged mostly from this angle.

**In the thesis:** chapters 4.1–4.7 and 4.9 in [`02-THESIS-MAP.md`](02-THESIS-MAP.md).

**What the committee is likely to ask, so the chapters should already answer it:**
- Why React Native and Expo instead of native Kotlin or Flutter?
- How does one codebase run on Android and in a browser? What's different?
- How does a match get simulated? Show the formula.
- What does "deterministic" mean here, and why does it matter?
- How do you know the simulation is correct? (The verify scripts.)
- Where does the data come from, and how is it stored?
- How is the user's data protected? (Supabase auth and row-level security.)

**Already in the repo:** `docs/PROJECT_STATE.md`, `docs/Major Overhaul + Bug fixes.md`, the `scripts/verify-*.ts` suites, the diagnostics plan (`docs/diagnostics/`).

**Still to do:**
- Architecture and data-pipeline diagrams.
- A table of verification results from a fresh run of every verify script.
- Short, readable code listings for Appendix A.

**Sources to cite:** official React Native and Expo documentation (versioned pages, with access date); SQLite documentation; Supabase documentation; a PRNG reference for mulberry32 and seeded generation; ECMAScript specification on `Math` precision (for the cross-engine point).

---

## 2. Game design

**Why it matters.** The committee will ask *why* the game works the way it does. Game design language turns "I thought it would be fun" into reasoned decisions, which feeds 2d (creativity) and 3d (explaining concepts).

**Concepts to apply to PoM, one paragraph or table each:**

| Concept | Where PoM shows it |
|---|---|
| Core loop | draft → place → simulate → verdict → play again |
| Meaningful choice under uncertainty | picking from a random club-season; formation fit; bench decisions |
| Randomness: input vs output | the spin and placement are *input* randomness (you react to it); the match result is *output* randomness (it happens to you) |
| Risk and reward | rerolls, hidden ratings, the score multiplier for harder settings |
| Difficulty and fairness | screw levels; the tilt applies only to the player's matches so the rest of the table stays honest |
| Roguelike structure | short runs, no carry-over, variety from data rather than content authoring |
| Feedback and drama | live matchdays, Deep Match timeline, penalty shootouts, ceremonies, the verdict |
| Player types / motivation | optimisers chasing Perfection vs players enjoying the story of a Misery |

**Worth adding as evidence:** a small playtest with friends (5–8 people): what they understood, where they hesitated, what they replayed. Summarise in a table in chapter 4.2 or 5. That also strengthens 2c (practical usefulness).

**Sources to cite:** Jesse Schell, *The Art of Game Design: A Book of Lenses* *(confirm edition)*; Katie Salen and Eric Zimmerman, *Rules of Play* (2003); Raph Koster, *A Theory of Fun for Game Design* *(confirm edition)*; Ernest Adams, *Fundamentals of Game Design* *(confirm edition)*; Greg Costikyan, *Uncertainty in Games* (2013) for the randomness discussion.

---

## 3. Design of digital media (interface, identity, motion)

**Why it matters.** Criterion 1b judges figures and 3a judges the presentation, and both look better with a real design system behind them. The redesign is also the most visible "contribution" (2d).

**Already in the repo, and it's substantial:** `docs/ui-overhaul/`: the heuristic critique (22/40), the native audit (8/20), the locked direction *Kit Drop*, the style guide with computed contrast, motion spec, screen-by-screen plans, components, copy deck. `PRODUCT.md`.

**In the thesis:**
- 2.7 explains the theory: usability heuristics, WCAG contrast, design tokens, motion as identity.
- 4.8 shows the method and the result: critique score → direction → system → built screens, with before/after screenshots.
- Re-run the heuristic critique on the built app before submission and report both scores. A measured improvement is strong evidence for 2a and 2d.

**Presentation and printed document:** apply the same identity with restraint. The thesis itself must follow the template (Times New Roman, no colour styling of text), but figures, diagrams and the slide deck can carry the Kit Drop palette and type.

**Caution:** the Kit Drop direction references Nike's 2014 "Winner Stays" advert as mood. In the thesis, describe it as an influence on tone, never reproduce the advert, its imagery or any Nike marks.

**Sources to cite:** Don Norman, *The Design of Everyday Things* (revised 2013); Steve Krug, *Don't Make Me Think* *(confirm edition)*; Jakob Nielsen's 10 usability heuristics (Nielsen Norman Group); **WCAG 2.2** (W3C); Google **Material Design 3** guidelines (for Android conventions and window size classes).

---

## 4. The website

**Why it matters.** The app already runs on web from the same code, and Martin wants a real web presence. For the thesis it's two things: the web *version* of the app and a *site* that presents it.

| | Web version (exists) | Presentation site (to build) |
|---|---|---|
| What | the app in a browser via react-native-web | a landing page: what the game is, screenshots, play in browser, Google Play link, privacy policy, terms, contact |
| Thesis | 4.9: how one codebase serves the web, the in-memory database, platform workarounds, wide layouts | 4.10: publishing, SEO basics, legal pages; screenshots in Appendix B |
| Needed for release | yes | yes: Google Play requires a public privacy policy URL |

**Still to decide:** a domain name (already an open decision in `docs/ui-overhaul/00-README.md`) and hosting. Run the vibecode audit against the live site once it exists and report the result.

**Sources to cite:** web.dev / MDN documentation for performance and SEO basics; Expo documentation for web export and hosting.

---

## 5. Economics

**Status: waiting for Martin's literature.** The assignment sheet doesn't list economics as a criterion, so it enters the grade through **2c** (practical usefulness) and **2d** (contribution), and through the proposed assignment point 6. Confirm with the consultant how much space it may take; a sub-chapter (2.9) plus a cost table in 4.10 is a sensible default.

**Questions the economics part should answer:**

1. **Business model.** Free with no monetisation (portfolio), free with ads, one-time purchase, optional cosmetic purchases, or a supporter donation link. What each means for the design (a Misery verdict followed by an ad is a design problem, not only a revenue one).
2. **Costs.** Google Play developer registration (a one-time fee), domain and hosting, Supabase beyond its free tier, EAS builds beyond the free tier, any data licences. Every price is looked up on the day of writing and cited with the date, because they change.
3. **Market.** Who else is in the genre, how they earn, what players expect to pay for.
4. **Break-even or sustainability.** Monthly running cost vs expected users; what happens at 10, 1,000 and 100,000 players (the Supabase and hosting tiers change the answer).
5. **Legal and tax side of earning money** as a student in Slovakia. Flag only; this needs a qualified source or adviser, and the thesis should say so rather than guess.

**Monetisation and licensing interact.** Real player names, club data and competition marks that are risky in a free hobby app become much riskier the moment the app earns money. Decide the model *after* [`04-LICENSING-AND-RELEASE.md`](04-LICENSING-AND-RELEASE.md) §1–3 are answered.

**Sources:** to be added from Martin's literature. Keep them in the same citation format as everything else from the start.
