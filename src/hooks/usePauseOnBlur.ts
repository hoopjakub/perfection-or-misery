import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'

// P8-32: a live season stops when anything opens on top of it — a match sheet,
// a story, a club page — and stays stopped when you come back, so you decide
// when it starts again. Matchdays used to keep landing underneath while you
// read. A screen losing focus runs this effect's cleanup, which is the one
// place every route on top passes through, so no "open" call has to remember
// to pause first.
export function usePauseOnBlur(setIsPlaying: (on: boolean) => void) {
  useFocusEffect(useCallback(() => () => setIsPlaying(false), [setIsPlaying]))
}
