// Flag emoji for national teams.
// Keys are the club id with "_nt" stripped (e.g. "usa_nt" → "usa").
// Also accepts full club ids like "usa_nt" directly.

const FLAGS: Record<string, string> = {
  // North & Central America + Caribbean
  usa: '🇺🇸',
  mexico: '🇲🇽',
  canada: '🇨🇦',
  costa_rica: '🇨🇷',
  honduras: '🇭🇳',
  panama: '🇵🇦',
  jamaica: '🇯🇲',
  el_salvador: '🇸🇻',
  guatemala: '🇬🇹',
  cuba: '🇨🇺',
  haiti: '🇭🇹',
  curacao: '🇨🇼',
  trinidad_tobago: '🇹🇹',
  trinidad: '🇹🇹',

  // South America
  brazil: '🇧🇷',
  argentina: '🇦🇷',
  colombia: '🇨🇴',
  uruguay: '🇺🇾',
  chile: '🇨🇱',
  ecuador: '🇪🇨',
  peru: '🇵🇪',
  paraguay: '🇵🇾',
  venezuela: '🇻🇪',
  bolivia: '🇧🇴',

  // Europe
  england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  france: '🇫🇷',
  germany: '🇩🇪',
  spain: '🇪🇸',
  italy: '🇮🇹',
  portugal: '🇵🇹',
  netherlands: '🇳🇱',
  belgium: '🇧🇪',
  croatia: '🇭🇷',
  switzerland: '🇨🇭',
  denmark: '🇩🇰',
  sweden: '🇸🇪',
  norway: '🇳🇴',
  scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  ireland: '🇮🇪',
  austria: '🇦🇹',
  poland: '🇵🇱',
  czechia: '🇨🇿',
  czech_republic: '🇨🇿',
  serbia: '🇷🇸',
  turkey: '🇹🇷',
  turkiye: '🇹🇷',
  bosnia_herzegovina: '🇧🇦',
  bosnia: '🇧🇦',
  ukraine: '🇺🇦',
  greece: '🇬🇷',
  hungary: '🇭🇺',
  slovakia: '🇸🇰',
  romania: '🇷🇴',
  albania: '🇦🇱',
  georgia: '🇬🇪',
  slovenia: '🇸🇮',
  north_macedonia: '🇲🇰',
  iceland: '🇮🇸',
  finland: '🇫🇮',
  russia: '🇷🇺',

  // Africa
  morocco: '🇲🇦',
  senegal: '🇸🇳',
  nigeria: '🇳🇬',
  ghana: '🇬🇭',
  egypt: '🇪🇬',
  cameroon: '🇨🇲',
  ivory_coast: '🇨🇮',
  cote_divoire: '🇨🇮',
  mali: '🇲🇱',
  south_africa: '🇿🇦',
  tunisia: '🇹🇳',
  algeria: '🇩🇿',
  guinea: '🇬🇳',
  democratic_republic_congo: '🇨🇩',
  dr_congo: '🇨🇩',
  congo: '🇨🇬',
  zambia: '🇿🇲',
  namibia: '🇳🇦',
  mozambique: '🇲🇿',
  cape_verde: '🇨🇻',
  cabo_verde: '🇨🇻',
  tanzania: '🇹🇿',
  uganda: '🇺🇬',
  angola: '🇦🇴',

  // Asia
  japan: '🇯🇵',
  south_korea: '🇰🇷',
  korea: '🇰🇷',
  korea_republic: '🇰🇷',
  australia: '🇦🇺',
  iran: '🇮🇷',
  saudi_arabia: '🇸🇦',
  qatar: '🇶🇦',
  uae: '🇦🇪',
  united_arab_emirates: '🇦🇪',
  china: '🇨🇳',
  iraq: '🇮🇶',
  uzbekistan: '🇺🇿',
  india: '🇮🇳',
  vietnam: '🇻🇳',
  thailand: '🇹🇭',
  indonesia: '🇮🇩',
  jordan: '🇯🇴',
  oman: '🇴🇲',
  bahrain: '🇧🇭',
  kuwait: '🇰🇼',

  // Oceania
  new_zealand: '🇳🇿',
  fiji: '🇫🇯',
  tahiti: '🇵🇫',

  // Middle East
  israel: '🇮🇱',
  lebanon: '🇱🇧',
  syria: '🇸🇾',
}

/**
 * Returns the flag emoji for a given team/club id.
 * Works with ids like "brazil_nt", "usa_nt", "france_nt" (strips "_nt" suffix).
 * Returns null if no flag is found (e.g. for club teams in UCL/league modes).
 */
export function getFlag(clubId: string | null | undefined): string | null {
  if (!clubId) return null
  const key = clubId.replace(/_nt$/, '')
  return FLAGS[key] ?? null
}
