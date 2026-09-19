import React, { useRef } from 'react'
import { View, StyleSheet, Pressable, LayoutChangeEvent, Platform } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { ROLES, space, border } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'
import { KitText, Plate, Tag, RoundFlag, Icon } from '@/components/kit'

// Kit Drop (docs/ui-overhaul/07c C5): square ties on nylon, your tie tagged,
// unknown slots as ? tags, and a visible fit control beside the gesture hint.
const roles = ROLES.nylon

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
  firstLabel, firstTies, road, onStart, title = 'The bracket', startLabel,
}: {
  firstLabel: string
  firstTies: PreviewTie[]
  road: RoadRound[]   // rounds AFTER the first, in order, each with its real tie count
  accent?: string   // no longer drawn; kept so callers needn't change
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

  // The same reset as the double tap, as a control you can see.
  function fit() {
    scale.value = withTiming(fitScale.value)
    savedScale.value = fitScale.value
    translateX.value = withTiming(0)
    translateY.value = withTiming(0)
    savedTranslateX.value = 0
    savedTranslateY.value = 0
  }

  return (
    <View style={[styles.container, { backgroundColor: roles.bg }]}>
      <KitText t="superM" color={roles.text} accessibilityRole="header">{`"${title.toUpperCase()}"`}</KitText>

      {opponent && (
        <View style={[styles.yourTieCard, { borderColor: roles.line, backgroundColor: roles.surface }]}>
          <KitText t="tag" color={roles.textMuted}>{`Your ${firstLabel}`}</KitText>
          <View style={styles.yourTieRow}>
            <Tag roles={roles} variant="you">YOU</Tag>
            <KitText t="tag" color={roles.textMuted}>V</KitText>
            {flagForCountry(opponent.clubName) ? <RoundFlag emoji={flagForCountry(opponent.clubName)} code={opponent.clubName.slice(0, 3)} size={20} roles={roles} /> : null}
            <KitText t="title" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{opponent.clubName}</KitText>
          </View>
        </View>
      )}

      {road.length > 0 && (
        <KitText t="body" color={roles.textMuted}>{`Win ${road.length + 1} ties and you're champions.`}</KitText>
      )}

      <View style={styles.hintRow}>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>
          {Platform.OS === 'web' ? 'Scroll to zoom · drag to pan' : 'Pinch to zoom · drag to pan'}
        </KitText>
        <Pressable onPress={fit} accessibilityRole="button" accessibilityLabel="Fit the bracket to the screen"
          style={({ pressed }) => [styles.fitBtn, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
          <Icon name="retry" size={16} color={roles.text} />
          <KitText t="tag" color={roles.text}>Fit</KitText>
        </Pressable>
      </View>

      {/* The bracket tree — a pinch-zoom-and-pan canvas, boxed off from the rest
          of the screen so only this area responds to the gesture. */}
      <View
        style={[styles.bracketPanel, { borderColor: roles.rule, backgroundColor: roles.sunken }]}
        onLayout={onPanelLayout}
        {...(Platform.OS === 'web' ? { onWheel: handleWheelZoom } : {})}
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.bracketRow, animatedStyle]} onLayout={onContentLayout}>
            {columns.map(col => (
              <View key={col.key} style={styles.bracketCol}>
                <KitText t="tag" color={roles.textMuted} style={styles.bracketColLabel}>{col.label}</KitText>
                <View style={[styles.bracketColBody, { height: colHeight }]}>
                  {col.ties
                    ? col.ties.map((t, i) => {
                        const isPM = t.teamA.isPlayer || t.teamB.isPlayer
                        return (
                          <View key={i} style={[styles.bracketCard, { borderColor: isPM ? roles.line : roles.rule, backgroundColor: roles.surface }, isPM && { borderWidth: border.plate }]}>
                            <TieTeamRow team={t.teamA} />
                            <View style={[styles.bracketDivider, { backgroundColor: roles.rule }]} />
                            <TieTeamRow team={t.teamB} />
                          </View>
                        )
                      })
                    : Array.from({ length: col.count }).map((_, i) => (
                        <View key={i} style={[styles.bracketCard, { borderColor: roles.rule }]}>
                          <Tag roles={roles} variant="hidden">?</Tag>
                          <View style={[styles.bracketDivider, { backgroundColor: roles.rule }]} />
                          <Tag roles={roles} variant="hidden">?</Tag>
                        </View>
                      ))}
                </View>
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>

      <Plate label={startLabel ?? (opponent ? `Watch your ${firstLabel.toLowerCase()} tie` : 'Watch it play out')}
        icon="play" roles={roles} onPress={onStart} />
    </View>
  )
}

function TieTeamRow({ team }: { team: TieTeam }) {
  const flag = flagForCountry(team.clubName)
  return (
    <View style={styles.bracketTeamRow}>
      {flag ? <RoundFlag emoji={flag} code={team.clubName.slice(0, 3)} size={16} roles={roles} /> : null}
      <KitText t="body" color={team.isPlayer ? roles.text : roles.textMuted} numberOfLines={1} style={{ flex: 1 }}>
        {team.clubName}
      </KitText>
      {team.isPlayer && <Tag roles={roles} variant="you">YOU</Tag>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space[4], gap: space[3] },
  yourTieCard: { borderWidth: border.plate, padding: space[3], gap: 4 },
  yourTieRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  fitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: space[3], borderWidth: border.thin },

  bracketPanel: {
    flex: 1,
    borderWidth: border.thin,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bracketRow: { flexDirection: 'row', gap: space[3], padding: CANVAS_PAD },
  bracketCol: { width: 170 },
  bracketColLabel: { textAlign: 'center', marginBottom: space[1] },
  bracketColBody: { justifyContent: 'space-around' },
  bracketCard: { borderWidth: border.thin, paddingVertical: 6, paddingHorizontal: space[2], gap: 4 },
  bracketTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bracketDivider: { height: StyleSheet.hairlineWidth },
})
