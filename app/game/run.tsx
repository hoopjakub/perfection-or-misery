import React, { useMemo, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { ROLES, space, border, prim, ratingColor } from '@/theme'
import { KitScreen, KitText, Tag, SectionTag, BackControl, EmptyState, InlineError, Icon, Field, Chips } from '@/components/kit'
import { SegmentSwitch, SeasonStrip, TieRow, PositionGraph, type Mark, type TieVM } from '@/components/season/SeasonParts'
import type { RunMatch } from '@/engine/run-stats'
import { useRunData, type RunData } from '@/lib/runData'
import { useSizeClass } from '@/hooks/useSizeClass'
import { WebKeys } from '@/lib/webKeys'
import { openPlayer, openClub, openStory, openRunMatch } from '@/lib/runNav'
import { storyText } from '@/engine/press'
import {
  STAT_LABEL, PER90_MIN_MINUTES, RATING_MIN_MATCHES, canPer90, eligible, per90, value,
  positionRanks, percentileTag, type StatKey,
} from '@/engine/run-aggregates'
import type { PlayerStatLine } from '@/types/stats'

// D2 · The run hub (docs/ui-overhaul/07d). Everything about one run on one
// route, in tabs: the table, your season, the stats boards (D3), the press and
// your squad. It replaces the old stats screen and its three modals — every
// name here is a link to its own page, so any player, club, match or story is
// two taps from the hub.
const roles = ROLES.nylon
type Tab = 'table' | 'bracket' | 'season' | 'stats' | 'press' | 'squad'

// D3 — the boards, in families so twenty-one columns aren't one long chip row.
const FAMILIES: { id: string; label: string; keys: StatKey[] }[] = [
  { id: 'att', label: 'Attack', keys: ['goals', 'shots', 'shotsOnTarget', 'dribbles'] },
  { id: 'cre', label: 'Creation', keys: ['assists', 'chancesCreated', 'bigChancesCreated', 'accuratePasses'] },
  { id: 'def', label: 'Defence', keys: ['tacklesWon', 'interceptions', 'clearances', 'blocks', 'duelsWon'] },
  { id: 'gk', label: 'Keeping', keys: ['saves', 'cleanSheets'] },
  { id: 'form', label: 'Form', keys: ['avgRating', 'potm'] },
  { id: 'disc', label: 'Discipline', keys: ['fouls', 'yellowCards', 'redCards'] },
]
const BOARD_ROWS = 50   // ponytail: a fixed cut; search reaches everyone below it

export default function RunHub() {
  const params = useLocalSearchParams<{ runId?: string; tab?: Tab }>()
  const { data, loading, failed, retry } = useRunData(params.runId)
  const [tab, setTab] = useState<Tab>(params.tab ?? 'table')
  const wide = useSizeClass() === 'expanded'

  if (loading) return <KitScreen ground="nylon"><BackControl roles={roles} /><KitText t="bodyL" color={roles.textMuted}>Reading the run.</KitText></KitScreen>
  if (failed || !data) return <KitScreen ground="nylon"><BackControl roles={roles} /><InlineError roles={roles} message="This run's numbers couldn't be read." onRetry={retry} /></KitScreen>

  const pick = (t: Tab) => { setTab(t); router.setParams({ tab: t } as never) }   // survives a reload on web
  const tabs: { id: Tab; label: string }[] = [
    { id: 'table', label: data.mode === 'world_cup' ? 'Groups' : 'Table' },
    ...(knockoutRounds(data.matches).length ? [{ id: 'bracket' as Tab, label: 'Bracket' }] : []),
    ...(data.matches?.length && data.playerClubId ? [{ id: 'season' as Tab, label: 'Season' }] : []),
    { id: 'stats', label: 'Stats' },
    ...(data.press.length ? [{ id: 'press' as Tab, label: 'Press' }] : []),
    { id: 'squad', label: 'Squad' },
  ]

  const body = (
    <>
      {data.missing.length > 0 && (
        <KitText t="body" color={roles.textMuted} style={{ marginBottom: space[2] }}>{`A saved run doesn't keep ${data.missing.join(', ')}.`}</KitText>
      )}
      {tab === 'table' && <TableTab data={data} runId={params.runId} />}
      {tab === 'bracket' && <BracketTab data={data} />}
      {tab === 'season' && <SeasonTab data={data} />}
      {tab === 'stats' && <StatsTab data={data} runId={params.runId} />}
      {tab === 'press' && <PressTab data={data} />}
      {tab === 'squad' && <SquadTab data={data} runId={params.runId} />}
    </>
  )

  // Expanded (≥1024, 10-ADAPT §2.2): the tabs become a left column inside the
  // content, so the table or a board gets the full width beside them.
  return (
    <KitScreen ground="nylon" width={wide ? 'wide' : 'column'}>
      <PageMeta title="The run" description="One run's table, bracket, season, stats, press and squad." path="/game/run" />
      <WebKeys onKey={k => { const n = Number(k); if (n >= 1 && n <= tabs.length) pick(tabs[n - 1].id) }} />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={{ marginTop: space[2] }}>THE RUN</KitText>
      {wide ? (
        <View style={styles.wide}>
          <View style={styles.side} accessibilityRole="tablist">
            {tabs.map((t, i) => (
              <Pressable key={t.id} onPress={() => pick(t.id)} accessibilityRole="tab" accessibilityState={{ selected: t.id === tab }}
                style={({ pressed, hovered }: any) => [styles.sideTab, { borderLeftColor: t.id === tab ? prim.orange : 'transparent' }, (pressed || hovered) && { backgroundColor: roles.surface }]}>
                <KitText t="tag" color={t.id === tab ? roles.text : roles.textMuted}>{`${i + 1}  ${t.label}`}</KitText>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: space[3] }}>
            <SegmentSwitch<Tab> roles={roles} value={tab} onChange={pick} options={tabs} />
          </ScrollView>
          {body}
        </>
      )}
    </KitScreen>
  )
}

// ── TABLE / GROUPS ───────────────────────────────────────────────────────────
function TableTab({ data, runId }: { data: RunData; runId?: string }) {
  if (!data.table.length) return <EmptyState roles={roles} title="No table" body="This run didn't keep its final table." />
  const groups = [...new Set(data.table.map(r => r.group ?? ''))]
  return (
    <View style={styles.section}>
      {groups.map(g => (
        <View key={g || 'all'} style={styles.section}>
          {g ? <SectionTag roles={roles}>{`Group ${g}`}</SectionTag> : null}
          <View style={[styles.row, { borderBottomColor: roles.line }]}>
            <KitText t="tag" color={roles.textMuted} style={styles.pos}>#</KitText>
            <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Club</KitText>
            {['P', 'W', 'D', 'L', 'GD', 'Pts'].map(h => <KitText key={h} t="tag" color={roles.textMuted} style={styles.col}>{h}</KitText>)}
          </View>
          {data.table.filter(r => (r.group ?? '') === g).map(r => (
            <Pressable key={r.clubId} onPress={() => openClub(r.clubId, runId)} accessibilityRole="link"
              style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.surface }, pressed && { backgroundColor: roles.sunken }]}>
              <KitText t="figure" color={roles.textMuted} style={styles.pos}>{String(r.position)}</KitText>
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{r.clubName}</KitText>
              {[r.played, r.won, r.drawn, r.lost].map((n, i) => <KitText key={i} t="figure" color={roles.textMuted} style={styles.col}>{String(n)}</KitText>)}
              <KitText t="figure" color={roles.textMuted} style={styles.col}>{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : String(r.gf - r.ga)}</KitText>
              <KitText t="figure" color={roles.text} style={styles.col}>{String(r.points)}</KitText>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  )
}

// ── BRACKET: the knockout rounds, as ties ───────────────────────────────────
// Rebuilt from the run's match list: a match whose label isn't a league-phase,
// group or qualifying game is a knockout leg, its round is the label before
// " · ", and a two-legged tie is the pair of legs between the same two clubs.
const NOT_KNOCKOUT = /^(League Phase|Group|Matchday|Qualifying)/

type Tie = { round: string; legs: RunMatch[] }
function knockoutRounds(matches: RunMatch[] | null): { round: string; ties: Tie[] }[] {
  const rounds: { round: string; ties: Tie[] }[] = []
  for (const m of matches ?? []) {
    if (!m.label || NOT_KNOCKOUT.test(m.label)) continue
    const round = m.label.split(' · ')[0]
    let r = rounds.find(x => x.round === round)
    if (!r) rounds.push(r = { round, ties: [] })
    const pair = r.ties.find(t => t.legs.length === 1 && t.legs[0].homeClubId === m.awayClubId && t.legs[0].awayClubId === m.homeClubId)
    if (pair && /Leg 2/.test(m.label)) pair.legs.push(m)
    else r.ties.push({ round, legs: [m] })
  }
  return rounds
}

function tieVM(data: RunData, t: Tie, later: Set<string>): TieVM {
  const [l1, l2] = t.legs
  const a = l1.homeClubId, b = l1.awayClubId
  const aGoals = l1.homeGoals + (l2 ? l2.awayGoals : 0), bGoals = l1.awayGoals + (l2 ? l2.homeGoals : 0)
  // Who went through: whoever plays in a later round; the final (or a tie
  // settled on penalties, which the match list doesn't carry) falls back to goals.
  const winnerIsA = later.has(a) ? true : later.has(b) ? false : aGoals >= bGoals
  const you = data.playerClubId
  return {
    aName: l1.homeClubName, bName: l1.awayClubName,
    score: `${aGoals}–${bGoals}`,
    detail: [l2 ? `Leg 1 ${l1.homeGoals}–${l1.awayGoals} · Leg 2 ${l2.awayGoals}–${l2.homeGoals}` : '', (l2 ?? l1).extraTime ? 'AET' : '', aGoals === bGoals ? 'Penalties' : '']
      .filter(Boolean).join(' · ') || undefined,
    winnerIsA, isPlayerTie: !!you && (a === you || b === you),
    onPress: () => openRunMatch(data, l1),
  }
}

function BracketTab({ data }: { data: RunData }) {
  const rounds = knockoutRounds(data.matches)
  return (
    <View style={styles.section}>
      {rounds.map((r, i) => {
        const later = new Set(rounds.slice(i + 1).flatMap(x => x.ties.flatMap(t => [t.legs[0].homeClubId, t.legs[0].awayClubId])))
        return (
          <View key={r.round} style={styles.section}>
            <SectionTag roles={roles}>{r.round}</SectionTag>
            {r.ties.map((t, k) => <TieRow key={k} roles={roles} tie={tieVM(data, t, later)} />)}
          </View>
        )
      })}
    </View>
  )
}

// ── SEASON: your matches, your form, your position ───────────────────────────
function SeasonTab({ data }: { data: RunData }) {
  const you = data.playerClubId!
  const mine = (data.matches ?? []).filter(m => m.homeClubId === you || m.awayClubId === you)
  const marks: Mark[] = mine.map(m => {
    const d = m.homeClubId === you ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals
    return d > 0 ? 'W' : d < 0 ? 'L' : 'D'
  })
  const pos = data.positions?.get(you)
  return (
    <View style={styles.section}>
      <SectionTag roles={roles}>Form</SectionTag>
      <SeasonStrip roles={roles} marks={marks} total={marks.length} viewing={null}
        onPick={i => { if (i != null && mine[i]) openRunMatch(data, mine[i]) }} />
      {pos && <><SectionTag roles={roles}>Position, matchday by matchday</SectionTag><PositionGraph roles={roles} values={pos} clubs={data.table.length} /></>}
      <SectionTag roles={roles}>Every match</SectionTag>
      {mine.map((m, i) => {
        const home = m.homeClubId === you
        const us = home ? m.homeGoals : m.awayGoals, them = home ? m.awayGoals : m.homeGoals
        return (
          <Pressable key={i} onPress={() => openRunMatch(data, m)} accessibilityRole="button"
            style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
            <View style={{ flex: 1 }}>
              {m.label ? <KitText t="tag" color={roles.textMuted}>{m.label}</KitText> : null}
              <KitText t="body" color={roles.text} numberOfLines={1}>{`${home ? 'v' : 'at'} ${home ? m.awayClubName : m.homeClubName}`}</KitText>
            </View>
            <Tag roles={roles} variant={marks[i] === 'W' ? 'win' : marks[i] === 'D' ? 'draw' : 'loss'}>{`${marks[i]} ${us}–${them}`}</Tag>
            <Icon name="chevron" size={16} color={roles.textMuted} />
          </Pressable>
        )
      })}
    </View>
  )
}

// ── STATS: the D3 boards ─────────────────────────────────────────────────────
function StatsTab({ data, runId }: { data: RunData; runId?: string }) {
  const [family, setFamily] = useState(FAMILIES[0].id)
  const [key, setKey] = useState<StatKey>('goals')
  const [mode, setMode] = useState<'total' | 'per90'>('total')
  const [query, setQuery] = useState('')
  const players = data.stats.players
  const hasMinutes = players.some(p => (p.minutes ?? 0) > 0)   // runs saved before minutes existed
  const m = canPer90(key) && hasMinutes ? mode : 'total'
  const ranks = useMemo(() => positionRanks(players, key, m), [players, key, m])

  const score = (p: PlayerStatLine) => (m === 'per90' ? per90(p, key) ?? 0 : value(p, key))
  const q = query.trim().toLowerCase()
  const list = q
    ? players.filter(p => p.name.toLowerCase().includes(q))
    : players.filter(p => eligible(p, key, m) && score(p) > 0)
  const board = [...list].sort((a, b) => score(b) - score(a)).slice(0, q ? 25 : BOARD_ROWS)
  const fmt = (p: PlayerStatLine) => key === 'avgRating' ? (p.avgRating ?? 0).toFixed(2) : m === 'per90' ? (per90(p, key)?.toFixed(2) ?? '—') : String(value(p, key))
  const fam = FAMILIES.find(f => f.id === family)!

  return (
    <View style={styles.section}>
      <Field roles={roles} label={`Search ${players.length} players`} value={query} onChangeText={setQuery} autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <SegmentSwitch roles={roles} value={family} onChange={f => { setFamily(f); setKey(FAMILIES.find(x => x.id === f)!.keys[0]) }}
          options={FAMILIES.map(f => ({ id: f.id, label: f.label }))} />
      </ScrollView>
      <Chips<StatKey> roles={roles} options={fam.keys.map(k => ({ id: k, label: STAT_LABEL[k] }))} value={key} onChange={setKey} />
      {canPer90(key) && hasMinutes && (
        <SegmentSwitch roles={roles} value={mode} onChange={setMode}
          options={[{ id: 'total', label: 'Total' }, { id: 'per90', label: 'Per 90' }]} />
      )}
      <KitText t="tag" color={roles.textMuted}>
        {key === 'avgRating' ? `${RATING_MIN_MATCHES}+ rated matches to qualify`
          : m === 'per90' ? `${PER90_MIN_MINUTES}+ minutes to qualify` : `${list.length} players`}
      </KitText>
      {board.length === 0 ? <KitText t="body" color={roles.textMuted}>Nobody.</KitText> : board.map((p, i) => {
        const tag = percentileTag(p, ranks.get(p.playerId))
        return (
          <Pressable key={p.playerId} onPress={() => openPlayer(p.playerId, runId)} accessibilityRole="link"
            style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, p.isPlayerClub && { backgroundColor: roles.surface }, pressed && { backgroundColor: roles.sunken }]}>
            <KitText t="figure" color={roles.textMuted} style={styles.pos}>{q ? '' : String(i + 1)}</KitText>
            <View style={{ flex: 1 }}>
              <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
              <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`${p.isPlayerClub ? 'Your XI' : p.clubName} · ${p.position}`}</KitText>
            </View>
            {tag && <Tag roles={roles} variant="win">{tag}</Tag>}
            {key === 'avgRating'
              ? <View style={[styles.rating, { backgroundColor: ratingColor(p.avgRating ?? 0) }]}><KitText t="figure" color={prim.ink}>{fmt(p)}</KitText></View>
              : <KitText t="figure" color={roles.text} style={styles.val}>{fmt(p)}</KitText>}
          </Pressable>
        )
      })}
    </View>
  )
}

// ── PRESS ────────────────────────────────────────────────────────────────────
function PressTab({ data }: { data: RunData }) {
  return (
    <View style={styles.section}>
      {[...data.press].reverse().map(s => (
        <Pressable key={s.id} onPress={() => openStory(s.id)} accessibilityRole="link"
          style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="tag" color={roles.textMuted} style={styles.md}>{`MD ${s.matchday}`}</KitText>
          <KitText t="body" color={roles.text} style={{ flex: 1 }}>{storyText(s).headline}</KitText>
          {s.involvesPlayer && <Tag roles={roles} variant="you">YOU</Tag>}
          <Icon name="chevron" size={16} color={roles.textMuted} />
        </Pressable>
      ))}
    </View>
  )
}

// ── SQUAD: your players ──────────────────────────────────────────────────────
function SquadTab({ data, runId }: { data: RunData; runId?: string }) {
  const mine = data.stats.players.filter(p => p.isPlayerClub).sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  if (!mine.length) return <EmptyState roles={roles} title="No squad" body="This run didn't keep your players' numbers." />
  return (
    <View style={styles.section}>
      {mine.map(p => (
        <Pressable key={p.playerId} onPress={() => openPlayer(p.playerId, runId)} accessibilityRole="link"
          style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="tag" color={roles.textMuted} style={styles.md}>{p.position}</KitText>
          <View style={{ flex: 1 }}>
            <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
            <KitText t="tag" color={roles.textMuted}>{`${p.isBench ? 'SUB · ' : ''}${p.matchesRated ?? p.matchesPlayed ?? 0} apps · ${p.goals}G ${p.assists}A${p.potm ? ` · ${p.potm} MOTM` : ''}`}</KitText>
          </View>
          {p.avgRating != null
            ? <View style={[styles.rating, { backgroundColor: ratingColor(p.avgRating) }]}><KitText t="figure" color={prim.ink}>{p.avgRating.toFixed(1)}</KitText></View>
            : null}
          <Icon name="chevron" size={16} color={roles.textMuted} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space[2], marginTop: space[2] },
  wide: { flexDirection: 'row', gap: space[5], marginTop: space[4], alignItems: 'flex-start' },
  side: { width: 180, gap: 2 },
  sideTab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3], borderLeftWidth: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair },
  tall: { minHeight: 56 },
  pos: { width: 28, textAlign: 'right' },
  col: { width: 30, textAlign: 'right' },
  md: { width: 44 },
  val: { minWidth: 48, textAlign: 'right' },
  rating: { minWidth: 40, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center' },
})
