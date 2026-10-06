import { t } from '@/i18n'
// knockoutRun names its ties `t`; `tr` is t() where that shadows it.
const tr = t
import { compareRows } from '@/engine/standings'
import { label } from '@/i18n/labels'
import { isEuropeMode } from '@/data/europe'
import React, { useMemo, useState } from 'react'
import { FormationPitch } from '@/components/season/AwardsParts'
import { buildAwardsNight } from '@/engine/awards'
import { useRunOwner, RunOwnerLine } from '@/components/profile/ProfileParts'
import { ShareLinkPlate } from '@/components/season/VerdictBlock'
import { useGameStore } from '@/store/gameStore'
import { isTournament } from '@/data/competition'
import { PageMeta } from '@/components/PageMeta'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { ROLES, space, border, prim } from '@/theme'
import { KitScreen, KitText, Tag, SectionTag, BackControl, EmptyState, InlineError, Icon, Field, Chips, ClubName, RatingSquare, EventMark } from '@/components/kit'
import { SegmentSwitch, SeasonStrip, PositionCompare, LeagueTable, ResultRow, StoryItem, ZoneLegend, leagueTableZones, tieDetail, CL_PHASE_ZONES, WC_GROUP_ZONES, WC_THIRD_ZONES, type Mark, type TableZone, type TableRowVM } from '@/components/season/SeasonParts'
import { runTie } from '@/engine/stages'
import { BracketTree, type BracketTie } from '@/components/BracketTree'
import { zonesFor } from '@/data/qualification-bands'
import { getFlag } from '@/lib/flagMap'
import type { RunMatch } from '@/engine/run-stats'
import { useRunData, type RunData } from '@/lib/runData'
import { PunditsTab, CupTab, EuropeTab, Grounds, hasPundits, hasEurope } from '@/components/season/RunMore'
import { LineupPitch } from '@/components/LineupPitch'
import { MedicalTable } from '@/components/MedicalTable'
import { useSizeClass } from '@/hooks/useSizeClass'
import { WebKeys } from '@/lib/webKeys'
import { openPlayer, openClub, openStory, openRunMatch } from '@/lib/runNav'
import { summariseScorers } from '@/engine/run-stats'
import {
  STAT_LABEL, PER90_MIN_MINUTES, RATING_MIN_MATCHES, canPer90, eligible, per90, value,
  positionRanks, percentileTag, type StatKey,
} from '@/engine/run-aggregates'
import type { PlayerStatLine, TeamGoalRecord } from '@/types/stats'
import { EVERYDAY } from '@/lib/appearance'

// D2 · The run hub (docs/ui-overhaul/07d). Everything about one run on one
// route, in tabs: the table, your season, the stats boards (D3), the press and
// your squad. It replaces the old stats screen and its three modals — every
// name here is a link to its own page, so any player, club, match or story is
// two taps from the hub.
const roles = ROLES[EVERYDAY]
// Wave F (step 6): Pundits, Cup and Europe hold what left the result screen.
type Tab = 'table' | 'bracket' | 'season' | 'cup' | 'teams' | 'stats' | 'press' | 'pundits' | 'europe' | 'squad'

// D3 — the boards, in families so twenty-one columns aren't one long chip row.
const FAMILIES: { id: string; label: string; keys: StatKey[] }[] = [
  { id: 'att', label: t('hub.famAtt'), keys: ['goals', 'shots', 'shotsOnTarget', 'dribbles'] },
  { id: 'cre', label: t('hub.famCre'), keys: ['assists', 'chancesCreated', 'bigChancesCreated', 'accuratePasses'] },
  { id: 'def', label: t('hub.famDef'), keys: ['tacklesWon', 'interceptions', 'clearances', 'blocks', 'duelsWon'] },
  { id: 'gk', label: t('hub.famGk'), keys: ['saves', 'cleanSheets'] },
  { id: 'form', label: t('hub.famForm'), keys: ['avgRating', 'potm'] },
  { id: 'disc', label: t('hub.famDisc'), keys: ['fouls', 'yellowCards', 'redCards'] },
]
// P8-80: a board lists everyone who qualifies, not a top 50.
// ponytail: plain rows, not a virtualised list; Phase 9 moves long lists to FlatList.

// Club boards (P8-80), from the club totals the run's stats pass keeps. `avg`
// divides by matches (possession, pass accuracy); `low` ranks the smallest
// first (fewest conceded). `sheet` marks the ones only newer runs have.
type ClubStat = { id: string; label: string; get: (t: TeamGoalRecord) => number | undefined; fmt?: (v: number) => string; low?: boolean; sheet?: boolean }
const perMatch = (sum?: number, n?: number) => (sum != null && n ? sum / n : undefined)
// Labels come from hub.club.<id>, filled in below.
const CLUB_STATS: ClubStat[] = ([
  { id: 'gf', label: 'Goals', get: t => t.goalsFor },
  { id: 'ga', label: 'Conceded', get: t => t.goalsAgainst, low: true },
  { id: 'gd', label: 'Goal difference', get: t => t.goalsFor - t.goalsAgainst, fmt: v => (v > 0 ? `+${v}` : String(v)) },
  { id: 'cs', label: 'Clean sheets', get: t => t.cleanSheets },
  { id: 'xg', label: 'xG', get: t => t.xg, fmt: v => v.toFixed(1), sheet: true },
  { id: 'xga', label: 'xG against', get: t => t.xgAgainst, fmt: v => v.toFixed(1), low: true, sheet: true },
  { id: 'pos', label: 'Possession', get: t => perMatch(t.possessionSum, t.matches), fmt: v => `${v.toFixed(1)}%`, sheet: true },
  { id: 'shots', label: 'Shots', get: t => t.shots, sheet: true },
  { id: 'sot', label: 'Shots on target', get: t => t.shotsOnTarget, sheet: true },
  { id: 'big', label: 'Big chances', get: t => t.bigChances, sheet: true },
  { id: 'pass', label: 'Pass accuracy', get: t => perMatch(t.passAccuracySum, t.matches), fmt: v => `${v.toFixed(1)}%`, sheet: true },
  { id: 'corners', label: 'Corners', get: t => t.corners, sheet: true },
  { id: 'fouls', label: 'Fouls', get: t => t.fouls, low: true, sheet: true },
  { id: 'yc', label: 'Yellow cards', get: t => t.yellowCards, low: true, sheet: true },
  { id: 'rc', label: 'Red cards', get: t => t.redCards, low: true, sheet: true },
] as ClubStat[]).map(c => ({ ...c, label: t(`hub.club.${c.id}` as 'hub.club.gf') }))

function ClubBoards({ data, runId }: { data: RunData; runId?: string }) {
  const teams = data.stats.teams
  const hasSheets = teams.some(t => t.matches != null)
  const stats = CLUB_STATS.filter(c => hasSheets || !c.sheet)
  const [id, setId] = useState(stats[0].id)
  const stat = stats.find(c => c.id === id) ?? stats[0]
  const rows = teams
    .map(t => ({ t, v: stat.get(t) }))
    .filter((r): r is { t: TeamGoalRecord; v: number } => r.v != null)
    .sort((a, b) => (stat.low ? a.v - b.v : b.v - a.v) || a.t.clubName.localeCompare(b.t.clubName))
  return (
    <View style={styles.section}>
      <Chips roles={roles} options={stats.map(c => ({ id: c.id, label: c.label }))} value={stat.id} onChange={setId} />
      <KitText t="tag" color={roles.textMuted}>
        {t('hub.clubsCount', { count: rows.length }) + (stat.low ? t('hub.fewestFirst') : '') + (hasSheets ? '' : t('hub.oldClubNumbers'))}
      </KitText>
      {rows.map(({ t: team, v }, i) => (
        <Pressable key={team.clubId} onPress={() => openClub(team.clubId, runId)} accessibilityRole="link"
          style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, team.clubId === data.playerClubId && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="figure" color={roles.textMuted} style={styles.pos}>{String(i + 1)}</KitText>
          <ClubName roles={roles} clubId={team.clubId} name={team.clubName} size={16} style={{ flex: 1 }} />
          <KitText t="figure" color={roles.text} style={styles.val}>{stat.fmt ? stat.fmt(v) : String(v)}</KitText>
        </Pressable>
      ))}
    </View>
  )
}

export default function RunHub() {
  const params = useLocalSearchParams<{ runId?: string; tab?: Tab }>()
  const { data, loading, failed, retry } = useRunData(params.runId)
  const [tab, setTab] = useState<Tab>(params.tab ?? 'table')
  const wide = useSizeClass() === 'expanded'

  if (loading) return <KitScreen ground={EVERYDAY}><BackControl roles={roles} /><KitText t="bodyL" color={roles.textMuted}>{t('hub.reading')}</KitText></KitScreen>
  if (failed || !data) return <KitScreen ground={EVERYDAY}><BackControl roles={roles} /><InlineError roles={roles} message={t('hub.readFailed')} onRetry={retry} /></KitScreen>

  const pick = (tb: Tab) => { setTab(tb); router.setParams({ tab: tb } as never) }   // survives a reload on web
  const tabs: { id: Tab; label: string }[] = [
    { id: 'table', label: data.mode === 'world_cup' ? t('hub.tabGroups') : t('hub.tabTable') },
    ...(knockoutRun(data).main.length ? [{ id: 'bracket' as Tab, label: t('hub.tabBracket') }] : []),
    ...(data.matches?.length && data.playerClubId ? [{ id: 'season' as Tab, label: isTournament(data.mode) ? t('hub.tabTournament') : t('hub.tabSeason') }] : []),
    ...(data.more.cup ? [{ id: 'cup' as Tab, label: t('hub.tabCup') }] : []),
    ...(data.rounds?.length ? [{ id: 'teams' as Tab, label: t('hub.tabTeams') }] : []),
    { id: 'stats', label: t('hub.tabStats') },
    ...(data.press.length ? [{ id: 'press' as Tab, label: t('hub.tabPress') }] : []),
    ...(hasPundits(data) ? [{ id: 'pundits' as Tab, label: t('hub.tabPundits') }] : []),
    ...(hasEurope(data) ? [{ id: 'europe' as Tab, label: t('hub.tabEurope') }] : []),
    { id: 'squad', label: t('hub.tabSquad') },
  ]

  const body = (
    <>
      {data.missing.length > 0 && (
        <KitText t="body" color={roles.textMuted} style={{ marginBottom: space[2] }}>{t('hub.missing', { what: data.missing.join(', ') })}</KitText>
      )}
      {tab === 'table' && <TableTab data={data} runId={params.runId} />}
      {tab === 'bracket' && <BracketTab data={data} />}
      {tab === 'season' && <SeasonTab data={data} />}
      {tab === 'teams' && <TeamsTab data={data} runId={params.runId} />}
      {tab === 'stats' && <StatsTab data={data} runId={params.runId} />}
      {tab === 'press' && <PressTab data={data} />}
      {tab === 'cup' && <CupTab data={data} />}
      {tab === 'pundits' && <PunditsTab data={data} />}
      {tab === 'europe' && <EuropeTab data={data} />}
      {tab === 'squad' && <SquadTab data={data} runId={params.runId} />}
    </>
  )

  // Expanded (≥1024, 10-ADAPT §2.2): the tabs become a left column inside the
  // content, so the table or a board gets the full width beside them.
  return (
    <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'}>
      <PageMeta title={t('hub.pageTitle')} description={t('hub.pageDesc')} path="/game/run" />
      <WebKeys onKey={k => { if (k === '/') { pick('stats'); return } const n = Number(k); if (n >= 1 && n <= tabs.length) pick(tabs[n - 1].id) }} />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={{ marginTop: space[2] }}>{t('hub.heading')}</KitText>
      {/* P8-89: whose run this is, a tap from their profile. */}
      <HubOwner ownerId={data.ownerId} runId={params.runId} />
      {wide ? (
        <View style={styles.wide}>
          <View style={styles.side} accessibilityRole="tablist">
            {tabs.map((tb, i) => (
              <Pressable key={tb.id} onPress={() => pick(tb.id)} accessibilityRole="tab" accessibilityState={{ selected: tb.id === tab }}
                style={({ pressed, hovered }: any) => [styles.sideTab, { borderLeftColor: tb.id === tab ? prim.orange : 'transparent' }, (pressed || hovered) && { backgroundColor: roles.surface }]}>
                <KitText t="tag" color={tb.id === tab ? roles.text : roles.textMuted}>{`${i + 1}  ${tb.label}`}</KitText>
              </Pressable>
            ))}
          </View>
          {/* A readable measure for tables and boards; wider only spreads the columns apart. */}
          <View style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>{body}</View>
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

function HubOwner({ ownerId, runId }: { ownerId?: string | null; runId?: string }) {
  const owner = useRunOwner(ownerId)
  const savedRunId = useGameStore(s => s.savedRunId)
  const shareText = owner ? (owner.yours ? t('hub.myRun') : t('hub.theirRun', { name: owner.name })) : t('hub.aRun')
  return (
    <>
      <RunOwnerLine roles={roles} owner={owner} />
      {/* P8-121: the run's link, from the hub as well as the verdict. */}
      <ShareLinkPlate roles={roles} runId={runId ?? savedRunId} text={shareText} />
    </>
  )
}

// ── TABLE / GROUPS ───────────────────────────────────────────────────────────
// The places each table marks, the same ones the live screens show (P8-61):
// a World Cup group's IN / 3RD / OUT, the league phase's R16 / PO / OUT, and a
// league's own places (champions, Europe, play-off, relegation) for its season.
function zonesForTable(data: RunData, group: string, n: number, thirdThrough?: boolean): (TableZone | null)[] {
  // P8-79: the run is over, so a group's third place isn't "into the race"
  // any more — it went through as one of the best eight, or it went out.
  if (data.mode === 'world_cup' && group) {
    return WC_GROUP_ZONES.slice(0, n).map((z, i) => (i === 2 && thirdThrough !== undefined ? WC_THIRD_ZONES[thirdThrough ? 0 : 11] : z))
  }
  if (isEuropeMode(data.mode)) return CL_PHASE_ZONES.slice(0, n)
  if (data.leagueId && data.yearStart) return leagueTableZones(zonesFor(data.leagueId, data.yearStart, n))
  return Array(n).fill(null)
}

function TableTab({ data, runId }: { data: RunData; runId?: string }) {
  if (!data.table.length) return <EmptyState roles={roles} title={t('hub.noTable')} body={t('hub.noTableBody')} />
  const groups = [...new Set(data.table.map(r => r.group ?? ''))]
  const wc = data.mode === 'world_cup'
  // P8-79: how far each club got in the knockouts, after its name (QF, WON).
  const reached = knockoutRun(data).reached
  const vm = (r: RunData['table'][number], note?: string): TableRowVM => ({
    clubId: r.clubId, clubName: r.clubName, isPlayer: r.isPlayer, played: r.played, gd: r.gf - r.ga, points: r.points,
    flag: wc ? getFlag(r.clubId) : undefined, note: [note, reached.get(r.clubId)].filter(Boolean).join(' · ') || undefined,
  })
  // The World Cup's third-placed teams, ranked as the tournament ranks them
  // (points, goal difference, goals): the best eight went through.
  const thirds = wc && groups.some(Boolean)
    ? data.table.filter(r => r.position === 3).sort((a, b) => compareRows({ clubId: a.clubId, points: a.points, goalsFor: a.gf, goalsAgainst: a.ga }, { clubId: b.clubId, points: b.points, goalsFor: b.gf, goalsAgainst: b.ga }))
    : []
  const thirdsThrough = new Set(thirds.slice(0, 8).map(r => r.clubId))
  // The same LeagueTable the season and the result screens use (P8-67: one
  // table everywhere), capped to a readable width in the wide layout.
  return (
    <View style={styles.section}>
      {groups.map(g => {
        const rows = data.table.filter(r => (r.group ?? '') === g)
        const third = rows.find(r => r.position === 3)
        const zones = zonesForTable(data, g, rows.length, third && thirds.length ? thirdsThrough.has(third.clubId) : undefined)
        return (
          <View key={g || 'all'} style={styles.section}>
            {g ? <SectionTag roles={roles}>{t('hub.group', { g })}</SectionTag> : null}
            <LeagueTable roles={roles} zones={zones} onRowPress={id => openClub(id, runId)} rows={rows.map(r => vm(r))} />
            {/* One legend under a single table; the groups share one, at the end. */}
            {groups.length === 1 ? <ZoneLegend roles={roles} zones={zones} /> : null}
          </View>
        )
      })}
      {groups.length > 1 ? <ZoneLegend roles={roles} zones={thirds.length ? [WC_GROUP_ZONES[0], WC_THIRD_ZONES[0], WC_GROUP_ZONES[3]] : WC_GROUP_ZONES} /> : null}
      {thirds.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('hub.bestThirds')}</SectionTag>
          <LeagueTable roles={roles} zones={WC_THIRD_ZONES.slice(0, thirds.length)} onRowPress={id => openClub(id, runId)}
            rows={thirds.map(r => vm(r, r.group))} />
          <ZoneLegend roles={roles} zones={WC_THIRD_ZONES} />
        </View>
      )}
    </View>
  )
}

// ── BRACKET: the knockout rounds, as ties ───────────────────────────────────
// Rebuilt from the run's match list: a match whose label isn't a league-phase,
// group or qualifying game is a knockout leg, its round is the label before
// " · ", and a two-legged tie is the pair of legs between the same two clubs.
// Qualifying legs are named per round since P8-100 ("First Qualifying Round",
// "Play-off Round"); older runs say just "Qualifying". Both stay out.
const NOT_KNOCKOUT = /^(League Phase|Group|Matchday|Domestic Season|Qualifying|\w+ Qualifying Round|Play-off Round)/

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

// A tie's aggregate, oriented to the first leg's home side.
function tieGoals(t: Tie) {
  const [l1, l2] = t.legs
  return { a: l1.homeGoals + (l2 ? l2.awayGoals : 0), b: l1.awayGoals + (l2 ? l2.homeGoals : 0) }
}

const THIRD = /3rd|third/i
// The short tag for how far a club got (P8-79), by the round it went out in.
const REACHED: Record<string, string> = { 'Playoff': 'PO', 'Round of 32': 'R32', 'Round of 16': 'R16', 'Quarter-final': 'QF', 'Semi-final': 'SF', 'Final': 'FINAL' }

/** The run's knockout, worked out once: the rounds (the third-place play-off
 *  kept apart, so it can hang under the final), who won each tie, and how far
 *  every club got. Who went through is whoever plays in a later round; the
 *  final and the third-place game (or a tie settled on penalties, which the
 *  match list doesn't carry) fall back to goals. The play-off for third is left
 *  out of "a later round" on purpose: both beaten semi-finalists play in it, so
 *  counting it made side A the winner of every semi-final. */
function knockoutRun(data: RunData) {
  const rounds = knockoutRounds(data.matches)
  const main = rounds.filter(r => !THIRD.test(r.round))
  const third = rounds.find(r => THIRD.test(r.round))
  const winnerIsA = new Map<Tie, boolean>()
  main.forEach((r, i) => {
    const later = new Set(main.slice(i + 1).flatMap(x => x.ties.flatMap(t => [t.legs[0].homeClubId, t.legs[0].awayClubId])))
    for (const t of r.ties) {
      const a = t.legs[0].homeClubId, b = t.legs[0].awayClubId, g = tieGoals(t)
      winnerIsA.set(t, later.has(a) ? true : later.has(b) ? false : g.a >= g.b)
    }
  })
  for (const t of third?.ties ?? []) { const g = tieGoals(t); winnerIsA.set(t, g.a >= g.b) }
  const reached = new Map<string, string>()
  for (const r of main) for (const t of r.ties) {
    const a = t.legs[0].homeClubId, b = t.legs[0].awayClubId
    const code = REACHED[r.round] ? tr(`hub.reached.${REACHED[r.round]}` as 'hub.reached.QF') : label(r.round).toUpperCase()
    reached.set(a, code); reached.set(b, code)
    if (r === main[main.length - 1] && r.round === 'Final') reached.set(winnerIsA.get(t) ? a : b, tr('hub.reached.WON'))
  }
  for (const t of third?.ties ?? []) {
    const a = t.legs[0].homeClubId, b = t.legs[0].awayClubId
    reached.set(winnerIsA.get(t) ? a : b, tr('hub.reached.third')); reached.set(winnerIsA.get(t) ? b : a, tr('hub.reached.fourth'))
  }
  return { main, third, winnerIsA, reached }
}

function bracketTie(data: RunData, t: Tie, winnerIsA: boolean): BracketTie {
  const [l1, l2] = t.legs
  const g = tieGoals(t)
  return {
    a: { clubId: l1.homeClubId, name: l1.homeClubName, goals: String(g.a) },
    b: { clubId: l1.awayClubId, name: l1.awayClubName, goals: String(g.b) },
    winner: winnerIsA ? 'a' : 'b',
    // The same line every tie row and bracket writes (tieDetail, SeasonParts).
    note: tieDetail(runTie(t.legs, winnerIsA)),
    onPress: () => openRunMatch(data, l1),
  }
}

// P8-79: a real bracket, rounds side by side with lines between them — the
// same tree the preview and the result screens draw — not a list of rounds.
function BracketTab({ data }: { data: RunData }) {
  const { main, third, winnerIsA } = knockoutRun(data)
  return (
    <View style={styles.section}>
      <BracketTree
        playerClubId={data.playerClubId}
        columns={main.map(r => ({ key: r.round, label: label(r.round), ties: r.ties.map(t => bracketTie(data, t, winnerIsA.get(t)!)) }))}
        third={third ? { key: third.round, label: label(third.round), ties: third.ties.map(t => bracketTie(data, t, winnerIsA.get(t)!)) } : undefined} />
      {/* The World Cup's grounds (P8-93), from the result screen. */}
      <Grounds data={data} />
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
      <SectionTag roles={roles}>{t('hub.form')}</SectionTag>
      <SeasonStrip roles={roles} marks={marks} total={marks.length} viewing={null}
        onPick={i => { if (i != null && mine[i]) openRunMatch(data, mine[i]) }} />
      {pos && data.positions && <><SectionTag roles={roles}>{t('hub.positionByMd')}</SectionTag><PositionCompare roles={roles} clubId={you} positions={data.positions} table={data.table} clubs={data.table.length} /></>}
      <SectionTag roles={roles}>{t('hub.everyMatch')}</SectionTag>
      {/* P8-67: the season's own result row (the season screen's and the
          verdict's), not a lookalike — crests, scorers and your side marked the
          same way everywhere. The matchday label sits above each. */}
      {mine.map((m, i) => (
        <View key={i}>
          {m.label ? <KitText t="tag" color={roles.textMuted} style={styles.matchLabel}>{label(m.label)}</KitText> : null}
          <ResultRow roles={roles} homeName={m.homeClubName} awayName={m.awayClubName}
            homeGoals={m.homeGoals} awayGoals={m.awayGoals}
            youSide={m.homeClubId === you ? 'home' : 'away'} neutral={data.mode === 'world_cup' || m.label === 'Final'}
            homeClubId={m.homeClubId} awayClubId={m.awayClubId}
            homeScorers={summariseScorers(m.scorers?.home) || undefined} awayScorers={summariseScorers(m.scorers?.away) || undefined}
            onPress={() => openRunMatch(data, m)} />
        </View>
      ))}
    </View>
  )
}

// ── TEAMS: every round's team of the matchday (P8-108) ───────────────────────
// The engine picks one for every round (it's what the "regular" award counts)
// and there was nowhere to look at one. Step through them, or jump straight
// to a round; each is the awards' pitch, every shirt a link to the player.
function TeamsTab({ data, runId }: { data: RunData; runId?: string }) {
  const teams = useMemo(() => buildAwardsNight({ awards: data.awards, stats: data.stats, rounds: data.rounds ?? undefined }).teamsOfTheRound, [data])
  const [i, setI] = useState(teams.length - 1)
  if (!teams.length) return <EmptyState roles={roles} title={t('hub.noTeams')} body={t('hub.noTeamsBody')} />
  const k = Math.min(Math.max(i, 0), teams.length - 1)
  const team = teams[k]
  return (
    <View style={styles.section}>
      <View style={styles.stepper}>
        <Pressable onPress={() => setI(Math.max(0, k - 1))} disabled={k === 0} accessibilityRole="button" accessibilityLabel={t('hub.roundBefore')}
          style={({ pressed }) => [styles.step, { borderColor: roles.line, opacity: k === 0 ? 0.3 : 1 }, pressed && { backgroundColor: roles.sunken }]}>
          <Icon name="back" size={20} color={roles.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <KitText t="title" color={roles.text} numberOfLines={1}>{label(team.label)}</KitText>
          <KitText t="tag" color={roles.textMuted}>{t('hub.nOfM', { n: k + 1, m: teams.length })}</KitText>
        </View>
        <Pressable onPress={() => setI(Math.min(teams.length - 1, k + 1))} disabled={k === teams.length - 1} accessibilityRole="button" accessibilityLabel={t('hub.roundAfter')}
          style={({ pressed }) => [styles.step, { borderColor: roles.line, opacity: k === teams.length - 1 ? 0.3 : 1 }, pressed && { backgroundColor: roles.sunken }]}>
          <Icon name="chevron" size={20} color={roles.text} />
        </Pressable>
      </View>
      {/* Every round at a glance, to jump to one. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumpRow}>
        {teams.map((r, j) => (
          <Pressable key={r.label} onPress={() => setI(j)} accessibilityRole="button" accessibilityLabel={label(r.label)}
            style={[styles.jump, { borderColor: roles.line, backgroundColor: j === k ? roles.line : 'transparent' }]}>
            <KitText t="tag" color={j === k ? roles.bg : roles.text}>{String(j + 1)}</KitText>
          </Pressable>
        ))}
      </ScrollView>
      <FormationPitch roles={roles} team={team.team} showScores="rating" onPlayer={pid => openPlayer(pid, runId)}
        caption={t('hub.teamCaption')} benchLabel={t('hub.closeCalls')} />
    </View>
  )
}

// ── STATS: the D3 boards ─────────────────────────────────────────────────────
function StatsTab({ data, runId }: { data: RunData; runId?: string }) {
  const [who, setWho] = useState<'players' | 'clubs'>('players')
  return (
    <View style={styles.section}>
      <SegmentSwitch roles={roles} value={who} onChange={setWho}
        options={[{ id: 'players', label: t('hub.players') }, { id: 'clubs', label: t('hub.clubs') }]} />
      {who === 'players' ? <PlayerBoards data={data} runId={runId} /> : <ClubBoards data={data} runId={runId} />}
    </View>
  )
}

function PlayerBoards({ data, runId }: { data: RunData; runId?: string }) {
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
  const board = [...list].sort((a, b) => score(b) - score(a))
  const fmt = (p: PlayerStatLine) => key === 'avgRating' ? (p.avgRating ?? 0).toFixed(2) : m === 'per90' ? (per90(p, key)?.toFixed(2) ?? '—') : String(value(p, key))
  const fam = FAMILIES.find(f => f.id === family)!

  return (
    <View style={styles.section}>
      <Field roles={roles} label={t('hub.search', { count: players.length })} value={query} onChangeText={setQuery} autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <SegmentSwitch roles={roles} value={family} onChange={f => { setFamily(f); setKey(FAMILIES.find(x => x.id === f)!.keys[0]) }}
          options={FAMILIES.map(f => ({ id: f.id, label: f.label }))} />
      </ScrollView>
      <Chips<StatKey> roles={roles} options={fam.keys.map(k => ({ id: k, label: STAT_LABEL[k] }))} value={key} onChange={setKey} />
      {canPer90(key) && hasMinutes && (
        <SegmentSwitch roles={roles} value={mode} onChange={setMode}
          options={[{ id: 'total', label: t('hub.total') }, { id: 'per90', label: t('hub.per90') }]} />
      )}
      <KitText t="tag" color={roles.textMuted}>
        {key === 'avgRating' ? t('hub.ratingQualify', { min: RATING_MIN_MATCHES, count: list.length })
          : m === 'per90' ? t('hub.per90Qualify', { min: PER90_MIN_MINUTES, count: list.length }) : t('hub.playersCount', { count: list.length })}
      </KitText>
      {board.length === 0 ? <KitText t="body" color={roles.textMuted}>{t('hub.nobody')}</KitText> : board.map((p, i) => {
        const tag = percentileTag(p, ranks.get(p.playerId))
        return (
          <Pressable key={p.playerId} onPress={() => openPlayer(p.playerId, runId)} accessibilityRole="link"
            style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, p.isPlayerClub && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
            <KitText t="figure" color={roles.textMuted} style={styles.pos}>{q ? '' : String(i + 1)}</KitText>
            <View style={{ flex: 1 }}>
              <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
              <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`${p.isPlayerClub ? (data.table.find(r => r.isPlayer)?.clubName ?? t('hub.yourXi')) : p.clubName} · ${p.position}`}</KitText>
            </View>
            {tag && <Tag roles={roles} variant="win">{tag}</Tag>}
            {key === 'avgRating'
              ? <RatingSquare value={p.avgRating ?? 0} decimals={2} />
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
      {/* P8-67: the season screen's own press item, not a lookalike. */}
      {[...data.press].reverse().map(s => <StoryItem key={s.id} roles={roles} story={s} onPress={() => openStory(s.id, data.key === 'live' ? undefined : data.key)} />)}
    </View>
  )
}

// ── SQUAD: your players ──────────────────────────────────────────────────────
function SquadTab({ data, runId }: { data: RunData; runId?: string }) {
  const mine = data.stats.players.filter(p => p.isPlayerClub).sort((a, b) => b.goals - a.goals || b.assists - a.assists)
  if (!mine.length) return <EmptyState roles={roles} title={t('hub.noSquad')} body={t('hub.noSquadBody')} />
  const bench = data.drafted.filter(p => p.isBench)
  return (
    <View style={styles.section}>
      {/* From the result screen (Wave F): your shape, and who missed what (§10.5 R8). */}
      {data.formation && data.drafted.length > 0 && (
        <LineupPitch formation={data.formation} draftedPlayers={data.drafted} benchPlayers={bench} title={t('result.yourLineup')} />
      )}
      <MedicalTable absences={data.more.absences} />
      {mine.map(p => (
        <Pressable key={p.playerId} onPress={() => openPlayer(p.playerId, runId)} accessibilityRole="link"
          style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="tag" color={roles.textMuted} style={styles.md}>{p.position}</KitText>
          <View style={{ flex: 1 }}>
            <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
            {/* P8-46's marks, not "8G 3A · 2 MOTM". */}
            <View style={styles.marks}>
              <KitText t="tag" color={roles.textMuted}>{(p.isBench ? t('hub.subPrefix') : '') + t('hub.apps', { count: p.matchesRated ?? p.matchesPlayed ?? 0 })}</KitText>
              {p.goals > 0 && <EventMark kind="goal" count={p.goals} size={12} />}
              {p.assists > 0 && <EventMark kind="assist" count={p.assists} size={12} />}
              {(p.potm ?? 0) > 0 && <EventMark kind="motm" count={p.potm} size={12} />}
            </View>
          </View>
          {p.avgRating != null
            ? <RatingSquare value={p.avgRating} />
            : null}
          <Icon name="chevron" size={16} color={roles.textMuted} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space[3], marginTop: space[4] },
  matchLabel: { marginTop: space[3] },
  marks: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  wide: { flexDirection: 'row', gap: space[5], marginTop: space[4], alignItems: 'flex-start' },
  side: { width: 180, gap: 2 },
  sideTab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3], borderLeftWidth: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair },
  tall: { minHeight: 56 },
  pos: { width: 28, textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  step: { width: 44, height: 44, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  jumpRow: { gap: space[1] },
  jump: { minWidth: 32, height: 32, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  col: { width: 30, textAlign: 'right' },
  md: { width: 44 },
  val: { minWidth: 48, textAlign: 'right' },
  rating: { minWidth: 40, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center' },
})
