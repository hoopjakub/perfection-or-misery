import { Tier } from '@/types/simulation'

export function assignTier(
  position: number,
  total: number,
  unbeaten: boolean,
  perfectSeason: boolean
): Tier {
  const isFirst   = position === 1
  const isTop4    = position <= 4
  const isTop3    = position <= 3
  const isTopHalf = position <= Math.floor(total / 2)
  const isBot3    = position > total - 3

  if (isFirst && perfectSeason) return 'perfection'
  if (isFirst && unbeaten)      return 'almost_perfection'
  if (isFirst)                  return 'champions'
  if (isTop3)                   return 'title_contender'
  if (isTop4)                   return 'champions_league'
  if (position <= 7)            return 'europa_glory'
  if (isTopHalf)                return 'almost_matters'
  if (!isBot3)                  return 'respectful_mediocrity'
  return 'absolute_misery'
}