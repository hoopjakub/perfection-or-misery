import { router } from 'expo-router'
import type { PredictionTeam } from '@/engine/predictions'

// P8.5-15: the full path's pundits. The other modes reach the pundits screen
// from the draw, with the field in the store. The full path's field is your
// domestic league, which only exists inside the full path's own screen (its
// refs hold the season), so that screen hands the field over here, pushes the
// pundits on top of itself, and gets the seed back when you press "Prove them
// wrong". Module scope, like the sheet (src/lib/sheet.ts).
// ponytail: a web reload on the pundits screen loses the hand-off; it then
// shows "no draw yet", like a sheet does.
export type PunditField = {
  teams: PredictionTeam[]
  yearStart: number
  /** Called once the lights go on, with the seed the predictions were made from. */
  onStart: (seed: number) => void
}

let pending: PunditField | null = null

export function openPundits(field: PunditField) {
  pending = field
  router.push('/game/pundits?field=1')
}

export function takePundits(): PunditField | null {
  return pending
}
