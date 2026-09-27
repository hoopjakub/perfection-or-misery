// The match drawn on a pitch (P4-H): shot map, average positions, heat map.
// Pure drawing over src/engine/match-geometry.ts, on nylon, in Kit Drop's
// grammar — square lines, cotton markings, volt for goals and heat.
import React, { useEffect, useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { TimedShot } from '@/engine/commentary'
import Svg, { Rect, Line, Circle, Path, G, Text as SvgText } from 'react-native-svg'
import { ROLES, prim, space } from '@/theme'
import { KitText, Icon } from '@/components/kit'
import { HEAT_COLS, HEAT_ROWS, type Shot, type PlayerSpot } from '@/engine/match-geometry'

const roles = ROLES.nylon
const LINE = prim.ruleNylon

// ── Pitch markings ───────────────────────────────────────────────────────────
// Drawn in a 68 x 105 box (metres), attack at the top. `half` crops to the
// attacking half for the shot map.
function Markings({ half }: { half?: boolean }) {
  const top = 0
  return (
    <G stroke={LINE} strokeWidth={0.5} fill="none">
      <Rect x={0} y={top} width={68} height={half ? 52.5 : 105} />
      {/* The attacking box, six-yard box, spot and arc at the top. */}
      <Rect x={13.84} y={0} width={40.32} height={16.5} />
      <Rect x={24.84} y={0} width={18.32} height={5.5} />
      <Circle cx={34} cy={11} r={0.5} fill={LINE} />
      <Path d="M 26.7 16.5 A 9.15 9.15 0 0 0 41.3 16.5" />
      <Rect x={30.34} y={-1.5} width={7.32} height={1.5} />
      {half ? (
        <Path d="M 24.85 52.5 A 9.15 9.15 0 0 1 43.15 52.5" />
      ) : (
        <>
          <Line x1={0} y1={52.5} x2={68} y2={52.5} />
          <Circle cx={34} cy={52.5} r={9.15} />
          <Rect x={13.84} y={88.5} width={40.32} height={16.5} />
          <Rect x={24.84} y={99.5} width={18.32} height={5.5} />
          <Circle cx={34} cy={94} r={0.5} fill={LINE} />
          <Path d="M 26.7 88.5 A 9.15 9.15 0 0 1 41.3 88.5" />
        </>
      )}
    </G>
  )
}

// ── Shot map ─────────────────────────────────────────────────────────────────
const OUTCOME_LABEL: Record<Shot['outcome'], string> = {
  goal: 'Goal', saved: 'Saved', off: 'Off target', blocked: 'Blocked', woodwork: 'Woodwork',
}

// P8-47: "too condensed and hard to see". Every shot now starts greyed out,
// and arrows above the map step through them in the order they were taken.
// The current shot lights up in its outcome's colour, says who took it, when,
// how it went and its xG, and a line runs from where it was struck to where it
// ended — in the net, at the keeper, wide, charged down, off a post — drawn
// out as you step, so the map moves (P8-145). The map itself isn't tapped.
const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const OUTCOME_COLOUR: Record<Shot['outcome'], string> = {
  goal: prim.volt, saved: prim.cotton, off: prim.cotton, blocked: prim.cottonMuted, woodwork: prim.orange,
}
const GREY = prim.nylonFaint

function ShotDot({ s, lit }: { s: TimedShot; lit: boolean }) {
  const cx = s.x * 68, cy = (1 - s.y) * 105
  const r = 0.9 + s.xg * 3.2
  const c = lit ? OUTCOME_COLOUR[s.outcome] : GREY
  if (s.outcome === 'goal') return <Circle cx={cx} cy={cy} r={r} fill={c} stroke={prim.ink} strokeWidth={0.35} />
  if (s.outcome === 'saved') return <Circle cx={cx} cy={cy} r={r} fill={c} />
  if (s.outcome === 'blocked') return <Circle cx={cx} cy={cy} r={r * 0.8} fill={c} opacity={lit ? 1 : 0.6} />
  if (s.outcome === 'woodwork') return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={0.45} />
      <Line x1={cx - r * 0.6} y1={cy} x2={cx + r * 0.6} y2={cy} stroke={c} strokeWidth={0.45} />
    </G>
  )
  return <Circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={0.4} />
}

// One shot's route, drawn from the boot to where it ended. Its own component,
// mounted fresh for every shot (keyed by the shot): the first version kept ONE
// progress value in the map and reset it after the render, so each step's
// first frame drew the new route at full length — at the previous shot's end,
// the maintainer's "all snap to where the first one ends" — before it snapped
// back and grew. Here every route starts at zero with its own coordinates in
// its own closure; there's no previous shot for it to remember. Its first
// frame is the boot itself (x2/y2 and cx/cy are set as plain props too, or it
// would draw from the pitch's corner before the animation lands).
function Route({ shot }: { shot: TimedShot }) {
  const reduced = useReducedMotion()
  const fx = shot.x * 68, fy = (1 - shot.y) * 105
  const ex = shot.end.x, ey = shot.end.y
  const p = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (!reduced) p.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) })
  }, [])
  const lineProps = useAnimatedProps(() => ({ x2: fx + (ex - fx) * p.value, y2: fy + (ey - fy) * p.value }))
  const ballProps = useAnimatedProps(() => ({ cx: fx + (ex - fx) * p.value, cy: fy + (ey - fy) * p.value }))
  const start = reduced ? { x: ex, y: ey } : { x: fx, y: fy }
  const colour = OUTCOME_COLOUR[shot.outcome]
  return (
    <G>
      <AnimatedLine x1={fx} y1={fy} x2={start.x} y2={start.y} animatedProps={lineProps} stroke={colour} strokeWidth={0.5}
        strokeDasharray={shot.outcome === 'blocked' ? '1 0.8' : undefined} />
      <AnimatedCircle cx={start.x} cy={start.y} animatedProps={ballProps} r={0.8} fill={colour} />
    </G>
  )
}

export function ShotMap({ shots }: { shots: TimedShot[] }) {
  const goals = shots.filter(s => s.outcome === 'goal').length
  const onTarget = shots.filter(s => s.outcome === 'goal' || s.outcome === 'saved').length
  const xg = shots.reduce((a, s) => a + s.xg, 0)
  // The first shot is picked from the start (the maintainer, 24 Sept): the map
  // opens already telling you something, and the arrows go on from there.
  const [at, setAt] = useState<number | null>(shots.length ? 0 : null)
  const cur = at != null ? shots[at] : null

  const step = (d: number) => setAt(i => {
    if (shots.length === 0) return null
    if (i == null) return d > 0 ? 0 : shots.length - 1
    return Math.max(0, Math.min(shots.length - 1, i + d))
  })

  return (
    <View style={styles.wrap}>
      <KitText t="tag" color={roles.textMuted}>
        {`${shots.length} shots · ${onTarget} on target · ${goals} ${goals === 1 ? 'goal' : 'goals'} · ${xg.toFixed(2)} xG`}
      </KitText>
      {shots.length > 0 && (
        <View style={styles.stepper}>
          <Pressable onPress={() => step(-1)} disabled={at === 0} accessibilityRole="button" accessibilityLabel="Previous shot" hitSlop={6}
            style={({ pressed }) => [styles.stepBtn, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }, at === 0 && { opacity: 0.4 }]}>
            <Icon name="back" size={20} color={roles.text} />
          </Pressable>
          <View style={styles.stepText} accessibilityLiveRegion="polite">
            {cur ? (
              <>
                <KitText t="title" color={roles.text} numberOfLines={1}>{`${cur.minute}${cur.plus ? `+${cur.plus}` : ''}' · ${cur.name}`}</KitText>
                <KitText t="tag" color={OUTCOME_COLOUR[cur.outcome] === prim.cotton ? roles.textMuted : OUTCOME_COLOUR[cur.outcome]}>
                  {`${cur.penalty ? 'Penalty · ' : ''}${OUTCOME_LABEL[cur.outcome]} · ${cur.xg.toFixed(2)} xG · shot ${at! + 1} of ${shots.length}`}
                </KitText>
              </>
            ) : (
              <KitText t="body" color={roles.textMuted}>Step through the shots, in the order they came.</KitText>
            )}
          </View>
          <Pressable onPress={() => step(1)} disabled={at === shots.length - 1} accessibilityRole="button" accessibilityLabel="Next shot" hitSlop={6}
            style={({ pressed }) => [styles.stepBtn, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }, at === shots.length - 1 && { opacity: 0.4 }]}>
            <Icon name="chevron" size={20} color={roles.text} />
          </Pressable>
        </View>
      )}
      <View style={[styles.pitch, { aspectRatio: 68 / 54 }]}
        accessible accessibilityLabel={`Shot map: ${shots.length} shots, ${goals} goals, ${xg.toFixed(2)} expected goals`}>
        <Svg width="100%" height="100%" viewBox="-1 -2 70 56">
          <Markings half />
          {shots.map((s, i) => i === at ? null : <ShotDot key={i} s={s} lit={false} />)}
          {cur && (
            <G>
              <Route key={at} shot={cur} />
              <ShotDot s={cur} lit />
            </G>
          )}
        </Svg>
      </View>
      <View style={styles.legend}>
        {(['goal', 'saved', 'off', 'blocked', 'woodwork'] as const).map(o => (
          <View key={o} style={styles.legendItem}>
            <Svg width={12} height={12} viewBox="0 0 12 12">
              {o === 'goal' && <Circle cx={6} cy={6} r={4.5} fill={prim.volt} stroke={prim.ink} strokeWidth={1} />}
              {o === 'saved' && <Circle cx={6} cy={6} r={4.5} fill={prim.cotton} />}
              {o === 'off' && <Circle cx={6} cy={6} r={4.5} fill="none" stroke={prim.cotton} strokeWidth={1.2} />}
              {o === 'blocked' && <Circle cx={6} cy={6} r={3.5} fill={prim.cottonMuted} opacity={0.6} />}
              {o === 'woodwork' && <><Circle cx={6} cy={6} r={4.5} fill="none" stroke={prim.orange} strokeWidth={1.2} /><Line x1={3} y1={6} x2={9} y2={6} stroke={prim.orange} strokeWidth={1.2} /></>}
            </Svg>
            <KitText t="tag" color={roles.textMuted}>{OUTCOME_LABEL[o]}</KitText>
          </View>
        ))}
        <KitText t="tag" color={roles.textMuted}>Bigger dot, bigger chance</KitText>
      </View>
    </View>
  )
}

// ── Average positions ────────────────────────────────────────────────────────
const surname = (n: string) => n.split(' ').slice(-1)[0]

export function AveragePositions({ spots, onPlayer, selected }: {
  spots: PlayerSpot[]
  onPlayer?: (playerId: string) => void
  selected?: string | null
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.pitch, { aspectRatio: 68 / 105 }]} accessible={false}>
        <Svg width="100%" height="100%" viewBox="-1 -2 70 109">
          <Markings />
          {spots.map(p => {
            const cx = p.x * 68, cy = (1 - p.y) * 105
            const on = selected === p.playerId
            return (
              <G key={p.playerId} onPress={onPlayer ? () => onPlayer(p.playerId) : undefined}>
                <Circle cx={cx} cy={cy} r={p.minutes >= 80 ? 3 : 2.3} fill={on ? prim.orange : prim.cotton} stroke={prim.ink} strokeWidth={0.4} />
                <SvgText x={cx} y={cy + 6.2} fontSize={2.9} fill={on ? prim.orange : prim.cottonMuted} textAnchor="middle">{surname(p.name)}</SvgText>
              </G>
            )
          })}
        </Svg>
      </View>
      <KitText t="tag" color={roles.textMuted}>Where each player played on average. Tap one for their heat map.</KitText>
    </View>
  )
}

// ── Heat map ─────────────────────────────────────────────────────────────────
export function HeatMap({ grid, name }: { grid: number[][]; name: string }) {
  const cw = 68 / HEAT_COLS, ch = 105 / HEAT_ROWS
  return (
    <View style={styles.wrap}>
      <KitText t="tag" color={roles.text}>{`${name} · heat map`}</KitText>
      <View style={[styles.pitch, { aspectRatio: 68 / 105 }]} accessible accessibilityLabel={`Heat map for ${name}`}>
        <Svg width="100%" height="100%" viewBox="-1 -2 70 109">
          {grid.map((row, r) => row.map((v, c) => v > 0.08 ? (
            <Rect key={`${r}-${c}`} x={c * cw} y={r * ch} width={cw} height={ch} fill={prim.volt} opacity={Math.min(0.85, v * 0.85)} />
          ) : null))}
          <Markings />
        </Svg>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  stepBtn: { width: 48, height: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, minHeight: 48, justifyContent: 'center' },
  wrap: { gap: space[2] },
  pitch: { width: '100%', backgroundColor: roles.sunken, borderWidth: 1, borderColor: roles.rule },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
