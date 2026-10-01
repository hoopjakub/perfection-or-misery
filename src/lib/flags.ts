import { FLAGS, FLAGS_LARGE } from './flagImages'
import { flagCodeOf } from './flagMap'

// P8-58: a flag emoji → its bundled flag image. Emoji flags cropped into a
// circle looked bad (and some platforms draw them as two letters), so every
// round flag is now the real flag. The app already carries flags as emoji
// everywhere (`flagForCountry`); this reads the country back out of the emoji,
// so no call site had to change:
//  - a country flag is two regional-indicator letters (🇩🇪 = D + E → 'de');
//  - England, Scotland and Wales are a black flag plus tag letters spelling
//    'gbeng' / 'gbsct' / 'gbwls' → 'gb-eng', 'gb-sct', 'gb-wls'.
// Anything else (no flag for it) returns null and RoundFlag keeps the emoji.
export function flagImageOf(emoji?: string | null): number | null {
  const code = flagCodeOf(emoji)
  return code ? FLAGS[code] ?? null : null
}

/** The same flag at 640px, for one that fills a card or a country on the
 *  globe (P8.5-11: the 80px one stretched over a draft card looked blurred). */
export function flagLargeOf(emoji?: string | null): number | null {
  const code = flagCodeOf(emoji)
  return code ? FLAGS_LARGE[code] ?? FLAGS[code] ?? null : null
}
