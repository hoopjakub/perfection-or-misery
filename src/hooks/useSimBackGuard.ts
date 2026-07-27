import { useCallback } from 'react'
import { BackHandler, Platform, Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { exitToHome } from '@/lib/nav'

// Anti-cheese guard (Big Fixes §3). Results are attribute-once and stored the
// moment a match/tie is simulated — the reveal animation is just playback of
// an already-decided outcome. A real exploit found in playtesting: lose a
// match, hit back BEFORE tapping through to the result, land on a screen that
// still lets you tap "simulate" again, and get a fresh (better) roll. `active`
// should be true for the whole decided-but-not-yet-viewed window — in
// practice, everything from the first simulate call in a run through to the
// result screen, not just the literal last tick.
//
// Android: OS back is interceptable — show a real confirm (Cancel stays,
// Quit exits the run for good). Web: browser back has already moved the
// history entry by the time `popstate` fires, so there's no clean "stay"
// option — re-arm the trap and punish it by sending the player all the way
// home, with a warning explaining why (maintainer decision: harsher than
// Android's cancel/quit choice, since a soft "are you sure" is trivially
// re-triggerable by pressing back again).
// `useFocusEffect`, not `useEffect`: since §10 the match-stats screen pushes on
// TOP of guarded screens, and a plain effect would leave this listener armed
// underneath — so backing out of match stats would fire the simulation's
// quit-the-run confirm (or, on web, send you straight home) instead of just
// returning. Focus-gating means only the screen you're actually looking at
// guards its back button.
export function useSimBackGuard(active: boolean) {
  useFocusEffect(useCallback(() => {
    if (!active) return

    function quit() {
      useGameStore.getState().resetRun()
      exitToHome()
    }

    if (Platform.OS === 'android') {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert(
          'Quit this run?',
          "You can't re-simulate — the result is final.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Quit', style: 'destructive', onPress: quit },
          ],
        )
        return true   // swallow the default back — it would rewind the sim
      })
      return () => sub.remove()
    }

    if (Platform.OS === 'web') {
      // Push a sentinel entry so the next back press fires `popstate` here
      // instead of actually navigating away. Re-armed on every focus, so
      // returning from the match-stats screen leaves the trap set again.
      window.history.pushState(null, '', window.location.href)
      const onPopState = () => {
        window.history.pushState(null, '', window.location.href)
        window.alert("Back is disabled during a simulation — you can't rewind to re-roll a result. Taking you home.")
        quit()
      }
      window.addEventListener('popstate', onPopState)
      return () => window.removeEventListener('popstate', onPopState)
    }
  }, [active]))
}
