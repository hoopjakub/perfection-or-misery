// The ONE scoring formula, shared by the app and the `submit-run` edge function
// (Phase 6). It lives under supabase/functions/_shared because Supabase only
// bundles a function's imports from inside supabase/functions; the app imports
// it from here by relative path. So: no '@/' aliases, no React Native, no Deno
// APIs. Plain TypeScript both runtimes understand.
//
// Before this, the app scored runs itself and inserted them straight into the
// table, so anyone could post any number. Now the app and the server run the
// same `scoreRun` over the same row, and the server's answer is the one saved.

/** A saved run, as far as scoring and validation need it. */
export type RunRow = {
  mode: string
  tier: string
  final_position: number
  teams_in_league: number
  team_ovr: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  difficulty_meta?: { hardness?: number } | null
}

// ── Difficulty ────────────────────────────────────────────────────────────────
// Harder settings are worth more points. Anchored so a "medium" run (hardness
// 3.9) is neutral (1.0×); easier runs are penalised, harder ones rewarded.
// Going from 0 → 10 rerolls drops hardness by a full point, about a 12% cut.
export const MEDIUM_HARDNESS = 3.9
export function scoreMultiplierFor(hardness: number): number {
  return Math.min(1.9, Math.max(0.45, 1 + (hardness - MEDIUM_HARDNESS) * 0.12))
}
/** A run saved without difficulty resolves to medium, exactly as resolveDifficulty(null) does. */
const multiplierOf = (row: RunRow) => scoreMultiplierFor(row.difficulty_meta?.hardness ?? MEDIUM_HARDNESS)

// ── Leagues ───────────────────────────────────────────────────────────────────
// Chaos/Cursed once had a flat 1.5×/1.3× on top; their fixed screw-level now
// flows through the difficulty multiplier instead, so they're 1.0 here.
const MODE_MULTIPLIER: Record<string, number> = { league: 1.0, all_time: 1.2, chaos: 1.0, cursed: 1.0 }

export function leagueScore(p: {
  mode: string; finalPosition: number; teamsInLeague: number; teamOvr: number
  losses: number; draws: number; difficultyMultiplier?: number
}): number {
  const positionScore = ((p.teamsInLeague - p.finalPosition + 1) / p.teamsInLeague) * 1000
  const ovrPenalty = Math.max(0, p.teamOvr - 80) * 10
  const tierBonus = p.losses === 0 && p.draws === 0 ? 750 : p.losses === 0 ? 400 : 0
  return Math.round((positionScore - ovrPenalty + tierBonus) * (MODE_MULTIPLIER[p.mode] ?? 1.0) * (p.difficultyMultiplier ?? 1.0))
}

// ── Knockout competitions ─────────────────────────────────────────────────────
// No league position: scored on the round reached, with the same underdog
// penalty, an unbeaten bonus and the same difficulty scaling.
export function knockoutScore(base: number, teamOvr: number, losses: number, difficultyMultiplier = 1): number {
  const ovrPenalty = Math.max(0, teamOvr - 80) * 10
  const unbeaten = losses === 0 ? 200 : 0
  return Math.round(Math.max(0, (base - ovrPenalty + unbeaten) * difficultyMultiplier))
}

export const WC_ROUND_TO_POSITION: Record<string, number> = {
  winner: 1, final: 2, third: 3, fourth: 4, sf: 4, qf: 8, r16: 16, r32: 32, groups: 40,
}
export const WC_ROUND_SCORE: Record<string, number> = {
  groups: 150, r32: 350, r16: 550, qf: 800, fourth: 950, sf: 950, third: 1150, final: 1300, winner: 1650,
}
export const CL_ROUND_TO_POSITION: Record<string, number> = {
  league_exit: 30, playoff_exit: 24, r16_exit: 16, qf_exit: 8, sf_exit: 4, finalist: 2, winner: 1,
}
export const CL_ROUND_SCORE: Record<string, number> = {
  league_exit: 200, playoff_exit: 350, r16_exit: 550, qf_exit: 800, sf_exit: 1050, finalist: 1300, winner: 1650,
}
// The full path: qualifying exits score lower than any league-phase finish.
export const CUSTOM_CL_ROUND_TO_POSITION: Record<string, number> = {
  not_qualified: 99, q1_exit: 90, q2_exit: 70, q3_exit: 55, quali_playoff_exit: 40, ...CL_ROUND_TO_POSITION,
}
export const CUSTOM_CL_ROUND_SCORE: Record<string, number> = {
  not_qualified: 20, q1_exit: 50, q2_exit: 90, q3_exit: 130, quali_playoff_exit: 170, ...CL_ROUND_SCORE,
}

const LEAGUE_MODES = new Set(['league', 'all_time', 'chaos', 'cursed', 'era'])
const LEAGUE_TIERS = new Set([
  'perfection', 'almost_perfection', 'champions', 'title_contender', 'champions_league',
  'europa_glory', 'almost_matters', 'respectful_mediocrity', 'absolute_misery',
])
const FIRST_PLACE_TIERS = new Set(['perfection', 'almost_perfection', 'champions'])

/** The score a run earns. The app shows it; the server saves it. */
export function scoreRun(row: RunRow): number {
  const mult = multiplierOf(row)
  switch (row.mode) {
    case 'world_cup':               return knockoutScore(WC_ROUND_SCORE[row.tier] ?? 100, row.team_ovr, row.losses, mult)
    case 'champions_league':        return knockoutScore(CL_ROUND_SCORE[row.tier] ?? 100, row.team_ovr, row.losses, mult)
    case 'champions_league_custom': return knockoutScore(CUSTOM_CL_ROUND_SCORE[row.tier] ?? 30, row.team_ovr, row.losses, mult)
    default: return leagueScore({
      mode: row.mode, finalPosition: row.final_position, teamsInLeague: row.teams_in_league,
      teamOvr: row.team_ovr, losses: row.losses, draws: row.draws, difficultyMultiplier: mult,
    })
  }
}

/**
 * Why a row can't be real, or null if it could be. The server refuses a row
 * that fails; the client runs the same check in the verifier. It can't prove
 * a result was simulated (the app reports its own results), but it rejects
 * rows no run could produce: a champion with losses on a perfect season,
 * more matches than a season has, a round that doesn't exist.
 */
export function invalidRun(row: RunRow): string | null {
  const ints = ['final_position', 'teams_in_league', 'team_ovr', 'wins', 'draws', 'losses', 'goals_for', 'goals_against'] as const
  for (const k of ints) if (!Number.isInteger(row[k]) || row[k] < 0) return `${k} must be a whole number ≥ 0`
  if (row.team_ovr < 30 || row.team_ovr > 99) return 'team_ovr out of range'
  const played = row.wins + row.draws + row.losses
  if (played > 60) return 'more matches than any competition has'
  if (row.goals_for > played * 15 || row.goals_against > played * 15) return 'goal totals out of range'
  const h = row.difficulty_meta?.hardness
  if (h != null && (typeof h !== 'number' || h < 0 || h > 11)) return 'hardness out of range'

  if (LEAGUE_MODES.has(row.mode)) {
    if (!LEAGUE_TIERS.has(row.tier)) return `unknown tier ${row.tier}`
    if (row.teams_in_league < 2 || row.teams_in_league > 30) return 'league size out of range'
    if (row.final_position < 1 || row.final_position > row.teams_in_league) return 'position outside the league'
    // No per-league match count: split formats (Scotland's 38 from 12 clubs,
    // Belgium's play-offs) break any simple rule. The global cap above holds.
    if (FIRST_PLACE_TIERS.has(row.tier) !== (row.final_position === 1)) return 'tier does not match the position'
    if (row.tier === 'perfection' && (row.losses > 0 || row.draws > 0)) return 'a perfect season has no draws or losses'
    if (row.tier === 'almost_perfection' && row.losses > 0) return 'an unbeaten season has no losses'
    return null
  }
  const ladder = row.mode === 'world_cup' ? WC_ROUND_SCORE
    : row.mode === 'champions_league' ? CL_ROUND_SCORE
    : row.mode === 'champions_league_custom' ? CUSTOM_CL_ROUND_SCORE
    : null
  if (!ladder) return `unknown mode ${row.mode}`
  if (!(row.tier in ladder)) return `unknown round ${row.tier}`
  return null
}
