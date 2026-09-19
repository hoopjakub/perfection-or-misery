// Kit Drop pieces for the season (docs/ui-overhaul/07c C1–C3): the table with
// zone tapes, its legend, the season strip, your result as a scoreline, the
// results list, the two-way switch, the press ticker and its stories. Every
// piece stands on whatever `roles` it's given; the season itself is nylon.
import React, { memo, useEffect, useRef } from 'react'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import Animated, { LinearTransition, FadeIn } from 'react-native-reanimated'
import { type Roles, space, border, density } from '@/theme'
import Svg, { Polyline, Line, Circle } from 'react-native-svg'
import { KitText, Stripe, Tape, Icon, Tag, RoundFlag } from '@/components/kit'
import { ZONES, type ZoneKey } from '@/data/qualification-bands'
import { storyText, type Story } from '@/engine/press'

// ── Zones ────────────────────────────────────────────────────────────────────
// How a zone is drawn. Volt is the good end, the hazard stripe is out, and the
// places in between are cotton, solid for the bigger prize and broken for the
// smaller. The code always sits beside the tape, so nothing is colour-only.
export type ZoneTone = 'top' | 'mid' | 'low' | 'out'
export type TableZone = { code: string; label: string; tone: ZoneTone }

const LEAGUE_TONE: Record<ZoneKey, ZoneTone> = {
  champ: 'top', ucl: 'top', uel: 'mid', uecl: 'low', playoff: 'out', down: 'out',
}

// The Champions League league phase's three zones, by place.
export const CL_PHASE_ZONES: TableZone[] = Array.from({ length: 36 }, (_, i) =>
  i < 8 ? { code: 'R16', label: 'Round of 16', tone: 'top' }
  : i < 24 ? { code: 'PO', label: 'Knockout play-off', tone: 'mid' }
  : { code: 'OUT', label: 'Out', tone: 'out' })

// The World Cup's: two through from each group, third into the race for the
// eight best thirds, fourth out; then that race's own table.
const zone = (code: string, label: string, tone: ZoneTone): TableZone => ({ code, label, tone })
export const WC_GROUP_ZONES: TableZone[] = [
  zone('IN', 'Through', 'top'), zone('IN', 'Through', 'top'),
  zone('3RD', 'Into the third-place race', 'mid'), zone('OUT', 'Out', 'out'),
]
export const WC_THIRD_ZONES: TableZone[] = Array.from({ length: 12 }, (_, i) =>
  i < 8 ? zone('IN', 'Through as a best third', 'top') : zone('OUT', 'Out', 'out'))

export function leagueTableZones(zones: (ZoneKey | null)[]): (TableZone | null)[] {
  return zones.map(z => (z ? { code: ZONES[z].code, label: ZONES[z].label, tone: LEAGUE_TONE[z] } : null))
}

function ZoneEdge({ roles, tone }: { roles: Roles; tone: ZoneTone | null }) {
  if (tone === 'out') return <Stripe roles={roles} band={4} style={styles.edge} />
  if (tone === 'low') {
    return (
      <View style={styles.edge}>
        {[0, 1, 2].map(i => <View key={i} style={[styles.dash, { backgroundColor: roles.textMuted }]} />)}
      </View>
    )
  }
  const bg = tone === 'top' ? roles.perfection : tone === 'mid' ? roles.textMuted : 'transparent'
  return <View style={[styles.edge, { backgroundColor: bg }]} />
}

export function ZoneLegend({ roles, zones }: { roles: Roles; zones: (TableZone | null)[] }) {
  const seen = new Map<string, TableZone>()
  for (const z of zones) if (z && !seen.has(z.code)) seen.set(z.code, z)
  if (seen.size === 0) return null
  return (
    <View style={styles.legend} accessibilityLabel={`Zones: ${[...seen.values()].map(z => z.label).join(', ')}`}>
      {[...seen.values()].map(z => (
        <View key={z.code} style={styles.legendItem}>
          <View style={styles.legendEdge}><ZoneEdge roles={roles} tone={z.tone} /></View>
          <KitText t="tag" color={roles.textMuted}>{`${z.code} ${z.label}`}</KitText>
        </View>
      ))}
    </View>
  )
}

// ── LeagueTable ──────────────────────────────────────────────────────────────
export type TableRowVM = {
  clubId: string; clubName: string; isPlayer: boolean
  played: number; gd: number; points: number
  ovr?: number             // shown instead of the results in a strength preview
  flag?: string | null     // nations get a round flag
  note?: string            // a short tag after the name: the group letter
}

export const LeagueTable = memo(function LeagueTable({ roles, rows, zones, moveMs, muted, flashId, strength, breakAfter, breakLabel, onRowPress }: {
  roles: Roles
  rows: TableRowVM[]
  zones: (TableZone | null)[]
  moveMs?: number        // rows slide to their new place over this long; undefined = jump
  muted?: boolean        // before a ball is kicked: the order is the pundits', not a result
  flashId?: string | null
  strength?: boolean     // a preview of the field: one OVR column, no results
  breakAfter?: number    // a split league: a heading after this many rows
  breakLabel?: string
  onRowPress?: (clubId: string) => void   // a finished table: each row opens its club
}) {
  const layout = moveMs ? LinearTransition.duration(moveMs) : undefined
  const fig = muted ? roles.textFaint : roles.text
  return (
    <View accessibilityRole="list">
      <View style={[styles.row, styles.headRow, { borderBottomColor: roles.line }]}>
        <View style={styles.edgeSlot} />
        <KitText t="tag" color={roles.textMuted} style={styles.code}> </KitText>
        <KitText t="tag" color={roles.textMuted} style={styles.pos}>#</KitText>
        <KitText t="tag" color={roles.textMuted} style={styles.name}>Club</KitText>
        {strength
          ? <KitText t="tag" color={roles.textMuted} style={styles.pts}>OVR</KitText>
          : <>
              <KitText t="tag" color={roles.textMuted} style={styles.num}>P</KitText>
              <KitText t="tag" color={roles.textMuted} style={styles.num}>GD</KitText>
              <KitText t="tag" color={roles.textMuted} style={styles.pts}>Pts</KitText>
            </>}
      </View>
      {rows.map((r, i) => {
        const z = zones[i] ?? null
        // A zone line is drawn where the zone changes, so the cut reads at a glance.
        const cut = i > 0 && (zones[i - 1]?.code ?? null) !== (z?.code ?? null)
        return (
          <React.Fragment key={r.clubId}>
          {breakAfter === i && breakLabel ? (
            <View style={[styles.tableBreak, { borderColor: roles.line }]}>
              <KitText t="tag" color={roles.textMuted}>{breakLabel}</KitText>
            </View>
          ) : null}
          <Pressable disabled={!onRowPress} onPress={() => onRowPress?.(r.clubId)} accessibilityRole={onRowPress ? 'link' : undefined}
            style={({ pressed }) => pressed ? { opacity: 0.7 } : undefined}>
          <Animated.View
            layout={layout}
            style={[
              styles.row,
              { borderTopColor: cut ? roles.line : roles.rule, borderTopWidth: cut ? border.thin : border.hair },
              r.isPlayer && { backgroundColor: roles.surface },
            ]}
            accessible
            accessibilityLabel={`${i + 1}, ${r.clubName}${r.isPlayer ? ', you' : ''}, ${r.points} points, goal difference ${r.gd}${z ? `, ${z.label}` : ''}`}
          >
            <View style={styles.edgeSlot}><ZoneEdge roles={roles} tone={z?.tone ?? null} /></View>
            <KitText t="tag" color={roles.textMuted} style={styles.code}>{z?.code ?? ''}</KitText>
            <KitText t="figure" color={fig} style={styles.pos}>{String(i + 1)}</KitText>
            <View style={[styles.name, styles.nameRow]}>
              {r.flag !== undefined && <RoundFlag emoji={r.flag} code={r.clubName.slice(0, 3)} size={16} roles={roles} />}
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{r.clubName}</KitText>
              {r.note ? <KitText t="tag" color={roles.textMuted}>{r.note}</KitText> : null}
              {r.isPlayer && <Tag roles={roles} variant="you">YOU</Tag>}
            </View>
            {strength
              ? <KitText t="figure" color={fig} style={styles.pts}>{String(r.ovr ?? 0)}</KitText>
              : <>
                  <KitText t="figure" color={fig} style={styles.num}>{String(r.played)}</KitText>
                  <KitText t="figure" color={fig} style={styles.num}>{r.gd > 0 ? `+${r.gd}` : String(r.gd)}</KitText>
                  <KitText t="figure" color={fig} style={styles.pts}>{String(r.points)}</KitText>
                </>}
            {flashId === r.clubId && (
              <Animated.View entering={FadeIn.duration(120)} style={styles.flash} pointerEvents="none">
                <Tape colours={[roles.you]} roles={roles} />
              </Animated.View>
            )}
          </Animated.View>
          </Pressable>
          </React.Fragment>
        )
      })}
    </View>
  )
})

// ── Where you stand ──────────────────────────────────────────────────────────
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function StandingFigure({ roles, pos, delta, zone, points }: {
  roles: Roles; pos: number; delta: number | null; zone: TableZone | null; points: number
}) {
  // null = we don't track movement on this screen; say nothing rather than "no change".
  const move = delta == null ? null : delta > 0 ? `UP ${delta}` : delta < 0 ? `DOWN ${-delta}` : 'NO CHANGE'
  return (
    <View style={styles.standing} accessible accessibilityLabel={`You're ${ordinal(pos)}${move ? `, ${move.toLowerCase()}` : ''}, ${points} points${zone ? `, ${zone.label}` : ''}`}>
      <KitText t="superL" color={roles.text}>{ordinal(pos).toUpperCase()}</KitText>
      <View style={styles.standingSide}>
        {move ? <KitText t="tag" color={(delta ?? 0) > 0 ? (roles.perfectionText ?? roles.text) : roles.textMuted}>{move}</KitText> : null}
        <KitText t="figure" color={roles.text}>{`${points} PTS`}</KitText>
        {zone && <Tag roles={roles}>{zone.code}</Tag>}
      </View>
    </View>
  )
}

// ── SeasonStrip ──────────────────────────────────────────────────────────────
// Your season as a row of W/D/L tags, one per matchday, scrubbable. Tapping a
// played matchday looks back at it; the live end is always the last one.
export type Mark = 'W' | 'D' | 'L'

export function SeasonStrip({ roles, marks, total, viewing, onPick }: {
  roles: Roles
  marks: Mark[]
  total: number
  viewing: number | null      // 1-based matchday being looked at, null = live
  onPick: (md: number | null) => void
}) {
  const ref = useRef<ScrollView>(null)
  useEffect(() => { if (viewing == null) ref.current?.scrollToEnd({ animated: true }) }, [marks.length, viewing])
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}
      accessibilityLabel={`Your season: ${marks.filter(m => m === 'W').length} won, ${marks.filter(m => m === 'D').length} drawn, ${marks.filter(m => m === 'L').length} lost`}>
      {Array.from({ length: total }, (_, i) => {
        const m = marks[i]
        const md = i + 1
        const on = viewing === md || (viewing == null && md === marks.length)
        const cell = (
          <View style={[styles.cell, {
            borderColor: m ? (m === 'D' ? roles.draw : roles.line) : roles.rule,
            backgroundColor: m === 'W' ? roles.perfection : 'transparent',
          }]}>
            {m === 'L' && <Stripe roles={roles} band={4} style={styles.cellStripe} />}
            {m && (
              <View style={m === 'L' ? [styles.cellInset, { backgroundColor: roles.bg }] : null}>
                <KitText t="tag" color={m === 'W' ? roles.onFill : m === 'D' ? roles.draw : roles.text}>{m}</KitText>
              </View>
            )}
          </View>
        )
        return (
          <Pressable key={md} disabled={!m} hitSlop={{ top: 10, bottom: 10 }}
            onPress={() => onPick(md === marks.length ? null : md)}
            accessibilityRole="button" accessibilityLabel={m ? `Matchday ${md}, ${m === 'W' ? 'won' : m === 'D' ? 'drawn' : 'lost'}` : `Matchday ${md}, to play`}
            accessibilityState={{ selected: on, disabled: !m }}
            style={styles.cellWrap}>
            {cell}
            <View style={[styles.cellMark, { backgroundColor: on ? roles.line : 'transparent' }]} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

// ── Your result ──────────────────────────────────────────────────────────────
export function ScorelineCard({ roles, label, homeName, awayName, homeGoals, awayGoals, youHome, homeScorers, awayScorers, onPress }: {
  roles: Roles
  label: string
  homeName: string; awayName: string
  homeGoals: number; awayGoals: number
  youHome: boolean
  homeScorers?: string; awayScorers?: string
  onPress?: () => void
}) {
  const mine = youHome ? homeGoals - awayGoals : awayGoals - homeGoals
  const mark: Mark = mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button"
      accessibilityLabel={`${label}. ${homeName} ${homeGoals}, ${awayName} ${awayGoals}. ${mark === 'W' ? 'Won' : mark === 'L' ? 'Lost' : 'Drawn'}`}
      accessibilityHint="Opens the match sheet"
      style={({ pressed }) => [styles.scoreCard, { borderColor: roles.line, backgroundColor: pressed ? roles.sunken : roles.surface }]}>
      <View style={styles.scoreTop}>
        <KitText t="tag" color={roles.textMuted}>{label}</KitText>
        <Tag roles={roles} variant={mark === 'W' ? 'win' : mark === 'D' ? 'draw' : 'loss'}>{mark}</Tag>
        <View style={{ flex: 1 }} />
        {onPress && <Icon name="chevron" size={20} color={roles.text} />}
      </View>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreSide, { alignItems: 'flex-end' }]}>
          <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: 'right' }}>{homeName}</KitText>
          {youHome && <Tag roles={roles} variant="you">YOU</Tag>}
        </View>
        <KitText t="superL" color={roles.text} style={styles.scoreFig}>{`${homeGoals}–${awayGoals}`}</KitText>
        <View style={[styles.scoreSide, { alignItems: 'flex-start' }]}>
          <KitText t="title" color={roles.text} numberOfLines={2}>{awayName}</KitText>
          {!youHome && <Tag roles={roles} variant="you">YOU</Tag>}
        </View>
      </View>
      {(homeScorers || awayScorers) ? (
        <View style={styles.scoreRow}>
          <KitText t="body" color={roles.textMuted} style={[styles.scoreSide, { textAlign: 'right' }]}>{homeScorers ?? ''}</KitText>
          <View style={styles.scoreGap} />
          <KitText t="body" color={roles.textMuted} style={styles.scoreSide}>{awayScorers ?? ''}</KitText>
        </View>
      ) : null}
    </Pressable>
  )
}

// ── ResultRow ────────────────────────────────────────────────────────────────
export const ResultRow = memo(function ResultRow({ roles, homeName, awayName, homeGoals, awayGoals, youSide, scorers, onPress }: {
  roles: Roles
  homeName: string; awayName: string
  homeGoals: number; awayGoals: number
  youSide: 'home' | 'away' | null
  scorers?: string
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button"
      accessibilityLabel={`${homeName} ${homeGoals}, ${awayName} ${awayGoals}`}
      style={({ pressed }) => [styles.resultRow, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.resultLine}>
          <KitText t="body" color={roles.text} numberOfLines={1} style={[styles.resultSide, { textAlign: 'right' }]}>{homeName}</KitText>
          <KitText t="figure" color={roles.text} style={styles.resultFig}>{`${homeGoals}–${awayGoals}`}</KitText>
          <KitText t="body" color={roles.text} numberOfLines={1} style={styles.resultSide}>{awayName}</KitText>
        </View>
        {scorers ? <KitText t="body" color={roles.textMuted} numberOfLines={2} style={styles.resultScorers}>{scorers}</KitText> : null}
      </View>
      {youSide && <Tag roles={roles} variant="you">YOU</Tag>}
      {onPress && <Icon name="chevron" size={16} color={roles.textMuted} />}
    </Pressable>
  )
})

// ── PositionGraph ────────────────────────────────────────────────────────────
// A club's league position after each matchday; first place at the top. One
// piece for the club page, the run hub and the result screen (P8-67).
// ponytail: no axis labels yet; P8-66 adds the scale and a legend.
export function PositionGraph({ roles, values, clubs }: { roles: Roles; values: number[]; clubs: number }) {
  const w = 320, h = 120
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 12) + 6)
  const y = (pos: number) => ((pos - 1) / Math.max(1, clubs - 1)) * (h - 12) + 6
  return (
    <View style={{ borderWidth: border.thin, borderColor: roles.rule }}
      accessible accessibilityLabel={`Position from ${values[0]} to ${values[values.length - 1]}`}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
        <Line x1={0} y1={y(1)} x2={w} y2={y(1)} stroke={roles.rule} strokeWidth={1} />
        <Line x1={0} y1={y(clubs)} x2={w} y2={y(clubs)} stroke={roles.rule} strokeWidth={1} />
        <Polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={roles.text} strokeWidth={1.5} />
        <Circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={roles.you} />
      </Svg>
    </View>
  )
}

// ── SegmentSwitch ────────────────────────────────────────────────────────────
// One focus at a time on a phone: the table or the results, never both.
export function SegmentSwitch<T extends string>({ roles, options, value, onChange }: {
  roles: Roles
  options: { id: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={[styles.segment, { borderBottomColor: roles.rule }]} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.id === value
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.segmentBtn, pressed && !on && { backgroundColor: roles.sunken }]}>
            <KitText t="tag" color={on ? roles.text : roles.textMuted}>
              {o.count ? `${o.label} ${o.count}` : o.label}
            </KitText>
            <View style={[styles.segmentTape, { backgroundColor: on ? roles.line : 'transparent' }]} />
          </Pressable>
        )
      })}
    </View>
  )
}

// ── FixtureRow ───────────────────────────────────────────────────────────────
// One of your fixtures before or as it's played: matchday, home or away, the
// opponent, and the pot they came from.
export function FixtureRow({ roles, matchday, opponent, home, pot, flag, result }: {
  roles: Roles
  matchday: number
  opponent: string
  home: boolean
  pot?: number
  flag?: string | null
  result?: { mine: number; theirs: number }
}) {
  const mark: Mark | null = result ? (result.mine > result.theirs ? 'W' : result.mine < result.theirs ? 'L' : 'D') : null
  return (
    <View style={[styles.fixture, { borderBottomColor: roles.rule }]} accessible
      accessibilityLabel={`Matchday ${matchday}, ${home ? 'home to' : 'away at'} ${opponent}${pot ? `, pot ${pot}` : ''}${result ? `, ${result.mine} ${result.theirs}` : ''}`}>
      <KitText t="tag" color={roles.textMuted} style={styles.fixtureMd}>{`MD ${matchday}`}</KitText>
      <Tag roles={roles}>{home ? 'HOME' : 'AWAY'}</Tag>
      {flag !== undefined && <RoundFlag emoji={flag} code={opponent.slice(0, 3)} size={16} roles={roles} />}
      <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{opponent}</KitText>
      {pot ? <Tag roles={roles}>{`POT ${pot}`}</Tag> : null}
      {result && mark ? (
        <>
          <KitText t="figure" color={roles.text}>{`${result.mine}–${result.theirs}`}</KitText>
          <Tag roles={roles} variant={mark === 'W' ? 'win' : mark === 'D' ? 'draw' : 'loss'}>{mark}</Tag>
        </>
      ) : null}
    </View>
  )
}

// ── GroupWall ────────────────────────────────────────────────────────────────
// Every other group as a small table, two to a row; each opens its group.
export type MiniGroup = { id: string; you: boolean; rows: { clubId: string; clubName: string; flag?: string | null; points: number; isPlayer: boolean }[] }

export function GroupWall({ roles, groups, onOpen, cut = 2 }: {
  roles: Roles
  groups: MiniGroup[]
  onOpen: (id: string) => void
  cut?: number     // rows above this line are through
}) {
  return (
    <View style={styles.wall}>
      {groups.map(g => (
        <Pressable key={g.id} onPress={() => onOpen(g.id)} accessibilityRole="button"
          accessibilityLabel={`Group ${g.id}: ${g.rows.map(r => `${r.clubName} ${r.points}`).join(', ')}`}
          style={({ pressed }) => [styles.mini, { borderColor: g.you ? roles.line : roles.rule, backgroundColor: pressed ? roles.sunken : roles.surface }]}>
          <View style={styles.miniTop}>
            <KitText t="tag" color={roles.text}>{`GROUP ${g.id}`}</KitText>
            {g.you && <Tag roles={roles} variant="you">YOU</Tag>}
            <View style={{ flex: 1 }} />
            <Icon name="chevron" size={16} color={roles.textMuted} />
          </View>
          {g.rows.map((r, i) => (
            <View key={r.clubId} style={[styles.miniRow, i === cut && { borderTopWidth: border.thin, borderTopColor: roles.rule }]}>
              {r.flag !== undefined && <RoundFlag emoji={r.flag} code={r.clubName.slice(0, 3)} size={16} roles={roles} />}
              <KitText t="body" color={r.isPlayer ? roles.text : roles.textMuted} numberOfLines={1} style={{ flex: 1 }}>{r.clubName}</KitText>
              <KitText t="figure" color={roles.text}>{String(r.points)}</KitText>
            </View>
          ))}
        </Pressable>
      ))}
    </View>
  )
}

// ── StampLabel ───────────────────────────────────────────────────────────────
// A fate, stamped: THROUGH AS WINNERS, OUT. Volt edge for good news, the
// stripe for bad.
export function StampLabel({ roles, text, good, sub }: { roles: Roles; text: string; good: boolean; sub?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[styles.stamp, { borderColor: roles.line, backgroundColor: roles.surface }]}
      accessible accessibilityRole="header" accessibilityLabel={`${text}${sub ? `. ${sub}` : ''}`}>
      {good
        ? <View style={[styles.stampEdge, { backgroundColor: roles.perfection }]} />
        : <Stripe roles={roles} band={6} style={styles.stampEdge} />}
      <View style={styles.stampBody}>
        <KitText t="superM" color={roles.text}>{`"${text.toUpperCase()}"`}</KitText>
        {sub ? <KitText t="body" color={roles.textMuted}>{sub}</KitText> : null}
      </View>
    </Animated.View>
  )
}

// ── RoadTape ─────────────────────────────────────────────────────────────────
// The full Champions League path as five stages (07c C4): done ones stamp
// DONE, the current one carries the tag, the rest wait in faint type.
export const UCL_ROAD = ['Domestic', "Europe's seasons", 'Qualifying', 'League phase', 'Knockouts'] as const

export function RoadTape({ roles, current }: { roles: Roles; current: number }) {
  return (
    <View style={styles.road} accessible accessibilityLabel={`Stage ${current + 1} of ${UCL_ROAD.length}: ${UCL_ROAD[current]}`}>
      <Tape colours={['#2F4BFF']} roles={roles} style={styles.roadTape} />
      <View style={styles.roadRow}>
        {UCL_ROAD.map((name, i) => i === current
          ? <Tag key={name} roles={roles} variant="selected">{name}</Tag>
          : <KitText key={name} t="tag" color={i < current ? roles.text : roles.textFaint}>{i < current ? `${name} DONE` : name}</KitText>)}
      </View>
    </View>
  )
}

// ── Ties ─────────────────────────────────────────────────────────────────────
// One tie, two sizes: `TieCard` for yours (the scoreline as a super) and
// `TieRow` for everyone else's. Every knockout, qualifying and result screen
// renders through these, so a tie reads the same wherever it appears.
export type TieVM = {
  id?: string
  aName: string
  bName: string
  aFlag?: string | null
  bFlag?: string | null
  score?: string          // "3–2", the aggregate for a two-legged tie
  detail?: string         // "Leg 1 2–1 · Leg 2 0–0 · AET · Pens 4–3", or "AET"
  winnerIsA: boolean
  isPlayerTie?: boolean
  bye?: boolean           // qualifying: A advances unopposed
  directA?: boolean       // entered this round directly (seeds skipping a round)
  directB?: boolean
  scorers?: string
  note?: string           // "You advance" — the beat after your tie resolves
  onPress?: () => void
}

function Flagged({ roles, name, flag, direct, muted, align }: {
  roles: Roles; name: string; flag?: string | null; direct?: boolean; muted?: boolean; align: 'left' | 'right'
}) {
  const body = (
    <>
      {flag ? <RoundFlag emoji={flag} code={name.slice(0, 3)} size={16} roles={roles} /> : null}
      {direct && <Tag roles={roles}>SEED</Tag>}
      <KitText t="body" color={muted ? roles.textMuted : roles.text} numberOfLines={1} style={{ flexShrink: 1, textAlign: align }}>{name}</KitText>
    </>
  )
  return (
    <View style={[styles.tieSide, { justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      {body}
    </View>
  )
}

export function TieRow({ roles, tie }: { roles: Roles; tie: TieVM }) {
  if (tie.bye) {
    return (
      <View style={[styles.tieRow, { borderBottomColor: roles.rule }]} accessible accessibilityLabel={`${tie.aName} advance without playing`}>
        <Flagged roles={roles} name={tie.aName} flag={tie.aFlag} direct={tie.directA} align="left" />
        <Tag roles={roles}>BYE</Tag>
        <KitText t="body" color={roles.textMuted} numberOfLines={1}>advances unopposed</KitText>
      </View>
    )
  }
  return (
    <Pressable onPress={tie.onPress} disabled={!tie.onPress} accessibilityRole="button"
      accessibilityLabel={`${tie.aName} ${tie.score ?? ''} ${tie.bName}${tie.detail ? `, ${tie.detail}` : ''}`}
      style={({ pressed }) => [styles.tieRow, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.tieLine}>
          <Flagged roles={roles} name={tie.aName} flag={tie.aFlag} direct={tie.directA} muted={!tie.winnerIsA} align="right" />
          <KitText t="figure" color={roles.text} style={styles.tieFig}>{tie.score ?? ''}</KitText>
          <Flagged roles={roles} name={tie.bName} flag={tie.bFlag} direct={tie.directB} muted={tie.winnerIsA} align="left" />
        </View>
        {tie.detail ? <KitText t="tag" color={roles.textMuted} style={styles.tieCentre}>{tie.detail}</KitText> : null}
        {tie.scorers ? <KitText t="body" color={roles.textMuted} style={styles.tieCentre} numberOfLines={2}>{tie.scorers}</KitText> : null}
        {tie.note ? <KitText t="tag" color={roles.text} style={styles.tieCentre}>{tie.note}</KitText> : null}
      </View>
      {tie.isPlayerTie && <Tag roles={roles} variant="you">YOURS</Tag>}
      {tie.onPress && <Icon name="chevron" size={16} color={roles.textMuted} />}
    </Pressable>
  )
}

export function TieCard({ roles, tie, label, tone }: {
  roles: Roles; tie: TieVM; label: string; tone?: 'win' | 'loss'
}) {
  return (
    <Pressable onPress={tie.onPress} disabled={!tie.onPress} accessibilityRole="button"
      accessibilityLabel={`${label}. ${tie.aName} ${tie.score ?? ''} ${tie.bName}${tie.detail ? `, ${tie.detail}` : ''}`}
      style={({ pressed }) => [styles.tieCard, { borderColor: roles.line, backgroundColor: pressed ? roles.sunken : roles.surface }]}>
      <View style={styles.tieCardTop}>
        <KitText t="tag" color={roles.textMuted}>{label}</KitText>
        {tie.note ? <Tag roles={roles} variant={tone ?? 'data'}>{tie.note}</Tag> : null}
        <View style={{ flex: 1 }} />
        {tie.onPress && <Icon name="chevron" size={20} color={roles.text} />}
      </View>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreSide, { alignItems: 'flex-end' }]}>
          {tie.aFlag ? <RoundFlag emoji={tie.aFlag} code={tie.aName.slice(0, 3)} size={20} roles={roles} /> : null}
          <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: 'right' }}>{tie.aName}</KitText>
        </View>
        <KitText t="superL" color={roles.text} style={styles.scoreFig}>{tie.score ?? ''}</KitText>
        <View style={[styles.scoreSide, { alignItems: 'flex-start' }]}>
          {tie.bFlag ? <RoundFlag emoji={tie.bFlag} code={tie.bName.slice(0, 3)} size={20} roles={roles} /> : null}
          <KitText t="title" color={roles.text} numberOfLines={2}>{tie.bName}</KitText>
        </View>
      </View>
      {tie.detail ? <KitText t="tag" color={roles.textMuted} style={styles.tieCentre}>{tie.detail}</KitText> : null}
      {tie.scorers ? <KitText t="body" color={roles.textMuted} style={styles.tieCentre}>{tie.scorers}</KitText> : null}
    </Pressable>
  )
}

// ── The press ──
// ──────────────────────────────────────────────────────────────
export function Ticker({ roles, story, onPress }: { roles: Roles; story: Story | null; onPress: () => void }) {
  if (!story) return null
  const { headline } = storyText(story)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Latest story: ${headline}`} accessibilityHint="Opens the press"
      style={({ pressed }) => [styles.ticker, { borderColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
      <Icon name="press" size={16} color={roles.textMuted} />
      <Animated.View key={story.id} entering={FadeIn.duration(200)} style={{ flex: 1 }}>
        <KitText t="body" color={roles.text} numberOfLines={1}>{`"${headline}"`}</KitText>
      </Animated.View>
      <KitText t="tag" color={roles.textMuted}>{`MD ${story.matchday}`}</KitText>
    </Pressable>
  )
}

export const StoryItem = memo(function StoryItem({ roles, story }: { roles: Roles; story: Story }) {
  const { headline, standfirst } = storyText(story)
  return (
    <View style={[styles.story, { borderBottomColor: roles.rule }]} accessible
      accessibilityLabel={`Matchday ${story.matchday}. ${headline}. ${standfirst}`}>
      <View style={styles.storyTop}>
        <KitText t="tag" color={roles.textMuted}>{`MD ${story.matchday}/${story.totalMatchdays}`}</KitText>
        {story.involvesPlayer && <Tag roles={roles} variant="you">YOU</Tag>}
      </View>
      <KitText t="title" color={roles.text}>{headline}</KitText>
      <KitText t="body" color={roles.textMuted}>{standfirst}</KitText>
      {/* The rows as they stood that day, set into the story like a graphic. */}
      <View style={styles.storyRows}>
        {/* P8-42 — every row the story is about, not the first five. */}
        {story.rows.map(r => (
          <View key={r.clubId} style={styles.storyRow}>
            <KitText t="figure" color={roles.textMuted} style={styles.pos}>{String(r.pos)}</KitText>
            <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{r.clubName}</KitText>
            <KitText t="figure" color={roles.text}>{`${r.points} PTS`}</KitText>
          </View>
        ))}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  edgeSlot: { width: 4, alignSelf: 'stretch' },
  edge: { width: 4, flex: 1, justifyContent: 'space-between' },
  dash: { height: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], paddingVertical: space[2] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendEdge: { height: 14, width: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: density.t3.row, paddingRight: space[1] },
  headRow: { borderBottomWidth: border.thin, minHeight: 28 },
  code: { width: 36 },
  pos: { width: 22, textAlign: 'right' },
  name: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  num: { width: 30, textAlign: 'right' },
  pts: { width: 34, textAlign: 'right' },
  flash: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  standing: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: space[2] },
  standingSide: { gap: 2, alignItems: 'flex-start' },

  strip: { gap: 4, paddingVertical: space[2] },
  cellWrap: { alignItems: 'center', gap: 3 },
  cell: { width: 26, height: 26, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cellStripe: { ...StyleSheet.absoluteFillObject },
  cellInset: { paddingHorizontal: 3 },
  cellMark: { width: 26, height: 3 },

  scoreCard: { borderWidth: border.thin, padding: space[3], gap: space[2], marginVertical: space[2] },
  scoreTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  scoreSide: { flex: 1 },
  scoreFig: { minWidth: 96, textAlign: 'center' },
  scoreGap: { minWidth: 96 },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: density.t2.row, paddingVertical: space[1], borderBottomWidth: border.hair },
  resultLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  resultSide: { flex: 1 },
  resultFig: { minWidth: 40, textAlign: 'center' },
  resultScorers: { textAlign: 'center' },

  segment: { flexDirection: 'row', borderBottomWidth: border.hair, marginTop: space[3] },
  // The padding matters inside a horizontal ScrollView (the run hub): there flex has no
  // width to share out, and the labels ran together as TABLESEASONSTATS.
  segmentBtn: { flex: 1, minHeight: 48, paddingHorizontal: space[3], alignItems: 'center', justifyContent: 'center' },
  segmentTape: { position: 'absolute', left: 0, right: 0, bottom: 0, height: border.tape },

  ticker: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderTopWidth: border.hair, paddingHorizontal: space[1] },

  fixture: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: density.t2.row, borderBottomWidth: border.hair },
  fixtureMd: { width: 40 },
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  mini: { flexBasis: '47%', flexGrow: 1, borderWidth: border.thin, padding: space[2], gap: 2 },
  miniTop: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 24 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 22 },
  stamp: { flexDirection: 'row', borderWidth: border.plate, marginVertical: space[3], overflow: 'hidden' },
  stampEdge: { width: 12, alignSelf: 'stretch' },
  stampBody: { flex: 1, padding: space[3], gap: 4 },

  tableBreak: { borderTopWidth: border.plate, paddingTop: space[2], paddingBottom: space[1] },
  road: { gap: space[2], paddingHorizontal: space[4] },
  roadTape: { marginHorizontal: -space[4] },
  roadRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },

  tieRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, paddingVertical: space[1], borderBottomWidth: border.hair },
  tieLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  tieSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  tieFig: { minWidth: 52, textAlign: 'center' },
  tieCentre: { textAlign: 'center' },
  tieCard: { borderWidth: border.plate, padding: space[3], gap: space[2], marginVertical: space[1] },
  tieCardTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },

  story: { paddingVertical: space[3], gap: 4, borderBottomWidth: border.hair },
  storyTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  storyRows: { marginTop: space[1], gap: 2 },
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
