// Match Momentum graph (Big Fixes §8) — the one renderer shared by the live
// Deep Match (§7) and the static Match Stats screen (§10).
//
// Shape of the thing: a signed area around a centreline — home above in one
// accent, away below in the other — with event markers in their own rows
// OUTSIDE the plot (so they never drown the curve), dotted dividers at the
// half-time (and full-time, for AET) breaks, and a ticked minute axis.
//
// The data model is honestly per-minute (`series[i]` = minute i+1, −100…100,
// generated in src/engine/match-detail.ts); the *rendering* smooths those
// points into a rounded filled area, which is the "hybrid" the spec locked in:
// real data, broadcast-quality curve. No bars-only fallback.
//
// Colour-blind safety: hue is never the only signal — which side of the
// centreline the fill sits on already encodes the team, and markers sit in a
// top row (home) or bottom row (away) to match.

import React, { useId, useMemo, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Rect, Circle, Line, G, Defs, ClipPath } from 'react-native-svg'
import { colors, spacing, typography, radius, prim, font } from '@/theme'
import type { MatchEvent } from '@/types/match-stats'

export type MomentumMarker = {
  minute: number
  isHome: boolean            // which row it sits in (top = home, bottom = away)
  kind: 'goal' | 'ownGoal' | 'red'
}

/** Pull the markers the spec calls for — goals, own goals, red cards — off a
 *  match's event list, so callers never hand-build a parallel array. */
export function momentumMarkers(events: MatchEvent[]): MomentumMarker[] {
  const out: MomentumMarker[] = []
  for (const e of events) {
    if (e.type === 'goal') out.push({ minute: e.minute, isHome: e.isHome, kind: e.ownGoal ? 'ownGoal' : 'goal' })
    else if (e.type === 'red') out.push({ minute: e.minute, isHome: e.isHome, kind: 'red' })
  }
  return out
}

const PLOT_H     = 104   // the signed area band
const MARKER_H   = 18    // one marker row, above and below the band
const FALLBACK_W = 320   // used for the first frame, before onLayout reports

// Catmull-Rom → cubic Bézier. Gives the reference's rounded peaks from raw
// per-minute points without inventing values between them (every control point
// is derived from the real samples on either side).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

export function MomentumGraph({
  series, duration, markers = [], accentHome, accentAway = prim.orange,
  homeName, awayName, revealUpTo, title = 'Momentum',
}: {
  series: number[]                 // signed −100…100, one per minute
  duration: number                 // 90, or 120 for AET
  markers?: MomentumMarker[]
  accentHome: string
  accentAway?: string
  homeName?: string
  awayName?: string
  /** Live reveal (§7): only draw up to this minute. Omit for the full graph. */
  revealUpTo?: number
  title?: string | null
}) {
  // Unique per instance — react-native-svg ids are global on web, so two graphs
  // on one screen would otherwise share (and fight over) the same clip paths.
  const uid = useId().replace(/:/g, '')
  const shown = revealUpTo === undefined ? series.length : Math.max(0, Math.min(series.length, Math.round(revealUpTo)))

  // Draw at the container's real width rather than stretching a fixed viewBox:
  // a non-uniform scale would squash the marker circles into ellipses on any
  // screen that isn't exactly the viewBox width.
  const [width, setWidth] = useState(FALLBACK_W)
  const VIEW_W = width

  const H = MARKER_H + PLOT_H + MARKER_H
  const mid = MARKER_H + PLOT_H / 2
  const half = PLOT_H / 2
  const xOf = (minute: number) => (minute / duration) * VIEW_W

  // The closed area: start on the centreline, run the smoothed curve through
  // every minute's point, then drop back to the line and close — so it fills as
  // a ribbon rather than reading as a stroke.
  const fullPath = useMemo(() => {
    if (shown === 0) return ''
    // Sample at the middle of each minute so minute 1 isn't pinned to x=0.
    const pts = series.slice(0, shown).map((v, i) => ({
      x: xOf(i + 0.5),
      y: mid - (Math.max(-100, Math.min(100, v)) / 100) * half,
    }))
    const curve = smoothPath(pts)
    const first = pts[0], last = pts[pts.length - 1]
    const bez = curve.indexOf(' C')
    return `M ${first.x.toFixed(2)} ${mid} L ${first.x.toFixed(2)} ${first.y.toFixed(2)}`
      + (bez === -1 ? '' : curve.slice(bez))
      + ` L ${last.x.toFixed(2)} ${mid} Z`
  }, [series, shown, duration, width])

  // Breaks: half-time always, full-time only when there's extra time to divide.
  const breaks = duration > 90 ? [45, 90] : [45]
  const labels: { at: number; text: string }[] = duration > 90
    ? [{ at: 0, text: "0'" }, { at: 45, text: 'HT' }, { at: 90, text: 'FT' }, { at: 120, text: 'AET' }]
    : [{ at: 0, text: "0'" }, { at: 45, text: 'HT' }, { at: 90, text: 'FT' }]

  const visibleMarkers = markers.filter(m => m.minute <= (shown === 0 ? -1 : shown))

  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View
        style={styles.plot}
        onLayout={e => {
          const w = Math.round(e.nativeEvent.layout.width)
          if (w > 0 && w !== width) setWidth(w)
        }}
      >
        <Svg width={VIEW_W} height={H} viewBox={`0 0 ${VIEW_W} ${H}`}>
          <Defs>
            {/* One area path, drawn twice and clipped to each half — the only
                way to two-tone a single fill that crosses the centreline. */}
            <ClipPath id={`above-${uid}`}><Rect x={0} y={0} width={VIEW_W} height={mid} /></ClipPath>
            <ClipPath id={`below-${uid}`}><Rect x={0} y={mid} width={VIEW_W} height={H - mid} /></ClipPath>
          </Defs>

          {/* Dotted period dividers, full height like the reference. */}
          {breaks.map(b => (
            <Line
              key={b} x1={xOf(b)} y1={MARKER_H * 0.2} x2={xOf(b)} y2={H - MARKER_H * 0.2}
              stroke={prim.cottonMuted} strokeWidth={1} strokeDasharray="2 5" opacity={0.55}
            />
          ))}

          {fullPath ? (
            <>
              <Path d={fullPath} fill={accentHome} clipPath={`url(#above-${uid})`} />
              <Path d={fullPath} fill={accentAway} clipPath={`url(#below-${uid})`} />
            </>
          ) : null}

          {/* Centreline sits ON TOP of the fill so the split stays crisp. */}
          <Line x1={0} y1={mid} x2={VIEW_W} y2={mid} stroke={prim.cotton} strokeWidth={0.8} opacity={0.75} />

          {/* Markers — in their own rows, never floating in the fill. */}
          <G>
            {visibleMarkers.map((m, i) => {
              // Nudged in from the edges so a 90'+ or 1' marker isn't clipped
              // in half by the viewBox.
              const cx = Math.max(6, Math.min(VIEW_W - 6, xOf(m.minute)))
              const cy = m.isHome ? MARKER_H / 2 : H - MARKER_H / 2
              if (m.kind === 'red') {
                return <Rect key={i} x={cx - 3} y={cy - 5} width={6} height={10} rx={1.5} fill={colors.danger} />
              }
              // Own goals get the same ball but ringed in red, so the gut-punch
              // is unmistakable next to a normal goal (§9).
              return (
                <G key={i}>
                  <Circle cx={cx} cy={cy} r={4.4} fill={prim.cotton} />
                  {m.kind === 'ownGoal' && <Circle cx={cx} cy={cy} r={5.8} stroke={colors.danger} strokeWidth={1.6} fill="none" />}
                  <Circle cx={cx} cy={cy} r={1.5} fill={prim.nylon} />
                </G>
              )
            })}
          </G>
        </Svg>
      </View>

      {/* Minute axis: bold period labels with ticked dots between them. */}
      <View style={styles.axis}>
        {labels.map((l, i) => {
          const next = labels[i + 1]
          return (
            <React.Fragment key={l.text}>
              <Text style={styles.axisLabel}>{l.text}</Text>
              {next ? (
                <View style={styles.axisTicks}>
                  {Array.from({ length: 9 }).map((_, k) => <View key={k} style={styles.axisTick} />)}
                </View>
              ) : null}
            </React.Fragment>
          )
        })}
      </View>

      {(homeName || awayName) && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: accentHome }]} />
            <Text style={styles.legendText} numberOfLines={1}>{homeName} <Text style={styles.legendHint}>above</Text></Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: accentAway }]} />
            <Text style={styles.legendText} numberOfLines={1}>{awayName} <Text style={styles.legendHint}>below</Text></Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: prim.nylonSunken, borderRadius: 0, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: typography.sm, fontFamily: font.bodyBlack, color: prim.cotton, textAlign: 'center' },
  plot: { width: '100%' },
  axis: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  axisLabel: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  axisTicks: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  axisTick: { width: 2, height: 2, borderRadius: 1, backgroundColor: prim.cottonMuted, opacity: 0.6 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 9, color: prim.cottonMuted, flexShrink: 1 },
  legendHint: { color: prim.cottonMuted },
})
