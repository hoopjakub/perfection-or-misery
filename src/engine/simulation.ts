import { SimTeam, Fixture, SeasonResult, TeamStats, MatchResult } from '@/types/simulation'
import { LeagueSeason } from '@/types/game'
import { generateFixtures } from './fixtures'
import { simulateMatch } from './match'
import { clamp } from '@/lib/math'
import { assignTier } from './tier'

export function simulateSeason(league: LeagueSeason): SeasonResult {
  const teams: SimTeam[] = league.teams.map(t => ({
    ...t,
    form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))

  const fixtures = generateFixtures(teams)
  const playerTeam = teams.find(t => t.isPlayer)!
  const upsets: SeasonResult['upsets'] = []
  let biggestWinMargin = -1, biggestWinData: SeasonResult['biggestWin'] = null
  let worstLossMargin  = -1, worstLossData: SeasonResult['worstLoss']  = null

  const matchdays = groupByMatchday(fixtures)

  for (const matchday of matchdays) {
    for (const fixture of matchday) {
      const result = simulateMatch(fixture.home, fixture.away)
      fixture.result = result

      updateStats(fixture.home.stats, fixture.away.stats, result)
      updateForm(fixture.home, result.outcome === 'home' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')
      updateForm(fixture.away, result.outcome === 'away' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')

      if (fixture.home.isPlayer || fixture.away.isPlayer) {
        const isPlayerHome = fixture.home.isPlayer
        const playerGoals  = isPlayerHome ? result.homeGoals : result.awayGoals
        const oppGoals     = isPlayerHome ? result.awayGoals : result.homeGoals
        const oppName      = isPlayerHome ? fixture.away.clubName : fixture.home.clubName
        const margin       = playerGoals - oppGoals

        if (margin > biggestWinMargin) {
          biggestWinMargin = margin
          biggestWinData   = { score: `${playerGoals}-${oppGoals}`, opponent: oppName }
        }
        if (worstLossMargin === -1 || margin < worstLossMargin) {
          worstLossMargin = margin
          if (margin < 0) worstLossData = { score: `${playerGoals}-${oppGoals}`, opponent: oppName }
        }

        if (result.isUpset) {
          const playerLost =
            (isPlayerHome && result.outcome === 'away') ||
            (!isPlayerHome && result.outcome === 'home')
          if (playerLost) {
            const oppOvr = isPlayerHome ? fixture.away.ovr : fixture.home.ovr
            upsets.push({
              score: `${playerGoals}-${oppGoals}`,
              opponent: oppName,
              ovrGap: playerTeam.ovr - oppOvr,
            })
          }
        }
      }
    }
  }

  const sortedTable  = sortTable(teams)
  const finalPosition = sortedTable.findIndex(t => t.isPlayer) + 1
  const { won, drawn, lost, goalsFor, goalsAgainst } = playerTeam.stats
  const unbeaten      = lost === 0
  const perfectSeason = lost === 0 && drawn === 0

  return {
    table: sortedTable,
    playerTeam,
    finalPosition,
    teamsInLeague: teams.length,
    wins: won,
    draws: drawn,
    losses: lost,
    goalsFor,
    goalsAgainst,
    biggestWin: biggestWinData,
    worstLoss: worstLossData,
    upsets,
    unbeaten,
    perfectSeason,
    tier: assignTier(finalPosition, teams.length, unbeaten, perfectSeason),
  }
}

function updateStats(home: TeamStats, away: TeamStats, result: MatchResult) {
  home.played++; away.played++
  home.goalsFor      += result.homeGoals
  home.goalsAgainst  += result.awayGoals
  away.goalsFor      += result.awayGoals
  away.goalsAgainst  += result.homeGoals

  if      (result.outcome === 'home') { home.won++;   home.points  += 3; away.lost++ }
  else if (result.outcome === 'away') { away.won++;   away.points  += 3; home.lost++ }
  else                                { home.drawn++; home.points  += 1; away.drawn++; away.points += 1 }
}

export function updateForm(team: SimTeam, result: 'win' | 'draw' | 'loss') {
  const delta = result === 'win' ? 0.15 : result === 'draw' ? 0 : -0.15
  team.form   = clamp(team.form * 0.85 + delta, -1.0, 1.0)
}

function sortTable(teams: SimTeam[]): SimTeam[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst
    const gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}

function groupByMatchday(fixtures: Fixture[]): Fixture[][] {
  const map = new Map<number, Fixture[]>()
  fixtures.forEach(f => {
    if (!map.has(f.matchday)) map.set(f.matchday, [])
    map.get(f.matchday)!.push(f)
  })
  return Array.from(map.values())
}