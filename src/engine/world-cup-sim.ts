import { SimTeam } from '@/types/simulation'
import { simulateMatch } from './match'
import { simulateKnockout, KnockoutResult } from './knockout-match'
import { clamp } from '@/lib/math'

export type WCTeam = SimTeam & {
  confederation: string
  groupId:       string
  groupPoints:   number
  groupWins:     number
  groupDraws:    number
  groupLosses:   number
  groupGF:       number
  groupGA:       number
  groupPlayed:   number
}

export type WCGroup = {
  id:     string  // 'A' through 'L'
  teams:  WCTeam[]
}

export type WCKnockoutMatch = {
  round:   string
  teamA:   WCTeam
  teamB:   WCTeam
  result:  KnockoutResult
  winner:  WCTeam
}

export type WCSeasonResult = {
  groups:           WCGroup[]
  r32Teams:         WCTeam[]
  knockoutRounds:   { round: string; matches: WCKnockoutMatch[] }[]
  winner:           WCTeam
  playerTeam:       WCTeam
  playerFinalRound: string
  playerGroup:      string
  playerGroupPos:   number
}

export function simulateWorldCup(teams: WCTeam[]): WCSeasonResult {
  // assign to 12 groups of 4 — try to balance confederations
  const groups = assignGroups(teams)

  // --- GROUP STAGE ---
  for (const group of groups) {
    const [t1, t2, t3, t4] = group.teams

    // round robin — 6 games per group
    const matchups: [WCTeam, WCTeam][] = [
      [t1, t2], [t3, t4],
      [t1, t3], [t2, t4],
      [t1, t4], [t2, t3],
    ]

    for (const [home, away] of matchups) {
      const result = simulateMatch(home, away)

      home.groupPlayed++; away.groupPlayed++
      home.groupGF += result.homeGoals; home.groupGA += result.awayGoals
      away.groupGF += result.awayGoals; away.groupGA += result.homeGoals
      updateForm(home, result.outcome === 'home' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')
      updateForm(away, result.outcome === 'away' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')

      if (result.outcome === 'home') {
        home.groupWins++; home.groupPoints += 3; away.groupLosses++
      } else if (result.outcome === 'away') {
        away.groupWins++; away.groupPoints += 3; home.groupLosses++
      } else {
        home.groupDraws++; home.groupPoints++
        away.groupDraws++; away.groupPoints++
      }
    }

    // sync to stats
    for (const t of group.teams) {
      t.stats.played       = t.groupPlayed
      t.stats.won          = t.groupWins
      t.stats.drawn        = t.groupDraws
      t.stats.lost         = t.groupLosses
      t.stats.points       = t.groupPoints
      t.stats.goalsFor     = t.groupGF
      t.stats.goalsAgainst = t.groupGA
    }

    group.teams.sort(compareGroupTeams)
  }

  // --- DETERMINE R32 QUALIFIERS ---
  // top 2 from each group (24 teams) + 8 best third-place teams
  const topTwo      = groups.flatMap(g => g.teams.slice(0, 2))
  const allThirds   = groups.map(g => g.teams[2]).sort(compareGroupTeams)
  const bestThirds  = allThirds.slice(0, 8)
  const r32Teams    = [...topTwo, ...bestThirds]

  const playerTeam  = [...teams].find(t => t.isPlayer)!
  const playerGroup = groups.find(g => g.teams.some(t => t.isPlayer))!
  const playerGroupPos = playerGroup.teams.indexOf(playerTeam) + 1

  // player didn't qualify
  if (!r32Teams.some(t => t.isPlayer)) {
    return {
      groups,
      r32Teams,
      knockoutRounds:   [],
      winner:           r32Teams[0],
      playerTeam,
      playerFinalRound: 'groups',
      playerGroup:      playerGroup.id,
      playerGroupPos,
    }
  }

  // --- KNOCKOUT ROUNDS (all single leg + ET/PKs) ---
  const knockoutRounds: { round: string; matches: WCKnockoutMatch[] }[] = []
  const roundNames = ['r32', 'r16', 'qf', 'sf', 'final']
  let current = r32Teams
  let playerFinalRound = 'groups'

  for (const round of roundNames) {
    const pairs = current.length === 2
      ? [[current[0], current[1]]] as [WCTeam, WCTeam][]
      : createKnockoutPairs(current)

    const roundMatches: WCKnockoutMatch[] = []
    const winners: WCTeam[] = []

    for (const [teamA, teamB] of pairs) {
      const result = simulateKnockout(teamA as any, teamB as any) as KnockoutResult
      const winner = result.winner === 'home' ? teamA : teamB
      winners.push(winner)

      roundMatches.push({ round, teamA, teamB, result, winner })

      if ((teamA.isPlayer || teamB.isPlayer) && !winner.isPlayer) {
        playerFinalRound = round
      }
    }

    knockoutRounds.push({ round, matches: roundMatches })
    current = winners

    if (current.length === 1) break
  }

  const champion = current[0]
  if (champion.isPlayer) playerFinalRound = 'winner'

  return {
    groups,
    r32Teams,
    knockoutRounds,
    winner:           champion,
    playerTeam,
    playerFinalRound,
    playerGroup:      playerGroup.id,
    playerGroupPos,
  }
}

// Generate matchday-by-matchday fixtures for the group stage (3 rounds, 24 games/round)
export function generateWCGroupFixtures(
  groups: WCGroup[]
): { matchday: number; home: WCTeam; away: WCTeam }[] {
  const roundPairings: Array<(t: WCTeam[]) => [WCTeam, WCTeam][]> = [
    t => [[t[0], t[1]], [t[2], t[3]]],
    t => [[t[0], t[2]], [t[1], t[3]]],
    t => [[t[0], t[3]], [t[1], t[2]]],
  ]
  const fixtures: { matchday: number; home: WCTeam; away: WCTeam }[] = []
  for (let roundIdx = 0; roundIdx < 3; roundIdx++) {
    for (const group of groups) {
      if (group.teams.length < 4) continue
      for (const [home, away] of roundPairings[roundIdx](group.teams)) {
        fixtures.push({ matchday: roundIdx + 1, home, away })
      }
    }
  }
  return fixtures
}

// Runs knockout phase from already-simulated groups
export function simulateWCKnockoutsOnly(
  groups: WCGroup[],
  allTeams: WCTeam[]
): Omit<WCSeasonResult, 'groups'> {
  const byStats = (a: WCTeam, b: WCTeam) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst
    const gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  }
  for (const group of groups) group.teams.sort(byStats)

  const topTwo     = groups.flatMap(g => g.teams.slice(0, 2))
  const allThirds  = groups.map(g => g.teams[2]).sort(byStats)
  const bestThirds = allThirds.slice(0, 8)
  const r32Teams   = [...topTwo, ...bestThirds]

  const playerTeam   = allTeams.find(t => t.isPlayer)!
  const playerGroup  = groups.find(g => g.teams.some(t => t.isPlayer))!
  const playerGroupPos = playerGroup.teams.indexOf(playerTeam) + 1

  if (!r32Teams.some(t => t.isPlayer)) {
    return {
      r32Teams,
      knockoutRounds:   [],
      winner:           r32Teams[0],
      playerTeam,
      playerFinalRound: 'groups',
      playerGroup:      playerGroup.id,
      playerGroupPos,
    }
  }

  const knockoutRounds: { round: string; matches: WCKnockoutMatch[] }[] = []
  const roundNames = ['r32', 'r16', 'qf', 'sf', 'final']
  let current          = r32Teams
  let playerFinalRound = 'groups'

  for (const round of roundNames) {
    const pairs = current.length === 2
      ? [[current[0], current[1]]] as [WCTeam, WCTeam][]
      : createKnockoutPairs(current)

    const roundMatches: WCKnockoutMatch[] = []
    const winners: WCTeam[] = []

    for (const [teamA, teamB] of pairs) {
      const result = simulateKnockout(teamA as any, teamB as any) as KnockoutResult
      const winner = result.winner === 'home' ? teamA : teamB
      winners.push(winner)
      roundMatches.push({ round, teamA, teamB, result, winner })
      if ((teamA.isPlayer || teamB.isPlayer) && !winner.isPlayer) {
        playerFinalRound = round
      }
    }

    knockoutRounds.push({ round, matches: roundMatches })
    current = winners
    if (current.length === 1) break
  }

  const champion = current[0]
  if (champion.isPlayer) playerFinalRound = 'winner'

  return {
    r32Teams,
    knockoutRounds,
    winner:           champion,
    playerTeam,
    playerFinalRound,
    playerGroup:      playerGroup.id,
    playerGroupPos,
  }
}

export function assignGroups(teams: WCTeam[]): WCGroup[] {
  const groupIds = 'ABCDEFGHIJKL'.split('')
  const groups: WCGroup[] = groupIds.map(id => ({ id, teams: [] }))

  // sort by OVR descending — spread strong teams across groups
  const sorted = [...teams].sort((a, b) => b.ovr - a.ovr)

  // pot 1: top 12 (one per group), pots 2-4: fill remaining
  const pots: WCTeam[][] = [[], [], [], []]
  sorted.forEach((t, i) => pots[Math.floor(i / 12)].push(t))

  for (const pot of pots) {
    const shuffled = [...pot].sort(() => Math.random() - 0.5)
    shuffled.forEach((team, i) => {
      if (i < groups.length) {
        team.groupId = groupIds[i]
        groups[i].teams.push(team)
      }
    })
  }

  return groups
}

function compareGroupTeams(a: WCTeam, b: WCTeam): number {
  if (b.groupPoints !== a.groupPoints) return b.groupPoints - a.groupPoints
  const gdA = a.groupGF - a.groupGA
  const gdB = b.groupGF - b.groupGA
  if (gdB !== gdA) return gdB - gdA
  return b.groupGF - a.groupGF
}

function createKnockoutPairs(teams: WCTeam[]): [WCTeam, WCTeam][] {
  const shuffled = [...teams].sort(() => Math.random() - 0.5)
  const pairs: [WCTeam, WCTeam][] = []
  for (let i = 0; i < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]])
  }
  return pairs
}

function updateForm(team: WCTeam, result: 'win' | 'draw' | 'loss') {
  const delta = result === 'win' ? 0.15 : result === 'draw' ? 0 : -0.15
  team.form = clamp(team.form * 0.85 + delta, -1.0, 1.0)
}

// builds WCTeam[] from raw club data (called from placement)
export function buildWCTeams(
  clubs: { clubId: string; clubName: string; ovr: number; isPlayer: boolean; confederation?: string }[]
): WCTeam[] {
  return clubs.map(c => ({
    clubId:        c.clubId,
    clubName:      c.clubName,
    ovr:           c.ovr,
    isPlayer:      c.isPlayer,
    form:          0,
    confederation: c.confederation ?? 'UEFA',
    groupId:       '',
    groupPoints:   0,
    groupWins:     0,
    groupDraws:    0,
    groupLosses:   0,
    groupGF:       0,
    groupGA:       0,
    groupPlayed:   0,
    stats: {
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    },
  }))
}