// Kit Drop pieces for the season (docs/ui-overhaul/07c C1–C3): the table with
// zone tapes, its legend, the season strip, your result as a scoreline, the
// results list, the two-way switch, the press ticker and its stories. Every
// piece stands on whatever `roles` it's given; the season itself is nylon.
import React, { memo, useEffect, useRef, useState } from 'react'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import Animated, { LinearTransition, FadeIn } from 'react-native-reanimated'
import { type Roles, space, border, density, SERIES } from '@/theme'
import Svg, { Polyline, Line, Circle } from 'react-native-svg'
import { KitText, Stripe, Tape, Icon, Tag, RoundFlag, VenueMark, TeamMark, Field, Twinkle } from '@/components/kit'
import { ZONES, type ZoneKey } from '@/data/qualification-bands'
import { storyText, type Story } from '@/engine/press'

// ── Zones ────────────────────────────────────────────────────────────────────
// How a zone is drawn. Volt is the title and nothing else (P8-16: the champion
// used to share the Champions League's tape, though winning the league and
// finishing fourth are not the same thing), the hazard stripe is out, and the
// places between are cotton — solid for the bigger prize, broken for the
// smaller. The code always sits beside the tape, so nothing is colour-only.
export type ZoneTone = 'title' | 'top' | 'mid' | 'low' | 'out'
export type TableZone = { code: string; label: string; tone: ZoneTone }

const LEAGUE_TONE: Record<ZoneKey, ZoneTone> = {
  champ: 'title', ucl: 'top', uel: 'mid', uecl: 'low', playoff: 'out', down: 'out',
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
  // P8-111: going down is red, the mirror of the title's volt. It was the
  // hazard stripe, which now only means "not available", never an outcome.
  if (tone === 'out') return <View style={[styles.edge, { backgroundColor: roles.loss }]} />
  if (tone === 'low') {
    return (
      <View style={styles.edge}>
        {[0, 1, 2].map(i => <View key={i} style={[styles.dash, { backgroundColor: roles.textMuted }]} />)}
      </View>
    )
  }
  const bg = tone === 'title' ? roles.perfection : tone === 'top' ? roles.line : tone === 'mid' ? roles.textMuted : 'transparent'
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
          {/* A label that only repeats its code ("OUT" / "Out") is said once (P8-107). */}
          <KitText t="tag" color={roles.textMuted}>{z.label.toUpperCase() === z.code ? z.code : `${z.code} ${z.label}`}</KitText>
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
  /** P8-22: places gained (+) or lost (−) since the matchday before. Left out
   *  where a table doesn't track movement, and then no column is drawn. */
  move?: number
}

/** P8-136: each row's places moved since `before` (the club ids in the order
 *  of the matchday before), for the table's movement column (P8-22). The
 *  Champions League tables slid their rows instead; now they say it the league
 *  mode's way. No order before (the first matchday): no column. */
export function withMoves(rows: TableRowVM[], before?: string[] | null): TableRowVM[] {
  if (!before?.length) return rows
  const was = new Map(before.map((id, i) => [id, i + 1]))
  return rows.map((r, i) => ({ ...r, move: (was.get(r.clubId) ?? i + 1) - (i + 1) }))
}

export const LeagueTable = memo(function LeagueTable({ roles, rows, zones, moveMs, muted, strength, breakAfter, breakLabel, onRowPress, crowned }: {
  roles: Roles
  rows: TableRowVM[]
  zones: (TableZone | null)[]
  moveMs?: number        // rows slide to their new place over this long; undefined = jump
  muted?: boolean        // before a ball is kicked: the order is the pundits', not a result
  strength?: boolean     // a preview of the field: one OVR column, no results
  breakAfter?: number    // a split league: a heading after this many rows
  breakLabel?: string
  onRowPress?: (clubId: string) => void   // a finished table: each row opens its club
  /** P8-145: a finished table's champion twinkles beside its name. */
  crowned?: boolean
}) {
  const tracksMoves = rows.some(r => r.move !== undefined)
  const layout = moveMs ? LinearTransition.duration(moveMs) : undefined
  const fig = muted ? roles.textFaint : roles.text
  return (
    <View accessibilityRole="list">
      <View style={[styles.row, styles.headRow, { borderBottomColor: roles.line }]}>
        <View style={styles.edgeSlot} />
        <KitText t="tag" color={roles.textMuted} style={styles.code}> </KitText>
        <KitText t="tag" color={roles.textMuted} style={styles.pos}>#</KitText>
        <KitText t="tag" color={roles.textMuted} style={styles.name}>Club</KitText>
        {tracksMoves && <View style={styles.moveCell} />}
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
              r.isPlayer && { backgroundColor: roles.yours },
            ]}
            accessible
            accessibilityLabel={`${i + 1}, ${r.clubName}${r.isPlayer ? ', you' : ''}, ${r.points} points, goal difference ${r.gd}${z ? `, ${z.label}` : ''}`}
          >
            <View style={styles.edgeSlot}><ZoneEdge roles={roles} tone={z?.tone ?? null} /></View>
            <KitText t="tag" color={roles.textMuted} style={styles.code} numberOfLines={1}>{z?.code ?? ''}</KitText>
            <KitText t="figure" color={fig} style={styles.pos}>{String(i + 1)}</KitText>
            <View style={[styles.name, styles.nameRow]}>
              {/* P8-12: a club wears its crest, a nation its flag. */}
              {r.flag !== undefined
                ? <RoundFlag emoji={r.flag} code={r.clubName.slice(0, 3)} size={16} roles={roles} />
                : <TeamMark roles={roles} clubId={r.clubId} name={r.clubName} size={16} />}
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{r.clubName}</KitText>
              {crowned && i === 0 ? <Twinkle /> : null}
              {r.note ? <KitText t="tag" color={roles.textMuted}>{r.note}</KitText> : null}
              {/* P8-23: no YOU tag — your row is marked by its background (the left
                  edge belongs to the zone tape). */}
            </View>
            {/* P8-22: places moved since the matchday before, a caret and a number. */}
            {tracksMoves && (
              <View style={styles.moveCell} accessibilityLabel={r.move ? `${r.move > 0 ? 'up' : 'down'} ${Math.abs(r.move)}` : undefined}>
                {r.move ? (
                  <>
                    <Icon name={r.move > 0 ? 'up' : 'down'} size={16} color={r.move > 0 ? (roles.perfectionText ?? roles.text) : roles.lossText} />
                    <KitText t="tag" color={r.move > 0 ? (roles.perfectionText ?? roles.text) : roles.lossText}>{String(Math.abs(r.move))}</KitText>
                  </>
                ) : null}
              </View>
            )}
            {strength
              ? <KitText t="figure" color={fig} style={styles.pts}>{String(r.ovr ?? 0)}</KitText>
              : <>
                  <KitText t="figure" color={fig} style={styles.num}>{String(r.played)}</KitText>
                  <KitText t="figure" color={fig} style={styles.num}>{r.gd > 0 ? `+${r.gd}` : String(r.gd)}</KitText>
                  <KitText t="figure" color={fig} style={styles.pts}>{String(r.points)}</KitText>
                </>}
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
  // P8-22: going up is volt and going down is misery red, on the words AND the
  // place itself (only UP used to be coloured, and the number never was).
  // Volt can't be text on cotton, so there a climb stays in ink.
  const tone = delta == null || delta === 0 ? roles.text : delta > 0 ? (roles.perfectionText ?? roles.text) : roles.lossText
  return (
    <View style={styles.standing} accessible accessibilityLabel={`You're ${ordinal(pos)}${move ? `, ${move.toLowerCase()}` : ''}, ${points} points${zone ? `, ${zone.label}` : ''}`}>
      <KitText t="superL" color={tone}>{ordinal(pos).toUpperCase()}</KitText>
      <View style={styles.standingSide}>
        {move ? <KitText t="tag" color={delta === 0 ? roles.textMuted : tone}>{move}</KitText> : null}
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

// One matchday cell, and the gap between two of them — the scroll maths (P8-15)
// and the styles read the same numbers.
const CELL_W = 26
const CELL_GAP = 4

export function SeasonStrip({ roles, marks, total, viewing, onPick }: {
  roles: Roles
  marks: Mark[]
  total: number
  viewing: number | null      // 1-based matchday being looked at, null = live
  onPick: (md: number | null) => void
}) {
  const ref = useRef<ScrollView>(null)
  // P8-15: follow the matchday just played, not the end of the strip. It used
  // to scroll to the end, which is the LAST matchday of the season — so before
  // a ball was kicked you were looking at May. Matchday 1 sits at x = 0, and
  // each one after that scrolls just enough to keep it in view.
  useEffect(() => {
    if (viewing != null) return
    const x = Math.max(0, (marks.length - 1) * (CELL_W + CELL_GAP) - CELL_W * 3)
    ref.current?.scrollTo({ x, animated: marks.length > 1 })
  }, [marks.length, viewing])
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
            backgroundColor: m === 'W' ? roles.perfection : m === 'L' ? roles.loss : 'transparent',
          }]}>
            {/* W volt, L misery red (P8-74), D grey outline; the letter says it without colour. */}
            {m && <KitText t="tag" color={m === 'D' ? roles.draw : roles.onFill}>{m}</KitText>}
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
export function ScorelineCard({ roles, label, homeName, awayName, homeClubId, awayClubId, homeGoals, awayGoals, youHome, homeScorers, awayScorers, onPress, footer }: {
  roles: Roles
  label: string
  homeName: string; awayName: string
  /** Each side's crest (or a nation's flag) over its name. */
  homeClubId?: string; awayClubId?: string
  homeGoals: number; awayGoals: number
  youHome: boolean
  homeScorers?: string; awayScorers?: string
  onPress?: () => void
  /** Under the scorers: the man of the match (P8-129). */
  footer?: React.ReactNode
}) {
  const mine = youHome ? homeGoals - awayGoals : awayGoals - homeGoals
  const mark: Mark = mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button"
      accessibilityLabel={`${label}. ${homeName} ${homeGoals}, ${awayName} ${awayGoals}. ${mark === 'W' ? 'Won' : mark === 'L' ? 'Lost' : 'Drawn'}`}
      accessibilityHint="Opens the match sheet"
      style={({ pressed }) => [styles.scoreCard, { borderColor: roles.line, backgroundColor: pressed ? roles.sunken : roles.surface }]}>
      <View style={styles.scoreTop}>
        {/* P8-134: home or away as the house or the plane (P8-09), not the word. */}
        <VenueMark roles={roles} home={youHome} />
        <KitText t="tag" color={roles.textMuted}>{label}</KitText>
        <Tag roles={roles} variant={mark === 'W' ? 'win' : mark === 'D' ? 'draw' : 'loss'}>{mark}</Tag>
        <View style={{ flex: 1 }} />
        {onPress && <Icon name="chevron" size={20} color={roles.text} />}
      </View>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreSide, { alignItems: 'flex-end' }]}>
          {/* P8-20/23: this card is your result already; a YOU tag said it twice. */}
          <TeamMark roles={roles} clubId={homeClubId} name={homeName} size={24} />
          <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: 'right' }}>{homeName}</KitText>
        </View>
        <KitText t="superL" color={roles.text} style={styles.scoreFig}>{`${homeGoals}–${awayGoals}`}</KitText>
        <View style={[styles.scoreSide, { alignItems: 'flex-start' }]}>
          <TeamMark roles={roles} clubId={awayClubId} name={awayName} size={24} />
          <KitText t="title" color={roles.text} numberOfLines={2}>{awayName}</KitText>
        </View>
      </View>
      {(homeScorers || awayScorers) ? (
        <View style={styles.scoreRow}>
          <KitText t="body" color={roles.textMuted} style={[styles.scoreSide, { textAlign: 'right' }]}>{homeScorers ?? ''}</KitText>
          <View style={styles.scoreGap} />
          <KitText t="body" color={roles.textMuted} style={styles.scoreSide}>{awayScorers ?? ''}</KitText>
        </View>
      ) : null}
      {footer}
    </Pressable>
  )
}

// ── ResultRow ────────────────────────────────────────────────────────────────
// P8-17: each side's scorers sit UNDER that side, lined up with the names and
// the score. They used to be one centred line ("Haaland 12' · Saka 40'"), which
// never said who scored for whom.
export const ResultRow = memo(function ResultRow({ roles, homeName, awayName, homeClubId, awayClubId, homeGoals, awayGoals, youSide, homeScorers, awayScorers, onPress, round, neutral }: {
  roles: Roles
  homeName: string; awayName: string
  /** P8-12: their crests, where the caller has the ids to hand. */
  homeClubId?: string; awayClubId?: string
  homeGoals: number; awayGoals: number
  youSide: 'home' | 'away' | null
  homeScorers?: string; awayScorers?: string
  onPress?: () => void
  /** Which round it was, where a list mixes them ("ROUND OF 16", "GROUP B · MD 2"). */
  round?: string
  /** Neutral ground (the World Cup, P8-59): your row carries no home or away mark. */
  neutral?: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button"
      accessibilityLabel={`${round ? `${round}, ` : ''}${homeName} ${homeGoals}, ${awayName} ${awayGoals}`}
      style={({ pressed }) => [styles.resultRow, { borderBottomColor: roles.rule }, youSide && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
      <View style={{ flex: 1 }}>
        {round ? <KitText t="tag" color={roles.textMuted} style={styles.resultRound}>{round}</KitText> : null}
        <View style={styles.resultLine}>
          <View style={[styles.resultTeam, styles.resultHome]}>
            <KitText t="body" color={roles.text} numberOfLines={1} style={styles.resultName}>{homeName}</KitText>
            {/* P8-79: a nation's flag, a club's crest — decided by the id. */}
            <TeamMark roles={roles} clubId={homeClubId} name={homeName} size={16} />
          </View>
          <KitText t="figure" color={roles.text} style={styles.resultFig}>{`${homeGoals}–${awayGoals}`}</KitText>
          <View style={styles.resultTeam}>
            <TeamMark roles={roles} clubId={awayClubId} name={awayName} size={16} />
            <KitText t="body" color={roles.text} numberOfLines={1} style={styles.resultName}>{awayName}</KitText>
          </View>
        </View>
        {homeScorers || awayScorers ? (
          <View style={styles.resultLine}>
            <KitText t="body" color={roles.textMuted} numberOfLines={2} style={[styles.resultSide, { textAlign: 'right' }]}>{homeScorers ?? ''}</KitText>
            <View style={styles.resultFig} />
            <KitText t="body" color={roles.textMuted} numberOfLines={2} style={styles.resultSide}>{awayScorers ?? ''}</KitText>
          </View>
        ) : null}
      </View>
      {/* P8-23: your match is marked by its background, not a tag on every
          list; P8-134: and whether you were at home, by the house or the plane. */}
      {youSide && !neutral && <VenueMark roles={roles} home={youSide === 'home'} />}
      {onPress && <Icon name="chevron" size={16} color={roles.textMuted} />}
    </Pressable>
  )
})

// ── LineGraph ────────────────────────────────────────────────────────────────
// One line over the run's matches, with ALL its reference values written on it
// (P8-66, the maintainer's spec): down the left, the scale's top, the line's
// best, its worst and the scale's bottom, each with its own guide line (solid
// for the scale, dashed for the line's own extremes). Where the best IS the
// top (or the worst the bottom) one label says both. Labels never overlap:
// ones that would are pushed apart. Taller than before (200) so four labels
// breathe. `onPoint` makes every point tappable (a 28px target round each).
export type GraphSeries = { key: string; label: string; values: number[] }

export function LineGraph({ roles, values, min, max, invert, fmt, topWord = 'MAX', bottomWord = 'MIN', legend, xLabel = 'MD', dot, onPoint, selected, compare = [] }: {
  roles: Roles
  values: number[]
  min: number
  max: number
  invert?: boolean               // smaller is better and sits at the top (league position)
  fmt: (v: number) => string     // how a value is written on the scale
  topWord?: string               // what the scale's top is called ('MAX', or 'TOP' for positions)
  bottomWord?: string
  legend: string
  xLabel?: string
  dot?: (v: number) => string    // a colour per point, when the points carry meaning (ratings)
  onPoint?: (i: number) => void
  selected?: number | null       // a point to ring, e.g. the match slid to
  /** P8-95: other lines to compare against, each in its own colour (SERIES) and
   *  named in the legend. The reference values stay yours. */
  compare?: GraphSeries[]
}) {
  const w = 320, h = 200, padY = 10, LABEL = 16
  // The longest line sets the x axis, so a compared line of another length
  // (a player with more matches) is drawn to scale, not stretched.
  const n = Math.max(values.length, ...compare.map(c => c.values.length))
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 16) + 8)
  const norm = (v: number) => (Math.max(min, Math.min(max, v)) - min) / Math.max(1e-6, max - min)
  const y = (v: number) => padY + (invert ? norm(v) : 1 - norm(v)) * (h - padY * 2)
  const last = values[values.length - 1]
  const top = invert ? min : max, bottom = invert ? max : min
  const best = invert ? Math.min(...values) : Math.max(...values)
  const worst = invert ? Math.max(...values) : Math.min(...values)

  // The four reference values, merged where they coincide.
  type Ref = { v: number; label: string; dashed: boolean }
  const refs: Ref[] = []
  refs.push({ v: top, label: best === top ? `${fmt(top)} ${topWord} = BEST` : `${fmt(top)} ${topWord}`, dashed: false })
  if (best !== top) refs.push({ v: best, label: `${fmt(best)} BEST`, dashed: true })
  if (worst !== bottom && worst !== best) refs.push({ v: worst, label: `${fmt(worst)} WORST`, dashed: true })
  refs.push({ v: bottom, label: worst === bottom ? `${fmt(bottom)} ${bottomWord} = WORST` : `${fmt(bottom)} ${bottomWord}`, dashed: false })

  // Label positions, top to bottom, pushed apart so none overlap, then pulled
  // back up from the bottom edge if the push ran them off the graph.
  const placed = refs.map(r => ({ ...r, ly: y(r.v) - LABEL / 2 })).sort((a, b) => a.ly - b.ly)
  for (let k = 0; k < placed.length; k++) placed[k].ly = Math.max(placed[k].ly, k === 0 ? 0 : placed[k - 1].ly + LABEL)
  for (let k = placed.length - 1; k >= 0; k--) {
    const floor = k === placed.length - 1 ? h - LABEL : placed[k + 1].ly - LABEL
    placed[k].ly = Math.min(placed[k].ly, floor)
  }

  return (
    <View style={styles.graph} accessible={!onPoint} accessibilityLabel={`${legend}. From ${fmt(values[0])} to ${fmt(last)}; best ${fmt(best)}, worst ${fmt(worst)}.`}>
      <View style={styles.graphBody}>
        <View style={[styles.graphGutter, { height: h }]}>
          {placed.map(r => (
            <KitText key={r.label} t="tag" color={r.dashed ? roles.text : roles.textMuted} numberOfLines={1}
              style={[styles.graphTick, { top: r.ly }]}>{r.label}</KitText>
          ))}
        </View>
        <View style={[styles.graphPlot, { borderColor: roles.rule, height: h }]}>
          <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            {refs.map(r => (
              <Line key={r.label} x1={0} y1={y(r.v)} x2={w} y2={y(r.v)} stroke={r.dashed ? roles.textMuted : roles.rule} strokeWidth={1}
                strokeDasharray={r.dashed ? '4 4' : undefined} />
            ))}
            {compare.map((c, k) => c.values.length > 0 && (
              <React.Fragment key={c.key}>
                <Polyline points={c.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={SERIES[k % SERIES.length]} strokeWidth={1.5} />
                {/* Where the points mean something (ratings), theirs wear it too:
                    the line says whose, the point says how good. */}
                {dot && c.values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={3} fill={dot(v)} />)}
              </React.Fragment>
            ))}
            <Polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={roles.text} strokeWidth={1.5} />
            {(dot || onPoint) && values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={3} fill={dot ? dot(v) : roles.textMuted} />)}
            {selected != null && values[selected] != null && <Circle cx={x(selected)} cy={y(values[selected])} r={6} fill="none" stroke={roles.you} strokeWidth={2} />}
            <Circle cx={x(values.length - 1)} cy={y(last)} r={4} fill={roles.you} />
          </Svg>
          {/* Tappable points, laid over the drawing (x in %, since the SVG stretches to the width). */}
          {onPoint && values.map((v, i) => (
            <Pressable key={i} onPress={() => onPoint(i)} hitSlop={4} accessibilityRole="button"
              accessibilityLabel={`${xLabel} ${i + 1}: ${fmt(v)}`}
              style={[styles.graphHit, { left: `${(x(i) / w) * 100}%`, top: y(v) - 14 }]} />
          ))}
        </View>
      </View>
      <View style={styles.graphFoot}>
        <KitText t="tag" color={roles.textMuted}>{`${xLabel} 1`}</KitText>
        <KitText t="tag" color={roles.textMuted}>{`${xLabel} ${n}`}</KitText>
      </View>
      <View style={styles.graphLegend}>
        <View style={[styles.graphSwatch, { backgroundColor: roles.you }]} />
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>{legend}</KitText>
      </View>
      {compare.map((c, k) => (
        <View key={c.key} style={styles.graphLegend}>
          <View style={[styles.graphSwatch, { backgroundColor: SERIES[k % SERIES.length] }]} />
          <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }} numberOfLines={1}>
            {`${c.label} · now ${fmt(c.values[c.values.length - 1])}`}
          </KitText>
        </View>
      ))}
      {onPoint ? <KitText t="tag" color={roles.textMuted} style={styles.graphLegendPad}>Tap a point to go to that match</KitText> : null}
    </View>
  )
}

const ordinalOf = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// A club's league position after each matchday; first place at the top. One
// piece for the club page, the run hub and the result screen (P8-67).
export function PositionGraph({ roles, values, clubs, onPoint, selected, compare }: {
  roles: Roles; values: number[]; clubs: number; onPoint?: (i: number) => void; selected?: number | null; compare?: GraphSeries[]
}) {
  return (
    <LineGraph roles={roles} values={values} min={1} max={clubs} invert fmt={v => ordinalOf(v).toUpperCase()}
      topWord="TOP" bottomWord="LAST" onPoint={onPoint} selected={selected} compare={compare}
      legend={`League position after each matchday · now ${ordinalOf(values[values.length - 1])} of ${clubs}`} />
  )
}

// ── PositionCompare (P8-95) ──────────────────────────────────────────────────
// A club's position graph with the picker under it: add other clubs from the
// same table and each gets its line, colour and legend entry. One piece for
// the run hub, the club page and the result screen.
export function PositionCompare({ roles, clubId, positions, table, clubs, onPoint, selected }: {
  roles: Roles
  clubId: string
  positions: Map<string, number[]>
  /** The clubs to offer, in table order. */
  table: { clubId: string; clubName: string }[]
  clubs: number
  onPoint?: (i: number) => void
  selected?: number | null
}) {
  const [picked, setPicked] = useState<string[]>([])
  const mine = positions.get(clubId)
  if (!mine || mine.length < 2) return null
  const names = new Map(table.map(t => [t.clubId, t.clubName]))
  const compare = picked.filter(id => positions.has(id)).map(id => ({ key: id, label: names.get(id) ?? id, values: positions.get(id)! }))
  return (
    <View>
      <PositionGraph roles={roles} values={mine} clubs={clubs} onPoint={onPoint} selected={selected} compare={compare} />
      <ComparePicker roles={roles} selected={picked} onChange={setPicked}
        options={table.filter(t => t.clubId !== clubId && positions.has(t.clubId)).map(t => ({ id: t.clubId, label: t.clubName }))} />
    </View>
  )
}

// ── ComparePicker (P8-95) ────────────────────────────────────────────────────
// What to draw beside your line: a row of chips to switch on and off, up to
// four (one per SERIES colour). A chip that's on wears its line's colour.
export const MAX_COMPARE = SERIES.length

export function ComparePicker({ roles, options, selected, onChange, label = 'Compare with' }: {
  roles: Roles
  /** Everyone who can be compared; found by typing, never listed in full. */
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  label?: string
}) {
  const [query, setQuery] = useState('')
  if (!options.length) return null
  // Accents fold, so "muller" finds Müller.
  const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = fold(query.trim())
  const found = q.length >= 2 ? options.filter(o => !selected.includes(o.id) && fold(o.label).includes(q)).slice(0, 6) : []
  const add = (id: string) => { if (selected.length < MAX_COMPARE) onChange([...selected, id]); setQuery('') }
  const names = new Map(options.map(o => [o.id, o.label]))
  return (
    <View style={styles.compare}>
      {/* What's on the graph now: its colour, and a tap takes it off. */}
      {selected.length > 0 && (
        <View style={styles.compareRow}>
          {selected.map((id, k) => (
            <Pressable key={id} onPress={() => onChange(selected.filter(x => x !== id))} accessibilityRole="button"
              accessibilityLabel={`Stop comparing with ${names.get(id) ?? id}`}
              style={({ pressed }) => [styles.compareChip, { borderColor: SERIES[k] }, pressed && { backgroundColor: roles.sunken }]}>
              <View style={[styles.graphSwatch, { backgroundColor: SERIES[k] }]} />
              <KitText t="tag" color={roles.text} numberOfLines={1}>{names.get(id) ?? id}</KitText>
              <Icon name="close" size={16} color={roles.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
      {selected.length < MAX_COMPARE && (
        <Field roles={roles} label={`${label} · up to ${MAX_COMPARE}`} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" />
      )}
      {found.map(o => (
        <Pressable key={o.id} onPress={() => add(o.id)} accessibilityRole="button"
          style={({ pressed }) => [styles.compareHit, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{o.label}</KitText>
          <Icon name="forward" size={16} color={roles.textMuted} />
        </Pressable>
      ))}
      {q.length >= 2 && found.length === 0 ? <KitText t="tag" color={roles.textMuted}>NOBODY BY THAT NAME</KitText> : null}
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
export function FixtureRow({ roles, matchday, opponent, home, pot, flag, result, when, you }: {
  roles: Roles
  matchday: number
  /** P8-117: your club's name. Given, the row reads like the scoreline it
   *  becomes: your side on the left at home and on the right away, the score
   *  home–away between them. Without it, only the opponent shows. */
  you?: string
  /** P8-92: the day it's played ("TUE 17 SEP"), under the matchday. */
  when?: string
  opponent: string
  /** null = a neutral venue (the World Cup, P8-59): no HOME or AWAY tag. */
  home: boolean | null
  pot?: number
  flag?: string | null
  result?: { mine: number; theirs: number }
}) {
  const mark: Mark | null = result ? (result.mine > result.theirs ? 'W' : result.mine < result.theirs ? 'L' : 'D') : null
  return (
    <View style={[styles.fixture, { borderBottomColor: roles.rule }]} accessible
      accessibilityLabel={`Matchday ${matchday}, ${home == null ? 'against' : home ? 'home to' : 'away at'} ${opponent}${pot ? `, pot ${pot}` : ''}${result ? `, ${result.mine} ${result.theirs}` : ''}`}>
      <View style={styles.fixtureMd}>
        <KitText t="tag" color={roles.textMuted}>{`MD ${matchday}`}</KitText>
        {when ? <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{when}</KitText> : null}
      </View>
      {home != null && <VenueMark roles={roles} home={home} />}
      {flag !== undefined && <RoundFlag emoji={flag} code={opponent.slice(0, 3)} size={16} roles={roles} />}
      {you && home != null ? (
        <>
          <KitText t="body" color={roles.text} numberOfLines={1} style={styles.fixtureLeft}>{home ? you : opponent}</KitText>
          <KitText t="figure" color={result ? roles.text : roles.textMuted} style={styles.fixtureScore}>
            {result ? (home ? `${result.mine}–${result.theirs}` : `${result.theirs}–${result.mine}`) : 'v'}
          </KitText>
          <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{home ? opponent : you}</KitText>
          {pot ? <Tag roles={roles}>{`POT ${pot}`}</Tag> : null}
          {mark ? <Tag roles={roles} variant={mark === 'W' ? 'win' : mark === 'D' ? 'draw' : 'loss'}>{mark}</Tag> : null}
        </>
      ) : (
        <>
          <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{opponent}</KitText>
          {pot ? <Tag roles={roles}>{`POT ${pot}`}</Tag> : null}
          {result && mark ? (
            <>
              <KitText t="figure" color={roles.text}>{`${result.mine}–${result.theirs}`}</KitText>
              <Tag roles={roles} variant={mark === 'W' ? 'win' : mark === 'D' ? 'draw' : 'loss'}>{mark}</Tag>
            </>
          ) : null}
        </>
      )}
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
// A fate, stamped: THROUGH AS WINNERS, OUT. Volt edge for good news, misery
// red for bad (P8-74); the stamp's word says which without colour.
export function StampLabel({ roles, text, good, sub }: { roles: Roles; text: string; good: boolean; sub?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[styles.stamp, { borderColor: roles.line, backgroundColor: roles.surface }]}
      accessible accessibilityRole="header" accessibilityLabel={`${text}${sub ? `. ${sub}` : ''}`}>
      {good
        ? <View style={[styles.stampEdge, { backgroundColor: roles.perfection }]} />
        : <View style={[styles.stampEdge, { backgroundColor: roles.loss }]} />}
      <View style={styles.stampBody}>
        <KitText t="superM" color={roles.text}>{text.toUpperCase()}</KitText>
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
  /** P8-12: their crests, where the caller has the ids (a nation shows its flag). */
  aClubId?: string
  bClubId?: string
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

function Flagged({ roles, name, flag, clubId, direct, muted, align }: {
  roles: Roles; name: string; flag?: string | null; clubId?: string; direct?: boolean; muted?: boolean; align: 'left' | 'right'
}) {
  const body = (
    <>
      {flag
        ? <RoundFlag emoji={flag} code={name.slice(0, 3)} size={16} roles={roles} />
        : <TeamMark roles={roles} clubId={clubId} name={name} size={16} />}
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
        <Flagged roles={roles} name={tie.aName} flag={tie.aFlag} clubId={tie.aClubId} direct={tie.directA} align="left" />
        <Tag roles={roles}>BYE</Tag>
        <KitText t="body" color={roles.textMuted} numberOfLines={1}>advances unopposed</KitText>
      </View>
    )
  }
  return (
    <Pressable onPress={tie.onPress} disabled={!tie.onPress} accessibilityRole="button"
      accessibilityLabel={`${tie.aName} ${tie.score ?? ''} ${tie.bName}${tie.detail ? `, ${tie.detail}` : ''}`}
      style={({ pressed }) => [styles.tieRow, { borderBottomColor: roles.rule }, tie.isPlayerTie && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.tieLine}>
          <Flagged roles={roles} name={tie.aName} flag={tie.aFlag} clubId={tie.aClubId} direct={tie.directA} muted={!tie.winnerIsA} align="right" />
          <KitText t="figure" color={roles.text} style={styles.tieFig}>{tie.score ?? ''}</KitText>
          <Flagged roles={roles} name={tie.bName} flag={tie.bFlag} clubId={tie.bClubId} direct={tie.directB} muted={tie.winnerIsA} align="left" />
        </View>
        {tie.detail ? <KitText t="tag" color={roles.textMuted} style={styles.tieCentre}>{tie.detail}</KitText> : null}
        {tie.scorers ? <KitText t="body" color={roles.textMuted} style={styles.tieCentre} numberOfLines={2}>{tie.scorers}</KitText> : null}
        {tie.note ? <KitText t="tag" color={roles.text} style={styles.tieCentre}>{tie.note}</KitText> : null}
      </View>
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
      {/* The round's name is the section heading right above the card (with
          its explainer); said here too it read twice (the maintainer, 26 Sept).
          It stays in the card's spoken label. */}
      <View style={styles.tieCardTop}>
        {tie.note ? <Tag roles={roles} variant={tone ?? 'data'}>{tie.note}</Tag> : null}
        <View style={{ flex: 1 }} />
        {tie.onPress && <Icon name="chevron" size={20} color={roles.text} />}
      </View>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreSide, { alignItems: 'flex-end' }]}>
          {/* Each side's crest, or a nation's flag: the card had only flags, so a club tie had no mark. */}
          {tie.aFlag ? <RoundFlag emoji={tie.aFlag} code={tie.aName.slice(0, 3)} size={24} roles={roles} />
            : <TeamMark roles={roles} clubId={tie.aClubId} name={tie.aName} size={24} />}
          <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: 'right' }}>{tie.aName}</KitText>
        </View>
        <KitText t="superL" color={roles.text} style={styles.scoreFig}>{tie.score ?? ''}</KitText>
        <View style={[styles.scoreSide, { alignItems: 'flex-start' }]}>
          {tie.bFlag ? <RoundFlag emoji={tie.bFlag} code={tie.bName.slice(0, 3)} size={24} roles={roles} />
            : <TeamMark roles={roles} clubId={tie.bClubId} name={tie.bName} size={24} />}
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

const HOT_STORIES = new Set(['hotStreak', 'masterclass', 'champions', 'playerForm', 'unbeatenRun'])

export const StoryItem = memo(function StoryItem({ roles, story, onPress }: { roles: Roles; story: Story; onPress?: () => void }) {
  const { headline, standfirst } = storyText(story)
  // Tappable: it opens the story's own page (it was a plain row, so a story in
  // the live season's press opened nothing).
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'link' : undefined}
      style={({ pressed }) => [styles.story, { borderBottomColor: roles.rule }, story.involvesPlayer && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}
      accessibilityLabel={`Matchday ${story.matchday}. ${story.involvesPlayer ? 'About you. ' : ''}${headline}. ${standfirst}`}>
      <View style={styles.storyTop}>
        <KitText t="tag" color={roles.textMuted}>{`MD ${story.matchday}/${story.totalMatchdays}`}</KitText>
        {/* P8-145: the hot ones live: a streak, a masterclass, a champion. */}
        {HOT_STORIES.has(story.kind) ? <Twinkle i={story.matchday} /> : null}
      </View>
      <KitText t="title" color={roles.text}>{headline}</KitText>
      <KitText t="body" color={roles.textMuted}>{standfirst}</KitText>
      {/* The rows as they stood that day, set into the story like a graphic;
          a story about one match shows that match instead (27 Sept). */}
      {story.match ? (
        <View style={styles.storyRow}>
          <TeamMark roles={roles} clubId={story.match.homeId} name={story.match.homeName} size={16} />
          <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{story.match.homeName}</KitText>
          <KitText t="figure" color={roles.text}>{`${story.match.homeGoals}–${story.match.awayGoals}`}</KitText>
          <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>{story.match.awayName}</KitText>
          <TeamMark roles={roles} clubId={story.match.awayId} name={story.match.awayName} size={16} />
        </View>
      ) : (
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
      )}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  compare: { gap: space[1], marginTop: space[2] },
  compareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  compareHit: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: border.hair },
  compareChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space[2], borderWidth: border.thin },
  graph: { gap: space[1] },
  graphBody: { flexDirection: 'row', gap: space[2] },
  graphGutter: { width: 118 },
  graphTick: { position: 'absolute', right: 0, textAlign: 'right' },
  graphPlot: { flex: 1, borderWidth: border.hair },
  graphHit: { position: 'absolute', width: 28, height: 28, marginLeft: -14 },
  graphFoot: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 118 + space[2] },
  graphLegend: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginLeft: 118 + space[2] },
  graphLegendPad: { marginLeft: 118 + space[2] },
  graphSwatch: { width: 8, height: 8 },
  edgeSlot: { width: 4, alignSelf: 'stretch' },
  edge: { width: 4, flex: 1, justifyContent: 'space-between' },
  dash: { height: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], paddingVertical: space[2] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendEdge: { height: 14, width: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: density.t3.row, paddingRight: space[1] },
  headRow: { borderBottomWidth: border.thin, minHeight: 28 },
  // Wide enough for the longest code (CHAMP, UECL, DOWN) in the tag mono: at
  // 36 it wrapped to "CHAM / P".
  code: { width: 46 },
  pos: { width: 22, textAlign: 'right' },
  name: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  num: { width: 30, textAlign: 'right' },
  pts: { width: 34, textAlign: 'right' },
  moveCell: { width: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },

  standing: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: space[2] },
  standingSide: { gap: 2, alignItems: 'flex-start' },

  strip: { gap: CELL_GAP, paddingVertical: space[2] },
  cellWrap: { alignItems: 'center', gap: 3 },
  cell: { width: CELL_W, height: CELL_W, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cellMark: { width: 26, height: 3 },

  scoreCard: { borderWidth: border.thin, padding: space[3], gap: space[2], marginVertical: space[2] },
  scoreTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  scoreSide: { flex: 1 },
  scoreFig: { minWidth: 96, textAlign: 'center' },
  scoreGap: { minWidth: 96 },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: density.t2.row, paddingVertical: space[1], borderBottomWidth: border.hair },
  resultLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  resultRound: { textAlign: 'center' },
  fixtureLeft: { flex: 1, textAlign: 'right' },
  fixtureScore: { minWidth: 36, textAlign: 'center' },
  resultHome: { justifyContent: 'flex-end' },
  resultName: { flexShrink: 1 },
  resultSide: { flex: 1 },
  // One side of the score: its name and its mark on one line (they stacked, the
  // mark under the name, when this was a plain column).
  resultTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[1] },
  resultFig: { minWidth: 40, textAlign: 'center' },

  segment: { flexDirection: 'row', borderBottomWidth: border.hair, marginTop: space[3] },
  // The padding matters inside a horizontal ScrollView (the run hub): there flex has no
  // width to share out, and the labels ran together as TABLESEASONSTATS.
  segmentBtn: { flex: 1, minHeight: 48, paddingHorizontal: space[3], alignItems: 'center', justifyContent: 'center' },
  segmentTape: { position: 'absolute', left: 0, right: 0, bottom: 0, height: border.tape },

  ticker: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderTopWidth: border.hair, paddingHorizontal: space[1] },

  fixture: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: density.t2.row, borderBottomWidth: border.hair },
  fixtureMd: { width: 76 },
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
