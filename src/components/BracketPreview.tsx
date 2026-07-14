import React, { useRef } from 'react'
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent, Platform } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { colors, spacing, typography, radius } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'

// A pre-knockout overview rendered as a real bracket TREE (column-per-round,
// styled like the result screen's bracket) so you can see the whole draw before
// a ball is kicked. The first column holds the actual first-round ties (your tie
// highlighted); later columns are the empty rounds ahead — placeholders sized
// to the REAL round (e.g. a playoff round feeding a same-size Round of 16
// alongside direct qualifiers), not a naive "half the ties every round" guess.
//
// Navigation is pinch-zoom-and-pan (like a map / ESPN's bracket viewer) rather
// than nested scroll axes. Opens fit-to-screen (the whole tree visible at
// once); pinch in to read a section, drag to pan while zoomed, double-tap to
// snap back to fit. You can also pinch OUT a bit past "fits exactly" for
// breathing room, and there's generous blank padding around the tree itself
// so panning near an edge doesn't feel like hitting a wall.
type TieTeam = { clubId: string; clubName: string; isPlayer: boolean }
export type PreviewTie = { teamA: TieTeam; teamB: TieTeam }
export type RoadRound = { label: string; count: number }   // a round AFTER the first, with its REAL tie count

const ROW_H = 72
const MAX_SCALE = 3
const CANVAS_PAD = 56   // blank margin around the tree so edge-panning has room to breathe

function clampWorklet(value: number, min: number, max: number) {
  'worklet'
  return Math.min(Math.max(value, min), max)
}

export function BracketPreview({
  firstLabel, firstTies, road, accent, onStart, title = 'The Knockout Bracket', startLabel = 'PLAY IT OUT →',
}: {
  firstLabel: string
  firstTies: PreviewTie[]
  road: RoadRound[]   // rounds AFTER the first, in order, each with its real tie count
  accent: string
  onStart: () => void
  title?: string
  startLabel?: string
}) {
  const playerTie = firstTies.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
  const opponent = playerTie ? (playerTie.teamA.isPlayer ? playerTie.teamB : playerTie.teamA) : null

  // Column model: first round (real ties) + one placeholder column per road
  // round, sized to that round's ACTUAL tie count (not halved from the last).
  const columns: { key: string; label: string; count: number; ties?: PreviewTie[] }[] = [
    { key: 'first', label: firstLabel, count: firstTies.length, ties: firstTies },
    ...road.map((r, i) => ({ key: `r${i}`, label: r.label, count: Math.max(1, r.count) })),
  ]

  const maxRows = Math.max(...columns.map(c => c.count), 1)
  const colHeight = maxRows * ROW_H

  // ── Pinch-zoom-and-pan canvas ──────────────────────────────────────────────
  const containerSize = useSharedValue({ width: 0, height: 0 })
  const contentSize = useSharedValue({ width: 0, height: 0 })
  const fitScale = useSharedValue(1)     // the "opens at" / double-tap-reset view — whole tree visible
  const minScale = useSharedValue(1)     // pinch floor — a bit BELOW fit, for breathing room
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)
  // Guards the ONE-TIME auto-fit so a later re-layout (rotation, etc.) doesn't
  // clobber a zoom/pan the user already did. Content is always visible — worst
  // case before both measurements land is a brief natural-size render, never a
  // permanently-blank canvas.
  const fitAppliedRef = useRef(false)

  function maybeInitFit() {
    if (fitAppliedRef.current) return
    const c = containerSize.value
    const k = contentSize.value
    if (c.width === 0 || c.height === 0 || k.width === 0 || k.height === 0) return
    const fit = Math.min(c.width / k.width, c.height / k.height, 1)
    fitScale.value = fit
    minScale.value = fit * 0.65   // let users pinch out a little further than "exact fit"
    scale.value = withTiming(fit, { duration: 250 })
    savedScale.value = fit
    fitAppliedRef.current = true
  }

  function onPanelLayout(e: LayoutChangeEvent) {
    containerSize.value = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }
    maybeInitFit()
  }
  function onContentLayout(e: LayoutChangeEvent) {
    contentSize.value = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }
    maybeInitFit()
  }

  // Where the pinch is actually centered, in the content's own untransformed
  // coordinates (native touch dispatch reports this pre-transform, which is
  // exactly what we need). Captured once at gesture start so the zoom anchors
  // to wherever you put your fingers down, not the content's center — without
  // this every pinch scales symmetrically about the middle regardless of where
  // you touch, which reads as "zooming in on the left also zooms the right".
  const focalX = useSharedValue(0)
  const focalY = useSharedValue(0)

  const pinchGesture = Gesture.Pinch()
    .onStart(e => {
      focalX.value = e.focalX
      focalY.value = e.focalY
    })
    .onUpdate(e => {
      const newScale = clampWorklet(savedScale.value * e.scale, minScale.value, MAX_SCALE)
      const k = contentSize.value
      const dx = focalX.value - k.width / 2
      const dy = focalY.value - k.height / 2
      translateX.value = savedTranslateX.value + dx * (savedScale.value - newScale)
      translateY.value = savedTranslateY.value + dy * (savedScale.value - newScale)
      scale.value = newScale
    })
    .onEnd(() => {
      savedScale.value = scale.value
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
      const c = containerSize.value, k = contentSize.value
      const maxX = Math.max(0, (k.width * scale.value - c.width) / 2)
      const maxY = Math.max(0, (k.height * scale.value - c.height) / 2)
      translateX.value = withTiming(clampWorklet(translateX.value, -maxX, maxX))
      translateY.value = withTiming(clampWorklet(translateY.value, -maxY, maxY))
      savedTranslateX.value = clampWorklet(savedTranslateX.value, -maxX, maxX)
      savedTranslateY.value = clampWorklet(savedTranslateY.value, -maxY, maxY)
    })

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      const c = containerSize.value, k = contentSize.value
      const maxX = Math.max(0, (k.width * scale.value - c.width) / 2)
      const maxY = Math.max(0, (k.height * scale.value - c.height) / 2)
      translateX.value = clampWorklet(savedTranslateX.value + e.translationX, -maxX, maxX)
      translateY.value = clampWorklet(savedTranslateY.value + e.translationY, -maxY, maxY)
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(fitScale.value)
      savedScale.value = fitScale.value
      translateX.value = withTiming(0)
      translateY.value = withTiming(0)
      savedTranslateX.value = 0
      savedTranslateY.value = 0
    })

  const composedGesture = Gesture.Race(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture))

  // Pinch is a two-finger touch gesture — a mouse/trackpad on desktop can't
  // produce one, so without this, zoom simply never triggers on PC. Scroll
  // wheel / trackpad-scroll zoom toward the center (simpler than the pinch's
  // cursor-anchored math, but the actual complaint — "zoom doesn't work on
  // PC at all" — is fully fixed by it). Dragging to pan already works with a
  // mouse; Pan gesture handles that natively.
  function handleWheelZoom(e: any) {
    e.preventDefault?.()
    const delta = e.deltaY ?? 0
    const factor = Math.exp(-delta * 0.001)
    const newScale = clampWorklet(scale.value * factor, minScale.value, MAX_SCALE)
    scale.value = newScale
    savedScale.value = newScale
    const c = containerSize.value, k = contentSize.value
    const maxX = Math.max(0, (k.width * newScale - c.width) / 2)
    const maxY = Math.max(0, (k.height * newScale - c.height) / 2)
    translateX.value = clampWorklet(translateX.value, -maxX, maxX)
    translateY.value = clampWorklet(translateY.value, -maxY, maxY)
    savedTranslateX.value = translateX.value
    savedTranslateY.value = translateY.value
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <View style={styles.container}>
      {/* Fixed header — title, your-tie summary, road note. Does NOT scroll. */}
      <Text style={[styles.title, { color: accent }]}>{title}</Text>

      {opponent && (
        <View style={[styles.yourTieCard, { borderColor: accent }]}>
          <Text style={styles.yourTieLabel}>YOUR {firstLabel.toUpperCase()} TIE</Text>
          <View style={styles.yourTieRow}>
            <Text style={[styles.yourSide, { color: accent }]} numberOfLines={1}>You</Text>
            <Text style={styles.vs}>vs</Text>
            <View style={styles.yourOppSide}>
              {flagForCountry(opponent.clubName) ? <Text style={styles.yourFlag}>{flagForCountry(opponent.clubName)}</Text> : null}
              <Text style={[styles.yourSide, { textAlign: 'right' }]} numberOfLines={1}>{opponent.clubName}</Text>
            </View>
          </View>
        </View>
      )}

      {road.length > 0 && (
        <Text style={styles.roadNote}>Win {road.length + 1} ties and you're champions.</Text>
      )}

      <Text style={styles.gestureHint}>
        {Platform.OS === 'web' ? 'Scroll to zoom · drag to pan · double-click to reset' : 'Pinch to zoom · drag to pan · double-tap to reset'}
      </Text>

      {/* The bracket tree — a pinch-zoom-and-pan canvas, boxed off from the rest
          of the screen so only this area responds to the gesture. */}
      <View
        style={styles.bracketPanel}
        onLayout={onPanelLayout}
        {...(Platform.OS === 'web' ? { onWheel: handleWheelZoom } : {})}
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.bracketRow, animatedStyle]} onLayout={onContentLayout}>
            {columns.map(col => (
              <View key={col.key} style={styles.bracketCol}>
                <Text style={styles.bracketColLabel}>{col.label}</Text>
                <View style={[styles.bracketColBody, { height: colHeight }]}>
                  {col.ties
                    ? col.ties.map((t, i) => {
                        const isPM = t.teamA.isPlayer || t.teamB.isPlayer
                        return (
                          <View key={i} style={[styles.bracketCard, isPM && { borderColor: accent, backgroundColor: accent + '14' }]}>
                            <TieTeamRow team={t.teamA} accent={accent} />
                            <View style={styles.bracketDivider} />
                            <TieTeamRow team={t.teamB} accent={accent} />
                          </View>
                        )
                      })
                    : Array.from({ length: col.count }).map((_, i) => (
                        <View key={i} style={[styles.bracketCard, styles.bracketCardEmpty]}>
                          <Text style={styles.placeholder}>?</Text>
                          <View style={styles.bracketDivider} />
                          <Text style={styles.placeholder}>?</Text>
                        </View>
                      ))}
                </View>
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>

      <Pressable style={[styles.startBtn, { backgroundColor: accent }]} onPress={onStart}>
        <Text style={styles.startBtnText}>{startLabel}</Text>
      </Pressable>
    </View>
  )
}

function TieTeamRow({ team, accent }: { team: TieTeam; accent: string }) {
  const flag = flagForCountry(team.clubName)
  return (
    <View style={styles.bracketTeamRow}>
      {flag ? <Text style={styles.teamFlag}>{flag}</Text> : null}
      <Text
        style={[styles.bracketTeamName, team.isPlayer && { color: accent, fontWeight: typography.black }]}
        numberOfLines={1}
      >
        {team.clubName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: typography.xl, fontWeight: typography.black, textAlign: 'center' },
  yourTieCard: { borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  yourTieLabel: { fontSize: 9, fontWeight: typography.black, color: colors.textMuted, letterSpacing: 1, textAlign: 'center' },
  yourTieRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  yourSide: { flex: 1, fontSize: 16, fontWeight: typography.bold, color: colors.textPrimary },
  yourOppSide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  yourFlag: { fontSize: 18 },
  vs: { fontSize: typography.sm, color: colors.textMuted, fontWeight: typography.bold },
  roadNote: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center' },
  gestureHint: { fontSize: 10, color: colors.textMuted, textAlign: 'center', marginTop: -spacing.xs },

  bracketPanel: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bracketRow: { flexDirection: 'row', gap: spacing.md, padding: CANVAS_PAD },
  bracketCol: { width: 160 },
  bracketColLabel: { fontSize: typography.xs, fontWeight: typography.black, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: spacing.xs },
  bracketColBody: { justifyContent: 'space-around' },
  bracketCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: spacing.sm, gap: 4 },
  bracketCardEmpty: { borderStyle: 'dashed', opacity: 0.55 },
  bracketTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamFlag: { fontSize: 13 },
  bracketTeamName: { flex: 1, fontSize: 11, color: colors.textSecondary },
  bracketDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  placeholder: { fontSize: 11, color: colors.textMuted, fontWeight: typography.bold },

  startBtn: { borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center' },
  startBtnText: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 1.5 },
})
