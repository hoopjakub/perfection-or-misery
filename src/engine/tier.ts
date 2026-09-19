import { Tier } from '@/types/simulation'
import type { ZoneKey } from '@/data/qualification-bands'

// The European and relegation rungs read the zone the place finished in
// (src/data/qualification-bands.ts), so the verdict can't disagree with the
// tape your row ended on. Without a zone (old callers, custom tables) the old
// fixed cut-offs apply: top 4, top 7, bottom 3.
export function assignTier(
  position: number,
  total: number,
  unbeaten: boolean,
  perfectSeason: boolean,
  zone?: ZoneKey | null,
): Tier {
  const isFirst   = position === 1
  const isTop3    = position <= 3
  const isTopHalf = position <= Math.floor(total / 2)
  const inUcl     = zone !== undefined ? zone === 'ucl' : position <= 4
  const inEurope  = zone !== undefined ? zone === 'uel' || zone === 'uecl' : position <= 7
  const goingDown = zone !== undefined ? zone === 'down' || zone === 'playoff' : position > total - 3

  if (isFirst && perfectSeason) return 'perfection'
  if (isFirst && unbeaten)      return 'almost_perfection'
  if (isFirst)                  return 'champions'
  if (isTop3)                   return 'title_contender'
  if (inUcl)                    return 'champions_league'
  if (inEurope)                 return 'europa_glory'
  if (goingDown)                return 'absolute_misery'
  if (isTopHalf)                return 'almost_matters'
  return 'respectful_mediocrity'
}
