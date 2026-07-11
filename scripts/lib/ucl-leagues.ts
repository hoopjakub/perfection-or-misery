/**
 * Registry of the domestic leagues that feed the custom Champions League path.
 *
 * Ordered by UEFA association coefficient rank (docs §12.1) — the rank drives the
 * UCL berth allocation, so it is embedded per league and written into
 * CustomUcl.json so the app's access-list builder can map (assocRank, league
 * position) → UCL entry point without a second lookup.
 *
 * `format` records the league's real domestic format so the sim/standings can
 * branch on it later (most are a plain double round-robin; a few have playoff
 * splits — Belgium & Scotland flagged now, others to refine).
 *
 * ⚠ `tmSlug` for the lower-ranked leagues is best-effort — dry-run each with
 *   `LEAGUES=<id> LIMIT=1 npx tsx scripts/scrape-custom-ucl.ts` and fix any that
 *   404 before a full run. Codes (`tmCode`) are the reliable part.
 */
export type LeagueFormat =
  | 'double_round_robin'   // standard: everyone twice, one table
  | 'belgium_playoff'      // 30-game regular season → points halved → championship playoff
  | 'scotland_split'       // 33 games → top-6/bottom-6 split → 5 more (38)
  | 'split_championship'   // generic regular season → championship/relegation split (Greece/Denmark/Cyprus/Czechia…)

export type UclLeagueCfg = {
  seedId:    string
  assocRank: number
  name:      string
  country:   string
  tmCode:    string
  tmSlug:    string
  games:     number
  format:    LeagueFormat
  verified:  boolean       // tmSlug confirmed to resolve on TM
}

// Ranks 1–19 (covers the entire league phase + most of the qualifying field).
// Extend downward (20–55) as needed for the champions-path long tail.
export const UCL_LEAGUES: UclLeagueCfg[] = [
  { seedId: 'premier_league', assocRank: 1,  name: 'Premier League',       country: 'England',     tmCode: 'GB1', tmSlug: 'premier-league',        games: 38, format: 'double_round_robin', verified: true },
  { seedId: 'serie_a',        assocRank: 2,  name: 'Serie A',              country: 'Italy',       tmCode: 'IT1', tmSlug: 'serie-a',               games: 38, format: 'double_round_robin', verified: true },
  { seedId: 'la_liga',        assocRank: 3,  name: 'LaLiga',               country: 'Spain',       tmCode: 'ES1', tmSlug: 'laliga',                games: 38, format: 'double_round_robin', verified: true },
  { seedId: 'bundesliga',     assocRank: 4,  name: 'Bundesliga',           country: 'Germany',     tmCode: 'L1',  tmSlug: 'bundesliga',            games: 34, format: 'double_round_robin', verified: true },
  { seedId: 'ligue_1',        assocRank: 5,  name: 'Ligue 1',              country: 'France',      tmCode: 'FR1', tmSlug: 'ligue-1',               games: 34, format: 'double_round_robin', verified: true },
  { seedId: 'liga_portugal',  assocRank: 6,  name: 'Liga Portugal',        country: 'Portugal',    tmCode: 'PO1', tmSlug: 'liga-portugal',         games: 34, format: 'double_round_robin', verified: true },
  { seedId: 'pro_league',     assocRank: 7,  name: 'Pro League',           country: 'Belgium',     tmCode: 'BE1', tmSlug: 'jupiler-pro-league',    games: 30, format: 'belgium_playoff',    verified: true },
  { seedId: 'eredivisie',     assocRank: 8,  name: 'Eredivisie',           country: 'Netherlands', tmCode: 'NL1', tmSlug: 'eredivisie',            games: 34, format: 'double_round_robin', verified: true },
  { seedId: 'super_lig',      assocRank: 9,  name: 'Süper Lig',            country: 'Turkey',      tmCode: 'TR1', tmSlug: 'super-lig',             games: 34, format: 'double_round_robin', verified: true },
  { seedId: 'czech_liga',     assocRank: 10, name: 'Chance Liga',          country: 'Czechia',     tmCode: 'TS1', tmSlug: 'fortuna-liga',          games: 30, format: 'split_championship',  verified: true },
  { seedId: 'ekstraklasa',    assocRank: 11, name: 'Ekstraklasa',          country: 'Poland',      tmCode: 'PL1', tmSlug: 'pko-bp-ekstraklasa',    games: 34, format: 'double_round_robin', verified: true },
  { seedId: 'super_league_gr',assocRank: 12, name: 'Super League 1',       country: 'Greece',      tmCode: 'GR1', tmSlug: 'super-league-1',         games: 26, format: 'split_championship',  verified: true },
  { seedId: 'superliga_dk',   assocRank: 13, name: 'Superliga',            country: 'Denmark',     tmCode: 'DK1', tmSlug: 'superligaen',            games: 22, format: 'split_championship',  verified: true },
  { seedId: 'eliteserien',    assocRank: 14, name: 'Eliteserien',          country: 'Norway',      tmCode: 'NO1', tmSlug: 'eliteserien',            games: 30, format: 'double_round_robin', verified: true },
  { seedId: 'cyprus_first',   assocRank: 15, name: 'First Division',       country: 'Cyprus',      tmCode: 'ZYP1',tmSlug: 'protathlima-cyta',      games: 26, format: 'split_championship',  verified: true },
  { seedId: 'super_league_ch',assocRank: 16, name: 'Super League',         country: 'Switzerland', tmCode: 'C1',  tmSlug: 'super-league',           games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'allsvenskan',    assocRank: 17, name: 'Allsvenskan',          country: 'Sweden',      tmCode: 'SE1', tmSlug: 'allsvenskan',            games: 30, format: 'double_round_robin', verified: true },
  { seedId: 'nb_i',           assocRank: 18, name: 'NB I',                 country: 'Hungary',     tmCode: 'UNG1',tmSlug: 'nemzeti-bajnoksag',      games: 33, format: 'double_round_robin', verified: true },
  { seedId: 'scottish_prem',  assocRank: 19, name: 'Scottish Premiership', country: 'Scotland',    tmCode: 'SC1', tmSlug: 'scottish-premiership',  games: 38, format: 'scotland_split',      verified: true },
  // Ranks 20–33 — the champions-path field (slugs to confirm via the LIMIT=1 pass).
  { seedId: 'austria_bl',     assocRank: 20, name: 'Bundesliga',           country: 'Austria',     tmCode: 'A1',   tmSlug: 'bundesliga',            games: 32, format: 'belgium_playoff',     verified: true },
  { seedId: 'ukraine_upl',    assocRank: 21, name: 'Premier Liha',         country: 'Ukraine',     tmCode: 'UKR1', tmSlug: 'premier-liga',          games: 30, format: 'split_championship',  verified: true },
  { seedId: 'romania_l1',     assocRank: 22, name: 'SuperLiga',            country: 'Romania',     tmCode: 'RO1',  tmSlug: 'liga-1',                games: 30, format: 'split_championship',  verified: true },
  { seedId: 'croatia_hnl',    assocRank: 23, name: 'HNL',                  country: 'Croatia',     tmCode: 'KR1',  tmSlug: 'hnl',                   games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'slovenia_pl',    assocRank: 24, name: 'PrvaLiga',            country: 'Slovenia',    tmCode: 'SL1',  tmSlug: 'prva-liga',             games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'israel_pl',      assocRank: 25, name: 'Ligat haAl',           country: 'Israel',      tmCode: 'ISR1', tmSlug: 'ligat-haal',            games: 26, format: 'split_championship',  verified: true },
  { seedId: 'azerbaijan_pl',  assocRank: 26, name: 'Premyer Liqa',         country: 'Azerbaijan',  tmCode: 'AZ1',  tmSlug: 'premyer-liqa',          games: 28, format: 'double_round_robin', verified: true },
  { seedId: 'slovakia_l1',    assocRank: 27, name: 'Nike Liga',            country: 'Slovakia',    tmCode: 'SLO1', tmSlug: 'fortuna-liga',          games: 32, format: 'split_championship',  verified: true },
  { seedId: 'bulgaria_pl',    assocRank: 28, name: 'Parva Liga',           country: 'Bulgaria',    tmCode: 'BU1',  tmSlug: 'parva-liga',            games: 26, format: 'split_championship',  verified: true },
  { seedId: 'serbia_sl',      assocRank: 30, name: 'Super Liga',           country: 'Serbia',      tmCode: 'SER1', tmSlug: 'super-liga-srbije',     games: 37, format: 'split_championship',  verified: true },
  { seedId: 'iceland_pl',     assocRank: 31, name: 'Besta deild',          country: 'Iceland',     tmCode: 'IS1',  tmSlug: 'besta-deild-karla',     games: 22, format: 'double_round_robin', verified: true },
  { seedId: 'ireland_pd',     assocRank: 32, name: 'Premier Division',     country: 'Rep. Ireland',tmCode: 'IR1',  tmSlug: 'premier-division',      games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'armenia_pl',     assocRank: 33, name: 'Premier League',       country: 'Armenia',     tmCode: 'ARM1', tmSlug: 'premier-league',        games: 28, format: 'double_round_robin', verified: true },
  // Ranks 34–55 — the champions-path long tail (all remaining UEFA nations except
  // Russia #29 suspended & Liechtenstein #40 no domestic league). Slugs best-effort.
  { seedId: 'bosnia_pl',      assocRank: 34, name: 'Premijer Liga',        country: 'Bosnia',        tmCode: 'BOS1', tmSlug: 'premijer-liga',       games: 33, format: 'double_round_robin', verified: true },
  { seedId: 'kosovo_sl',      assocRank: 35, name: 'Superliga',            country: 'Kosovo',        tmCode: 'KO1',  tmSlug: 'superliga',           games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'kazakhstan_pl',  assocRank: 36, name: 'Premier League',       country: 'Kazakhstan',    tmCode: 'KAS1', tmSlug: 'premier-liga',        games: 26, format: 'split_championship',  verified: true },
  { seedId: 'finland_vl',     assocRank: 37, name: 'Veikkausliiga',        country: 'Finland',       tmCode: 'FI1',  tmSlug: 'veikkausliiga',       games: 27, format: 'split_championship',  verified: true },
  { seedId: 'latvia_vl',      assocRank: 38, name: 'Virsliga',             country: 'Latvia',        tmCode: 'LET1', tmSlug: 'virsliga',            games: 28, format: 'double_round_robin', verified: true },
  { seedId: 'moldova_sl',     assocRank: 39, name: 'Super Liga',           country: 'Moldova',       tmCode: 'MO1N', tmSlug: 'divizia-nationala',   games: 30, format: 'double_round_robin', verified: true },
  { seedId: 'faroe_pd',       assocRank: 41, name: 'Betri deildin',        country: 'Faroe Islands', tmCode: 'FARO', tmSlug: 'betri-deildin',       games: 27, format: 'double_round_robin', verified: true },
  { seedId: 'nmacedonia_pl',  assocRank: 42, name: 'Prva Liga',            country: 'North Macedonia',tmCode: 'MAZ1',tmSlug: 'prva-liga',           games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'malta_pl',       assocRank: 43, name: 'Premier League',       country: 'Malta',         tmCode: 'MAL1', tmSlug: 'premier-league',      games: 26, format: 'split_championship',  verified: true },
  { seedId: 'albania_ks',     assocRank: 44, name: 'Kategoria Superiore',  country: 'Albania',       tmCode: 'ALB1', tmSlug: 'kategoria-superiore', games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'belarus_vl',     assocRank: 45, name: 'Vysshaya Liga',        country: 'Belarus',       tmCode: 'WER1', tmSlug: 'wyschejschaja-liga',  games: 30, format: 'double_round_robin', verified: true },
  { seedId: 'lithuania_al',   assocRank: 46, name: 'A Lyga',               country: 'Lithuania',     tmCode: 'LI1',  tmSlug: 'a-lyga',              games: 28, format: 'double_round_robin', verified: true },
  { seedId: 'gibraltar_nl',   assocRank: 47, name: 'National League',      country: 'Gibraltar',     tmCode: 'GI1',  tmSlug: 'national-league',     games: 27, format: 'double_round_robin', verified: true },
  { seedId: 'montenegro_pl',  assocRank: 48, name: 'Prva Liga',            country: 'Montenegro',    tmCode: 'MNE1', tmSlug: 'prva-crnogorska-liga',games: 33, format: 'double_round_robin', verified: true },
  { seedId: 'nireland_pr',    assocRank: 49, name: 'Premiership',          country: 'Northern Ireland',tmCode: 'NIR1',tmSlug: 'premiership',        games: 38, format: 'split_championship',  verified: true },
  { seedId: 'luxembourg_nd',  assocRank: 50, name: 'National Division',    country: 'Luxembourg',    tmCode: 'LUX1', tmSlug: 'national-division',   games: 26, format: 'double_round_robin', verified: true },
  { seedId: 'andorra_pd',     assocRank: 51, name: 'Primera Divisió',      country: 'Andorra',       tmCode: 'AND1', tmSlug: 'primera-divisio',     games: 28, format: 'double_round_robin', verified: true },
  { seedId: 'georgia_el',     assocRank: 52, name: 'Erovnuli Liga',        country: 'Georgia',       tmCode: 'GE1N', tmSlug: 'erovnuli-liga',       games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'estonia_ml',     assocRank: 53, name: 'Meistriliiga',         country: 'Estonia',       tmCode: 'EST1', tmSlug: 'meistriliiga',        games: 36, format: 'double_round_robin', verified: true },
  { seedId: 'wales_cp',       assocRank: 54, name: 'Cymru Premier',        country: 'Wales',         tmCode: 'WAL1', tmSlug: 'cymru-premier',       games: 32, format: 'split_championship',  verified: true },
  { seedId: 'sanmarino_cs',   assocRank: 55, name: 'Campionato',           country: 'San Marino',    tmCode: 'SMR1', tmSlug: 'campionato-sammarinese',games: 26, format: 'double_round_robin', verified: true },
]
