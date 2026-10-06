// How long a matchday waits before the next one plays, at each speed
// (centralisation L-02, phase two step 2). The league season, the classic cups
// and the full path each had their own table, and by 2 October 2026 they no
// longer agreed: the full path's "normal" was 900 ms against the league's 400.
// One table, the league's values (decision D-3 in docs/audit-2026-10).
export type Speed = 'slow' | 'normal' | 'fast'

export const SPEED_MS: Record<Speed, number> = { slow: 2000, normal: 400, fast: 100 }
