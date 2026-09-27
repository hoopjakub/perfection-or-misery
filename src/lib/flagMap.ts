// A national team's flag, by club id (the World Cup's `<nation>_nt` ids) — the
// emoji every flag in the app is drawn from. RoundFlag turns the emoji into the
// real flag image (src/lib/flags.ts, P8-58), so callers only ever deal in this.
//
// Rebuilt 24 September 2026 as an explicit table of the 48 nations in the
// bundled DB: the earlier file was overwritten by mistake while the flag images
// were being generated (they now live in their own generated file,
// flagImages.ts, which the generator owns). A nation not listed has no flag
// and RoundFlag shows its code instead; `diagnostics` checks coverage.
const NATION_ISO: Record<string, string> = {
  usa_nt: 'us', mexico_nt: 'mx', canada_nt: 'ca', algeria_nt: 'dz', argentina_nt: 'ar',
  australia_nt: 'au', austria_nt: 'at', belgium_nt: 'be', bosnia_herzegovina_nt: 'ba', brazil_nt: 'br',
  cabo_verde_nt: 'cv', colombia_nt: 'co', dr_congo_nt: 'cd', cote_divoire_nt: 'ci', croatia_nt: 'hr',
  czechia_nt: 'cz', curacao_nt: 'cw', ecuador_nt: 'ec', egypt_nt: 'eg', england_nt: 'gb-eng',
  france_nt: 'fr', germany_nt: 'de', ghana_nt: 'gh', haiti_nt: 'ht', iran_nt: 'ir',
  iraq_nt: 'iq', japan_nt: 'jp', jordan_nt: 'jo', korea_republic_nt: 'kr', morocco_nt: 'ma',
  netherlands_nt: 'nl', new_zealand_nt: 'nz', norway_nt: 'no', panama_nt: 'pa', paraguay_nt: 'py',
  portugal_nt: 'pt', qatar_nt: 'qa', saudi_arabia_nt: 'sa', scotland_nt: 'gb-sct', senegal_nt: 'sn',
  south_africa_nt: 'za', spain_nt: 'es', sweden_nt: 'se', switzerland_nt: 'ch', tunisia_nt: 'tn',
  turkiye_nt: 'tr', uruguay_nt: 'uy', uzbekistan_nt: 'uz', wales_nt: 'gb-wls',
}

/** ISO code → flag emoji: two regional-indicator letters, or for England,
 *  Scotland and Wales the black flag with tag letters (and the cancel tag). */
export function emojiForIso(iso: string): string {
  const letter = (base: number) => (ch: string) => String.fromCodePoint(base + ch.charCodeAt(0) - 97)
  if (iso.startsWith('gb-')) {
    return '\u{1F3F4}' + [...iso.replace('-', '')].map(letter(0xe0061)).join('') + '\u{E007F}'
  }
  return [...iso].map(letter(0x1f1e6)).join('')
}

export function getFlag(clubId: string | null | undefined): string | null {
  const iso = clubId ? NATION_ISO[clubId] : undefined
  return iso ? emojiForIso(iso) : null
}

// The way back (P8-58): a flag emoji → its ISO code, so RoundFlag can find the image.
const RI_A = 0x1f1e6, TAG_A = 0xe0061, BLACK_FLAG = 0x1f3f4

export function flagCodeOf(emoji?: string | null): string | null {
  if (!emoji) return null
  const cps = Array.from(emoji).map(c => c.codePointAt(0)!)
  if (cps.length === 2 && cps.every(c => c >= RI_A && c < RI_A + 26)) {
    return cps.map(c => String.fromCharCode(97 + c - RI_A)).join('')
  }
  if (cps[0] === BLACK_FLAG) {
    const tag = cps.slice(1).filter(c => c >= TAG_A && c < TAG_A + 26).map(c => String.fromCharCode(97 + c - TAG_A)).join('')
    if (tag.length === 5) return `${tag.slice(0, 2)}-${tag.slice(2)}`
  }
  return null
}
