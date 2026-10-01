// Each side's own colour on the match sheet and the momentum graph (P8-49).
//
// The sheet coloured the home side in its accent (white) and the away side in
// safety orange — and orange means YOU everywhere else in the app, so an away
// side that wasn't you wore your colour. Club colours are what FotMob uses, and
// what a supporter reads a graph by.
//
// A club's colour isn't always readable: plenty of kits are black, navy or
// white, and two clubs can share a red. So each side takes the first of its
// primary and secondary, lifted toward white until it stands off the ground
// (3:1, the bar for graphics), and the away side steps to its other colour, then to a neutral, when the two
// would be too alike to tell apart.
import { createContext, useContext, useEffect, useState } from 'react'
import { prim, choiceHex } from '@/theme'
import { useCrestStore } from '@/store/crestStore'
import { ratio } from '@/lib/contrast'
import { getClubColours } from '@/db/queries/seasons'

const MIN_ON_GROUND = 3
const MIN_APART = 1.4   // two colours closer than this read as the same side

type Kit = { primary: string; secondary: string | null }

// A dark kit colour is lifted toward white until it reads, rather than thrown
// away: Everton's royal blue becomes a lighter royal blue, not grey. Dropping
// every navy, maroon and bottle green to a neutral is what made the first
// version look like it "only worked for some teams".
function lift(hex: string, ground: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mix = (c: number) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')
    const out = `#${mix(r)}${mix(g)}${mix(b)}`
    if (ratio(out, ground) >= MIN_ON_GROUND) return out
  }
  return '#ffffff'
}

export function readablePair(home: Kit | undefined, away: Kit | undefined, ground = prim.nylon): { home: string; away: string } {
  const valid = (c?: string | null): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c)
  // Each side's colours in order of preference, every one made readable.
  const options = (k: Kit | undefined, fallback: string) =>
    [k?.primary, k?.secondary].filter(valid).map(c => lift(c, ground)).concat(fallback)
  const h = options(home, prim.cotton)[0]
  const a = options(away, prim.cottonMuted).find(c => ratio(c, h) >= MIN_APART)
    ?? (ratio(prim.cottonMuted, h) >= MIN_APART ? prim.cottonMuted : prim.nylonFaint)
  return { home: h, away: a }
}

// A match screen provides its pair once; the stat bars and the momentum graph
// read it, so none of the ~45 stat rows has to be handed colours one by one.
// Outside a provider they fall back to the old neutral look.
export const TeamColoursContext = createContext<{ home: string; away: string } | null>(null)
export const useTeamColourPair = () => useContext(TeamColoursContext)

/** The two sides' colours for a match, loaded once; neutral until they arrive. */
export function useTeamColours(homeId?: string, awayId?: string): { home: string; away: string } {
  const [pair, setPair] = useState<{ home: string; away: string }>({ home: prim.cotton, away: prim.cottonMuted })
  // P8-142: your side wears your club's colours, not the club it took over.
  // Two plain selections: a selector that builds an object returns a new one on
  // every read, which zustand takes as a change on every render (P8-140's loop).
  const yourClub = useCrestStore(st => st.active?.clubId ?? null)
  const colours = useCrestStore(st => st.active?.choice.colours ?? null)
  const yours = yourClub && colours ? { clubId: yourClub, colours } : null
  const yourKit: Kit | null = yours ? { primary: choiceHex(yours.colours.main), secondary: choiceHex(yours.colours.second) } : null
  useEffect(() => {
    if (!homeId || !awayId) return
    let alive = true
    getClubColours([homeId, awayId])
      .then(m => {
        if (!alive) return
        const kit = (id: string) => (yourKit && yours?.clubId === id ? yourKit : m.get(id))
        setPair(readablePair(kit(homeId), kit(awayId)))
      })
      .catch(e => console.warn('[team colours] load failed:', e))
    return () => { alive = false }
  }, [homeId, awayId, yourKit?.primary, yourKit?.secondary, yours?.clubId])
  return pair
}
