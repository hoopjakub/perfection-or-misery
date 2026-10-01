/**
 * Which Wikipedia article is each league's season (the open build's map from
 * the game's league seeds to their sources). Keys are the seedIds used by
 * scripts/seed-identity/CustomUcl.json and the domestic seed files.
 *
 * Titles follow Wikipedia's own naming: "2025–26 X" for autumn–spring leagues,
 * "2025 X" for the calendar-year ones (the Nordics, Ireland, the Baltics,
 * Kazakhstan, Belarus, Georgia). The game calls both "2025" (year_start).
 * Checked by scripts/check-open-leagues.ts.
 */
export const CALENDAR_YEAR = new Set([
  'eliteserien', 'allsvenskan', 'iceland_pl', 'ireland_pd', 'kazakhstan_pl', 'finland_vl', 'latvia_vl',
  'faroe_pd', 'belarus_vl', 'lithuania_al', 'georgia_el', 'estonia_ml',
])

// Base names: the part after the season.
const NAME: Record<string, string> = {
  premier_league: 'Premier League', serie_a: 'Serie A', la_liga: 'La Liga', bundesliga: 'Bundesliga', ligue_1: 'Ligue 1',
  liga_portugal: 'Primeira Liga', pro_league: 'Belgian Pro League', eredivisie: 'Eredivisie', super_lig: 'Süper Lig',
  czech_liga: 'Czech First League', ekstraklasa: 'Ekstraklasa', super_league_gr: 'Super League Greece',
  superliga_dk: 'Danish Superliga', eliteserien: 'Eliteserien', cyprus_first: 'Cypriot First Division',
  super_league_ch: 'Swiss Super League', allsvenskan: 'Allsvenskan', nb_i: 'Nemzeti Bajnokság I',
  scottish_prem: 'Scottish Premiership', austria_bl: 'Austrian Football Bundesliga', ukraine_upl: 'Ukrainian Premier League',
  romania_l1: 'Liga I', croatia_hnl: 'Croatian Football League', slovenia_pl: 'Slovenian PrvaLiga',
  israel_pl: 'Israeli Premier League', azerbaijan_pl: 'Azerbaijan Premier League', slovakia_l1: 'Slovak First Football League',
  bulgaria_pl: 'First Professional Football League (Bulgaria)', serbia_sl: 'Serbian SuperLiga', iceland_pl: 'Besta deild karla',
  ireland_pd: 'League of Ireland Premier Division', armenia_pl: 'Armenian Premier League',
  bosnia_pl: 'Premier League of Bosnia and Herzegovina', kosovo_sl: 'Football Superleague of Kosovo',
  kazakhstan_pl: 'Kazakhstan Premier League', finland_vl: 'Veikkausliiga', latvia_vl: 'Latvian Higher League',
  moldova_sl: 'Moldovan Super Liga', faroe_pd: 'Faroe Islands Premier League', nmacedonia_pl: 'Macedonian First Football League',
  malta_pl: 'Maltese Premier League', albania_ks: 'Kategoria Superiore', belarus_vl: 'Belarusian Premier League',
  lithuania_al: 'A Lyga', gibraltar_nl: 'Gibraltar Football League', montenegro_pl: 'Montenegrin First League',
  nireland_pr: 'NIFL Premiership', luxembourg_nd: 'Luxembourg National Division', andorra_pd: 'Primera Divisió',
  georgia_el: 'Erovnuli Liga', estonia_ml: 'Meistriliiga', wales_cp: 'Cymru Premier', sanmarino_cs: 'Campionato Sammarinese di Calcio',
}

// Where Wikipedia's title for a season breaks the pattern, it goes here.
const OVERRIDE: Record<string, string> = {}

export function leagueArticle(seedId: string, yearStart: number): string {
  const key = `${seedId}:${yearStart}`
  if (OVERRIDE[key]) return OVERRIDE[key]
  const name = NAME[seedId]
  if (!name) throw new Error(`no Wikipedia name for league ${seedId}`)
  const season = CALENDAR_YEAR.has(seedId) ? `${yearStart}` : `${yearStart}–${String((yearStart + 1) % 100).padStart(2, '0')}`
  return `${season} ${name}`
}

export const LEAGUE_SEEDS = Object.keys(NAME)
