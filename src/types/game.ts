export type GameMode = 'league' | 'all_time' | 'era' | 'chaos' | 'cursed'

export type Position =
  'GK' | 'CB' | 'LB' | 'RB' | 'CDM' |
  'CM' | 'CAM' | 'LW' | 'RW' | 'ST'

export type Formation = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '5-3-2'

export type PositionSlot = {
  slotIndex: number
  label: string
  primary: Position
  accepts: Position[]
  filledBy: DraftedPlayer | null
}

export type DraftedPlayer = {
  playerId: string
  playerSeasonId: string
  name: string
  nationality: string
  primaryPosition: Position
  secondaryPositions: Position[]
  ovr: number
  clubName: string
  season: string
  slotIndex: number
  isIcon: boolean
}

export type LeagueSeason = {
  leagueId: string
  leagueName: string
  yearStart: number
  gamesPerSeason: number
  teams: LeagueTeam[]
  replacedTeamName: string
}

export type LeagueTeam = {
  clubId: string
  clubName: string
  ovr: number
  isPlayer: boolean
}

export type LeagueSeasonWithTeams = {
  leagueId: string
  leagueName: string
  yearStart: number
  gamesPerSeason: number
  teams: {
    club_id: string
    club_name: string
    historical_ovr: number
  }[]
}