// P8-177: the colour picker's arithmetic. Hue in degrees (0–360), saturation
// and value 0–1; hex as #rrggbb, lower case.

export type HSV = { h: number; s: number; v: number }

// A template-literal type, so a string that isn't one stays a string in the other branch.
export const isHex = (v: unknown): v is `#${string}` => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

export function hexToHsv(hex: string): HSV {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map(k => Math.round((k + m) * 255).toString(16).padStart(2, '0')).join('')
}

/** What a person typed into the hex field, as #rrggbb, or null while it isn't one yet. */
export function readHex(typed: string): string | null {
  const t = typed.trim().replace(/^#?/, '#').toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(t)) return t
  if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t.slice(1).split('').map(c => c + c).join('')
  return null
}
