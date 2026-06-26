/**
 * Derive a club's primary + secondary colours from its Transfermarkt crest
 * (deterministic CDN URL by verein id), so clubs that aren't hand-curated still
 * get plausible brand colours instead of a generic grey.
 *
 * Pure-JS (pngjs) — no native image deps. Skips transparent / near-white /
 * near-black pixels, quantises the rest, and scores by frequency × saturation
 * so the dominant *brand* colour wins over greys; the secondary is the most
 * frequent colour that's far enough from the primary.
 */
import { PNG } from 'pngjs'
import { UA } from './transfermarkt'

const FALLBACK = { primary: '#1E293B', secondary: '#94A3B8' }
const cache = new Map<string, { primary: string; secondary: string }>()

const hex = (c: { r: number; g: number; b: number }) =>
  '#' + [c.r, c.g, c.b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
const sat = (c: { r: number; g: number; b: number }) => {
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b)
  return mx === 0 ? 0 : (mx - mn) / mx
}
const dist = (a: any, b: any) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)

export function extractColors(buf: Buffer): { primary: string; secondary: string } {
  let png: PNG
  try { png = PNG.sync.read(buf) } catch { return FALLBACK }
  const data = png.data
  const counts = new Map<string, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
    if (a < 128) continue                         // transparent
    if (r > 240 && g > 240 && b > 240) continue   // ~white
    if (r < 18 && g < 18 && b < 18) continue      // ~black
    const key = `${r >> 5},${g >> 5},${b >> 5}`   // quantise to 32-steps
    const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += r; e.g += g; e.b += b
    counts.set(key, e)
  }
  if (counts.size === 0) return FALLBACK
  const arr = [...counts.values()].map(e => ({ n: e.n, r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n) }))
  arr.sort((a, b) => b.n * (0.5 + sat(b)) - a.n * (0.5 + sat(a)))   // frequent + colourful first
  const primary = arr[0]
  // secondary: most frequent colour far enough from primary; if the crest is
  // basically one colour, derive a lighter tint so the two aren't identical.
  const secondary = arr.find(c => dist(c, primary) > 80)
    ?? { r: Math.round(primary.r + (255 - primary.r) * 0.55), g: Math.round(primary.g + (255 - primary.g) * 0.55), b: Math.round(primary.b + (255 - primary.b) * 0.55) }
  return { primary: hex(primary), secondary: hex(secondary) }
}

// Fetch a club crest by verein id and extract its colours (cached per club).
export async function fetchCrestColors(vereinId: string): Promise<{ primary: string; secondary: string }> {
  if (cache.has(vereinId)) return cache.get(vereinId)!
  let out = FALLBACK
  try {
    const res = await fetch(`https://tmssl.akamaized.net/images/wappen/head/${vereinId}.png`, { headers: { 'User-Agent': UA } })
    if (res.ok) out = extractColors(Buffer.from(await res.arrayBuffer()))
  } catch { /* keep fallback */ }
  cache.set(vereinId, out)
  return out
}
