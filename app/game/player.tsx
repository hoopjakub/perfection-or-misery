import React, { useMemo, useRef, useState } from 'react'
import { forCompetition } from '@/data/modes'
import { LineGraph, ComparePicker, type GraphSeries } from '@/components/season/SeasonParts'
import { PageMeta } from '@/components/PageMeta'
import { View, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ROLES, space, border, prim, ratingColor, formatRating } from '@/theme'
import { KitScreen, KitText, Tag, SectionTag, Chips, BackControl, EmptyState, InlineError, Icon, Plate, RatingSquare, EventMark, VenueMark, TeamMark } from '@/components/kit'
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
  // P8-95: players to compare against — his teammates first, then the best
  // rated elsewhere — each drawn from their own match log.
  const [picked, setPicked] = useState<string[]>([])
  const compareOptions = useMemo(() => {
    const me = data?.stats.players.find(x => x.playerId === id)
    return (data?.stats.players ?? [])
      // Anyone with a match to draw. It was the top thirty with two or more,
      // so most of the run's players were never offered (the search finds them).
      .filter(x => x.playerId !== id && (data?.matchLog?.get(x.playerId)?.length ?? 0) > 0)
      .sort((a, b) => Number(b.clubName === me?.clubName) - Number(a.clubName === me?.clubName) || (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .map(x => ({ id: x.playerId, label: x.name }))
  }, [data, id])
  const compare: GraphSeries[] = picked.map(pid => ({
    key: pid, label: data?.stats.players.find(x => x.playerId === pid)?.name ?? pid,
    values: (data?.matchLog?.get(pid) ?? []).map(e => e.line.rating),
  }))
  const line = p ? lineOf(p.position) : 'MID'
  const keys = ROWS_BY_LINE[line]

  const ranks = useMemo(() => {
    if (!data) return new Map<StatKey, ReturnType<typeof positionRanks>>()
    return new Map(keys.map(k => [k, positionRanks(data.stats.players, k, mode)] as const))
  }, [data, mode, line])

  // His honours from the run's awards, measured the same way Awards Night was.
  const honours = useMemo(() => {
    if (!data || !p || ceremony === '1') return []
    const night = buildAwardsNight({ awards: data.awards, stats: data.stats, rounds: data.rounds ?? undefined, mode: data.mode })
    const out: string[] = []
    const all = [night.playerOfTheSeason, night.bestU21, ...night.players].filter(Boolean) as NonNullable<typeof night.playerOfTheSeason>[]
    for (const a of all) {
      if (a.winner.playerId === p.playerId) out.push(a.title.toUpperCase())
      const ru = a.runnersUp.findIndex(c => c.playerId === p.playerId)
      if (ru >= 0) out.push(`${a.title.toUpperCase()} · ${ordinal(ru + 2)}`)
    }
    if (night.teamOfTheSeason?.xi.some(x => x.player.id === p.playerId)) out.push(forCompetition('TEAM OF THE SEASON', data?.mode))
    const totm = night.teamsOfTheRound.filter(r => r.team.xi.some(x => x.player.id === p.playerId)).length
    if (totm) out.push(`TEAM OF THE MATCHDAY ×${totm}`)
    return out
  }, [data, p, ceremony])

  // P8-66 — tapping a point on the rating graph slides down to that match and
  // opens it in place. Rows report where they sit; the screen scrolls there.
  const scrollRef = useRef<ScrollView>(null)
  const matchesY = useRef(0)
  const rowY = useRef<Record<number, number>>({})
  const [openRow, setOpenRow] = useState<number | null>(null)
  const slideTo = (i: number) => {
    setOpenRow(i)
    scrollRef.current?.scrollTo({ y: Math.max(0, matchesY.current + (rowY.current[i] ?? 0) - 96), animated: true })
  }

  if (loading) {
    return (
      <KitScreen ground="nylon">
        <BackControl roles={roles} />
        <KitText t="bodyL" color={roles.textMuted}>Reading the run.</KitText>
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
    <KitScreen ground="nylon" scrollRef={scrollRef}>
      <PageMeta title={p.name} description={forCompetition(`${p.name}'s season in a Perfection or Misery run.`, data.mode)} />
      <BackControl roles={roles} />

      {/* The player as a tag. */}
      <View style={styles.head}>
        <KitText t="superL" color={roles.text}>{p.name.toUpperCase()}</KitText>
        <View style={styles.headMeta}>
          <Tag roles={roles}>{p.position}</Tag>
          {/* P8-171: his club's crest (a nation's flag at the World Cup) beside its name. */}
          <Pressable onPress={() => openClub(p.clubId, runId)} accessibilityRole="link" hitSlop={8} style={styles.clubLink}>
            <TeamMark roles={roles} clubId={p.clubId} name={p.clubName} size={16} />
            <KitText t="tag" color={roles.text} style={styles.link}>{p.clubName}</KitText>
          </Pressable>
          <KitText t="tag" color={roles.textMuted}>{p.seasonLabel}</KitText>
          {p.isPlayerClub && <Tag roles={roles} variant="you">DRAFTED BY YOU</Tag>}
        </View>
      </View>

      {/* The two numbers a season is read by first, and the minutes behind them. */}
      <View style={styles.bigRow}>
        <View style={styles.big}>
          {p.avgRating != null ? <RatingSquare value={p.avgRating} decimals={2} /> : <KitText t="figureL" color={roles.text}>–</KitText>}
          <KitText t="tag" color={roles.textMuted}>Average rating</KitText>
        </View>
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
              <SectionTag roles={roles}>{forCompetition('Season', data.mode)}</SectionTag>
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
              <Trend values={log.map(e => e.line.rating)} onPoint={slideTo} selected={openRow} compare={compare} />
              {/* P8-95: other players' ratings beside his, teammates first. */}
              <ComparePicker roles={roles} selected={picked} onChange={setPicked} options={compareOptions} />
            </View>
          )}
        </>
      )}

      <View style={styles.section} onLayout={e => { matchesY.current = e.nativeEvent.layout.y }}>
        <SectionTag roles={roles}>Matches</SectionTag>
        {data.missing.includes('match-by-match detail') ? (
          <KitText t="body" color={roles.textMuted}>{forCompetition("Saved runs don't keep match-by-match detail. The season totals above are complete.", data.mode)}</KitText>
        ) : log.length === 0 ? (
          <KitText t="body" color={roles.textMuted}>No matches.</KitText>
        ) : log.map((e, i) => {
          const m = data.matches?.find(x => x.label === e.label && (e.isHome ? x.awayClubName : x.homeClubName) === e.opponentName)
          const res = e.goalsFor > e.goalsAgainst ? 'W' : e.goalsFor < e.goalsAgainst ? 'L' : 'D'
          const l = e.line
          return (
            <View key={i} onLayout={ev => { rowY.current[i] = ev.nativeEvent.layout.y }}>
            <Pressable onPress={() => setOpenRow(o => (o === i ? null : i))} accessibilityRole="button"
              accessibilityState={{ expanded: openRow === i }}
              accessibilityLabel={`${e.label}, ${e.isHome ? 'v' : 'at'} ${e.opponentName}, ${e.goalsFor}–${e.goalsAgainst}, rating ${l.rating}`}
              style={({ pressed }) => [styles.match, { borderBottomColor: roles.rule }, openRow === i && { backgroundColor: roles.surface, borderLeftColor: roles.you, borderLeftWidth: 3 }, pressed && { backgroundColor: roles.sunken }]}>
              <View style={{ flex: 1 }}>
                <KitText t="tag" color={roles.textMuted}>{e.label}</KitText>
                {/* P8-134: home or away as the mark, the opponent's name beside it. */}
                <View style={styles.opp}>
                  <VenueMark roles={roles} home={e.isHome} />
                  <KitText t="body" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{e.opponentName}</KitText>
                </View>
                <View style={styles.marks}>
                  <KitText t="tag" color={roles.textMuted}>{`${l.minutes}'`}</KitText>
                  {l.goals > 0 && <EventMark kind="goal" count={l.goals} size={12} />}
                  {l.assists > 0 && <EventMark kind="assist" count={l.assists} size={12} />}
                  {l.yellowCard && !l.redCard && <EventMark kind="yellow" size={11} />}
                  {l.redCard && <EventMark kind="red" size={11} />}
                  {l.injured && <EventMark kind="injury" size={12} />}
                  {l.motm && <EventMark kind="motm" size={12} />}
                </View>
              </View>
              <Tag roles={roles} variant={res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss'}>{`${res} ${e.goalsFor}–${e.goalsAgainst}`}</Tag>
              {l.minutes > 0 && (
                <RatingSquare value={l.rating} />
              )}
              <Icon name="chevron" size={16} color={roles.textMuted} />
            </Pressable>
            {/* Opened in place (P8-66): that match's line, and the way into the full sheet. */}
            {openRow === i && (
              <View style={[styles.opened, { borderBottomColor: roles.rule, borderLeftColor: roles.you }]}>
                <View style={styles.openedFigures}>
                  {([['Minutes', `${l.minutes}'`], ['Goals', l.goals], ['Assists', l.assists], ['Shots', l.shots], ['Chances created', l.keyPasses], ['Tackles won', l.tacklesWon], ['Rating', formatRating(l.rating)]] as [string, string | number][]).map(([k, v]) => (
                    <View key={k} style={styles.openedFig}>
                      <KitText t="figure" color={roles.text}>{String(v ?? 0)}</KitText>
                      <KitText t="tag" color={roles.textMuted}>{k}</KitText>
                    </View>
                  ))}
                </View>
                {m ? <Plate label="Open the match" icon="forward" variant="secondary" roles={roles} onPress={() => openRunMatch(data, m)} /> : null}
              </View>
            )}
            </View>
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

// The one graph a player page earns: his rating across the run, on the shared
// LineGraph with every reference value written on (P8-66), each point in its
// rating colour. Tapping a point slides the page down to that match.
function Trend({ values, onPoint, selected, compare }: { values: number[]; onPoint: (i: number) => void; selected: number | null; compare?: GraphSeries[] }) {
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
  return (
    <LineGraph roles={roles} values={values} min={3} max={10} fmt={v => formatRating(v)} dot={ratingColor} xLabel="Match"
      onPoint={onPoint} selected={selected} compare={compare}
      legend={`Match rating, match by match · average ${avg.toFixed(2)} · latest ${formatRating(values[values.length - 1])}`} />
  )
}

const styles = StyleSheet.create({
  clubLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  opp: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  opened: { borderBottomWidth: border.hair, borderLeftWidth: 3, paddingHorizontal: space[3], paddingVertical: space[3], gap: space[3] },
  openedFigures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5], rowGap: space[2] },
  openedFig: { minWidth: 56 },
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
  marks: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  match: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, paddingVertical: space[1], borderBottomWidth: border.hair },
  rating: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
})

export type { PlayerStatLine }
