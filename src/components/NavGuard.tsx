import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Loader } from '@/components/kit'
import { View, StyleSheet, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRootNavigationState } from 'expo-router'
import { isNavBusy, subscribeNavBusy, setNavBusy, pulseActive, workActive } from '@/lib/navGuard'
import { prim } from '@/theme'

// The layer that makes "one tap, one screen" visible (src/lib/navGuard.ts).
// While a navigation is on its way, a transparent layer over the whole app
// takes every tap, so nothing else can be opened on top of it; if the new
// screen takes more than a moment, a small spinner says it's loading. It
// lifts as soon as the navigation state moves, and after MAX_MS whatever
// happens, so a navigation that never lands can't lock the app.
// Shown at once (the maintainer, 24 Sept: a tap gave no feedback beyond a
// darker press): the bar says "it heard you" the moment the tap lands.
const SHOW_SPINNER_MS = 0
const MAX_MS = 2000

export function NavGuard() {
  const busy = useSyncExternalStore(subscribeNavBusy, isNavBusy, isNavBusy)
  // A tap's pulse (src/lib/navGuard.ts): the bar alone, blocking nothing.
  const tapPulse = useSyncExternalStore(subscribeNavBusy, pulseActive, pulseActive)
  // P8.5-45: and work a screen is waiting on (trackWork), likewise blocking nothing.
  const work = useSyncExternalStore(subscribeNavBusy, workActive, workActive)
  const pulse = tapPulse || work
  const nav = useRootNavigationState()
  const [spinner, setSpinner] = useState(false)
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  // The new screen is on the stack: release (after the frame, so the tap that
  // started it can't land on the screen underneath as it leaves).
  useEffect(() => {
    const t = setTimeout(() => setNavBusy(false), 0)
    return () => clearTimeout(t)
  }, [nav])

  useEffect(() => {
    if (!busy) { setSpinner(false); return }
    const show = setTimeout(() => setSpinner(true), SHOW_SPINNER_MS)
    const release = setTimeout(() => setNavBusy(false), MAX_MS)
    return () => { clearTimeout(show); clearTimeout(release) }
  }, [busy])

  if (!busy && !pulse) return null
  if (!busy) return (
    <View style={[styles.bar, { top: insets.top }]} pointerEvents="none">
      <Loader color={prim.orange} width={width} />
    </View>
  )
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto" accessibilityLabel="Opening" accessibilityLiveRegion="polite">
      {spinner && (
        <View style={[styles.bar, { top: insets.top }]}>
          <Loader color={prim.orange} width={width} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0 },
})
