// WCAG 2.x contrast ratio between two #rrggbb (or #rgb) colours. Used at
// runtime where a colour isn't known in advance — a replaced club's colour on
// a tape — to decide whether it needs a stitched edge to stay visible.
// Same formula as the deep-audit skill's contrast.py; white on #F5C518 = 1.63.

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return 0
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Whichever of two inks reads better on every one of the given backgrounds
 * (centralisation N-15, phase two step 2): the higher of their worst ratios.
 * The rule that keeps text legible on a colour someone chose (a club's tag,
 * your crest, your pin, your profile theme), written five times before. The
 * inks come from the caller (`prim.ink`, `prim.cotton`) so this file stays
 * free of the theme and importable from the verify scripts.
 */
export function inkOn(backgrounds: string | readonly string[], ink: string, cotton: string): string {
  const bgs = typeof backgrounds === 'string' ? [backgrounds] : backgrounds
  const worst = (fg: string) => Math.min(...bgs.map(bg => ratio(fg, bg)))
  return worst(ink) >= worst(cotton) ? ink : cotton
}
