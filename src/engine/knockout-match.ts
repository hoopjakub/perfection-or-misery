import { SimTeam } from '@/types/simulation'
import { simulateMatch } from './match'
import { poissonSample } from '@/lib/math'

export type PenKick = { playerName: string; scored: boolean }

// A single 90-minute (or ET) scoreline from one venue's perspective.
export type LegScore = { homeGoals: number; awayGoals: number }

export type KnockoutResult = {
  homeGoals:   number   // FINAL score incl. any extra time
  awayGoals:   number
  regulation:  LegScore // 90-minute score on its own
  extraTimeScore: LegScore | null  // ET-only goals when ET was played, else null
  extraTime:   boolean
  homePens:    number | null
  awayPens:    number | null
  homePenKicks?: boolean[]   // actual make/miss sequence (only the kicks taken)
  awayPenKicks?: boolean[]
  winner:      'home' | 'away'
}

export type TwoLegResult = {
  // Each leg is its own match. leg1: teamA home. leg2: teamB home. Both are the
  // REGULATION 90-minute scores — ET is tracked separately on leg2ExtraTime.
  leg1:        LegScore   // { homeGoals: teamA, awayGoals: teamB }
  leg2:        LegScore   // { homeGoals: teamB, awayGoals: teamA }  (90' only)
  // ET is played ONLY at the second leg's venue, ONLY when the aggregate is level
  // after both legs' 90 minutes. Goals here are the ET period alone (teamB home).
  leg2ExtraTime: LegScore | null
  totalA:      number  // aggregate incl. ET — teamA (first-leg home) perspective
  totalB:      number
  extraTime:   boolean
  homePens:    number | null  // teamA pens
  awayPens:    number | null  // teamB pens
  homePenKicks?: boolean[]   // actual make/miss sequence (only the kicks taken)
  awayPenKicks?: boolean[]
  winner:      'home' | 'away'  // 'home' = teamA wins
}

// 30-minute extra-time period, strength-aware (tired legs → low scoring). The
// home team here is whoever hosts (the second leg's venue for two-legged ties,
// or the neutral "home" for a single-leg final).
export function simulateExtraTime(home: SimTeam, away: SimTeam): LegScore {
  const d = (home.ovr + 2.0 - away.ovr) / 12   // small venue nudge + OVR tilt
  const homeLambda = 0.55 * Math.exp(d * 0.5)  // ~0.55 goals/side baseline
  const awayLambda = 0.55 * Math.exp(-d * 0.5)
  return { homeGoals: poissonSample(homeLambda), awayGoals: poissonSample(awayLambda) }
}

// single leg knockout (e.g. a final) — ET then pens if drawn after 90'
export function simulateKnockout(
  home: SimTeam,
  away: SimTeam
): KnockoutResult {
  const reg = simulateMatch(home, away)
  const regulation: LegScore = { homeGoals: reg.homeGoals, awayGoals: reg.awayGoals }

  if (reg.outcome !== 'draw') {
    return {
      homeGoals: reg.homeGoals,
      awayGoals: reg.awayGoals,
      regulation,
      extraTimeScore: null,
      extraTime: false,
      homePens:  null,
      awayPens:  null,
      winner:    reg.outcome === 'home' ? 'home' : 'away',
    }
  }

  // level after 90' → extra time
  const et = simulateExtraTime(home, away)
  const totalHome = reg.homeGoals + et.homeGoals
  const totalAway = reg.awayGoals + et.awayGoals

  if (totalHome !== totalAway) {
    return {
      homeGoals: totalHome,
      awayGoals: totalAway,
      regulation,
      extraTimeScore: et,
      extraTime: true,
      homePens:  null,
      awayPens:  null,
      winner:    totalHome > totalAway ? 'home' : 'away',
    }
  }

  // still level after ET → penalties
  const pens = simulateShootout(penRate(home), penRate(away))
  return {
    homeGoals: totalHome,
    awayGoals: totalAway,
    regulation,
    extraTimeScore: et,
    extraTime: true,
    homePens:  pens.p1,
    awayPens:  pens.p2,
    homePenKicks: pens.kicks1,
    awayPenKicks: pens.kicks2,
    winner:    pens.p1 > pens.p2 ? 'home' : 'away',
  }
}

// Two-legged tie — teamA hosts leg 1, teamB hosts leg 2. Away-goals rule was
// abolished in 2021, so it's pure aggregate. Extra time is played ONLY at the
// second leg, and ONLY if the aggregate is level after both legs' 90 minutes;
// if still level after ET, penalties. (Each leg stays its own match record.)
export function simulateTwoLegs(
  teamA: SimTeam,
  teamB: SimTeam
): TwoLegResult {
  const l1 = simulateMatch(teamA, teamB)        // teamA home
  const l2 = simulateMatch(teamB, teamA)        // teamB home
  const leg1: LegScore = { homeGoals: l1.homeGoals, awayGoals: l1.awayGoals }
  const leg2: LegScore = { homeGoals: l2.homeGoals, awayGoals: l2.awayGoals }

  // aggregate after 90'+90', from teamA's perspective
  let totalA = leg1.homeGoals + leg2.awayGoals
  let totalB = leg1.awayGoals + leg2.homeGoals

  const base = { leg1, leg2, leg2ExtraTime: null as LegScore | null }

  if (totalA !== totalB) {
    return { ...base, totalA, totalB, extraTime: false, homePens: null, awayPens: null,
             winner: totalA > totalB ? 'home' : 'away' }
  }

  // Level on aggregate → 30' extra time at the second leg (teamB at home).
  const et = simulateExtraTime(teamB, teamA)     // home = teamB, away = teamA
  totalA += et.awayGoals
  totalB += et.homeGoals
  base.leg2ExtraTime = et

  if (totalA !== totalB) {
    return { ...base, totalA, totalB, extraTime: true, homePens: null, awayPens: null,
             winner: totalA > totalB ? 'home' : 'away' }
  }

  // Still level after ET → penalty shoot-out (at the second leg's venue).
  const pens = simulateShootout(penRate(teamA), penRate(teamB))
  return {
    ...base, totalA, totalB, extraTime: true,
    homePens: pens.p1, awayPens: pens.p2,
    homePenKicks: pens.kicks1, awayPenKicks: pens.kicks2,
    winner: pens.p1 > pens.p2 ? 'home' : 'away',
  }
}

// Zip the stored make/miss sequence onto kicker names for the UI. The names
// list cycles if a long sudden-death shootout runs past the takers we fetched.
export function expandPenaltyKicks(
  namesA: string[],
  namesB: string[],
  kicksA: boolean[],
  kicksB: boolean[]
): { kicksA: PenKick[]; kicksB: PenKick[] } {
  const name = (names: string[], i: number) =>
    names.length > 0 ? names[i % names.length] : `Player ${i + 1}`
  return {
    kicksA: kicksA.map((scored, i) => ({ playerName: name(namesA, i), scored })),
    kicksB: kicksB.map((scored, i) => ({ playerName: name(namesB, i), scored })),
  }
}

// OVR nudges conversion slightly — better teams convert a touch more often.
function penRate(t: SimTeam): number {
  return Math.min(0.84, 0.74 + (t.ovr - 70) * 0.002)
}

// In the best-of-five phase a tie is decided the instant one side's score is
// already beyond what the other can still reach with its remaining kicks.
function decidedInRegulation(p1: number, p2: number, k1: number, k2: number): boolean {
  return p1 > p2 + (5 - k2) || p2 > p1 + (5 - k1)
}

// Simulate a shootout with real rules AND early termination: best-of-five,
// alternating, stopping the moment it's mathematically settled — then sudden
// death (both kick each round) until one scores and the other misses. Returns
// only the kicks that were actually taken.
export function simulateShootout(r1: number, r2: number): {
  p1: number; p2: number; kicks1: boolean[]; kicks2: boolean[]
} {
  const kicks1: boolean[] = []
  const kicks2: boolean[] = []
  let p1 = 0, p2 = 0

  // Best of five — re-check after every single kick.
  for (let round = 0; round < 5; round++) {
    const a = Math.random() < r1
    kicks1.push(a); if (a) p1++
    if (decidedInRegulation(p1, p2, kicks1.length, kicks2.length)) return { p1, p2, kicks1, kicks2 }
    const b = Math.random() < r2
    kicks2.push(b); if (b) p2++
    if (decidedInRegulation(p1, p2, kicks1.length, kicks2.length)) return { p1, p2, kicks1, kicks2 }
  }

  // Sudden death — both take a kick each round; settled when they differ.
  for (let i = 0; i < 30; i++) {
    const a = Math.random() < r1
    kicks1.push(a); if (a) p1++
    const b = Math.random() < r2
    kicks2.push(b); if (b) p2++
    if (p1 !== p2) return { p1, p2, kicks1, kicks2 }
  }

  // Pathological fallback (30 identical rounds) — one decisive round to settle it.
  const aWins = Math.random() < 0.5
  kicks1.push(aWins); kicks2.push(!aWins)
  if (aWins) p1++; else p2++
  return { p1, p2, kicks1, kicks2 }
}