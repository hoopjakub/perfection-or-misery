import { LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'

const DOMINANCE_MARGIN = 8

export function filterEligibleLeagues(
  teamOvr: number,
  allSeasons: LeagueSeasonWithTeams[],
  chaosMode = false
): LeagueSeasonWithTeams[] {
  if (chaosMode) return allSeasons

  const eligible = allSeasons.filter(s => isEligible(teamOvr, s))

  if (eligible.length === 0) {
    return [...allSeasons]
      .sort((a, b) => getTop4Avg(b) - getTop4Avg(a))
      .slice(0, 3)
  }

  return eligible
}

function isEligible(teamOvr: number, season: LeagueSeasonWithTeams): boolean {
  return teamOvr <= getTop4Avg(season) + DOMINANCE_MARGIN
}

function getTop4Avg(season: LeagueSeasonWithTeams): number {
  const top4 = [...season.teams]
    .sort((a, b) => b.historical_ovr - a.historical_ovr)
    .slice(0, 4)
  return top4.reduce((s, t) => s + t.historical_ovr, 0) / 4
}

export function spinPlacement(eligible: LeagueSeasonWithTeams[]): LeagueSeasonWithTeams {
  return eligible[Math.floor(Math.random() * eligible.length)]
}

/**
 * Your side's name in a league run (P8-20): "{username} XI" when you're signed
 * in, "Your XI" for a guest. The side is yours, not the club it replaced, so it
 * wears your name — and it's stored on the run under that name. The modes where
 * you take over a club or a nation keep that club's or nation's name.
 */
export function sideName(username: string | null | undefined): string {
  const u = username?.trim()
  return u ? `${u} XI` : 'Your XI'
}

export function buildLeagueSeason(
  raw: LeagueSeasonWithTeams,
  playerOvr: number,
  /** P8-20: what your side is called — `sideName(username)`. */
  yourSide: string = sideName(null),
): LeagueSeason {
  const sorted  = [...raw.teams].sort((a, b) => a.historical_ovr - b.historical_ovr)
  const weakest = sorted[0]

  return {
    leagueId:         raw.leagueId,
    leagueName:       raw.leagueName,
    yearStart:        raw.yearStart,
    gamesPerSeason:   raw.gamesPerSeason,
    format:           raw.format ?? 'double_round_robin',
    replacedTeamName: weakest.club_name,
    teams: raw.teams.map(t => ({
      clubId:   t.club_id,
      clubName: t === weakest ? yourSide : t.club_name,
      ovr:      t === weakest ? playerOvr : t.historical_ovr,
      isPlayer: t === weakest,
    })),
  }
}