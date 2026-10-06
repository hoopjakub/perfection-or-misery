import { t } from '@/i18n'
// Ties are named `t` in this file's callbacks; `tr` is t() where that shadows it.
const tr = t
import type { MatchScorers } from '@/types/stats'
import type { BracketColumn, BracketTie } from './bracket'
import { kickoffFor } from '@/engine/schedule'
import type { StageTie } from '@/engine/stages'
import { tieDetail } from './tieDetail'

// P8-91: the whole bracket, opened in the middle of a knockout round. Finished
// ties show their results, the round being played shows every tie's score as
// it stands at the same moment as yours, and the rounds still to come show
// when they're played (P8-92) and `?` for sides not known yet.
//
// "The same moment" is how far through your tie the live clock is (0…1),
// published by LiveMatch (setLiveProgress). Every other tie in the round is
// read at that same fraction of its own match or two legs, from its stored
// goal minutes, so the bracket never shows a result your live match hasn't
// reached yet.

let progress: number | null = null
/** LiveMatch reports how far through its tie it is; null when none is playing. */
export function setLiveProgress(p: number | null) { progress = p }
export function liveProgress(): number | null { return progress }

type Side = { clubId: string; clubName: string }
type TieLike = {
  teamA: Side; teamB: Side; winner: { clubId: string }
  aGoals: number; bGoals: number
  leg1?: { aGoals: number; bGoals: number }
  leg2?: { aGoals: number; bGoals: number }
  extraTime: boolean; aPens?: number; bPens?: number
  leg1Scorers?: MatchScorers; leg2Scorers?: MatchScorers; leg2ExtraTimeScorers?: MatchScorers
  scorers?: MatchScorers   // a single match (the World Cup)
}
type RoundLike = { round: string; label: string; ties: TieLike[] }

/** A tie's score when it's `p` of the way through (0…1). Two legs share the
 *  time half and half; extra time counts at the very end of the last leg. */
export function scoreAt(t: TieLike, p: number): { a: number; b: number } {
  const twoLegs = !!t.leg1
  let a = 0, b = 0
  const count = (s: MatchScorers | undefined, start: number, span: number, len: number, homeIsA: boolean) => {
    for (const side of ['home', 'away'] as const) {
      for (const e of s?.[side] ?? []) {
        const at = start + span * Math.min(1, e.minute / len)
        if (at > p) continue
        if ((side === 'home') === homeIsA) a++; else b++
      }
    }
  }
  if (twoLegs) {
    count(t.leg1Scorers, 0, 0.5, 90, true)             // leg 1: A at home
    count(t.leg2Scorers, 0.5, 0.5, 90, false)          // leg 2: B at home
    count(t.leg2ExtraTimeScorers, 1, 0, 120, false)    // extra time: only at the end
  } else {
    count(t.scorers ?? t.leg1Scorers, 0, 1, t.extraTime ? 120 : 90, true)
  }
  return { a, b }
}

const isThird = (r: RoundLike) => /third|3rd/i.test(`${r.round} ${r.label}`)

/** A live tie as the engine's one tie model (src/engine/stages.ts). */
export function stageTieOf(t: TieLike): StageTie {
  return {
    a: t.teamA, b: t.teamB, aGoals: t.aGoals, bGoals: t.bGoals,
    legs: t.leg1 && t.leg2 ? [{ a: t.leg1.aGoals, b: t.leg1.bGoals }, { a: t.leg2.aGoals, b: t.leg2.bGoals }] : undefined,
    extraTime: t.extraTime, shootout: t.aPens !== undefined,
    pens: t.aPens !== undefined && t.bPens !== undefined ? { a: t.aPens, b: t.bPens } : undefined,
    winnerIsA: t.winner.clubId === t.teamA.clubId,
    scorers: [t.leg1Scorers, t.leg2Scorers, t.leg2ExtraTimeScorers, t.scorers],
  }
}

export function liveBracket(rounds: RoundLike[], o: {
  /** Rounds revealed so far (the last of them is the one being played). */
  visible: number
  /** Your match in the newest round is still being played. */
  liveOpen: boolean
  /** How far through it (0…1). */
  progress: number
  yearStart: number
}): { columns: BracketColumn[]; third?: BracketColumn } {
  const col = (r: RoundLike, i: number): BracketColumn => {
    const twoLegs = !!r.ties[0]?.leg1
    const when = kickoffFor({ label: twoLegs ? `${r.label} · Leg 1` : r.label, yearStart: o.yearStart })?.short
    const ties: BracketTie[] = r.ties.map(t => {
      if (i >= o.visible) return { a: null, b: null, note: when }                 // still to come
      if (i === o.visible - 1 && o.liveOpen) {                                     // being played now
        const s = scoreAt(t, o.progress)
        return { a: { clubId: t.teamA.clubId, name: t.teamA.clubName, goals: String(s.a) }, b: { clubId: t.teamB.clubId, name: t.teamB.clubName, goals: String(s.b) }, note: tr('parts.live') }
      }
      // The same line every tie row and result bracket writes (tieDetail).
      const note = tieDetail(stageTieOf(t))
      return {
        a: { clubId: t.teamA.clubId, name: t.teamA.clubName, goals: String(t.aGoals) },
        b: { clubId: t.teamB.clubId, name: t.teamB.clubName, goals: String(t.bGoals) },
        winner: t.winner.clubId === t.teamA.clubId ? 'a' : 'b',
        note: note || undefined,
      }
    })
    return { key: r.round, label: r.label, ties }
  }
  const indexed = rounds.map((r, i) => ({ r, i }))
  const third = indexed.find(x => isThird(x.r))
  return {
    columns: indexed.filter(x => !isThird(x.r)).map(x => col(x.r, x.i)),
    third: third ? col(third.r, third.i) : undefined,
  }
}
