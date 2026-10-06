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
  difficulty_meta?: { hardness?: number; target?: string } | null
}

// ── Difficulty ────────────────────────────────────────────────────────────────
// Harder settings are worth more points. Anchored so a "medium" run (hardness
// 3.9) is neutral (1.0×); easier runs are penalised, harder ones rewarded.
//
// P8-106: the multiplier DOUBLES every 3.55 points of hardness (curve A,
// chosen by the maintainer 19 September 2026). It used to be linear, 0.12 a
// point capped at 1.9×, so 11/11 paid 1.85× while the pain multiplied: against
// an equal side your win rate falls from 33.5% at medium to 9.3% at level 10.
// Now: easiest 0.47×, easy 0.65×, medium 1.00×, hard 1.83×, 9/11 2.71×, 11/11 4.00×.
// Going from 0 → 10 rerolls drops hardness by a full point, about an 18% cut.
export const MEDIUM_HARDNESS = 3.9
const DOUBLING_HARDNESS = 3.55
export function scoreMultiplierFor(hardness: number): number {
  return 2 ** ((hardness - MEDIUM_HARDNESS) / DOUBLING_HARDNESS)
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
// P8-52: the full path now runs on into the Europa and Conference Leagues. A
// season that ends there climbs that competition's ladder (the classic modes'
// weights, 0.8 and 0.65), prefixed with where it was; going out in the
// Conference League's qualifying, where nobody drops any further, scores under
// its league phase and over not qualifying.
// How much a round in each European competition is worth against the same
// round in the Champions League (P8-172, docs/europe/02). One table (N-04,
// phase two step 2): it was written as 0.8 and 0.65 in both ladders below and
// again in src/data/tiers.ts, and src/data/europe.ts said it held them.
export const COMP_WEIGHT = { ucl: 1, uel: 0.8, uecl: 0.65 } as const

const prefixed = (p: string, ladder: Record<string, number>, w: number) =>
  Object.fromEntries(Object.entries(ladder).map(([k, v]) => [`${p}_${k}`, Math.round(v * w)]))
Object.assign(CUSTOM_CL_ROUND_SCORE, prefixed('uel', CL_ROUND_SCORE, COMP_WEIGHT.uel), prefixed('uecl', CL_ROUND_SCORE, COMP_WEIGHT.uecl), {
  uecl_q1_exit: 40, uecl_q2_exit: 60, uecl_q3_exit: 85, uecl_quali_playoff_exit: 110,
})
Object.assign(CUSTOM_CL_ROUND_TO_POSITION,
  Object.fromEntries(Object.entries(CL_ROUND_TO_POSITION).map(([k, v]) => [`uel_${k}`, v + 36])),
  Object.fromEntries(Object.entries(CL_ROUND_TO_POSITION).map(([k, v]) => [`uecl_${k}`, v + 72])),
  { uecl_q1_exit: 98, uecl_q2_exit: 96, uecl_q3_exit: 94, uecl_quali_playoff_exit: 92 },
)

// P8.5-21 / P8.5-39: a hunt (Settings → Achievement hunting) that reached its
// target. The draw was steered toward a league that can lead there, so it's
// worth a little less than a lucky run, the more so the easier the target's
// field. A hunt that missed its target is saved as a normal run, unmultiplied.
// The plan's starting figures (docs/europe/07 §3), to be tuned with
// scripts/measure-europe.ts.
export const TARGET_MULTIPLIER: Record<string, number> = { ucl: 0.9, uel: 0.85, uecl: 0.7 }
const compOfTier = (tier: string) => tier.startsWith('uecl_') ? 'uecl' : tier.startsWith('uel_') ? 'uel' : 'ucl'

// P8-172: the Europa and Conference Leagues climb the same ladder, weighed
// down — the same round against a weaker field is worth less (docs/europe/02).
const weighed = (ladder: Record<string, number>, w: number): Record<string, number> =>
  Object.fromEntries(Object.entries(ladder).map(([k, v]) => [k, Math.round(v * w)]))
export const UEL_ROUND_SCORE = weighed(CL_ROUND_SCORE, COMP_WEIGHT.uel)
export const UECL_ROUND_SCORE = weighed(CL_ROUND_SCORE, COMP_WEIGHT.uecl)

const LEAGUE_MODES = new Set(['league', 'all_time', 'chaos', 'cursed', 'era'])
const LEAGUE_TIERS = new Set([
  'perfection', 'almost_perfection', 'champions', 'title_contender', 'champions_league',
  'europa_glory', 'almost_matters', 'respectful_mediocrity', 'absolute_misery',
])
const FIRST_PLACE_TIERS = new Set(['perfection', 'almost_perfection', 'champions'])

/** One line of how a score was made (P8.5-41): what, and what it added or multiplied. */
export type ScoreLine = { label: string; value: string }

/**
 * The score a run earns, with how it was made (P8.5-41: the result's points
 * and their breakdown). The same arithmetic as before, written out in steps,
 * so the breakdown can never disagree with the total: scoreRun is this total.
 */
export function scoreBreakdown(row: RunRow): { total: number; lines: ScoreLine[] } {
  const mult = multiplierOf(row)
  const lines: ScoreLine[] = []
  const signed = (n: number) => (n >= 0 ? `+${Math.round(n)}` : `−${Math.round(-n)}`)
  const ovrPenalty = Math.max(0, row.team_ovr - 80) * 10
  const ladder = row.mode === 'world_cup' ? { l: WC_ROUND_SCORE, d: 100 }
    : row.mode === 'champions_league' ? { l: CL_ROUND_SCORE, d: 100 }
    : row.mode === 'champions_league_custom' ? { l: CUSTOM_CL_ROUND_SCORE, d: 30 }
    : row.mode === 'europa_league' ? { l: UEL_ROUND_SCORE, d: 80 }
    : row.mode === 'conference_league' ? { l: UECL_ROUND_SCORE, d: 65 }
    : null
  let raw: number
  let factor = mult
  if (ladder) {
    const base = ladder.l[row.tier] ?? ladder.d
    const unbeaten = row.losses === 0 ? 200 : 0
    lines.push({ label: 'How far you went', value: String(base) })
    if (ovrPenalty) lines.push({ label: `Team rated ${row.team_ovr} (over 80)`, value: signed(-ovrPenalty) })
    if (unbeaten) lines.push({ label: 'Unbeaten', value: signed(unbeaten) })
    raw = base - ovrPenalty + unbeaten
    const target = row.mode === 'champions_league_custom' ? row.difficulty_meta?.target : undefined
    const hunt = target ? TARGET_MULTIPLIER[target] ?? 1 : 1
    if (hunt !== 1) lines.push({ label: 'A hunt that reached its target', value: `×${hunt.toFixed(2)}` })
    factor *= hunt
    if (mult !== 1) lines.push({ label: 'Difficulty', value: `×${mult.toFixed(2)}` })
    const total = Math.round(Math.max(0, raw * factor))
    return { total, lines }
  }
  const positionScore = ((row.teams_in_league - row.final_position + 1) / row.teams_in_league) * 1000
  const tierBonus = row.losses === 0 && row.draws === 0 ? 750 : row.losses === 0 ? 400 : 0
  const modeMult = MODE_MULTIPLIER[row.mode] ?? 1.0
  lines.push({ label: `Finished ${row.final_position} of ${row.teams_in_league}`, value: String(Math.round(positionScore)) })
  if (ovrPenalty) lines.push({ label: `Team rated ${row.team_ovr} (over 80)`, value: signed(-ovrPenalty) })
  if (tierBonus) lines.push({ label: tierBonus === 750 ? 'Won every match' : 'Unbeaten', value: signed(tierBonus) })
  if (modeMult !== 1) lines.push({ label: 'All Time', value: `×${modeMult.toFixed(2)}` })
  if (mult !== 1) lines.push({ label: 'Difficulty', value: `×${mult.toFixed(2)}` })
  raw = positionScore - ovrPenalty + tierBonus
  factor *= modeMult
  return { total: Math.round(raw * factor), lines }
}

/** The score a run earns. The app shows it; the server saves it. */
export function scoreRun(row: RunRow): number {
  return scoreBreakdown(row).total
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
    : row.mode === 'europa_league' ? UEL_ROUND_SCORE
    : row.mode === 'conference_league' ? UECL_ROUND_SCORE
    : null
  if (!ladder) return `unknown mode ${row.mode}`
  if (!(row.tier in ladder)) return `unknown round ${row.tier}`
  // A hunting run stays in its target: its tier is that competition's.
  const target = row.difficulty_meta?.target
  if (target != null) {
    if (row.mode !== 'champions_league_custom' || !(target in TARGET_MULTIPLIER)) return `unknown target ${target}`
    if (row.tier === 'not_qualified' || compOfTier(row.tier) !== target) return `a ${target} hunt can't end as ${row.tier}`
  }
  return null
}
