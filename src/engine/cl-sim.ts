import type { SimTeam } from '@/types/simulation'
import type { MatchScorers } from '@/types/stats'
import { simulateMatch } from './match'
import { simulateKnockout, simulateTwoLegs, type PenKick } from './knockout-match'

export type CLPot = 1 | 2 | 3 | 4

export type CLTeam = SimTeam & {
  pot: CLPot
}

export type CLKnockoutMatch = {
  round:     string
  teamA:     CLTeam
  teamB:     CLTeam
  winner:    CLTeam
  aGoals:    number   // aggregate goals for teamA
  bGoals:    number   // aggregate goals for teamB
  leg1?:     { aGoals: number; bGoals: number }  // two-leg ties only (teamA at home)
  leg2?:     { aGoals: number; bGoals: number }  // two-leg ties only (teamB at home)
  extraTime: boolean
  aPens?:    number
  bPens?:    number
  leg1Scorers?: MatchScorers   // attributed once, stored — leg1 (or the single final)
  leg2Scorers?: MatchScorers   // leg2 (teamB at home)
  aPenKicks?: boolean[]        // raw make/miss sequence from the shootout sim
  bPenKicks?: boolean[]
  penKicksA?: PenKick[]        // names zipped on at reveal, stored for the result screen
  penKicksB?: PenKick[]
}

// A single league-phase fixture result, recorded for the results screen.
export type CLLeagueMatch = {
  matchday:  number
  home:      { clubId: string; clubName: string; isPlayer: boolean }
  away:      { clubId: string; clubName: string; isPlayer: boolean }
  homeGoals: number
  awayGoals: number
  scorers?:  MatchScorers
}

export type CLSeasonResult = {
  leaguePhaseStandings: CLTeam[]
  playoffRound:         CLKnockoutMatch[]
  r16:                  CLKnockoutMatch[]
  qf:                   CLKnockoutMatch[]
  sf:                   CLKnockoutMatch[]
  final:                CLKnockoutMatch | null
  winner:               CLTeam
  playerTeam:           CLTeam
  playerFinalRound:     'league_exit' | 'playoff_exit' | 'r16_exit' | 'qf_exit' | 'sf_exit' | 'finalist' | 'winner'
  playerPot:            CLPot
  leagueMatchdays?:     CLLeagueMatch[]   // populated by the simulation component
}

export function buildCLTeams(
  clubs: { clubId: string; clubName: string; ovr: number; isPlayer: boolean }[]
): CLTeam[] {
  const teams: CLTeam[] = clubs.map(c => ({
    clubId:   c.clubId,
    clubName: c.clubName,
    ovr:      c.ovr,
    isPlayer: c.isPlayer,
    form:     0,
    pot:      1 as CLPot,
    stats:    { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))

  const sorted = [...teams].sort((a, b) => b.ovr - a.ovr)
  const potSize = Math.ceil(teams.length / 4)
  sorted.forEach((t, i) => {
    t.pot = (Math.min(4, Math.floor(i / potSize) + 1)) as CLPot
  })

  return teams
}

// 8-round partial round-robin using the circle method
export function generateCLLeagueFixtures(
  teams: CLTeam[]
): { matchday: number; home: CLTeam; away: CLTeam }[] {
  const list = [...teams]
  if (list.length % 2 !== 0) list.push({ clubId: '__bye__' } as CLTeam)

  const n = list.length
  const half = n / 2
  const fixed = list[0]
  const rotating = list.slice(1)
  const fixtures: { matchday: number; home: CLTeam; away: CLTeam }[] = []

  for (let round = 0; round < 8; round++) {
    const roundTeams = [fixed, ...rotating]
    for (let i = 0; i < half; i++) {
      const home = roundTeams[i]
      const away = roundTeams[n - 1 - i]
      if (home.clubId === '__bye__' || away.clubId === '__bye__') continue
      fixtures.push({ matchday: round + 1, home, away })
    }
    rotating.unshift(rotating.pop()!)
  }

  return fixtures
}

// Runs the knockout phase after the league phase matchdays are done.
//
// The FULL bracket is always simulated — even when the player is eliminated in
// the league phase or an early knockout round — so the results screen can show
// the whole thing playing out. Once the player loses, they simply stop showing
// up in the winners arrays, so later rounds continue with the other teams.
export function simulateCLKnockoutsOnly(
  sortedLeagueStandings: CLTeam[]
): Omit<CLSeasonResult, 'leaguePhaseStandings'> {
  const playerTeam = sortedLeagueStandings.find(t => t.isPlayer)!
  const playerPos  = sortedLeagueStandings.findIndex(t => t.isPlayer) + 1

  // Direct R16 qualifiers: positions 1-8 · Playoff spots: positions 9-24
  const r16Direct   = sortedLeagueStandings.slice(0, 8)
  const playoffPool = sortedLeagueStandings.slice(8, 24)

  // Playoff round (positions 9-24, 8 two-leg ties → 8 winners)
  const shuffledPlayoff = shuffle([...playoffPool])
  const playoffRound: CLKnockoutMatch[] = []
  const playoffWinners: CLTeam[] = []
  for (let i = 0; i < shuffledPlayoff.length; i += 2) {
    const m = twoLegKO('playoff', shuffledPlayoff[i], shuffledPlayoff[i + 1])
    playoffRound.push(m); playoffWinners.push(m.winner)
  }

  // R16: each tie pairs a direct qualifier (1st-8th) with a Playoff winner, so
  // two top-8 sides can NEVER meet here — only from the quarter-finals onward.
  // Playoff winners keep their column order (playoff tie i feeds R16 tie i); the
  // direct qualifiers are drawn at random against them.
  const directDraw = shuffle([...r16Direct])
  const r16: CLKnockoutMatch[] = []
  const r16Winners: CLTeam[] = []
  for (let i = 0; i < playoffWinners.length; i++) {
    const m = twoLegKO('r16', directDraw[i], playoffWinners[i])
    r16.push(m); r16Winners.push(m.winner)
  }

  // From here the bracket is FIXED — each round pairs consecutive winners, so
  // the winners of two adjacent ties always meet in the next round (a real tree
  // rather than a fresh random draw every round).
  const qf: CLKnockoutMatch[] = []
  const qfWinners: CLTeam[] = []
  for (let i = 0; i < r16Winners.length; i += 2) {
    const m = twoLegKO('qf', r16Winners[i], r16Winners[i + 1])
    qf.push(m); qfWinners.push(m.winner)
  }

  const sf: CLKnockoutMatch[] = []
  const sfWinners: CLTeam[] = []
  for (let i = 0; i < qfWinners.length; i += 2) {
    const m = twoLegKO('sf', qfWinners[i], qfWinners[i + 1])
    sf.push(m); sfWinners.push(m.winner)
  }

  // Final (single leg, neutral venue)
  const final = singleKO('final', sfWinners[0], sfWinners[1])

  // Where did the player bow out? Find their tie in each round in order; the
  // first round they don't win is their exit.
  const playerTie = (arr: CLKnockoutMatch[]) =>
    arr.find(m => m.teamA.isPlayer || m.teamB.isPlayer)

  let playerFinalRound: CLSeasonResult['playerFinalRound']
  if (playerPos > 24) {
    playerFinalRound = 'league_exit'
  } else {
    const po = playerTie(playoffRound)
    const r  = playerTie(r16)
    const q  = playerTie(qf)
    const s  = playerTie(sf)
    if (po && !po.winner.isPlayer)                      playerFinalRound = 'playoff_exit'
    else if (r && !r.winner.isPlayer)                   playerFinalRound = 'r16_exit'
    else if (q && !q.winner.isPlayer)                   playerFinalRound = 'qf_exit'
    else if (s && !s.winner.isPlayer)                   playerFinalRound = 'sf_exit'
    else if (final.teamA.isPlayer || final.teamB.isPlayer)
                                                        playerFinalRound = final.winner.isPlayer ? 'winner' : 'finalist'
    else playerFinalRound = playerPos <= 8 ? 'r16_exit' : 'playoff_exit'
  }

  return {
    playoffRound, r16, qf, sf, final,
    winner: final.winner,
    playerTeam,
    playerFinalRound,
    playerPot: playerTeam.pot,
  }
}

// Two-leg tie used for all UCL knockout rounds except the final
function twoLegKO(round: string, teamA: CLTeam, teamB: CLTeam): CLKnockoutMatch {
  const result = simulateTwoLegs(teamA, teamB)
  const winner = result.winner === 'home' ? teamA : teamB
  return {
    round, teamA, teamB, winner,
    aGoals:    result.totalA,
    bGoals:    result.totalB,
    // leg1: teamA at home. leg2: teamB at home (teamA is away).
    leg1:      { aGoals: result.leg1.homeGoals, bGoals: result.leg1.awayGoals },
    leg2:      { aGoals: result.leg2.awayGoals, bGoals: result.leg2.homeGoals },
    extraTime: result.extraTime,
    aPens:     result.homePens ?? undefined,
    bPens:     result.awayPens ?? undefined,
    aPenKicks: result.homePenKicks,
    bPenKicks: result.awayPenKicks,
  }
}

// Single-leg for the final (neutral venue)
function singleKO(round: string, teamA: CLTeam, teamB: CLTeam): CLKnockoutMatch {
  const result = simulateKnockout(teamA, teamB)
  const winner = result.winner === 'home' ? teamA : teamB
  return {
    round, teamA, teamB, winner,
    aGoals:    result.homeGoals,
    bGoals:    result.awayGoals,
    extraTime: result.extraTime,
    aPens:     result.homePens ?? undefined,
    bPens:     result.awayPens ?? undefined,
    aPenKicks: result.homePenKicks,
    bPenKicks: result.awayPenKicks,
  }
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}
