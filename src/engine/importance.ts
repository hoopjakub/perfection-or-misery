// P8-130: later, bigger matches count for more in the season's awards, the way
// real voters remember the big nights. Measured, not invented: no imaginary
// voters, just a weight per match from its stage, and a player's award score
// scaled by how much of HIS contribution came in the weighted matches. The
// award's breakdown shows the weighting as its own line, so it can be checked.
//
// It pairs with P8-116: the stage split decides who's eligible for which
// award; this decides how much each match counts inside it.
import { cmpStr } from '@/lib/pmath'
import type { AwardCandidate } from '@/types/stats'

/** A match's weight from its label (the labels run-matches.ts writes). */
export function matchWeight(label: string, lastMatchday: number): number {
  if (/^Final\b/.test(label)) return 1.5
  if (/^Semi-final/.test(label)) return 1.3
  if (/^Quarter-final/.test(label)) return 1.2
  if (/^(Round of 16|Round of 32|Playoff)/.test(label)) return 1.1
  // A league's run-in: its last five matchdays.
  const md = /^Matchday (\d+)$/.exec(label)
  if (md && lastMatchday > 5 && Number(md[1]) > lastMatchday - 5) return 1.1
  return 1
}

/** The last league matchday among these labels (0 when there's none). */
export function lastMatchdayOf(labels: string[]): number {
  return labels.reduce((max, l) => { const m = /^Matchday (\d+)$/.exec(l); return m ? Math.max(max, Number(m[1])) : max }, 0)
}

// How much a match was HIS: his rating above an ordinary 5.5. A quiet game
// in a final doesn't lift anyone; a great one does.
const contribution = (rating: number) => Math.max(0, rating - 5.5)

/** His weighted share: 1 when his best games were ordinary ones, above 1 when they came in the big ones. */
export function importanceFactor(games: { label: string; rating: number }[], weight: (label: string) => number): number {
  let num = 0, den = 0
  for (const g of games) { const c = contribution(g.rating); num += weight(g.label) * c; den += c }
  return den > 0 ? num / den : 1
}

/**
 * Scale each candidate's award scores by his big-match factor, add the line
 * that says so to his breakdown, and re-rank. Only the games in `counts` are
 * weighed (the full path's main awards leave qualifying out). Mutates the
 * candidates; returns the list re-sorted.
 */
export function applyImportance(
  candidates: AwardCandidate[],
  gamesOf: (playerId: string) => { label: string; rating: number }[],
  weight: (label: string) => number,
): AwardCandidate[] {
  for (const c of candidates) {
    const f = importanceFactor(gamesOf(c.playerId), weight)
    if (Math.abs(f - 1) < 0.005) continue
    const before = c.score
    c.score = Math.round(c.score * f * 10) / 10
    if (c.lineScores) for (const k of Object.keys(c.lineScores) as (keyof typeof c.lineScores)[]) {
      c.lineScores[k] = Math.round(c.lineScores[k]! * f * 10) / 10
    }
    c.breakdown = [...(c.breakdown ?? []), { label: `Big matches ×${f.toFixed(2)}`, value: f, points: Math.round((c.score - before) * 10) / 10 }]
  }
  return [...candidates].sort((a, b) => b.score - a.score || cmpStr(a.playerId, b.playerId))
}
