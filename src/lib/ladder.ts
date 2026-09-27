// P8-99: placing runs on a board from its scores, best first. Kept apart from
// the queries so scripts/verify-week.ts can check it without a database.
export const SCORE_LADDER = 1000

/** A score's place on a ladder: 1 + how many scored more. null when it's
 *  below the ladder's end (outside the top SCORE_LADDER). */
export function placeOn(ladder: number[], score: number): number | null {
  let lo = 0, hi = ladder.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ladder[mid] > score) lo = mid + 1; else hi = mid }
  return lo === ladder.length && ladder.length >= SCORE_LADDER ? null : lo + 1
}
