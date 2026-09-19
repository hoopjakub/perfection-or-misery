import React, { useMemo, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import Svg, { Polyline, Circle, Line } from 'react-native-svg'
import { ROLES, space, border, prim, ratingColor } from '@/theme'
import { KitScreen, KitText, Tag, SectionTag, Chips, BackControl, EmptyState, InlineError, Icon } from '@/components/kit'
import { useRunData } from '@/lib/runData'
import { openClub, openRunMatch } from '@/lib/runNav'
import { buildAwardsNight } from '@/engine/awards'
import {
  STAT_LABEL, per90, positionRanks, percentileTag, value, canPer90, PER90_MIN_MINUTES, type StatKey,
} from '@/engine/run-aggregates'
import { lineOf } from '@/engine/awards'
import type { PlayerStatLine } from '@/types/stats'
import type { PlayerMatchLogEntry } from '@/engine/run-stats'

// D4 · The player page (docs/ui-overhaul/07d), replacing the game-log modal. A
// route, so back returns to exactly where you were and it survives a reload.
// Reads the run's cached data (src/lib/runData.ts), so it opens instantly.
//
// `ceremony=1` (opened from Awards Night) hides his honours: the page shows
// the player, never the rest of the night (P8-36).
const roles = ROLES.nylon

// The rows his season is read in, by what his line does.
const ROWS_BY_LINE: Record<string, StatKey[]> = {
  GK: ['saves', 'cleanSheets', 'passes', 'accuratePasses'],
  DEF: ['tacklesWon', 'interceptions', 'clearances', 'blocks', 'duelsWon', 'cleanSheets', 'goals', 'assists', 'chancesCreated'],
  MID: ['goals', 'assists', 'chancesCreated', 'bigChancesCreated', 'dribbles', 'tacklesWon', 'interceptions', 'passes', 'shots'],
  FWD: ['goals', 'assists', 'shots', 'shotsOnTarget', 'chancesCreated', 'bigChancesCreated', 'dribbles', 'duelsWon'],
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export default function PlayerScreen() {
  const { id, runId, ceremony } = useLocalSearchParams<{ id: string; runId?: string; ceremony?: string }>()
  const { data, loading, failed, retry } = useRunData(runId)
  const [mode, setMode] = useState<'total' | 'per90'>('total')

  const p = data?.stats.players.find(x => x.playerId === id) ?? null
  const log: PlayerMatchLogEntry[] = (data?.matchLog?.get(id ?? '') ?? [])
  const line = p ? lineOf(p.position) : 'MID'
  const keys = ROWS_BY_LINE[line]

  const ranks = useMemo(() => {
    if (!data) return new Map<StatKey, ReturnType<typeof positionRanks>>()
    return new Map(keys.map(k => [k, positionRanks(data.stats.players, k, mode)] as const))
  }, [data, mode, line])

  // His honours from the run's awards, measured the same way Awards Night was.
  const honours = useMemo(() => {
    if (!data || !p || ceremony === '1') return []
    const night = buildAwardsNight({ awards: data.awards, stats: data.stats, rounds: data.rounds ?? undefined })
    const out: string[] = []
    const all = [night.playerOfTheSeason, night.bestU21, ...night.players].filter(Boolean) as NonNullable<typeof night.playerOfTheSeason>[]
    for (const a of all) {
      if (a.winner.playerId === p.playerId) out.push(a.title.toUpperCase())
      const ru = a.runnersUp.findIndex(c => c.playerId === p.playerId)
      if (ru >= 0) out.push(`${a.title.toUpperCase()} · ${ordinal(ru + 2)}`)
    }
    if (night.teamOfTheSeason?.xi.some(x => x.player.id === p.playerId)) out.push('TEAM OF THE SEASON')
    const totm = night.teamsOfTheRound.filter(r => r.team.xi.some(x => x.player.id === p.playerId)).length
    if (totm) out.push(`TEAM OF THE MATCHDAY ×${totm}`)
    return out
  }, [data, p, ceremony])

  if (loading) {
    return (
      <KitScreen ground="nylon">
        <BackControl roles={roles} />
        <KitText t="bodyL" color={roles.textMuted}>Reading his season.</KitText>
      </KitScreen>
    )
  }
  if (failed || !data) {
    return (
      <KitScreen ground="nylon">
        <BackControl roles={roles} />
        <InlineError roles={roles} message="This run's numbers couldn't be read." onRetry={retry} />
      </KitScreen>
    )
  }
  if (!p) {
    return (
      <KitScreen ground="nylon">
        <BackControl roles={roles} />
        <EmptyState roles={roles} title="Not in this run" body="This player didn't feature in the competition." />
      </KitScreen>
    )
  }

  const played = (p.matchesRated ?? 0) > 0
  return (
    <KitScreen ground="nylon">
      <BackControl roles={roles} />

      {/* The player as a tag. */}
      <View style={styles.head}>
        <KitText t="superL" color={roles.text}>{p.name.toUpperCase()}</KitText>
        <View style={styles.headMeta}>
          <Tag roles={roles}>{p.position}</Tag>
          <Pressable onPress={() => openClub(p.clubId, runId)} accessibilityRole="link" hitSlop={8}>
            <KitText t="tag" color={roles.text} style={styles.link}>{p.clubName}</KitText>
          </Pressable>
          <KitText t="tag" color={roles.textMuted}>{p.seasonLabel}</KitText>
          {p.isPlayerClub && <Tag roles={roles} variant="you">DRAFTED BY YOU</Tag>}
        </View>
      </View>

      {/* The two numbers a season is read by first, and the minutes behind them. */}
      <View style={styles.bigRow}>
        <Big label="Average rating" value={p.avgRating != null ? p.avgRating.toFixed(2) : '–'} tint={p.avgRating != null ? ratingColor(p.avgRating) : undefined} />
        <Big label="Man of the match" value={String(p.potm ?? 0)} />
        <Big label="Minutes" value={String(p.minutes ?? '–')} />
        <Big label="Matches" value={String(p.matchesRated ?? 0)} />
      </View>

      {honours.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>Honours this run</SectionTag>
          <View style={styles.tags}>{honours.map(h => <Tag key={h} roles={roles} variant="win">{h}</Tag>)}</View>
        </View>
      )}

      {!played ? (
        <EmptyState roles={roles} title="Didn't play" body={log.length ? 'He was named but never came on.' : 'He never featured in a match this run.'} />
      ) : (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <SectionTag roles={roles}>Season</SectionTag>
              <View style={{ flex: 1 }} />
              <Chips<'total' | 'per90'> roles={roles} value={mode} onChange={setMode}
                options={[{ id: 'total', label: 'Total' }, { id: 'per90', label: 'Per 90' }]} />
            </View>
            {mode === 'per90' && (
              <KitText t="body" color={roles.textMuted}>{`Per 90 counts once a player has ${PER90_MIN_MINUTES} minutes.`}</KitText>
            )}
            <View style={[styles.row, styles.rowHead, { borderBottomColor: roles.line }]}>
              <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Stat</KitText>
              <KitText t="tag" color={roles.textMuted} style={styles.num}>{mode === 'total' ? 'Total' : 'Per 90'}</KitText>
              <KitText t="tag" color={roles.textMuted} style={styles.rank}>{`Rank · ${line}`}</KitText>
            </View>
            {keys.map(k => {
              const v = mode === 'per90' ? (canPer90(k) ? per90(p, k) : null) : value(p, k)
              const r = ranks.get(k)?.get(p.playerId)
              const top = percentileTag(p, r)
              return (
                <View key={k} style={[styles.row, { borderBottomColor: roles.rule }]}>
                  <View style={{ flex: 1 }}>
                    <KitText t="body" color={roles.text}>{STAT_LABEL[k]}</KitText>
                    {top ? <KitText t="tag" color={roles.perfectionText ?? roles.text}>{top}</KitText> : null}
                  </View>
                  <KitText t="figure" color={roles.text} style={styles.num}>{v == null ? '–' : String(v)}</KitText>
                  <KitText t="figure" color={roles.textMuted} style={styles.rank}>{r ? `${ordinal(r.rank)} of ${r.of}` : '–'}</KitText>
                </View>
              )
            })}
          </View>

          {log.length > 1 && (
            <View style={styles.section}>
              <SectionTag roles={roles}>Rating, match by match</SectionTag>
              <Trend values={log.map(e => e.line.rating)} />
            </View>
          )}
        </>
      )}

      <View style={styles.section}>
        <SectionTag roles={roles}>Matches</SectionTag>
        {data.missing.includes('match-by-match detail') ? (
          <KitText t="body" color={roles.textMuted}>Saved runs don't keep match-by-match detail. The season totals above are complete.</KitText>
        ) : log.length === 0 ? (
          <KitText t="body" color={roles.textMuted}>No matches.</KitText>
        ) : log.map((e, i) => {
          const m = data.matches?.find(x => x.label === e.label && (e.isHome ? x.awayClubName : x.homeClubName) === e.opponentName)
          const res = e.goalsFor > e.goalsAgainst ? 'W' : e.goalsFor < e.goalsAgainst ? 'L' : 'D'
          const l = e.line
          return (
            <Pressable key={i} disabled={!m} onPress={() => m && openRunMatch(data, m)} accessibilityRole="button"
              accessibilityLabel={`${e.label}, ${e.isHome ? 'v' : 'at'} ${e.opponentName}, ${e.goalsFor}–${e.goalsAgainst}, rating ${l.rating}`}
              style={({ pressed }) => [styles.match, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
              <View style={{ flex: 1 }}>
                <KitText t="tag" color={roles.textMuted}>{e.label}</KitText>
                <KitText t="body" color={roles.text} numberOfLines={1}>{`${e.isHome ? 'v' : 'at'} ${e.opponentName}`}</KitText>
                <KitText t="tag" color={roles.textMuted}>
                  {[`${l.minutes}'`, l.goals ? `${l.goals}G` : '', l.assists ? `${l.assists}A` : '', l.yellowCard ? 'YC' : '', l.redCard ? 'RC' : '', l.injured ? 'INJ' : ''].filter(Boolean).join(' · ')}
                </KitText>
              </View>
              <Tag roles={roles} variant={res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss'}>{`${res} ${e.goalsFor}–${e.goalsAgainst}`}</Tag>
              {l.minutes > 0 && (
                <View style={[styles.rating, { backgroundColor: ratingColor(l.rating) }]}>
                  <KitText t="figure" color={prim.ink}>{l.rating.toFixed(1)}</KitText>
                </View>
              )}
              {m && <Icon name="chevron" size={16} color={roles.textMuted} />}
            </Pressable>
          )
        })}
      </View>
    </KitScreen>
  )
}

function Big({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.big}>
      <KitText t="figureL" color={tint ?? roles.text}>{value}</KitText>
      <KitText t="tag" color={roles.textMuted}>{label}</KitText>
    </View>
  )
}

// The one graph a player page earns: his rating across the run, the 6.0 and
// 7.0 lines drawn so "good" and "poor" read without a legend.
function Trend({ values }: { values: number[] }) {
  const w = 320, h = 90, lo = 4.5, hi = 10
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 12) + 6)
  const y = (v: number) => h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (h - 10) - 5
  return (
    <View style={styles.trend} accessible accessibilityLabel={`Ratings from ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)}`}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
        <Line x1={0} y1={y(6)} x2={w} y2={y(6)} stroke={prim.ruleNylon} strokeWidth={1} />
        <Line x1={0} y1={y(7)} x2={w} y2={y(7)} stroke={prim.ruleNylon} strokeWidth={1} strokeDasharray="4 4" />
        <Polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={prim.cotton} strokeWidth={1.5} />
        {values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={2.4} fill={ratingColor(v)} />)}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { gap: space[2], marginTop: space[2] },
  headMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  link: { textDecorationLine: 'underline' },
  bigRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4], marginVertical: space[4] },
  big: { minWidth: 72 },
  section: { gap: space[2], marginBottom: space[5] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40, borderBottomWidth: border.hair },
  rowHead: { borderBottomWidth: border.thin, minHeight: 28 },
  num: { width: 64, textAlign: 'right' },
  rank: { width: 96, textAlign: 'right' },
  trend: { borderWidth: border.thin, borderColor: roles.rule, paddingVertical: space[1] },
  match: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, paddingVertical: space[1], borderBottomWidth: border.hair },
  rating: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
})

export type { PlayerStatLine }
