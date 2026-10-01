// Maps our league/nation identifiers to ISO 3166-1 numeric codes, which are the
// feature ids in assets/geo/countries-110m.geo.json — so the globe knows which
// country outline to light up. Football "home nations" (England/Scotland) fall
// back to GB (826); the text label still names the real footballing nation.

// World Cup national-team club ids (`*_nt`) → ISO numeric.
// The club→country maps are keyed by club name, so they live in their own
// module with a public-build twin (europe-countries.legal.ts, P8.5 Wave D).
import { EUROPE_CLUB_COUNTRY, CL_CLUB_COUNTRY } from './europe-countries'
export const NATION_ISO: Record<string, number> = {
  algeria_nt: 12, argentina_nt: 32, australia_nt: 36, austria_nt: 40, belgium_nt: 56,
  bosnia_herzegovina_nt: 70, brazil_nt: 76, canada_nt: 124, colombia_nt: 170, croatia_nt: 191,
  czechia_nt: 203, cote_divoire_nt: 384, dr_congo_nt: 180, ecuador_nt: 218, egypt_nt: 818,
  england_nt: 826, france_nt: 250, germany_nt: 276, ghana_nt: 288, haiti_nt: 332,
  iran_nt: 364, iraq_nt: 368, japan_nt: 392, jordan_nt: 400, korea_republic_nt: 410,
  mexico_nt: 484, morocco_nt: 504, netherlands_nt: 528, new_zealand_nt: 554, norway_nt: 578,
  panama_nt: 591, paraguay_nt: 600, portugal_nt: 620, qatar_nt: 634, saudi_arabia_nt: 682,
  scotland_nt: 826, senegal_nt: 686, south_africa_nt: 710, spain_nt: 724, sweden_nt: 752,
  switzerland_nt: 756, tunisia_nt: 788, turkiye_nt: 792, usa_nt: 840, uruguay_nt: 858,
  uzbekistan_nt: 860,
  // cabo_verde_nt and curacao_nt have no feature in the 110m set — globe spins
  // without a highlight for those (rare), the text still names them.
}

// Domestic league country name (leagues.country) → ISO numeric. Covers the
// top-5 + WC/UCL nations plus every association scraped for the custom UCL
// path (docs §16 / scripts/lib/ucl-leagues.ts) — all 53 non-suspended UEFA
// members with a domestic league.
export const COUNTRY_ISO: Record<string, number> = {
  England: 826, Scotland: 826, Wales: 826, 'Northern Ireland': 826, Germany: 276, Spain: 724, Italy: 380,
  France: 250, Netherlands: 528, Portugal: 620, Brazil: 76, Argentina: 32,
  'United States': 840, USA: 840,
  // Custom UCL — every scraped association's country.
  Belgium: 56, Turkey: 792, Czechia: 203, Poland: 616, Greece: 300, Denmark: 208,
  Norway: 578, Cyprus: 196, Switzerland: 756, Sweden: 752, Hungary: 348,
  Austria: 40, Ukraine: 804, Romania: 642, Croatia: 191, Slovenia: 705,
  Israel: 376, Azerbaijan: 31, Slovakia: 703, Bulgaria: 100, Serbia: 688,
  Iceland: 352, 'Rep. Ireland': 372, 'Republic of Ireland': 372, Ireland: 372, Armenia: 51, Bosnia: 70, Kosovo: 383,
  Kazakhstan: 398, Finland: 246, Latvia: 428, Moldova: 498, Liechtenstein: 438,
  'Faroe Islands': 234, 'North Macedonia': 807, Malta: 470, Albania: 8,
  Belarus: 112, Lithuania: 440, Gibraltar: 292, Montenegro: 499,
  Luxembourg: 442, Andorra: 20, Georgia: 268, Estonia: 233, 'San Marino': 674,
}


export function countryForClClub(clubName?: string | null): string | undefined {
  if (!clubName) return undefined
  // P8-172: the Europa and Conference Leagues' clubs too (generated from their draws).
  return CL_CLUB_COUNTRY[clubName] ?? EUROPE_CLUB_COUNTRY[clubName]
}

// Domestic league id → ISO numeric (currently only the Premier League ships).
export const LEAGUE_ISO: Record<string, number> = {
  premier_league: 826, bundesliga: 276, la_liga: 724, serie_a: 380, ligue_1: 250,
  eredivisie: 528, primeira_liga: 620,
}

export function isoForLeague(leagueId: string): number | undefined {
  return LEAGUE_ISO[leagueId]
}

export function isoForNationId(nationId: string): number | undefined {
  return NATION_ISO[nationId]
}

// Custom UCL placement — each entrant carries its association's country name.
export function isoForCountryName(country?: string | null): number | undefined {
  if (!country) return undefined
  return COUNTRY_ISO[country]
}

// Flag emoji per association country (leagues.country values from the custom
// UCL scrape). Football home nations get their own flags where emoji exist.
export const COUNTRY_FLAG: Record<string, string> = {
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Northern Ireland': '🇬🇧',
  Italy: '🇮🇹', Spain: '🇪🇸', Germany: '🇩🇪', France: '🇫🇷', Portugal: '🇵🇹',
  Belgium: '🇧🇪', Netherlands: '🇳🇱', Turkey: '🇹🇷', Czechia: '🇨🇿', Poland: '🇵🇱',
  Greece: '🇬🇷', Denmark: '🇩🇰', Norway: '🇳🇴', Cyprus: '🇨🇾', Switzerland: '🇨🇭',
  Sweden: '🇸🇪', Hungary: '🇭🇺', Austria: '🇦🇹', Ukraine: '🇺🇦', Romania: '🇷🇴',
  Croatia: '🇭🇷', Slovenia: '🇸🇮', Israel: '🇮🇱', Azerbaijan: '🇦🇿', Slovakia: '🇸🇰',
  Bulgaria: '🇧🇬', Serbia: '🇷🇸', Iceland: '🇮🇸', 'Rep. Ireland': '🇮🇪', 'Republic of Ireland': '🇮🇪', Ireland: '🇮🇪', Armenia: '🇦🇲',
  Bosnia: '🇧🇦', Kosovo: '🇽🇰', Kazakhstan: '🇰🇿', Finland: '🇫🇮', Latvia: '🇱🇻',
  Moldova: '🇲🇩', 'Faroe Islands': '🇫🇴', 'North Macedonia': '🇲🇰', Malta: '🇲🇹',
  Albania: '🇦🇱', Belarus: '🇧🇾', Lithuania: '🇱🇹', Gibraltar: '🇬🇮', Montenegro: '🇲🇪',
  Luxembourg: '🇱🇺', Andorra: '🇦🇩', Georgia: '🇬🇪', Estonia: '🇪🇪', 'San Marino': '🇸🇲',
  // World Cup nations (non-UEFA / alternate spellings) — names exactly as in world_cup.json.
  'United States': '🇺🇸', Mexico: '🇲🇽', Canada: '🇨🇦', Algeria: '🇩🇿', Argentina: '🇦🇷',
  Australia: '🇦🇺', 'Bosnia and Herzegovina': '🇧🇦', Brazil: '🇧🇷', 'Cabo Verde': '🇨🇻',
  Colombia: '🇨🇴', 'DR Congo': '🇨🇩', "Côte d'Ivoire": '🇨🇮', 'Curaçao': '🇨🇼', Ecuador: '🇪🇨',
  Egypt: '🇪🇬', Ghana: '🇬🇭', Haiti: '🇭🇹', 'IR Iran': '🇮🇷', Iraq: '🇮🇶', Japan: '🇯🇵',
  Jordan: '🇯🇴', 'Korea Republic': '🇰🇷', Morocco: '🇲🇦', 'New Zealand': '🇳🇿', Panama: '🇵🇦',
  Paraguay: '🇵🇾', Qatar: '🇶🇦', 'Saudi Arabia': '🇸🇦', Senegal: '🇸🇳', 'South Africa': '🇿🇦',
  Tunisia: '🇹🇳', Turkiye: '🇹🇷', Uruguay: '🇺🇾', Uzbekistan: '🇺🇿',
}

// ISO alpha-2 → flag emoji (two regional-indicator letters). Fallback for any
// country not in the explicit map above, driven by the numeric-ISO tables.
const ISO_NUM_TO_A2: Record<number, string> = {
  4: 'AF', 8: 'AL', 12: 'DZ', 20: 'AD', 24: 'AO', 31: 'AZ', 32: 'AR', 36: 'AU', 40: 'AT',
  50: 'BD', 51: 'AM', 56: 'BE', 70: 'BA', 76: 'BR', 100: 'BG', 112: 'BY', 124: 'CA', 156: 'CN',
  170: 'CO', 180: 'CD', 191: 'HR', 196: 'CY', 203: 'CZ', 208: 'DK', 218: 'EC', 233: 'EE',
  234: 'FO', 246: 'FI', 250: 'FR', 268: 'GE', 276: 'DE', 288: 'GH', 292: 'GI', 300: 'GR',
  348: 'HU', 352: 'IS', 356: 'IN', 364: 'IR', 368: 'IQ', 372: 'IE', 376: 'IL', 380: 'IT',
  383: 'XK', 392: 'JP', 398: 'KZ', 400: 'JO', 410: 'KR', 428: 'LV', 438: 'LI', 440: 'LT',
  442: 'LU', 470: 'MT', 484: 'MX', 498: 'MD', 499: 'ME', 504: 'MA', 528: 'NL', 554: 'NZ',
  578: 'NO', 591: 'PA', 600: 'PY', 604: 'PE', 616: 'PL', 620: 'PT', 634: 'QA', 642: 'RO',
  643: 'RU', 674: 'SM', 682: 'SA', 686: 'SN', 688: 'RS', 703: 'SK', 705: 'SI', 710: 'ZA',
  724: 'ES', 752: 'SE', 756: 'CH', 788: 'TN', 792: 'TR', 804: 'UA', 807: 'MK', 818: 'EG',
  826: 'GB', 840: 'US', 858: 'UY', 860: 'UZ',
}
function flagFromA2(a2: string): string {
  return a2.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

export function flagForCountry(country?: string | null): string {
  if (!country) return ''
  if (COUNTRY_FLAG[country]) return COUNTRY_FLAG[country]
  const iso = COUNTRY_ISO[country]
  const a2 = iso ? ISO_NUM_TO_A2[iso] : undefined
  return a2 ? flagFromA2(a2) : ''
}

// Flag emoji for a domestic league, via its country. The Premier League is
// England's flag rather than the UK's.
export function flagForLeague(leagueId: string): string {
  if (leagueId === 'premier_league') return COUNTRY_FLAG.England
  const iso = LEAGUE_ISO[leagueId]
  const a2 = iso ? ISO_NUM_TO_A2[iso] : undefined
  return a2 ? flagFromA2(a2) : ''
}

export function isoForCountry(country: string): number | undefined {
  return COUNTRY_ISO[country]
}

// P8-163: a player's nationality, as the scrapers wrote it, is mostly the
// demonym ("Dutch", "Japanese") and sometimes the country ("Belarus",
// "Kosovo"). flagForCountry only knows countries, so every draft card came up
// flagless. Every value in the bundled database is listed (read off
// players_v5.db); the home nations go through the country table above.
const NATIONALITY_A2: Record<string, string> = {
  Spanish: 'ES', French: 'FR', German: 'DE', Italian: 'IT', Brazilian: 'BR', Dutch: 'NL',
  Portuguese: 'PT', Serbian: 'RS', Croatian: 'HR', Swedish: 'SE', Norwegian: 'NO', Danish: 'DK',
  Belgian: 'BE', Ukrainian: 'UA', Argentine: 'AR', Czech: 'CZ', Polish: 'PL', Nigerian: 'NG',
  Austrian: 'AT', Swiss: 'CH', Irish: 'IE', Turkish: 'TR', Ghanaian: 'GH', Senegalese: 'SN',
  Romanian: 'RO', Ivorian: 'CI', Belarus: 'BY', 'North Macedonia': 'MK', 'Bosnia-Herzegovina': 'BA', Israeli: 'IL',
  Iceland: 'IS', Moroccan: 'MA', Montenegro: 'ME', Slovak: 'SK', Finnish: 'FI', Greek: 'GR',
  Kosovo: 'XK', Albanian: 'AL', Kazakhstan: 'KZ', Georgian: 'GE', Hungarian: 'HU', Slovenian: 'SI',
  Bulgaria: 'BG', Estonia: 'EE', Japanese: 'JP', American: 'US', 'Faroe Islands': 'FO', Colombian: 'CO',
  Cameroonian: 'CM', Congolese: 'CD', Azerbaijan: 'AZ', Luxembourg: 'LU', Armenian: 'AM', Algerian: 'DZ',
  Malta: 'MT', Latvia: 'LV', Uruguayan: 'UY', Malian: 'ML', Moldova: 'MD', Cyprus: 'CY',
  Lithuania: 'LT', Gibraltar: 'GI', 'San Marino': 'SM', Russian: 'RU', Canadian: 'CA', Guinean: 'GN',
  Mexican: 'MX', Australian: 'AU', Tunisian: 'TN', 'The Gambia': 'GM', 'South Korean': 'KR', Ecuadorian: 'EC',
  'Cape Verdean': 'CV', 'Guinea-Bissau': 'GW', 'Burkina Faso': 'BF', Venezuelan: 'VE', Angolan: 'AO', Paraguayan: 'PY',
  Egyptian: 'EG', 'South African': 'ZA', Suriname: 'SR', 'New Zealander': 'NZ', Chilean: 'CL', Iranian: 'IR',
  Uzbek: 'UZ', Jamaican: 'JM', Togo: 'TG', Andorra: 'AD', Curacao: 'CW', Gabonese: 'GA',
  Benin: 'BJ', Guadeloupe: 'GP', 'Saudi Arabian': 'SA', Qatari: 'QA', Peruvian: 'PE', Panamanian: 'PA',
  Jordanian: 'JO', Iraqi: 'IQ', Haitian: 'HT', Curaçaoan: 'CW', 'Cura�aoan': 'CW', Comoros: 'KM',
  'Cabo Verdian': 'CV', Bosnian: 'BA', Zambian: 'ZM', Mauritania: 'MR', Madagascar: 'MG', Haiti: 'HT',
  'Costa Rican': 'CR', Indonesia: 'ID', Martinique: 'MQ', Iraq: 'IQ', 'Equatorial Guinea': 'GQ', Panama: 'PA',
  Kenya: 'KE', 'Central African Republic': 'CF', Uganda: 'UG', Zimbabwe: 'ZW', 'Sierra Leone': 'SL', Niger: 'NE',
  Liberia: 'LR', 'Dominican Republic': 'DO', Honduras: 'HN', Syria: 'SY', Mozambique: 'MZ', Rwanda: 'RW',
  Palestine: 'PS', 'Trinidad and Tobago': 'TT', Tanzania: 'TZ', Libya: 'LY', Burundi: 'BI', 'French Guiana': 'GF',
  Cuba: 'CU', Bolivian: 'BO', Somalia: 'SO', Saudi: 'SA', Philippines: 'PH', Lebanon: 'LB',
  Kyrgyzstan: 'KG', Chad: 'TD', 'Saint-Martin': 'MF', Nicaragua: 'NI', 'St. Kitts & Nevis': 'KN', 'New Caledonia': 'NC',
  Malawi: 'MW', Jordan: 'JO', Eritrea: 'ER', 'United Arab Emirates': 'AE', Tajikistan: 'TJ', 'Sao Tome and Principe': 'ST',
  Pakistan: 'PK', India: 'IN', Guyana: 'GY', Grenada: 'GD', China: 'CN', Afghanistan: 'AF',
  Vietnam: 'VN', Thailand: 'TH', 'Sri Lanka': 'LK', 'Southern Sudan': 'SS', 'Sint Maarten': 'SX', Mongolia: 'MN',
  Mauritius: 'MU', Malaysia: 'MY', Macao: 'MO', Liechtenstein: 'LI', Laos: 'LA', 'Korea, North': 'KP',
  Guatemala: 'GT', Ethiopia: 'ET', 'El Salvador': 'SV', Djibouti: 'DJ', Bermuda: 'BM', Barbados: 'BB',
  Bangladesh: 'BD', Bahrain: 'BH', Aruba: 'AW', 'Antigua and Barbuda': 'AG',
}
const HOME_NATIONS: Record<string, string> = { English: 'England', Scottish: 'Scotland', Welsh: 'Wales', 'Northern Ireland': 'Northern Ireland' }

/** A player's flag emoji from his nationality (demonym or country), or ''. */
export function flagForNationality(nationality?: string | null): string {
  if (!nationality) return ''
  const home = HOME_NATIONS[nationality]
  if (home) return COUNTRY_FLAG[home]
  const a2 = NATIONALITY_A2[nationality]
  return a2 ? flagFromA2(a2) : flagForCountry(nationality)
}
