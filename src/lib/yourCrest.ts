// P8-132: your own crest. The drawn badge the kit makes for clubs without a
// crest (P8-12), but chosen rather than generated: a shape, two colours from
// the palette, a shirt device and up to three letters. Or a picture instead.
// Pure (no theme, no React Native), so the choices and their defaults can be
// checked by a script; the kit maps each colour id to its palette colour.
import { isHex } from './colour'

// P8-175: more of each — shapes, devices and a trim — so a crest can look like
// a real club's rather than one of eighteen badges.
export type CrestShape = 'square' | 'shield' | 'round' | 'heater' | 'hexagon' | 'diamond' | 'octagon' | 'pennant' | 'oval'
export type CrestDevice = 'none' | 'hoop' | 'halves' | 'sash' | 'chevron' | 'solid'
  | 'stripes' | 'hoops' | 'quarters' | 'cross' | 'saltire' | 'star' | 'ball'
export type CrestTrim = 'ink' | 'thin' | 'double' | 'gold' | 'none'
export type CrestDesign = { shape: CrestShape; primary: string; secondary: string; device: CrestDevice; initials: string; trim?: CrestTrim }
/** P8-142: your club's two colours, by palette id. */
export type SideColours = { main: string; second: string }
/** What the account keeps: a design, or a picture (which wins when both are set);
 *  and your club's colours, which go on your side with or without a crest. */
export type CrestChoice = { design: CrestDesign | null; imagePath: string | null; everywhere: boolean; colours?: SideColours | null
  /** P8-175: the picture is your profile picture (imagePath is then its current path). */
  avatar?: boolean }

/** Stored colours, trusted no further than the palette. */
export function readColours(raw: unknown): SideColours | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  // A palette id, or (P8-177) any #rrggbb.
  const ok = (v: unknown): v is string => typeof v === 'string' && (CREST_COLOURS.some(c => c.id === v) || isHex(v))
  const low = (v: string) => (isHex(v) ? v.toLowerCase() : v)
  return ok(r.main) ? { main: low(r.main), second: ok(r.second) ? low(r.second) : low(r.main) } : null
}

// The colours, from the palette (P8-74), never a free hex: kept by id, so a
// palette change moves every crest with it (the hexes: `crestHex` in the kit).
export const CREST_COLOURS: { id: string; label: string }[] = [
  { id: 'ink', label: 'Ink' }, { id: 'cotton', label: 'Cotton' }, { id: 'orange', label: 'Orange' },
  { id: 'volt', label: 'Volt' }, { id: 'red', label: 'Red' }, { id: 'gold', label: 'Gold' },
  { id: 'pitch', label: 'Pitch' }, { id: 'amber', label: 'Amber' }, { id: 'violet', label: 'Violet' },
  { id: 'green', label: 'Green' }, { id: 'blue', label: 'Blue' },
]

export const CREST_SHAPES: { id: CrestShape; label: string }[] = [
  { id: 'shield', label: 'Shield' }, { id: 'heater', label: 'Heater' }, { id: 'pennant', label: 'Pennant' },
  { id: 'round', label: 'Round' }, { id: 'oval', label: 'Oval' }, { id: 'square', label: 'Square' },
  { id: 'diamond', label: 'Diamond' }, { id: 'hexagon', label: 'Hexagon' }, { id: 'octagon', label: 'Octagon' },
]
export const CREST_DEVICES: { id: CrestDevice; label: string }[] = [
  { id: 'none', label: 'Plain' }, { id: 'hoop', label: 'Hoop' }, { id: 'hoops', label: 'Hoops' }, { id: 'stripes', label: 'Stripes' },
  { id: 'halves', label: 'Halves' }, { id: 'quarters', label: 'Quarters' }, { id: 'sash', label: 'Sash' },
  { id: 'chevron', label: 'Chevron' }, { id: 'cross', label: 'Cross' }, { id: 'saltire', label: 'Saltire' },
  { id: 'solid', label: 'Band' }, { id: 'star', label: 'Star' }, { id: 'ball', label: 'Ball' },
]
export const CREST_TRIMS: { id: CrestTrim; label: string }[] = [
  { id: 'ink', label: 'Ink' }, { id: 'thin', label: 'Thin' }, { id: 'double', label: 'Double' }, { id: 'gold', label: 'Gold' }, { id: 'none', label: 'None' },
]

export const MAX_INITIALS = 3

/** Letters only, capitals, at most three (what fits a badge at any size). */
export function cleanInitials(raw: string): string {
  return raw.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, MAX_INITIALS)
}

/** A first design to start from: your name's letters, on your club's colours
 *  when you've chosen them (P8-142), else the kit's own. */
export function defaultDesign(username?: string | null, colours?: SideColours | null): CrestDesign {
  const words = (username ?? '').split(/[\s_\-.]+/).filter(Boolean)
  const initials = cleanInitials(words.length > 1 ? words.map(w => w[0]).join('') : words[0] ?? 'YOU')
  return { shape: 'shield', primary: colours?.main ?? 'ink', secondary: colours?.second ?? 'orange', device: 'sash', initials: initials || 'YOU' }
}

/** A stored design, trusted no further than the choices exist (the row is the user's to write). */
export function readDesign(raw: unknown): CrestDesign | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const shape = CREST_SHAPES.some(s => s.id === r.shape) ? r.shape as CrestShape : 'shield'
  const device = CREST_DEVICES.some(d => d.id === r.device) ? r.device as CrestDevice : 'none'
  const trim = CREST_TRIMS.some(t => t.id === r.trim) ? r.trim as CrestTrim : 'ink'
  const colour = (v: unknown, fallback: string) => (isHex(v) ? v.toLowerCase() : typeof v === 'string' && CREST_COLOURS.some(c => c.id === v) ? v : fallback)
  return { shape, device, trim, primary: colour(r.primary, 'ink'), secondary: colour(r.secondary, 'orange'), initials: cleanInitials(String(r.initials ?? '')) }
}

/** A crest picture's public address (the avatars bucket is public to read). */
export function crestImageUrl(path: string | null | undefined): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  return path && base ? `${base}/storage/v1/object/public/avatars/${path}` : null
}

