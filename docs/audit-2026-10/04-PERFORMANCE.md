# 04 · Performance: what the web costs, and where the phone's numbers will come from

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **findings, 2 October 2026.** The phone side stays with the Diagnostics plan ([`../diagnostics/00-README.md`](../diagnostics/00-README.md)) and Phase 9; this document doesn't redo it.

There is no field data to rank by ([`01-MEASURED.md`](01-MEASURED.md) §1), so this is the web build measured from the outside, plus the phone items already queued for Phase 9 with what this audit adds to them.

---

## 1. Findings

| # | Finding | Evidence | Estimated effect | Proposal |
|---|---|---|---|---|
| P-1 | **~6 MB before the first spin.** One 5.17 MB JS chunk (1.38 MB gzip), a 13.4 MB database (4.5 MB gzip, served brotli), a 0.6 MB wasm | `expo export -p web`, legal flavour, 2 Oct; the DB hash matches production | The dominant cost on a phone on mobile data. **Estimate, not measured in the field** | (a) Load the database after first paint, behind the Home screen, so the shell shows at once; (b) consider a smaller "draft" database for the web with only what a spin needs, the full one fetched when a run starts. Measure LCP and "time to first spin" before and after, once M-1 says there are visits |
| P-2 | **The hashed database isn't cached.** `/_expo/*` (the JS) was already `immutable`; `/assets/*`, with the 13.4 MB database, was `max-age=0, must-revalidate` | `curl -I` on production, 2 Oct | A returning visit revalidates the database (a 304 if unchanged, a full download if the CDN's copy expired) | **Done in step 0, 2 Oct:** `vercel.json` gives `/assets/(.*)` `public, max-age=31536000, immutable`; takes effect on the next deploy |
| P-3 | **The whole database lives in memory on the web** | `deserializeDatabaseAsync` (`docs/PROJECT_STATE.md`, web notes); 13.4 MB file | A 13 MB heap block before anything else; on a low-end phone browser it competes with the page | Comes with P-1(b) |
| P-4 | **The result screens render everything at once** | 13–20 blocks stacked per result screen ([`08-RESULT-PAGES.md`](08-RESULT-PAGES.md) §1): every table, every group, the bracket, the venue map | Both a scroll problem and a mount cost on a phone; **not measured** | Wave F's redesign moves the depth into the run hub's tabs, which mount one at a time |
| P-5 | The match sheet is still the biggest old screen | `app/game/match-stats.tsx`, 1,283 lines (C-15); its scroll listener sets a boolean (`setAtTop`, `:146`), which React only re-renders on when it flips | **Not measured**; no evidence it's slow today | Phase two step 8 rebuilds it on the Kit; measure it in Phase 9 before and after |

## 2. Already planned for Phase 9 (not repeated)

The globe without path strings (Skia or a sprite), the live match's 24 s vs 15 s timing, switching tabs during a simulation, ghost loading rows, the friends list's load state, the pundits' tournament lag, the Deep Match pitch on the shared view, and **§1 logs everywhere** with the Diagnostics screen's budgets. All in [`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md) Phase 9.

**What this audit adds to Phase 9:** a budget for **result screen mount** (`screen:result:mount`, from navigation to the first painted frame of the verdict) measured before and after Wave F, so the redesign's "less to render" is a number, not a feeling. Proposed for [`../diagnostics/03-BUDGETS.md`](../diagnostics/03-BUDGETS.md) when Phase 9 starts; target and hard fail **provisional** until the first reading from the maintainer's POCO X6.

## 3. Order

P-2 is ten minutes and safe: step 0. P-1 and P-3 wait for M-1's answer (there's no point making the first load faster for zero visitors, and every reason to once there are some). P-4 is Wave F. P-5 is phase two's step 8.
