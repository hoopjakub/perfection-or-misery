import { useCallback } from 'react'
import { BackHandler, Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { askAbandon } from '@/components/season/RunChrome'

// Anti-cheese guard (Big Fixes §3). Results are attribute-once and stored the
// moment a match/tie is simulated — the reveal animation is just playback of
// an already-decided outcome. A real exploit found in playtesting: lose a
// match, hit back BEFORE tapping through to the result, land on a screen that
// still lets you tap "simulate" again, and get a fresh (better) roll. `active`
// should be true for the whole decided-but-not-yet-viewed window — in
// practice, everything from the first simulate call in a run through to the
// result screen, not just the literal last tick.
//
// P8-26 (Phase 7): back opens the Abandon screen, and back again on that
// screen abandons (ConfirmRequest.backConfirms). No OS alert on Android and
// no window.alert on web any more; the same route everywhere. Android's back
// is intercepted before it navigates; on web the browser has already moved the
// history entry when `popstate` fires, so the sentinel is re-armed first.
// `useFocusEffect`, not `useEffect`: since §10 the match-stats screen pushes on
// TOP of guarded screens, and a plain effect would leave this listener armed
// underneath — so backing out of match stats would fire the simulation's
// quit-the-run confirm (or, on web, send you straight home) instead of just
// returning. Focus-gating means only the screen you're actually looking at
// guards its back button.
// How long after the guard arms a `popstate` still counts as the return that
// armed it (P8-127). A person can't press back again this fast.
const SETTLE_MS = 400

export function useSimBackGuard(active: boolean) {
  useFocusEffect(useCallback(() => {
    if (!active) return

    const ask = () => askAbandon(() => {})

    if (Platform.OS === 'android') {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => { ask(); return true })
      return () => sub.remove()
    }

    if (Platform.OS === 'web') {
      // A sentinel entry so the next back press fires `popstate` here instead
      // of navigating away. Re-armed on every focus, so returning from the
      // match-stats screen (or choosing "Keep playing") sets the trap again.
      //
      // P8-127: back from a match sheet could open Abandon over and over (on
      // PC). Leaving the match sheet is itself a step back in the history, and
      // its `popstate` can land just AFTER this screen has refocused and
      // re-armed, so it read as the player pressing back; each return armed
      // it again. Three changes:
      // - a `popstate` within SETTLE_MS of arming is that return: re-arm
      //   quietly, don't ask;
      // - the sentinel is pushed only when the current entry isn't one
      //   already (it was pushed on every focus, so they piled up);
      // - it keeps the navigator's own history state (its entry id), so the
      //   step back from the sentinel reads to the navigator as the same
      //   screen, not an unknown entry it has to reconcile by navigating.
      // The dev log says which case each `popstate` was, to confirm the cause.
      const armedAt = Date.now()
      const arm = () => {
        const state = window.history.state as Record<string, unknown> | null
        if (!state?.simGuard) window.history.pushState({ ...(state ?? {}), simGuard: true }, '', window.location.href)
      }
      arm()
      const onPopState = () => {
        const settling = Date.now() - armedAt < SETTLE_MS
        if (__DEV__) console.log(`[back-guard] popstate ${Date.now() - armedAt} ms after arming: ${settling ? 'a return, ignored' : 'a back press'}`)
        arm()
        if (!settling) ask()
      }
      window.addEventListener('popstate', onPopState)
      return () => window.removeEventListener('popstate', onPopState)
    }
  }, [active]))
}
