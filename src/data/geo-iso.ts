// Maps our league/nation identifiers to ISO 3166-1 numeric codes, which are the
// feature ids in assets/geo/countries-110m.geo.json — so the globe knows which
// country outline to light up. Football "home nations" (England/Scotland) fall
// back to GB (826); the text label still names the real footballing nation.

// World Cup national-team club ids (`*_nt`) → ISO numeric.
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

// Domestic league country name (leagues.country) → ISO numeric.
export const COUNTRY_ISO: Record<string, number> = {
  England: 826, Scotland: 826, Wales: 826, Germany: 276, Spain: 724, Italy: 380,
  France: 250, Netherlands: 528, Portugal: 620, Brazil: 76, Argentina: 32,
  'United States': 840, USA: 840,
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

export function isoForCountry(country: string): number | undefined {
  return COUNTRY_ISO[country]
}
