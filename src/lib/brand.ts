// Real marks, or ours (P8-12).
//
// `EXPO_PUBLIC_BRAND_MODE=real` uses the bundled crests in logoMap; anything
// else (the default, and what a public release ships) uses the drawn Kit Drop
// crest instead — a square badge with a shirt's graphic device and the club's
// initials, generated from the club's id so it's the same mark every time.
// Phase 6 and the maturita licensing notes both require original marks, so
// `original` is the default rather than the opt-in.
//
// Everything that shows a crest reads it through `crestFor`, so the switch is
// this one place.
import { getLogo, getCompetitionLogo } from './logoMap'
import { CREST_COLOURS, FLAG_COLOURS } from './markColours'
import { getFlag, flagCodeOf } from './flagMap'

export type BrandMode = 'real' | 'original'
export const BRAND_MODE: BrandMode = process.env.EXPO_PUBLIC_BRAND_MODE === 'real' ? 'real' : 'original'

/** The five shirt graphic devices the drawn crest is built from (04-DIRECTION). */
export type CrestDevice = 'solid' | 'hoop' | 'sash' | 'halves' | 'chevron'
const DEVICES: CrestDevice[] = ['solid', 'hoop', 'sash', 'halves', 'chevron']

/** A stable small hash of a club id — the same club always gets the same mark. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h)
}

/** Up to three letters for the badge: initials of a multi-word name, else the
 *  first three letters. "1. FC Köln" skips the number. */
export function crestInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w && !/^\d+$/.test(w))
  if (words.length >= 2) return words.slice(0, 3).map(w => w[0]).join('').toUpperCase()
  return (words[0] ?? name).slice(0, 3).toUpperCase()
}

// The words that say what kind of club it is rather than which: "FC" in FC
// Metz, "SK" in SK Rapid. Half of Europe's names start or end with one.
const CLUB_FORM = new Set(['FC', 'SC', 'AC', 'CF', 'FK', 'SK', 'KF', 'NK', 'HNK', 'AS', 'SS', 'US', 'CD', 'SD', 'UD', 'KV', 'KRC', 'KAA', 'AFC', 'BK', 'IF', 'SV', 'RC', 'CS', 'GD', 'SL', 'SP', 'PFC', 'OFK', 'RFC'])

/** P8-119: a drawn badge at 16–20px has room for two letters, not three (it
 *  cut them off as "F…"). The club-form words go first, since "FC" alone
 *  says nothing about which club it is. */
export function shortCrestInitials(name: string): string {
  const core = name.split(/\s+/).filter(w => !CLUB_FORM.has(w.replace(/\./g, '').toUpperCase())).join(' ')
  return crestInitials(core || name).slice(0, 2)
}

export type Crest =
  | { kind: 'image'; source: number }
  | { kind: 'drawn'; device: CrestDevice; initials: string }
  /** A competition with a mark of our own, drawn in the kit (A-11: the World
   *  Cup, whose real mark isn't ours to use in either brand mode). */
  | { kind: 'mark'; mark: 'world_cup' }

/** The mark for one club: a real crest only in `real` mode and only when one is
 *  bundled; otherwise ours, drawn. */
export function crestFor(clubId: string | null | undefined, name: string): Crest {
  if (BRAND_MODE === 'real') {
    const source = getLogo(clubId)
    if (source != null) return { kind: 'image', source }
  }
  return { kind: 'drawn', device: DEVICES[hash(clubId || name) % DEVICES.length], initials: crestInitials(name) }
}

/** P8-163: a mark's own colours, [main, second], read off the picture itself
 *  (scripts/mark-colours.ts): a nation's flag, or a club's real crest. null for
 *  a drawn crest, whose colours the caller already has. A national side is
 *  found by its id or by the flag the caller passes (the World Cup's draft
 *  pool knows a nation by name). */
export function markColoursOf(clubId?: string | null, flag?: string | null): [string, string] | null {
  const code = flagCodeOf(flag ?? getFlag(clubId))
  if (code && FLAG_COLOURS[code]) return FLAG_COLOURS[code]
  if (BRAND_MODE === 'real' && clubId && CREST_COLOURS[clubId]) return CREST_COLOURS[clubId]
  return null
}

/** The same for a competition (P8-12): the Champions League's and each league's
 *  own mark are real images, scraped beside the crests. The World Cup has a
 *  mark of its own, drawn in the kit (A-11): the real one isn't licensable
 *  (the maturita licensing notes), so it's the same in both brand modes. */
export function competitionCrestFor(competitionId: string | null | undefined, name: string): Crest {
  if (competitionId === 'world_cup') return { kind: 'mark', mark: 'world_cup' }
  if (BRAND_MODE === 'real') {
    const source = getCompetitionLogo(competitionId)
    if (source != null) return { kind: 'image', source }
  }
  return { kind: 'drawn', device: DEVICES[hash(competitionId || name) % DEVICES.length], initials: crestInitials(name) }
}
