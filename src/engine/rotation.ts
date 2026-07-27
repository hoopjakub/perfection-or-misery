// When does a side rest players? (Big Fixes §10.5 phase 2.)
//
// Rotation is a stakes question, not a random one: a team rests players when
// the table says this game can no longer change their season, and never when it
// can. Everything here is decided from points arithmetic — how much is still
// winnable versus how big the gap is — so it's deterministic, explainable, and
// impossible to fire in a must-win.

export type StakesInput = {
  /** Every side in the competition (or the group), with points played so far. */
  standings:      { clubId: string; points: number }[]
  clubId:         string
  totalMatchdays: number
  playedMatchdays: number
  /** Top N places that matter — European spots in a league, qualifying places
   *  in a group. A side is "done" once it's mathematically in or out. */
  qualifyCutoff?: number
  /** Bottom N places that matter (relegation). Counted from the foot. */
  dropCutoff?:    number
  /** Leagues only: while the title is still reachable, nothing is a dead
   *  rubber. Off for groups, where finishing 1st vs 2nd isn't worth resting
   *  nobody over — securing qualification is the thing that ends the stakes. */
  titleMatters?:  boolean
}

/** Rotation strength, 0 (full strength) … 1 (heavy). */
export function rotationFor(i: StakesInput): number {
  const remaining = Math.max(0, i.totalMatchdays - i.playedMatchdays)
  if (remaining === 0) return 0
  // The most a side can still move: three points a game.
  const maxGain = remaining * 3

  const table = [...i.standings].sort((a, b) => b.points - a.points)
  const me = table.findIndex(t => t.clubId === i.clubId)
  if (me === -1 || table.length < 3) return 0
  const myPts = table[me].points

  let live = false

  // Still able to win the whole thing? Then there is nothing to rest for.
  if (i.titleMatters && table[0].points - myPts <= maxGain) live = true

  if (i.qualifyCutoff && i.qualifyCutoff > 0 && i.qualifyCutoff < table.length) {
    const lastIn  = table[i.qualifyCutoff - 1]   // worst qualifying position
    const firstOut = table[i.qualifyCutoff]      // best non-qualifying position
    const secured    = myPts - firstOut.points > maxGain
    const eliminated = lastIn.points - myPts > maxGain
    if (!secured && !eliminated) live = true
  }

  if (i.dropCutoff && i.dropCutoff > 0 && i.dropCutoff < table.length) {
    const firstSafe = table[table.length - i.dropCutoff - 1]
    const firstDown = table[table.length - i.dropCutoff]
    const safe   = myPts - firstDown.points > maxGain
    const doomed = firstSafe.points - myPts > maxGain
    if (!safe && !doomed) live = true
  }

  if (live) return 0
  // Nothing left to play for. Rest harder the closer the end is — the last
  // couple of games of a settled season are where reserves really get a run.
  return remaining <= 2 ? 0.8 : 0.6
}
