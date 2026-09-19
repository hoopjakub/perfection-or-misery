// Unified registry of every result "tier" across all modes (league finish tiers,
// Champions League knockout exits, and World Cup finishes incl. the 3rd-place
// playoff). Used by the home page "Best Tier" so a WC/CL result is recognised,
// not just league tiers.

// Higher = more prestigious. Best tier = the user's run with the highest rank.
export const TIER_RANK: Record<string, number> = {
  // top of the pile
  winner:                100,   // any champion (WC / UCL)
  perfection:             98,   // league: unbeaten champion
  almost_perfection:      94,
  final:                  92,   // WC runner-up
  finalist:               91,   // UCL runner-up
  champions:              90,   // league champion
  third:                  86,   // WC bronze
  title_contender:        82,
  sf:                     78,   // WC semi-final
  sf_exit:                77,   // UCL semi-final
  champions_league:       74,   // league: UCL qualification
  europa_glory:           70,
  fourth:                 66,   // WC 4th — the "no medal" finish
  qf:                     62,   // WC quarter-final
  qf_exit:                61,   // UCL quarter-final
  almost_matters:         56,
  r16:                    52,   // WC round of 16
  r16_exit:               51,   // UCL round of 16
  respectful_mediocrity:  46,
  playoff_exit:           42,   // UCL playoff round (post-league-phase knockout)
  r32:                    40,   // WC round of 32
  league_exit:            36,   // UCL league phase
  groups:                 32,   // WC group stage
  absolute_misery:        20,
  // Custom UCL — qualifying-ladder exits (below league_exit; earlier == lower rank).
  quali_playoff_exit:     18,   // eliminated in the qualifying play-off round
  q3_exit:                16,   // eliminated in the 3rd qualifying round
  q2_exit:                14,   // eliminated in the 2nd qualifying round
  q1_exit:                12,   // eliminated in the 1st qualifying round
  not_qualified:          10,   // domestic finish earned no UCL spot at all
}

// The ONE set of display names for every tier, in every mode. The result card,
// Home, Runs and the leaderboard all read from here — they used to disagree
// (the league card said "ULTIMATE PERFECTION" / "EUROPEAN ELITE" while Home
// said "Perfection" / "UCL Qualification"), and a UCL winner was labelled
// "WC Champion". Cup labels don't name the competition; the mode is shown
// beside them wherever a run is listed.
export const TIER_LABEL: Record<string, string> = {
  // league
  perfection:            'Perfection',
  almost_perfection:     'Almost Perfection',
  champions:             'Champions',
  title_contender:       'Title Contenders',
  champions_league:      'Champions League',
  europa_glory:          'Europa Glory',
  almost_matters:        'Almost Matters',
  respectful_mediocrity: 'Respectable Mediocrity',
  absolute_misery:       'Absolute Misery',
  // cups (World Cup and Champions League share the knockout names)
  winner:                'Champions',
  final:                 'Runners-up',
  finalist:              'Runners-up',
  third:                 'Third Place',
  fourth:                'Fourth',
  sf:                    'Semi-finalists',
  sf_exit:               'Semi-finalists',
  qf:                    'Quarter-finalists',
  qf_exit:               'Quarter-finalists',
  r16:                   'Round of 16',
  r16_exit:              'Round of 16',
  r32:                   'Round of 32',
  playoff_exit:          'Knockout Play-off',
  league_exit:           'League Phase',
  groups:                'Group Stage',
  // the full Champions League path's qualifying exits
  quali_playoff_exit:    'Out in the Play-off',
  q3_exit:               'Out in Q3',
  q2_exit:               'Out in Q2',
  q1_exit:               'Out in Q1',
  not_qualified:         "Didn't Qualify",
}

// The highest-ranked tier among a set of run tiers (null if none recognised).
export function bestTierOf(tiers: (string | null | undefined)[]): string | null {
  let best: string | null = null
  let bestRank = -Infinity
  for (const t of tiers) {
    if (!t) continue
    const rank = TIER_RANK[t] ?? -1
    if (rank > bestRank) { bestRank = rank; best = t }
  }
  return best
}

// Which end of the ladder a tier sits at, for the verdict treatments: volt for
// the good end, the hazard stripe for Misery, plain ink for everything between.
// Cup exits before the knockouts count as Misery; a trophy counts as Perfection.
const PERFECTION_TIERS = new Set(['perfection', 'almost_perfection', 'winner'])
const MISERY_TIERS = new Set([
  'absolute_misery', 'groups', 'league_exit', 'not_qualified',
  'q1_exit', 'q2_exit', 'q3_exit', 'quali_playoff_exit',
])
export function verdictOf(tier: string | null | undefined): 'perfection' | 'misery' | 'middle' {
  if (tier && PERFECTION_TIERS.has(tier)) return 'perfection'
  if (tier && MISERY_TIERS.has(tier)) return 'misery'
  return 'middle'
}

// Short mode names for tags ("ALL TIME · HARD").
export const MODE_TAG: Record<string, string> = {
  all_time: 'All Time', league: 'League', era: 'Era', chaos: 'Chaos', cursed: 'Cursed',
  champions_league: 'UCL', champions_league_custom: 'UCL Full Path', world_cup: 'World Cup',
}

export function formatTier(tier: string | null | undefined): string {
  if (!tier) return '—'
  return TIER_LABEL[tier] ?? tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// A run's tag line on its garment label ("PREMIER LEAGUE 23/24 · UCL · HARD").
// One definition, so Home's last three and the Runs list print the same line.
const PRESET_DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
export function runMeta(run: { league_name: string; year_start?: number | null; mode: string; difficulty?: string | null; difficulty_meta?: { hardness?: number } | null }): string {
  const season = run.year_start ? ` ${String(run.year_start).slice(-2)}/${String(run.year_start + 1).slice(-2)}` : ''
  const mode = MODE_TAG[run.mode] ?? run.mode
  // P8-75: a custom run says what it was played on (the 0–11 hardness), as the old DifficultyBadge did.
  const h = run.difficulty_meta?.hardness
  const diff = run.difficulty && PRESET_DIFFICULTIES.has(run.difficulty) ? ` · ${run.difficulty}`
    : run.difficulty === 'custom' ? (typeof h === 'number' ? ` · custom ${h.toFixed(1)}/11` : ' · custom') : ''
  return `${run.league_name}${season} · ${mode}${diff}`.toUpperCase()
}
