import { create } from 'zustand'
import { readDesign, readColours, type CrestChoice } from '@/lib/yourCrest'

// P8-132: whose crest is on your side right now. `mine` is the account's
// choice (loaded with the profile); `active` is the side it's on in the run
// being shown: the club id your side took over, and the crest to draw in its
// place. The kit's Crest and TeamMark read `active`, so every place a club's
// mark is drawn swaps it without being told.
//
// Set when a run is drawn (the league modes always; the Champions League and
// the World Cup only with `everywhere`), and from a saved run's own crest when
// one is opened; cleared when you leave for a new run.
type CrestState = {
  mine: CrestChoice | null
  active: { clubId: string; choice: CrestChoice } | null
  setMine: (c: CrestChoice | null) => void
  setActive: (a: { clubId: string; choice: CrestChoice } | null) => void
}

export const useCrestStore = create<CrestState>(set => ({
  mine: null,
  active: null,
  setMine: mine => set({ mine }),
  setActive: active => set({ active }),
}))

/** At the draw: put your crest on your side, if you have one and this mode takes it. */
export function activateCrestFor(clubId: string | null | undefined, mode: string | null | undefined): void {
  const { mine, setActive } = useCrestStore.getState()
  const leagueMode = mode === 'league' || mode === 'all_time' || mode === 'chaos' || mode === 'cursed'
  if (!clubId || !mine || (!mine.design && !mine.imagePath && !mine.colours) || (!leagueMode && !mine.everywhere)) { setActive(null); return }
  setActive({ clubId, choice: mine })
}

/** A saved run: the crest it was played with (runs.highlights.crest), or none.
 *  It's another player's row, so it's read as carefully as your own: a design
 *  through readDesign, and a picture only as a crest file in a user's folder. */
export function adoptRunCrest(highlights: { crest?: unknown } | null | undefined): void {
  const raw = highlights?.crest as { clubId?: unknown; choice?: { design?: unknown; imagePath?: unknown; everywhere?: unknown } } | null | undefined
  const clubId = typeof raw?.clubId === 'string' ? raw.clubId : null
  const design = readDesign(raw?.choice?.design)
  const path = raw?.choice?.imagePath
  const imagePath = typeof path === 'string' && /^[0-9a-f-]{36}\/crest-\d+\.jpg$/i.test(path) ? path : null
  const colours = readColours((raw?.choice as { colours?: unknown } | undefined)?.colours)
  useCrestStore.getState().setActive(clubId && (design || imagePath || colours) ? { clubId, choice: { design, imagePath, everywhere: !!raw?.choice?.everywhere, colours } } : null)
}
