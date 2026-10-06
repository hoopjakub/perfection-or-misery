import { useCrestStore } from '@/store/crestStore'
import { router } from 'expo-router'

// Leaving a result screen ("Play Again" / "Return to Home") must NOT leave the
// deep game stack intact underneath it. The flow pushes
//   mode-select → formation-select → draft → placement → simulation → result
// so a plain router.replace on the result screen only swaps the TOP entry and
// leaves every earlier screen sitting in the stack. Two bugs fall out of that:
//   1. "Back" from the new mode-select lands on the stale simulation screen,
//      whose store was just reset by resetRun() → "game not found".
//   2. Re-walking the flow pushes duplicate routes into a Stack that already
//      contains them, and the router resolves the duplicates to the wrong
//      (empty) instance → "not found" for any mode you pick next.
// dismissAll() pops the whole game stack back to its anchor first, so we always
// restart from a clean single-screen stack. canDismiss() guards the case where
// result is itself the anchor (e.g. the quick-sim tester pushes it directly).

// P8-132: leaving a run takes your crest off the side it was on; the next
// draw puts it on the new one.
const clearRunCrest = () => useCrestStore.getState().setActive(null)

export function restartToModeSelect() {
  clearRunCrest()
  if (router.canDismiss()) router.dismissAll()
  router.replace('/game/mode-select')
}

// Where a saved run is rebuilt. One result route for every mode since Wave F
// (step 6); the route picks the family from the run's own mode.
export function runRoute(_mode?: string): '/game/result' {
  return '/game/result'
}

export function exitToHome() {
  clearRunCrest()
  if (router.canDismiss()) router.dismissAll()
  router.replace('/(tabs)')
}
