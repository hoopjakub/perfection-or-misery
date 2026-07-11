/**
 * Reusable, format-aware domestic-league simulator (headless).
 *
 * The custom Champions League path simulates every UEFA league fresh each run and
 * derives the UCL berths from the resulting standings — but the sim is generic, so
 * the SAME engine can drive any domestic league (incl. normal League mode when we
 * ship these leagues there).
 *
 * Each league carries a `format` (see scripts/lib/ucl-leagues.ts + the DB
 * `leagues.format` column). Most are a plain double round-robin, but several use a
 * regular season → split structure that changes who finishes where:
 *   • belgium_playoff  — double RR, then the top 6 have their points HALVED and play
 *                        a 2-round championship play-off (the classic Belgian drama).
 *   • scotland_split   — triple RR (33 games), then a top-6/bottom-6 split with 5
 *                        more games each; teams can't cross the split line.
 *   • split_championship — generic regular season → top-6 championship round +
 *                        relegation round (Greece/Denmark/Cyprus/Czechia/…).
 * The championship group always finishes above the rest (the split "locks").
 */
import type { SimTeam, TeamStats, MatchResult } from '@/types/simulation'
import { simulateMatch } from './match'
import { updateForm } from './simulation'

export type LeagueClub = { clubId: string; clubName: string; ovr: number }

export type LeagueFormat =
  | 'double_round_robin'
  | 'belgium_playoff'
  | 'scotland_split'
  | 'split_championship'

export type SimStandingRow = LeagueClub & {
  played: number; won: number; drawn: number; lost: number
  goalsFor: number; goalsAgainst: number; points: number
}

export type SimLeagueTable = {
  rank: number            // UEFA association coefficient rank
  name: string            // league name
  country?: string        // for the globe reveal
  format?: LeagueFormat   // how this table was produced (for the viewer + explainers)
  standings: SimStandingRow[]   // FINAL table, sorted, winner first
  // Split-format leagues: the table as it stood at the split (before points
  // halving / the championship round) — lets the viewer show both phases.
  regularStandings?: SimStandingRow[]
}

type FormatSpec = {
  regularRounds: number   // round-robins in the regular season (2 = home + away)
  split?: {
    championshipSize: number   // top-K enter the championship group
    halvePoints: boolean       // Belgium/Austria: halve (round up) carried points at the split
    championshipRounds: number // round-robins among the championship group
    relegationRounds: number   // round-robins among the rest (0 = keep regular order)
  }
}

export const FORMAT_SPECS: Record<LeagueFormat, FormatSpec> = {
  double_round_robin: { regularRounds: 2 },
  belgium_playoff:    { regularRounds: 2, split: { championshipSize: 6, halvePoints: true,  championshipRounds: 2, relegationRounds: 0 } },
  scotland_split:     { regularRounds: 3, split: { championshipSize: 6, halvePoints: false, championshipRounds: 1, relegationRounds: 1 } },
  split_championship: { regularRounds: 2, split: { championshipSize: 6, halvePoints: false, championshipRounds: 1, relegationRounds: 1 } },
}

function blankStats(): TeamStats {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
}

function applyResult(home: TeamStats, away: TeamStats, r: MatchResult) {
  home.played++; away.played++
  home.goalsFor += r.homeGoals; home.goalsAgainst += r.awayGoals
  away.goalsFor += r.awayGoals; away.goalsAgainst += r.homeGoals
  if      (r.outcome === 'home') { home.won++;   home.points += 3; away.lost++ }
  else if (r.outcome === 'away') { away.won++;   away.points += 3; home.lost++ }
  else                           { home.drawn++; home.points += 1; away.drawn++; away.points += 1 }
}

const BYE = '__bye__'

// One single round-robin as an array of matchdays (circle method). Matchdays let
// form evolve realistically when we replay the schedule for multi-round phases.
function roundRobinMatchdays(teams: SimTeam[]): [SimTeam, SimTeam][][] {
  const list: (SimTeam | typeof BYE)[] = [...teams]
  if (list.length % 2 !== 0) list.push(BYE)
  const n = list.length, rounds = n - 1, half = n / 2
  const fixed = list[0]
  const rot = list.slice(1)
  const mds: [SimTeam, SimTeam][][] = []
  for (let r = 0; r < rounds; r++) {
    const arr = [fixed, ...rot]
    const md: [SimTeam, SimTeam][] = []
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i]
      if (a !== BYE && b !== BYE) md.push([a as SimTeam, b as SimTeam])
    }
    mds.push(md)
    rot.unshift(rot.pop()!)
  }
  return mds
}

// Play `rounds` round-robins among `teams`, accumulating onto their existing
// stats (so a championship play-off adds on top of the regular season). Home/away
// alternates each round-robin repetition.
function playPhase(teams: SimTeam[], rounds: number) {
  if (teams.length < 2 || rounds <= 0) return
  const base = roundRobinMatchdays(teams)
  for (let rep = 0; rep < rounds; rep++) {
    for (const md of base) {
      for (const [x, y] of md) {
        const home = rep % 2 === 0 ? x : y
        const away = rep % 2 === 0 ? y : x
        const r = simulateMatch(home, away)
        applyResult(home.stats, away.stats, r)
        updateForm(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
        updateForm(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
      }
    }
  }
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

const toRow = (t: SimTeam): SimStandingRow => ({
  clubId: t.clubId, clubName: t.clubName, ovr: t.ovr,
  played: t.stats.played, won: t.stats.won, drawn: t.stats.drawn, lost: t.stats.lost,
  goalsFor: t.stats.goalsFor, goalsAgainst: t.stats.goalsAgainst, points: t.stats.points,
})

// ── Live play (the player's own league) ─────────────────────────────────────
// The sim screen plays the player's domestic season matchday-by-matchday. These
// helpers expose the same format logic as `simulateLeagueTable`, but staged:
// regular-season matchdays first, then (if the format splits) a second stage
// whose membership depends on the live standings at the split.

export type LiveMatchday = [SimTeam, SimTeam][]

/** All regular-season matchdays for the format (repetitions alternate venue). */
export function regularSeasonMatchdays(teams: SimTeam[], format: LeagueFormat = 'double_round_robin'): LiveMatchday[] {
  const spec = FORMAT_SPECS[format] ?? FORMAT_SPECS.double_round_robin
  const base = roundRobinMatchdays(teams)
  const out: LiveMatchday[] = []
  for (let rep = 0; rep < spec.regularRounds; rep++) {
    for (const md of base) {
      out.push(md.map(([x, y]) => (rep % 2 === 0 ? [x, y] : [y, x]) as [SimTeam, SimTeam]))
    }
  }
  return out
}

/**
 * Apply the split (mutates points when halving) and return the post-split stage:
 * combined matchdays (championship + relegation groups play side by side) plus
 * the championship-group ids so the final table can lock the groups.
 * Returns null when the format has no split or the league is too small.
 */
export function splitStage(teams: SimTeam[], format: LeagueFormat): {
  label: string
  matchdays: LiveMatchday[]
  championshipIds: Set<string>
  pointsHalved: boolean
} | null {
  const spec = FORMAT_SPECS[format] ?? FORMAT_SPECS.double_round_robin
  if (!spec.split || teams.length < 6) return null
  const ordered = sortTable(teams)
  const k = Math.min(spec.split.championshipSize, Math.floor(teams.length / 2))
  const champ = ordered.slice(0, k)
  const rest  = ordered.slice(k)
  if (spec.split.halvePoints) for (const t of champ) t.stats.points = Math.ceil(t.stats.points / 2)

  const champMds: LiveMatchday[] = []
  const restMds: LiveMatchday[] = []
  const champBase = roundRobinMatchdays(champ)
  for (let rep = 0; rep < spec.split.championshipRounds; rep++)
    for (const md of champBase) champMds.push(md.map(([x, y]) => (rep % 2 === 0 ? [x, y] : [y, x]) as [SimTeam, SimTeam]))
  if (spec.split.relegationRounds > 0 && rest.length >= 2) {
    const restBase = roundRobinMatchdays(rest)
    for (let rep = 0; rep < spec.split.relegationRounds; rep++)
      for (const md of restBase) restMds.push(md.map(([x, y]) => (rep % 2 === 0 ? [x, y] : [y, x]) as [SimTeam, SimTeam]))
  }
  // Interleave: matchday i = championship md i + relegation md i (side by side).
  const matchdays: LiveMatchday[] = []
  for (let i = 0; i < Math.max(champMds.length, restMds.length); i++) {
    matchdays.push([...(champMds[i] ?? []), ...(restMds[i] ?? [])])
  }
  return {
    label: spec.split.halvePoints ? 'Championship Play-off' : 'Championship Round',
    matchdays,
    championshipIds: new Set(champ.map(t => t.clubId)),
    pointsHalved: spec.split.halvePoints,
  }
}

/** Final table with the championship group locked above the rest. */
export function lockedFinalTable(teams: SimTeam[], championshipIds: Set<string> | null): SimTeam[] {
  if (!championshipIds) return sortTable(teams)
  const champ = teams.filter(t => championshipIds.has(t.clubId))
  const rest  = teams.filter(t => !championshipIds.has(t.clubId))
  return [...sortTable(champ), ...sortTable(rest)]
}

/** One live match: simulate, apply stats + form (shared with the headless path). */
export function playLiveMatch(home: SimTeam, away: SimTeam): MatchResult {
  const r = simulateMatch(home, away)
  applyResult(home.stats, away.stats, r)
  updateForm(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
  updateForm(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
  return r
}

export { sortTable as sortLeagueTable, blankStats as blankLeagueStats }

/**
 * Simulate a full domestic season in the league's real `format` and return the
 * final table (winner first). Defaults to a plain double round-robin.
 */
export function simulateLeagueTable(
  clubs: LeagueClub[],
  format: LeagueFormat = 'double_round_robin',
): SimStandingRow[] {
  return simulateLeagueTableDetailed(clubs, format).standings
}

/**
 * Same, but for split-format leagues also returns the table AS IT STOOD at the
 * split (pre-halving, regular-season order) so viewers can show both phases.
 */
export function simulateLeagueTableDetailed(
  clubs: LeagueClub[],
  format: LeagueFormat = 'double_round_robin',
): { standings: SimStandingRow[]; regularStandings?: SimStandingRow[] } {
  if (clubs.length === 0) return { standings: [] }
  const spec = FORMAT_SPECS[format] ?? FORMAT_SPECS.double_round_robin
  const teams: SimTeam[] = clubs.map(c => ({
    clubId: c.clubId, clubName: c.clubName, ovr: c.ovr, isPlayer: false,
    form: 0, stats: blankStats(),
  }))

  // 1. Regular season.
  playPhase(teams, spec.regularRounds)
  let ordered = sortTable(teams)
  let regularStandings: SimStandingRow[] | undefined

  // 2. Split into a championship group + the rest (if the format has one and the
  //    league is big enough to bother). The championship group locks above the rest.
  if (spec.split && teams.length >= 6) {
    regularStandings = ordered.map(toRow)   // snapshot BEFORE halving/playoffs
    const k = Math.min(spec.split.championshipSize, Math.floor(teams.length / 2))
    const champ = ordered.slice(0, k)
    const rest  = ordered.slice(k)
    if (spec.split.halvePoints) for (const t of champ) t.stats.points = Math.ceil(t.stats.points / 2)
    playPhase(champ, spec.split.championshipRounds)
    playPhase(rest,  spec.split.relegationRounds)
    ordered = [...sortTable(champ), ...sortTable(rest)]
  }

  return { standings: ordered.map(toRow), regularStandings }
}
