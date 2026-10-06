# 09 · From here to Phase 9

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **plan, 2 October 2026.** One order across every finding in this set, the centralisation plan and Wave F. The step detail lives in [`../centralisation/12-PHASE-TWO-FINAL.md`](../centralisation/12-PHASE-TWO-FINAL.md); this page is the map.

---

## 1. The phases

| # | Phase | What | Detail | Ends when |
|---|---|---|---|---|
| 1 | **Step 0** | The quick fixes: the pundits' ordinal (G-L6), the dead shootout (G-L7), the guide's Medium (G-L4), dead code (C-17), one `surname` (L-11), immutable caching (P-2), the analytics probe (M-1) | 12 §2 | one sitting; every grep in 12 §2 at zero |
| 2 | **Step 1** | Team marks and grounds | 12 §3 | `withFlag` gone |
| 3 | **Step 2** | Engine helpers; the ratings fix (G-L1) and one strength scale (G-L3), each behind a check that failed first (C-1 to C-6) | 12 §4, [`02-LOGIC.md`](02-LOGIC.md) | checks green, before/after numbers written down, the maintainer's two test runs |
| 4 | **Steps 3–5** | The stage model, the live screens' shell (abandon and speed everywhere first), one knockout view | [`../centralisation/10-PHASE-TWO-REVISED.md`](../centralisation/10-PHASE-TWO-REVISED.md) | as 10 says |
| 5 | **Step 6 = Wave F** | One short result screen, the depth in the run hub | [`08-RESULT-PAGES.md`](08-RESULT-PAGES.md) | F1–F3 done-whens |
| 6 | **Steps 7–8** | Press in every stage; the rest (the match sheet on the Kit) | 12 §5 | re-count: only deliberate leftovers |
| 6b | **Difficulty, rethought** | The model the maintainer picks from [`11-DIFFICULTY.md`](11-DIFFICULTY.md); built after step 2 (one strength scale), measured together | [`11-DIFFICULTY.md`](11-DIFFICULTY.md) §6 | A1–A4 done-whens |
| 6c | **Daily challenges** | Seeded draft and placement, a random restriction a day, the catalogue, feats and tags, `supabase/daily.sql` | [`10-DAILY-CHALLENGES.md`](10-DAILY-CHALLENGES.md) §8 | D1–D5 done-whens |
| 7 | **Close Phase 8.5** | Re-score the interface (target 34/40), check C-7 (`verify-runs`) for the fun numbers, update the roadmap | [`05-UI-RESCORE.md`](05-UI-RESCORE.md) | the re-score table filled |
| 8 | **Phase 9** | Performance and Diagnostics on the phone, plus P-1/P-3 (web first load) if M-1 found visitors | [`04-PERFORMANCE.md`](04-PERFORMANCE.md), [`../diagnostics/`](../diagnostics/00-README.md) | Phase 9's own |
| 9 | **Phase 9.5** | The maintainer's pass down [`../PHASE-9.5-CHECKLIST.md`](../PHASE-9.5-CHECKLIST.md) on a native build | | every row marked |

Ideas ([`07-FRESH-IDEAS.md`](07-FRESH-IDEAS.md)) slot in where that page says: I-2, I-3 and I-4 inside Wave F; I-6 at the end of step 2 if the maintainer wants I-1 (the daily draft) soon after.

## 2. Risks

| # | Risk | Likelihood | What happens | Mitigation |
|---|---|---|---|---|
| R-1 | The leaderboard is gamed before results are seeded (03 S-2) | low while it's friends-scale; high if it goes public | fake scores on Ranks | tighter `invalidRun` first; I-6 before any public promotion |
| R-2 | One strength scale (G-L3) moves every balance number | certain | difficulty, Europe and score multipliers drift | checks first, re-measure, retune with numbers written down (12 §4) |
| R-3 | Phase two is long and Wave F waits behind it | medium | the maintainer's top complaint (the scroll) stays for weeks | F1 needs steps 3 and 5; if that's too long, ship F1's **action move** alone (Play again under the verdict, the ThumbBar) as part of step 0, which needs nothing else |
| R-4 | Analytics stays empty | medium | Phase 9's web work has no field numbers | M-1 in step 0 decides it in minutes |
| R-5 | A DB bump breaks old runs' sheets | low | a stored scorer with no line | C-1's old-run fixture |

R-3's fallback is worth taking either way: moving `ResultActions` under the verdict is a few lines in each of the four result files and fixes the worst part of the scroll at once. It's listed as step 0's optional last item; the default is **yes, do it** (open decision D-2).

## 3. Documents to update as each phase lands

- `docs/ui-overhaul/11-ROADMAP.md`: Wave G *(Done …)* when this set is accepted; P8.5-43 and P8-54 when Wave F lands.
- `docs/centralisation/00-README.md`: status line points at 11 and 12.
- `docs/PHASE-9.5-CHECKLIST.md`: a row per built item, wave and date, as always.
- `docs/PROJECT_STATE.md`: the audit pointer (added with this set).
- This set's 02 §8 and 05 §1: the before/after numbers and the re-score.
