import { SimTeam, Fixture } from '@/types/simulation'

export function generateFixtures(teams: SimTeam[]): Fixture[] {
  const n = teams.length
  const teamList = [...teams]
  if (n % 2 !== 0) teamList.push({ clubId: 'bye', clubName: 'BYE', ovr: 0, isPlayer: false, form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 } } as SimTeam)

  const numRounds = teamList.length - 1
  const half = teamList.length / 2
  const fixtures: Fixture[] = []

  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = teamList[i]
      const away = teamList[teamList.length - 1 - i]
      if (home.clubId === 'bye' || away.clubId === 'bye') continue

      fixtures.push({ matchday: round + 1,              home, away, result: null })
      fixtures.push({ matchday: round + 1 + numRounds,  home: away, away: home, result: null })
    }
    teamList.splice(1, 0, teamList.pop()!)
  }

  return shuffleWithinMatchdays(fixtures, numRounds * 2)
}

function shuffleWithinMatchdays(fixtures: Fixture[], totalMatchdays: number): Fixture[] {
  const result: Fixture[] = []
  for (let md = 1; md <= totalMatchdays; md++) {
    const day = fixtures.filter(f => f.matchday === md)
    result.push(...day.sort(() => Math.random() - 0.5))
  }
  return result
}