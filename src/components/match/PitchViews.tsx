// The match drawn on a pitch (P4-H): shot map, average positions, heat map.
// Pure drawing over src/engine/match-geometry.ts, on nylon, in Kit Drop's
// grammar — square lines, cotton markings, volt for goals and heat.
import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Rect, Line, Circle, Path, G, Text as SvgText } from 'react-native-svg'
import { ROLES, prim, space } from '@/theme'
import { KitText } from '@/components/kit'
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

export function ShotMap({ shots }: { shots: Shot[] }) {
  const goals = shots.filter(s => s.outcome === 'goal').length
  const onTarget = shots.filter(s => s.outcome === 'goal' || s.outcome === 'saved').length
  const xg = shots.reduce((a, s) => a + s.xg, 0)
  return (
    <View style={styles.wrap}>
      <KitText t="tag" color={roles.textMuted}>
        {`${shots.length} shots · ${onTarget} on target · ${goals} ${goals === 1 ? 'goal' : 'goals'} · ${xg.toFixed(2)} xG`}
      </KitText>
      <View style={[styles.pitch, { aspectRatio: 68 / 54 }]}
        accessible accessibilityLabel={`Shot map: ${shots.length} shots, ${goals} goals, ${xg.toFixed(2)} expected goals`}>
        <Svg width="100%" height="100%" viewBox="-1 -2 70 56">
          <Markings half />
          {[...shots].sort((a, b) => (a.outcome === 'goal' ? 1 : 0) - (b.outcome === 'goal' ? 1 : 0)).map((s, i) => {
            const cx = s.x * 68, cy = (1 - s.y) * 105
            const r = 0.9 + s.xg * 3.2
            if (s.outcome === 'goal') return <Circle key={i} cx={cx} cy={cy} r={r} fill={prim.volt} stroke={prim.ink} strokeWidth={0.35} />
            if (s.outcome === 'saved') return <Circle key={i} cx={cx} cy={cy} r={r} fill={prim.cotton} />
            if (s.outcome === 'blocked') return <Circle key={i} cx={cx} cy={cy} r={r * 0.8} fill={prim.cottonMuted} opacity={0.6} />
            if (s.outcome === 'woodwork') return (
              <G key={i}>
                <Circle cx={cx} cy={cy} r={r} fill="none" stroke={prim.orange} strokeWidth={0.45} />
                <Line x1={cx - r * 0.6} y1={cy} x2={cx + r * 0.6} y2={cy} stroke={prim.orange} strokeWidth={0.45} />
              </G>
            )
            return <Circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={prim.cotton} strokeWidth={0.4} />
          })}
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
  wrap: { gap: space[2] },
  pitch: { width: '100%', backgroundColor: roles.sunken, borderWidth: 1, borderColor: roles.rule },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
