import { t } from '@/i18n'
import { ordinal } from '@/lib/format'

// The verdict's pundits, checked (P8-24, P8-122): one row per club, and what
// they got right and wrong in words.
export type PunditRow = {
  clubId: string; clubName: string; finalPosition: number; predicted: number; isPlayer: boolean
  /** P8-122: the points it finished on, and the points they tipped it for. */
  points?: number; predictedPoints?: number
}

/**
 * The call on one club, now that points are checked too (the maintainer, 26
 * Sept): MEGA SPOT ON when the place AND the points were right; PLACE SPOT ON
 * or POINTS SPOT ON when one was; otherwise how many places they were out.
 * Without points (a run saved before P8-122) a right place is plain SPOT ON.
 */
export function callOf(r: PunditRow): { label: string; spot: 'mega' | 'place' | 'points' | null; off: number } {
  const off = r.predicted - r.finalPosition   // positive = did better than tipped
  const hasPts = r.points != null && r.predictedPoints != null
  const ptsRight = hasPts && r.points === r.predictedPoints
  if (off === 0 && ptsRight) return { label: t('verdict.megaSpotOn'), spot: 'mega', off }
  if (off === 0) return { label: hasPts ? t('verdict.placeSpotOn') : t('verdict.spotOn'), spot: 'place', off }
  if (ptsRight) return { label: t('verdict.pointsSpotOn'), spot: 'points', off }
  return { label: off > 0 ? t('verdict.up', { n: off }) : t('verdict.down', { n: -off }), spot: null, off }
}

// P8-122: what they got right and wrong, in a few lines, not one. The best
// call is the closest (spot on, then nearest on points); the worst the
// furthest out; and how they did on you, which is the call you care about.
export function punditsSummary(rows: PunditRow[]): string[] {
  const off = (r: PunditRow) => Math.abs(r.predicted - r.finalPosition)
  const ptsOff = (r: PunditRow) => r.points != null && r.predictedPoints != null ? Math.abs(r.points - r.predictedPoints) : Infinity
  const byName = (a: PunditRow, b: PunditRow) => a.clubName.localeCompare(b.clubName)
  const best = [...rows].sort((a, b) => off(a) - off(b) || ptsOff(a) - ptsOff(b) || byName(a, b))[0]
  const worst = [...rows].sort((a, b) => off(b) - off(a) || byName(a, b))[0]
  const exact = rows.filter(r => off(r) === 0).length
  const pts = (v?: number) => (v != null ? t('verdict.sumOnPoints', { n: v }) : '')
  const call = (r: PunditRow) => t('verdict.sumCall', { name: r.clubName, tipped: ordinal(r.predicted), tpts: pts(r.predictedPoints), place: ordinal(r.finalPosition), pts: pts(r.points) })
  const you = rows.find(r => r.isPlayer)
  const withPts = rows.some(r => r.points != null && r.predictedPoints != null)
  const ptsExact = rows.filter(r => r.points != null && r.points === r.predictedPoints).length
  const mega = rows.filter(r => callOf(r).spot === 'mega').length
  const lines = [
    withPts
      ? t('verdict.sumWithPts', { exact, count: rows.length, ptsExact, s: ptsExact === 1 ? '' : t('verdict.sumPtsS'), mega: mega ? t('verdict.sumMega', { n: mega }) : '' })
      : t('verdict.sumPlaces', { exact, count: rows.length }),
    t('verdict.sumBest', { call: call(best) }),
    ...(worst !== best ? [t('verdict.sumWorst', { call: call(worst) })] : []),
  ]
  if (you) {
    const d = you.predicted - you.finalPosition
    const how = d > 0 ? t('verdict.sumBetter', { count: d }) : d < 0 ? t('verdict.sumWorse', { count: -d }) : t('verdict.sumExactly')
    lines.push(t('verdict.sumYou', { tipped: ordinal(you.predicted), tpts: pts(you.predictedPoints), place: ordinal(you.finalPosition), pts: pts(you.points), how }))
  }
  return lines
}
