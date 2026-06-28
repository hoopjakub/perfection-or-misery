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
  playoff_exit:           42,   // UCL playoff round
  r32:                    40,   // WC round of 32
  league_exit:            36,   // UCL league phase
  groups:                 32,   // WC group stage
  absolute_misery:        20,
}

// Display labels for the home page / teasers.
export const TIER_LABEL: Record<string, string> = {
  winner:                'Champion 🏆',
  perfection:            'Perfection',
  almost_perfection:     'Almost Perfection',
  champions:             'Champions',
  title_contender:       'Title Contender',
  champions_league:      'UCL Qualification',
  europa_glory:          'Europa Glory',
  almost_matters:        'Almost Matters',
  respectful_mediocrity: 'Respectful Mediocrity',
  absolute_misery:       'Absolute Misery',
  final:                 'WC Finalist',
  finalist:              'UCL Finalist',
  third:                 '🥉 Third Place',
  fourth:                "Semi 'No Medal' Finalist",
  sf:                    'Semi-Finalist',
  sf_exit:               'Semi-Finalist',
  qf:                    'Quarter-Finalist',
  qf_exit:               'Quarter-Finalist',
  r16:                   'Round of 16',
  r16_exit:              'Round of 16',
  r32:                   'Round of 32',
  playoff_exit:          'Playoff Round',
  league_exit:           'League Phase',
  groups:                'Group Stage',
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

export function formatTier(tier: string | null | undefined): string {
  if (!tier) return '—'
  return TIER_LABEL[tier] ?? tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
