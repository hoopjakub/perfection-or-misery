import type { SimTeam } from '@/types/simulation'
import { simulateMatch } from './match'
import { simulateKnockout, simulateTwoLegs } from './knockout-match'

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

// Runs knockout phase after the league phase matchdays are done
export function simulateCLKnockoutsOnly(
  sortedLeagueStandings: CLTeam[]
): Omit<CLSeasonResult, 'leaguePhaseStandings'> {
  const playerTeam = sortedLeagueStandings.find(t => t.isPlayer)!
  const playerPos  = sortedLeagueStandings.findIndex(t => t.isPlayer) + 1

  // Direct R16 qualifiers: positions 1-8
  const r16Direct  = sortedLeagueStandings.slice(0, 8)
  // Playoff spots: positions 9-24
  const playoffPool = sortedLeagueStandings.slice(8, 24)

  const playerDirectR16 = playerPos <= 8
  const playerPlayoff   = playerPos >= 9 && playerPos <= 24

  if (!playerDirectR16 && !playerPlayoff) {
    return {
      playoffRound: [], r16: [], qf: [], sf: [],
      final: null,
      winner: sortedLeagueStandings[0],
      playerTeam,
      playerFinalRound: 'league_exit',
      playerPot: playerTeam.pot,
    }
  }

  let playerFinalRound: CLSeasonResult['playerFinalRound'] = 'playoff_exit'

  // Playoff round (positions 9-24, 8 matches)
  const shuffledPlayoff = shuffle([...playoffPool])
  const playoffRound: CLKnockoutMatch[] = []
  const playoffWinners: CLTeam[] = []

  for (let i = 0; i < shuffledPlayoff.length; i += 2) {
    const m = twoLegKO('playoff', shuffledPlayoff[i], shuffledPlayoff[i + 1])
    playoffRound.push(m)
    playoffWinners.push(m.winner)
  }

  const playerSurvivedPlayoff = playerDirectR16 || playoffRound
    .find(m => m.teamA.isPlayer || m.teamB.isPlayer)?.winner.isPlayer

  if (!playerSurvivedPlayoff) {
    return {
      playoffRound, r16: [], qf: [], sf: [],
      final: null,
      winner: sortedLeagueStandings[0],
      playerTeam,
      playerFinalRound: 'playoff_exit',
      playerPot: playerTeam.pot,
    }
  }

  // R16 (8 direct + 8 playoff winners = 16 teams, 8 matches)
  const r16Teams = shuffle([...r16Direct, ...playoffWinners])
  const r16: CLKnockoutMatch[] = []
  const r16Winners: CLTeam[] = []

  for (let i = 0; i < r16Teams.length; i += 2) {
    const m = twoLegKO('r16', r16Teams[i], r16Teams[i + 1])
    r16.push(m)
    r16Winners.push(m.winner)
  }

  const playerSurvivedR16 = r16.find(m => m.teamA.isPlayer || m.teamB.isPlayer)?.winner.isPlayer
  if (!playerSurvivedR16) {
    return {
      playoffRound, r16, qf: [], sf: [],
      final: null,
      winner: r16Winners.sort((a, b) => b.ovr - a.ovr)[0],
      playerTeam,
      playerFinalRound: 'r16_exit',
      playerPot: playerTeam.pot,
    }
  }
  playerFinalRound = 'qf_exit'

  // QF (8 teams, 4 matches)
  const qfTeams = shuffle(r16Winners)
  const qf: CLKnockoutMatch[] = []
  const qfWinners: CLTeam[] = []

  for (let i = 0; i < qfTeams.length; i += 2) {
    const m = twoLegKO('qf', qfTeams[i], qfTeams[i + 1])
    qf.push(m)
    qfWinners.push(m.winner)
  }

  const playerSurvivedQF = qf.find(m => m.teamA.isPlayer || m.teamB.isPlayer)?.winner.isPlayer
  if (!playerSurvivedQF) {
    return {
      playoffRound, r16, qf, sf: [],
      final: null,
      winner: qfWinners.sort((a, b) => b.ovr - a.ovr)[0],
      playerTeam,
      playerFinalRound: 'qf_exit',
      playerPot: playerTeam.pot,
    }
  }
  playerFinalRound = 'sf_exit'

  // SF (4 teams, 2 matches)
  const sfTeams = shuffle(qfWinners)
  const sf: CLKnockoutMatch[] = []
  const sfWinners: CLTeam[] = []

  for (let i = 0; i < sfTeams.length; i += 2) {
    const m = twoLegKO('sf', sfTeams[i], sfTeams[i + 1])
    sf.push(m)
    sfWinners.push(m.winner)
  }

  const playerSurvivedSF = sf.find(m => m.teamA.isPlayer || m.teamB.isPlayer)?.winner.isPlayer

  // Final
  const final = singleKO('final', sfWinners[0], sfWinners[1])

  if (playerSurvivedSF) {
    playerFinalRound = final.winner.isPlayer ? 'winner' : 'finalist'
  } else {
    playerFinalRound = 'sf_exit'
  }

  return {
    playoffRound, r16, qf, sf,
    final,
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
  }
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}
