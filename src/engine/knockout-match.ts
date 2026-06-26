import { SimTeam } from '@/types/simulation'
import { simulateMatch } from './match'
import { poissonSample } from '@/lib/math'

export type PenKick = { playerName: string; scored: boolean }

export type KnockoutResult = {
  homeGoals:   number
  awayGoals:   number
  extraTime:   boolean
  homePens:    number | null
  awayPens:    number | null
  homePenKicks?: boolean[]   // actual make/miss sequence (only the kicks taken)
  awayPenKicks?: boolean[]
  winner:      'home' | 'away'
}

export type TwoLegResult = {
  leg1:        { homeGoals: number; awayGoals: number }
  leg2:        { homeGoals: number; awayGoals: number }
  totalA:      number  // teamA (first leg home team) total across both legs
  totalB:      number
  extraTime:   boolean
  homePens:    number | null  // teamA pens
  awayPens:    number | null  // teamB pens
  homePenKicks?: boolean[]   // actual make/miss sequence (only the kicks taken)
  awayPenKicks?: boolean[]
  winner:      'home' | 'away'  // 'home' = teamA wins
}

// single leg knockout — ET + pens if draw after 90
export function simulateKnockout(
  home: SimTeam,
  away: SimTeam
): KnockoutResult {
  const reg = simulateMatch(home, away)

  if (reg.outcome !== 'draw') {
    return {
      homeGoals: reg.homeGoals,
      awayGoals: reg.awayGoals,
      extraTime: false,
      homePens:  null,
      awayPens:  null,
      winner:    reg.outcome === 'home' ? 'home' : 'away',
    }
  }

  // extra time — lower lambda, tired legs
  const etHome = poissonSample(0.35)
  const etAway = poissonSample(0.35)
  const totalHome = reg.homeGoals + etHome
  const totalAway = reg.awayGoals + etAway

  if (totalHome !== totalAway) {
    return {
      homeGoals: totalHome,
      awayGoals: totalAway,
      extraTime: true,
      homePens:  null,
      awayPens:  null,
      winner:    totalHome > totalAway ? 'home' : 'away',
    }
  }

  // penalties
  const pens = simulateShootout(penRate(home), penRate(away))
  return {
    homeGoals: totalHome,
    awayGoals: totalAway,
    extraTime: true,
    homePens:  pens.p1,
    awayPens:  pens.p2,
    homePenKicks: pens.kicks1,
    awayPenKicks: pens.kicks2,
    winner:    pens.p1 > pens.p2 ? 'home' : 'away',
  }
}

// two-legged tie — teamA plays first leg at home
// away goals rule was abolished in 2021, pure aggregate
export function simulateTwoLegs(
  teamA: SimTeam,
  teamB: SimTeam
): TwoLegResult {
  const leg1 = simulateMatch(teamA, teamB)
  const leg2 = simulateMatch(teamB, teamA)  // teamB at home for leg 2

  // aggregate from teamA's perspective
  const totalA = leg1.homeGoals + leg2.awayGoals
  const totalB = leg1.awayGoals + leg2.homeGoals

  if (totalA !== totalB) {
    return {
      leg1:      { homeGoals: leg1.homeGoals, awayGoals: leg1.awayGoals },
      leg2:      { homeGoals: leg2.homeGoals, awayGoals: leg2.awayGoals },
      totalA,
      totalB,
      extraTime: false,
      homePens:  null,
      awayPens:  null,
      winner:    totalA > totalB ? 'home' : 'away',
    }
  }

  // level on aggregate — ET at second leg venue
  const etA = poissonSample(0.35)
  const etB = poissonSample(0.35)
  const finalA = totalA + etA
  const finalB = totalB + etB

  if (finalA !== finalB) {
    return {
      leg1:      { homeGoals: leg1.homeGoals, awayGoals: leg1.awayGoals },
      leg2:      { homeGoals: leg2.homeGoals + etB, awayGoals: leg2.awayGoals + etA },
      totalA:    finalA,
      totalB:    finalB,
      extraTime: true,
      homePens:  null,
      awayPens:  null,
      winner:    finalA > finalB ? 'home' : 'away',
    }
  }

  // penalties
  const pens = simulateShootout(penRate(teamA), penRate(teamB))
  return {
    leg1:      { homeGoals: leg1.homeGoals, awayGoals: leg1.awayGoals },
    leg2:      { homeGoals: leg2.homeGoals + etB, awayGoals: leg2.awayGoals + etA },
    totalA:    finalA,
    totalB:    finalB,
    extraTime: true,
    homePens:  pens.p1,
    awayPens:  pens.p2,
    homePenKicks: pens.kicks1,
    awayPenKicks: pens.kicks2,
    winner:    pens.p1 > pens.p2 ? 'home' : 'away',
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