import { countryName } from '@/data/countries-sk'
import { useUiFrameSampler } from '@/diag/frames'
import { t } from '@/i18n'
import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, LayoutChangeEvent, Platform, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { ROLES, space, border } from '@/theme'
import { KitText, Tag, Icon, TeamMark } from '@/components/kit'
import type { TieVM } from '@/components/season/SeasonParts'
import { orderBracket, type BracketSide, type BracketTie, type BracketColumn } from '@/lib/bracket'
import { useScreenRoles } from '@/lib/appearance'
export type { BracketSide, BracketTie, BracketColumn }

// One knockout, drawn as a real bracket (P8-79): rounds side by side, each tie a
// card, lines joining a tie to the one its winner plays next. Every bracket in
// the app is this component — the preview before the first round
// (BracketPreview), the run hub's Bracket tab, and the knockouts on the cup
// result screens — so a fix here reaches all of them (docs/centralisation
// 03 C-06). A side that isn't known yet is a `?` tag, so the same tree shows a
// draw, a knockout half-played, and a finished one.
//
// Navigation is the preview's pinch-zoom-and-pan canvas, moved here unchanged
// (P8-62, P8-77): opens fit to the panel, pinch or wheel to zoom, drag to pan,
// double tap or Fit to reset.
// P8.5-25: the ground comes from the screen this sits on (useScreenRoles).
const ROW_H = 88       // the vertical slot one tie of the busiest round gets
const CARD_H = 74      // two sides and a note line (AET, pens, the legs)
const COL_W = 176
const GAP = 28         // the connector lane between two rounds
const LABEL_H = 24
const MAX_SCALE = 3
const CANVAS_PAD = 48  // blank margin so panning near an edge doesn't hit a wall

function clampWorklet(value: number, min: number, max: number) {
  'worklet'
  return Math.min(Math.max(value, min), max)
}

/** A knockout round on a result screen: its tie rows, built by `tieVM` from
 *  the engine's one tie model (src/engine/stages.ts). */
export type KoRoundVM = { key: string; label: string; sub?: string; infoTopic?: string; ties: TieVM[] }

/** The cup result screens' knockout rounds as columns. */
export function koRoundsToColumns(rounds: KoRoundVM[]): { columns: BracketColumn[]; third?: BracketColumn } {
  const toTie = (r: KoRoundVM['ties'][number]): BracketTie => {
    const [ga, gb] = (r.score ?? '').split('–').map(x => x.trim())
    return {
      a: { clubId: r.aClubId, name: r.aName, goals: ga || undefined, seed: r.directA },
      b: r.bye ? null : { clubId: r.bClubId, name: r.bName, goals: gb || undefined, seed: r.directB },
      winner: r.winnerIsA ? 'a' : 'b',
      note: r.detail,
      onPress: r.onPress,
    }
  }
  const isThird = (r: KoRoundVM) => /third|3rd/i.test(`${r.key} ${r.label}`)
  const cols = rounds.filter(r => !isThird(r)).map(r => ({ key: r.key, label: r.label, ties: r.ties.map(toTie) }))
  const t = rounds.find(isThird)
  return { columns: cols, third: t ? { key: t.key, label: t.label, ties: t.ties.map(toTie) } : undefined }
}

export function BracketTree({ columns, third, playerClubId, height }: {
  columns: BracketColumn[]
  /** The third-place play-off, drawn under the final (the World Cup has one). */
  third?: BracketColumn
  /** Marks your side's name; a tie you played in gets the heavy border. */
  playerClubId?: string | null
  /** The panel's height; defaults to most of the window, as the preview had. */
  height?: number
}) {
  const roles = useScreenRoles()
  const { height: windowH } = useWindowDimensions()
  const ordered = orderBracket(columns)
  const maxRows = Math.max(1, ...ordered.map(c => c.ties.length))
  const bodyH = Math.max(maxRows * ROW_H, third ? 3 * ROW_H + CARD_H : ROW_H)
  const centre = (n: number, j: number) => (bodyH * (2 * j + 1)) / (2 * n)

  // ── Pinch-zoom-and-pan canvas (moved from BracketPreview) ──────────────────
  const containerSize = useSharedValue({ width: 0, height: 0 })
  const contentSize = useSharedValue({ width: 0, height: 0 })
  const fitScale = useSharedValue(1)
  const minScale = useSharedValue(1)
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)
  // The one-time fit, so a later re-layout doesn't undo a zoom you made.
  const fitAppliedRef = useRef(false)

  function maybeInitFit() {
    if (fitAppliedRef.current) return
    const c = containerSize.value, k = contentSize.value
    if (c.width === 0 || c.height === 0 || k.width === 0 || k.height === 0) return
    const fit = Math.min(c.width / k.width, c.height / k.height, 1)
    fitScale.value = fit
    minScale.value = fit * 0.65
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

  // The pinch anchors where your fingers went down, not the middle.
  const focalX = useSharedValue(0)
  const focalY = useSharedValue(0)
  // Phase 9: frame:bracket is sampled while a finger is down, not while the tree sits still.
  const [touching, setTouching] = useState(false)
  useUiFrameSampler('frame:bracket', touching)
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { runOnJS(setTouching)(true) })
    .onFinalize(() => { runOnJS(setTouching)(false) })
    .onStart(e => { focalX.value = e.focalX; focalY.value = e.focalY })
    .onUpdate(e => {
      const newScale = clampWorklet(savedScale.value * e.scale, minScale.value, MAX_SCALE)
      const k = contentSize.value
      translateX.value = savedTranslateX.value + (focalX.value - k.width / 2) * (savedScale.value - newScale)
      translateY.value = savedTranslateY.value + (focalY.value - k.height / 2) * (savedScale.value - newScale)
      scale.value = newScale
    })
    .onEnd(() => {
      savedScale.value = scale.value
      const c = containerSize.value, k = contentSize.value
      const maxX = Math.max(0, (k.width * scale.value - c.width) / 2)
      const maxY = Math.max(0, (k.height * scale.value - c.height) / 2)
      translateX.value = withTiming(clampWorklet(translateX.value, -maxX, maxX))
      translateY.value = withTiming(clampWorklet(translateY.value, -maxY, maxY))
      savedTranslateX.value = clampWorklet(translateX.value, -maxX, maxX)
      savedTranslateY.value = clampWorklet(translateY.value, -maxY, maxY)
    })
  // P8-77: one finger only, so a pinch owns the position for its whole duration.
  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => { runOnJS(setTouching)(true) })
    .onFinalize(() => { runOnJS(setTouching)(false) })
    .onUpdate(e => {
      const c = containerSize.value, k = contentSize.value
      const maxX = Math.max(0, (k.width * scale.value - c.width) / 2)
      const maxY = Math.max(0, (k.height * scale.value - c.height) / 2)
      translateX.value = clampWorklet(savedTranslateX.value + e.translationX, -maxX, maxX)
      translateY.value = clampWorklet(savedTranslateY.value + e.translationY, -maxY, maxY)
    })
    .onEnd(() => { savedTranslateX.value = translateX.value; savedTranslateY.value = translateY.value })

  function fit() {
    'worklet'
    scale.value = withTiming(fitScale.value)
    savedScale.value = fitScale.value
    translateX.value = withTiming(0)
    translateY.value = withTiming(0)
    savedTranslateX.value = 0
    savedTranslateY.value = 0
  }
  const doubleTapGesture = Gesture.Tap().numberOfTaps(2).onEnd(() => { fit() })
  const composedGesture = Gesture.Race(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture))

  // A mouse can't pinch: the wheel zooms about the middle on the web (P8-77).
  function handleWheelZoom(e: { deltaY?: number; preventDefault?: () => void }) {
    e.preventDefault?.()
    const newScale = clampWorklet(scale.value * Math.exp(-(e.deltaY ?? 0) * 0.001), minScale.value, MAX_SCALE)
    const ratio = newScale / (scale.value || 1)
    scale.value = newScale
    savedScale.value = newScale
    const c = containerSize.value, k = contentSize.value
    const maxX = Math.max(0, (k.width * newScale - c.width) / 2)
    const maxY = Math.max(0, (k.height * newScale - c.height) / 2)
    translateX.value = clampWorklet(translateX.value * ratio, -maxX, maxX)
    translateY.value = clampWorklet(translateY.value * ratio, -maxY, maxY)
    savedTranslateX.value = translateX.value
    savedTranslateY.value = translateY.value
  }
  // React's onWheel is passive, so the page would scroll too; a real
  // non-passive listener on the panel's DOM node stops it.
  const panelRef = useRef<View>(null)
  const wheelRef = useRef(handleWheelZoom)
  wheelRef.current = handleWheelZoom
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = panelRef.current as unknown as HTMLElement | null
    if (!node?.addEventListener) return
    const h = (e: WheelEvent) => { e.preventDefault(); wheelRef.current(e) }
    node.addEventListener('wheel', h, { passive: false })
    return () => node.removeEventListener('wheel', h)
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }))

  return (
    <View style={styles.wrap}>
      <View style={styles.hintRow}>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>
          {Platform.OS === 'web' ? t('parts.scrollZoom') : t('parts.pinchZoom')}
        </KitText>
        <Pressable onPress={() => fit()} accessibilityRole="button" accessibilityLabel={t('parts.fitA11y')}
          style={({ pressed }) => [styles.fitBtn, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
          <Icon name="retry" size={16} color={roles.text} />
          <KitText t="tag" color={roles.text}>{t('parts.fit')}</KitText>
        </Pressable>
      </View>
      <View ref={panelRef} onLayout={onPanelLayout}
        style={[styles.panel, { borderColor: roles.rule, backgroundColor: roles.sunken, height: height ?? Math.max(340, windowH * 0.55) }]}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.row, animatedStyle]} onLayout={onContentLayout}>
            {ordered.map((col, i) => {
              const next = ordered[i + 1]
              const isLast = i === ordered.length - 1
              return (
                <React.Fragment key={col.key}>
                  <View style={{ width: COL_W }}>
                    <KitText t="tag" color={roles.textMuted} style={styles.colLabel} numberOfLines={1}>{col.label}</KitText>
                    <View style={{ height: bodyH }}>
                      {col.ties.map((t, j) => (
                        <TieCard key={j} tie={t} playerClubId={playerClubId} top={centre(col.ties.length, j) - CARD_H / 2} />
                      ))}
                      {/* The third-place play-off hangs under the final, labelled. */}
                      {isLast && third?.ties[0] ? (
                        <>
                          <KitText t="tag" color={roles.textMuted} style={[styles.thirdLabel, { top: bodyH / 2 + CARD_H / 2 + space[4] }]}>{third.label}</KitText>
                          <TieCard tie={third.ties[0]} playerClubId={playerClubId} top={bodyH / 2 + CARD_H / 2 + space[4] + LABEL_H} />
                        </>
                      ) : null}
                    </View>
                  </View>
                  {next ? <Connectors from={col.ties.length} to={next.ties.length} centre={centre} bodyH={bodyH} /> : null}
                </React.Fragment>
              )
            })}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  )
}

// The lines between two rounds. Two ties feeding one (a halving round) get a
// bracket: out from each, joined, into the next. Rounds of the same size (the
// Champions League play-off feeding the round of 16, where a seed waits) get a
// straight line each. Anything else gets no lines rather than wrong ones.
function Connectors({ from, to, centre, bodyH }: { from: number; to: number; centre: (n: number, j: number) => number; bodyH: number }) {
  const roles = useScreenRoles()
  const line = roles.rule
  const half = GAP / 2
  const segs: React.ReactNode[] = []
  if (from === to * 2) {
    for (let k = 0; k < to; k++) {
      const y1 = centre(from, 2 * k), y2 = centre(from, 2 * k + 1), yt = centre(to, k)
      segs.push(
        <View key={`a${k}`} style={[styles.h, { top: y1, left: 0, width: half, backgroundColor: line }]} />,
        <View key={`b${k}`} style={[styles.h, { top: y2, left: 0, width: half, backgroundColor: line }]} />,
        <View key={`v${k}`} style={[styles.v, { top: y1, height: y2 - y1, left: half, backgroundColor: line }]} />,
        <View key={`c${k}`} style={[styles.h, { top: yt, left: half, width: half, backgroundColor: line }]} />,
      )
    }
  } else if (from === to) {
    for (let k = 0; k < to; k++) segs.push(<View key={k} style={[styles.h, { top: centre(from, k), left: 0, width: GAP, backgroundColor: line }]} />)
  }
  return (
    <View style={{ width: GAP }}>
      <View style={{ height: LABEL_H }} />
      <View style={{ height: bodyH }}>{segs}</View>
    </View>
  )
}

function TieCard({ tie, playerClubId, top }: { tie: BracketTie; playerClubId?: string | null; top: number }) {
  const roles = useScreenRoles()
  const mine = !!playerClubId && (tie.a?.clubId === playerClubId || tie.b?.clubId === playerClubId)
  const label = tie.a && tie.b
    ? `${countryName(tie.a.name)} ${tie.a.goals ?? ''}, ${countryName(tie.b.name)} ${tie.b.goals ?? ''}${tie.winner ? t('parts.through', { name: countryName((tie.winner === 'a' ? tie.a : tie.b).name) }) : ''}`
    : t('parts.notDrawn')
  return (
    <Pressable onPress={tie.onPress} disabled={!tie.onPress} accessibilityRole={tie.onPress ? 'button' : undefined} accessibilityLabel={label}
      style={({ pressed }) => [
        styles.card,
        { top, borderColor: mine ? roles.line : roles.rule, backgroundColor: roles.surface },
        mine && { borderWidth: border.plate },
        pressed && { backgroundColor: roles.sunken },
      ]}>
      <SideRow side={tie.a} won={tie.winner === 'a'} decided={!!tie.winner} you={!!playerClubId && tie.a?.clubId === playerClubId} />
      <View style={[styles.divider, { backgroundColor: roles.rule }]} />
      <SideRow side={tie.b} won={tie.winner === 'b'} decided={!!tie.winner} you={!!playerClubId && tie.b?.clubId === playerClubId} />
      {tie.note ? <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{tie.note}</KitText> : null}
    </Pressable>
  )
}

function SideRow({ side, won, decided, you }: { side: BracketSide | null; won: boolean; decided: boolean; you: boolean }) {
  const roles = useScreenRoles()
  if (!side) return <View style={styles.side}><Tag roles={roles} variant="hidden">?</Tag></View>
  // The loser fades once the tie is decided, so the path through reads at a glance.
  const colour = decided && !won ? roles.textMuted : roles.text
  return (
    <View style={styles.side}>
      <TeamMark roles={roles} clubId={side.clubId} name={side.name} size={16} />
      <KitText t={you || (decided && won) ? 'title' : 'body'} color={colour} numberOfLines={1} style={{ flex: 1 }}>{countryName(side.name)}</KitText>
      {side.seed ? <KitText t="tag" color={roles.textMuted}>{t('parts.seed')}</KitText> : null}
      {side.goals != null ? <KitText t="figure" color={colour}>{side.goals}</KitText> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  fitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: space[3], borderWidth: border.thin },
  panel: { borderWidth: border.thin, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', padding: CANVAS_PAD },
  colLabel: { height: LABEL_H, textAlign: 'center' },
  thirdLabel: { position: 'absolute', left: 0, right: 0, textAlign: 'center' },
  card: { position: 'absolute', left: 0, right: 0, height: CARD_H, borderWidth: border.thin, paddingHorizontal: space[2], justifyContent: 'center', gap: 3 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
  divider: { height: StyleSheet.hairlineWidth },
  h: { position: 'absolute', height: border.thin },
  v: { position: 'absolute', width: border.thin },
})
