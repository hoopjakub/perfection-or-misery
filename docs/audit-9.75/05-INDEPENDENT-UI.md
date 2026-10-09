# 05 · The independent audit: the interface, scored again

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **re-score, 7 October 2026.** The same ten heuristics as [`../audit-2026-10/05-UI-RESCORE.md`](../audit-2026-10/05-UI-RESCORE.md) (0–4 each; a 4 is genuinely excellent), scored this time with the phone's evidence: the maintainer's 9.5 pass and the first timings. The 5 October score (38/40) was from code alone and said a failed checklist row would take its heuristic down. Some did.

---

## 1. The score

| # | Heuristic | 5 Oct | 7 Oct | Why it moved, with evidence |
|---|---|---|---|---|
| 1 | Visibility of system status | 4 | **4** | Logs everywhere, a waiting look only on slow taps, ghost rows, Diagnostics |
| 2 | Match with the real world | 4 | **3** | National teams in English on the Slovak bracket screen (P9.75-08); the run hub's tabs never say which competition they show (P9.75-05) |
| 3 | User control and freedom | 4 | **4** | Unchanged: abandon everywhere, speed everywhere |
| 4 | Consistency and standards | 4 | **3** | A dark live-match card inside light screens (P9.75-01); the bench drawn unlike the eleven (P9.75-03); the press a tab on some stages and a list at the bottom on others (P9.75-04); four loading looks (R3-03) |
| 5 | Error prevention | 4 | **3** | The keyboard covers the field you're typing in on ten screens (P9.75-07) |
| 6 | Recognition rather than recall | 4 | **3** | Your own knockouts hard to find (P9.75-05); where a held sub can go is faint (P9.75-03) |
| 7 | Flexibility and efficiency | 4 | **3** | The run hub's Stats tab freezes the phone 4–5 s, the hub takes up to 1.6 s to open (P9.75-11, -12) |
| 8 | Aesthetic and minimalist design | 3 | **3** | Unchanged: the match sheet (Phase 11) |
| 9 | Error recovery | 3 | **2** | A run finished offline is queued, then never sent and never mentioned again (P9.75-06); a refused run is deleted silently (L-2) |
| 10 | Help and documentation | 4 | **4** | Unchanged |
| | **Total** | **38** | **32/40** | |

**What the drop says.** The code-only re-score missed what only the phone shows: the light-mode pins, the keyboard, the timings, the queue. 32 is still "good" on the scale; every point lost has a named fix in [`01-PHONE-FINDINGS.md`](01-PHONE-FINDINGS.md) or [`02-PHONE-PERFORMANCE.md`](02-PHONE-PERFORMANCE.md).

## 2. What would move it back

| Heuristic | To | By |
|---|---|---|
| 9 | 4 | the offline queue sends, a refused run is kept and said (P9.75-06, L-2) |
| 4 | 4 | floodlit for whole screens only; one hanger; one stage tab set; one loading rule (centralisation phase three steps 1–4) |
| 7 | 4 | the hub's boards virtualised, the hub opening in one frame (02 §2–3) |
| 5 | 4 | the keyboard handled by the screen base (R3-02) |
| 2, 6 | 4 | team names through one translator; your competition first and named (R3-07, R3-10) |

**Target after Phase 9.75: 38/40**, confirmed on the phone this time, not from code.

## 3. Accessibility, measured

- **Pressables without a role or label: 13 of 108**, 8 of them on the match sheet (`match-stats.tsx`), 2 in `MatchLineupPitch`, one each in `ui.tsx`, `WCGroupModal`, `kit/run.tsx` (counted with brace-aware parsing, 7 Oct; a naive count said 83 and was wrong). The match sheet's go with P8-48; the other five are quick.
- **Reduce motion** is honoured by the new ghost rows and the waiting look (Phase 9); the live match's beats and the ceremony already were.
- **Contrast** wasn't re-measured: no colours changed since the 1 October bands.

## 4. How it was scored, and what wasn't done

Scored from the maintainer's phone pass, his log and the code. The impeccable critique flow (two independent assessments, one of them in a browser) wasn't run: the maintainer tests the app himself and the screens weren't opened for him. The next full critique with that flow is Phase 11's, where the design is reworked anyway.
