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
  const [hp, ap] = simulatePenalties(home, away)
  return {
    homeGoals: totalHome,
    awayGoals: totalAway,
    extraTime: true,
    homePens:  hp,
    awayPens:  ap,
    winner:    hp > ap ? 'home' : 'away',
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
  const [pa, pb] = simulatePenalties(teamA, teamB)
  return {
    leg1:      { homeGoals: leg1.homeGoals, awayGoals: leg1.awayGoals },
    leg2:      { homeGoals: leg2.homeGoals + etB, awayGoals: leg2.awayGoals + etA },
    totalA:    finalA,
    totalB:    finalB,
    extraTime: true,
    homePens:  pa,
    awayPens:  pb,
    winner:    pa > pb ? 'home' : 'away',
  }
}

// Given known pen totals (aPens, bPens), generates a realistic-looking kick-by-kick sequence.
// This is for UI display only — the outcome is already determined by the simulation.
export function expandPenaltyKicks(
  namesA: string[],
  namesB: string[],
  aPens: number,
  bPens: number
): { kicksA: PenKick[]; kicksB: PenKick[] } {
  const getNameA = (i: number) => namesA[i] ?? `Player ${i + 1}`
  const getNameB = (i: number) => namesB[i] ?? `Player ${i + 1}`
  const aWins = aPens > bPens

  // Determine if sudden death occurred (winner scored more than 5)
  const hasSuddenDeath = aPens > 5 || bPens > 5
  const regA = hasSuddenDeath ? 5 : aPens
  const regB = hasSuddenDeath ? 5 : bPens

  const kicksA: PenKick[] = shuffleGoals(regA, 5).map((scored, i) => ({
    playerName: getNameA(i), scored,
  }))
  const kicksB: PenKick[] = shuffleGoals(regB, 5).map((scored, i) => ({
    playerName: getNameB(i), scored,
  }))

  if (hasSuddenDeath) {
    // Both scored 5 in regulation, now sudden death. The margin in sudden death
    // is always exactly 1: every round before the last has both teams scoring,
    // and in the decisive round the winner scores while the loser misses.
    const sdGoalsA = aPens - 5
    const sdGoalsB = bPens - 5
    const sdRounds = Math.max(sdGoalsA, sdGoalsB)

    for (let i = 0; i < sdRounds; i++) {
      const isDecisive = i === sdRounds - 1
      kicksA.push({ playerName: getNameA(5 + i), scored: isDecisive ? aWins : true })
      kicksB.push({ playerName: getNameB(5 + i), scored: isDecisive ? !aWins : true })
    }
  }

  return { kicksA, kicksB }
}

function shuffleGoals(goals: number, total: number): boolean[] {
  const arr = [...Array(goals).fill(true), ...Array(total - goals).fill(false)]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function simulatePenalties(t1: SimTeam, t2: SimTeam): [number, number] {
  // OVR nudges success rate slightly — better teams convert slightly more
  const r1 = Math.min(0.84, 0.74 + (t1.ovr - 70) * 0.002)
  const r2 = Math.min(0.84, 0.74 + (t2.ovr - 70) * 0.002)

  let p1 = 0, p2 = 0

  // 5 kicks each
  for (let i = 0; i < 5; i++) {
    if (Math.random() < r1) p1++
    if (Math.random() < r2) p2++
  }

  if (p1 !== p2) return [p1, p2]

  // sudden death — up to 20 rounds
  for (let i = 0; i < 20; i++) {
    const k1 = Math.random() < r1
    const k2 = Math.random() < r2
    if (k1 && !k2) return [p1 + 1, p2]
    if (!k1 && k2) return [p1, p2 + 1]
    if (k1 && k2) { p1++; p2++ }
    // both miss: continue
  }

  // edge case
  return Math.random() < 0.5 ? [p1 + 1, p2] : [p1, p2 + 1]
}