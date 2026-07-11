import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { simulateMatch } from '@/engine/match'
import {
  buildCLTeams, generateCLLeagueFixtures, simulateCLKnockoutsOnly,
  type CLTeam, type CLKnockoutMatch, type CLSeasonResult, type CLLeagueMatch,
} from '@/engine/cl-sim'
import {
  regularSeasonMatchdays, splitStage, lockedFinalTable, playLiveMatch, sortLeagueTable,
  blankLeagueStats, simulateLeagueTableDetailed, type SimLeagueTable, type LiveMatchday, type LeagueFormat,
  type SimStandingRow,
} from '@/engine/cl-league-sim'
import { buildCLAccessList, ensureHolders, type AssociationEntry, type CLAccessList } from '@/engine/cl-access'
import { simulateCustomUclQualifying, type QualTie, type QualifyingResult } from '@/engine/cl-qualifying'
import { getCustomUclAssociations, getCustomUclHolders } from '@/db/queries/custom-ucl'
import { berthForPosition } from '@/data/uefa-coefficients'
import { getRostersForClubs } from '@/db/queries/seasons'
import {
  loadLeaguePools, attributeFixtureScorers, attributeCLResultScorers, attributeQualTieScorers, summariseScorers,
  attachCLShootoutNames,
} from '@/engine/run-stats'
import type { RosterPlayer } from '@/types/stats'
import type { SimTeam } from '@/types/simulation'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { LiveMatch, periodsForTwoLegTie } from '@/components/LiveMatch'
import { BracketPreview } from '@/components/BracketPreview'
import { InfoBubble } from '@/components/InfoBubble'
import {
  BerthBadge, LeaguesBrowserModal, LeagueTableModal, KoTieDetailModal, qualTieToKoMatch,
} from '@/components/CustomUclViewers'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, FORMAT_EXPLAINER, isSpecialFormat } from '@/data/league-formats'
import { PenShootout } from '@/components/PenShootout'
import { TeamLabel } from '@/components/TeamLabel'
import { LineupPitch } from '@/components/LineupPitch'
import { FixtureList } from '@/components/FixtureList'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'

const CL = MODE_THEMES.champions_league

type Phase =
  | 'loading'
  | 'domestic_review'   // your league + club + stakes → start
  | 'domestic_sim'      // play YOUR domestic season, matchday by matchday
  | 'domestic_result'   // where you finished → what it earned (or nothing)
  | 'world_sim'         // the other 52 leagues resolve (revealed slowly, browsable)
  | 'qualifying'        // the qualifying ladder plays out (ties tappable)
  | 'quali_result'      // qualified / eliminated / entered directly
  | 'review'            // league phase preview
  | 'simulating'        // league phase matchdays
  | 'knockout_phase'    // knockout reveal (ties tappable)

type Speed = 'slow' | 'normal' | 'fast'
const SPEED_MS: Record<Speed, number> = { slow: 2200, normal: 900, fast: 250 }

// One matchday result (with summarised scorers) for the results card.
type MDResult = {
  homeId: string; awayId: string; home: string; away: string
  hg: number; ag: number; playerHome: boolean; playerAway: boolean
  hs?: string; as?: string
}

// A single matchday result row — clone of the league-mode "Matchday Results"
// ticker (score badge, player highlight, scorer lines). Defined ABOVE the
// screen component so it exists regardless of hoisting/Fast Refresh quirks.
function MDResultRow({ r }: { r: MDResult }) {
  const isPM = r.playerHome || r.playerAway
  let resultColor: string | null = null
  if (isPM) {
    const pWin = (r.playerHome && r.hg > r.ag) || (r.playerAway && r.ag > r.hg)
    resultColor = r.hg === r.ag ? colors.warning : pWin ? colors.success : '#DC2626'
  }
  return (
    <View style={[styles.resultRowWrap, isPM && styles.resultRowPlayerHighlight, resultColor ? { backgroundColor: resultColor + '15' } : null]}>
      <View style={styles.resultRowInner}>
        <TeamLabel clubId={r.homeId} name={r.home} textStyle={[styles.resultClubNameText, r.playerHome && { color: CL.accent, fontWeight: typography.bold }]} containerStyle={[styles.resultTeamSide, { justifyContent: 'flex-end' }]} size={14} />
        <View style={[styles.scoreBadge, resultColor ? { backgroundColor: resultColor + '33' } : null]}>
          <Text style={[styles.scoreText, resultColor ? { color: resultColor } : null]}>{r.hg} - {r.ag}</Text>
        </View>
        <TeamLabel clubId={r.awayId} name={r.away} textStyle={[styles.resultClubNameText, r.playerAway && { color: CL.accent, fontWeight: typography.bold }]} containerStyle={styles.resultTeamSide} size={14} />
      </View>
      {(r.hs || r.as) ? (
        <View style={styles.scorerRow}>
          <Text style={[styles.scorerHalf, { textAlign: 'right' }]} numberOfLines={2}>{r.hs ? `⚽ ${r.hs}` : ''}</Text>
          <Text style={styles.scorerHalf} numberOfLines={2}>{r.as ? `${r.as} ⚽` : ''}</Text>
        </View>
      ) : null}
    </View>
  )
}

// Matchday Results card with LOOKBACK — follows the live matchday, but you can
// scrub ‹ › back through every matchday already played (and jump to LIVE).
function MatchdayResultsCard({ history }: { history: MDResult[][] }) {
  const [idx, setIdx] = useState<number | null>(null)   // null = follow live
  const total = history.length
  const viewing = idx == null ? total : Math.min(idx, total)
  const shown = total === 0 ? [] : (history[viewing - 1] ?? [])
  const atLive = idx == null || viewing >= total

  return (
    <View style={styles.resultsCard}>
      <View style={styles.mdCardHead}>
        <Text style={[styles.cardHeaderTitle, { flexShrink: 1 }]} numberOfLines={1}>{total > 0 ? `Matchday ${viewing}` : 'Matchday Results'}</Text>
        {total > 1 && (
          <View style={styles.mdScrub}>
            <Pressable style={styles.mdScrubBtn} disabled={viewing <= 1} onPress={() => setIdx(Math.max(1, viewing - 1))}>
              <Text style={[styles.mdScrubText, viewing <= 1 && { opacity: 0.3 }]}>‹</Text>
            </Pressable>
            <Text style={styles.mdScrubCount}>{viewing}/{total}</Text>
            <Pressable style={styles.mdScrubBtn} disabled={atLive} onPress={() => setIdx(v => Math.min(total, (v ?? total) + 1))}>
              <Text style={[styles.mdScrubText, atLive && { opacity: 0.3 }]}>›</Text>
            </Pressable>
            {!atLive && (
              <Pressable style={[styles.mdLiveBtn, { borderColor: CL.accent }]} onPress={() => setIdx(null)}>
                <Text style={[styles.mdLiveText, { color: CL.accent }]}>LIVE</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {shown.length === 0 ? (
        <View style={styles.emptyResultsBox}><Text style={styles.emptyResultsText}>Waiting for kickoff...</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {shown.map((r, i) => <MDResultRow key={i} r={r} />)}
        </ScrollView>
      )}
    </View>
  )
}

function sortStandings(teams: CLTeam[]): CLTeam[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst, gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}


export default function CustomUclSimulationScreen() {
  const {
    formation, draftedPlayers, benchPlayers, useSubstitutes, clYear, customUclPlayerClubId,
    setClTeams, setClResult, setCustomUclQual, setCustomUclLeagues,
  } = useGameStore()
  const fullSquad = [...draftedPlayers, ...benchPlayers]

  const totalTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, getSlotsForFormation(formation)) : 0
  const playerClubId = customUclPlayerClubId

  const [phase, setPhase] = useState<Phase>('loading')
  const [speed, setSpeed] = useState<Speed>('normal')
  const [isPlaying, setIsPlaying] = useState(false)

  // ── Domestic season state ──
  const assocsRef = useRef<AssociationEntry[]>([])
  const playerAssocRef = useRef<AssociationEntry | null>(null)
  const domTeamsRef = useRef<SimTeam[]>([])
  const domMatchdaysRef = useRef<LiveMatchday[]>([])
  const domSplitIdsRef = useRef<Set<string> | null>(null)
  const domStageLabelRef = useRef('Regular Season')
  const domRegularSnapshotRef = useRef<SimStandingRow[] | undefined>(undefined)
  const [domMD, setDomMD] = useState(0)             // 0-based index into current plan
  const [domStage, setDomStage] = useState<'regular' | 'split'>('regular')
  const [showRegularTable, setShowRegularTable] = useState(false)  // split view: peek at pre-split table
  const [domTick, setDomTick] = useState(0)         // re-render trigger (teams are refs)
  const [domesticFinish, setDomesticFinish] = useState<number | null>(null)
  // This matchday's results (league-sim-style card with scorers).
  const [recentResults, setRecentResults] = useState<MDResult[]>([])
  // Full per-matchday history for lookback (domestic season + UCL league phase).
  const [domHistory, setDomHistory] = useState<MDResult[][]>([])
  const [lpHistory, setLpHistory] = useState<MDResult[][]>([])
  // Scorer pools for the player's DOMESTIC league (attribution is display-only
  // there; the UCL phases use poolByClubRef).
  const domPoolRef = useRef<Map<string, RosterPlayer[]>>(new Map())

  // ── World / access / qualifying ──
  const [tables, setTables] = useState<SimLeagueTable[]>([])
  const accessRef = useRef<CLAccessList | null>(null)
  const [qual, setQual] = useState<QualifyingResult | null>(null)
  const [worldRevealed, setWorldRevealed] = useState(0)
  const [qualRoundIdx, setQualRoundIdx] = useState(0)
  const [openLeague, setOpenLeague] = useState<SimLeagueTable | null>(null)
  const [openKo, setOpenKo] = useState<{ m: CLKnockoutMatch; label?: string } | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)

  // ── UCL league phase + knockouts ──
  const [clTeamsLocal, setClTeamsLocal] = useState<CLTeam[]>([])
  const [fixtures, setFixtures] = useState<{ matchday: number; home: CLTeam; away: CLTeam }[]>([])
  const [currentMD, setCurrentMD] = useState(1)
  const leagueHistoryRef = useRef<CLLeagueMatch[]>([])
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  const [koRounds, setKoRounds] = useState<{ round: string; label: string; ties: CLKnockoutMatch[] }[]>([])
  const [koVisibleCount, setKoVisibleCount] = useState(0)
  const [liveDone, setLiveDone] = useState<Record<string, boolean>>({})
  const finishedRef = useRef(false)
  const finalResultRef = useRef<CLSeasonResult | null>(null)
  const totalMatchdays = 8

  const playerReachedLeaguePhase = clTeamsLocal.some(t => t.isPlayer)

  // ── Init: load associations, set up the player's live domestic season ──────
  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0 || !playerClubId) return
      const assocs = await getCustomUclAssociations()
      assocsRef.current = assocs
      const mine = assocs.find(a => a.clubs.some(c => c.clubId === playerClubId)) ?? null
      playerAssocRef.current = mine
      if (!mine) return
      const teams: SimTeam[] = mine.clubs.map(c => ({
        clubId: c.clubId, clubName: c.clubName,
        ovr: c.clubId === playerClubId ? totalTeamOvr : c.ovr,
        isPlayer: c.clubId === playerClubId,
        form: 0, stats: blankLeagueStats(),
      }))
      domTeamsRef.current = teams
      domMatchdaysRef.current = regularSeasonMatchdays(teams, mine.format ?? 'double_round_robin')
      setPhase('domestic_review')
      // Domestic scorer pools (background — ready before the first matchday).
      loadLeaguePools(teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer })), fullSquad, 2025, useSubstitutes)
        .then(p => { domPoolRef.current = p.poolByClub })
        .catch(e => console.warn('[custom-ucl-sim] domestic pool load failed:', e))
    }
    init()
  }, [])

  // ── Domestic matchday loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'domestic_sim' || !isPlaying) return
    const timer = setTimeout(playDomesticMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, domMD, domStage, speed, domTick])

  function playDomesticMD() {
    const plan = domMatchdaysRef.current
    if (domMD >= plan.length) { advanceDomesticStage(); return }
    const md = plan[domMD]
    const results: MDResult[] = []
    for (const [home, away] of md) {
      const r = playLiveMatch(home, away)
      const sc = attributeFixtureScorers(domPoolRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals)
      results.push({
        homeId: home.clubId, awayId: away.clubId, home: home.clubName, away: away.clubName,
        hg: r.homeGoals, ag: r.awayGoals, playerHome: home.isPlayer, playerAway: away.isPlayer,
        hs: summariseScorers(sc.home), as: summariseScorers(sc.away),
      })
    }
    // Player's match first, then the rest — same reading order as league mode.
    results.sort((a, b) => Number(b.playerHome || b.playerAway) - Number(a.playerHome || a.playerAway))
    setRecentResults(results)
    setDomHistory(h => [...h, results])
    setDomMD(n => n + 1)
    setDomTick(t => t + 1)
  }

  // Snapshot the table as it stands at the split — BEFORE points get halved —
  // so the league viewer can show "Regular Season" vs "Final" phases.
  function snapshotRegularSeason(): SimStandingRow[] {
    return sortLeagueTable(domTeamsRef.current).map(t => ({
      clubId: t.clubId, clubName: t.clubName, ovr: t.ovr,
      played: t.stats.played, won: t.stats.won, drawn: t.stats.drawn, lost: t.stats.lost,
      goalsFor: t.stats.goalsFor, goalsAgainst: t.stats.goalsAgainst, points: t.stats.points,
    }))
  }

  function advanceDomesticStage() {
    const mine = playerAssocRef.current!
    if (domStage === 'regular') {
      const snapshot = snapshotRegularSeason()
      const split = splitStage(domTeamsRef.current, (mine.format ?? 'double_round_robin') as LeagueFormat)
      if (split && split.matchdays.length > 0) {
        domRegularSnapshotRef.current = snapshot
        domSplitIdsRef.current = split.championshipIds
        domStageLabelRef.current = split.label
        domMatchdaysRef.current = split.matchdays
        setDomStage('split'); setDomMD(0)
        setIsPlaying(false)   // pause at the split so the moment lands
        return
      }
    }
    finishDomesticSeason()
  }

  function skipDomesticSeason() {
    // Fast-forward: play every remaining matchday headlessly (stage-aware).
    setIsPlaying(false)
    const mine = playerAssocRef.current!
    let plan = domMatchdaysRef.current
    let md = domMD
    let stage = domStage
    for (;;) {
      for (; md < plan.length; md++) for (const [h, a] of plan[md]) playLiveMatch(h, a)
      if (stage === 'regular') {
        const snapshot = snapshotRegularSeason()
        const split = splitStage(domTeamsRef.current, (mine.format ?? 'double_round_robin') as LeagueFormat)
        if (split && split.matchdays.length > 0) {
          domRegularSnapshotRef.current = snapshot
          domSplitIdsRef.current = split.championshipIds
          domStageLabelRef.current = split.label
          plan = split.matchdays; md = 0; stage = 'split'
          continue
        }
      }
      break
    }
    finishDomesticSeason()
  }

  function finishDomesticSeason() {
    const ordered = lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current)
    const pos = ordered.findIndex(t => t.isPlayer) + 1
    setDomesticFinish(pos)
    // Freeze the player's league as a SimLeagueTable (feeds access + the viewer).
    const mine = playerAssocRef.current!
    const playerTable: SimLeagueTable = {
      rank: mine.rank, name: mine.name, country: mine.country, format: mine.format,
      standings: ordered.map(t => ({
        clubId: t.clubId, clubName: t.clubName, ovr: t.ovr,
        played: t.stats.played, won: t.stats.won, drawn: t.stats.drawn, lost: t.stats.lost,
        goalsFor: t.stats.goalsFor, goalsAgainst: t.stats.goalsAgainst, points: t.stats.points,
      })),
      regularStandings: domRegularSnapshotRef.current,
    }
    // Now resolve the REST of Europe (headless, format-aware) + access + qualifying.
    resolveWorld(playerTable, pos)
    setPhase('domestic_result')
  }

  async function resolveWorld(playerTable: SimLeagueTable, playerPos: number) {
    const allTables: SimLeagueTable[] = []
    const simulated: AssociationEntry[] = assocsRef.current.map(a => {
      if (a.rank === playerTable.rank) {
        allTables.push(playerTable)
        return { rank: a.rank, name: a.name, country: a.country, format: a.format, clubs: playerTable.standings.map(s => ({ clubId: s.clubId, clubName: s.clubName, ovr: s.ovr })) }
      }
      const { standings, regularStandings } = simulateLeagueTableDetailed(a.clubs, a.format)
      allTables.push({ rank: a.rank, name: a.name, country: a.country, format: a.format, standings, regularStandings })
      return { rank: a.rank, name: a.name, country: a.country, format: a.format, clubs: standings.map(s => ({ clubId: s.clubId, clubName: s.clubName, ovr: s.ovr })) }
    })
    allTables.sort((x, y) => x.rank - y.rank)

    let access = buildCLAccessList(simulated)
    try { access = ensureHolders(access, await getCustomUclHolders()) } catch { /* keep un-heldered */ }
    accessRef.current = access

    const q = simulateCustomUclQualifying(access, playerClubId ?? undefined)
    // Attribute qualifying-tie scorers ONCE (stored on the ties) so the tie
    // details, stats totals and awards all agree everywhere.
    try {
      const tieClubs = new Map<string, { clubId: string; clubName: string; isPlayer: boolean }>()
      for (const t of q.ties) {
        tieClubs.set(t.teamA.clubId, { clubId: t.teamA.clubId, clubName: t.teamA.clubName, isPlayer: t.teamA.clubId === playerClubId })
        if (t.teamB) tieClubs.set(t.teamB.clubId, { clubId: t.teamB.clubId, clubName: t.teamB.clubName, isPlayer: t.teamB.clubId === playerClubId })
      }
      if (tieClubs.size > 0) {
        const pools = await loadLeaguePools([...tieClubs.values()], fullSquad, clYear ?? 2025, useSubstitutes)
        attributeQualTieScorers(q.ties, pools.poolByClub)
      }
    } catch (e) { console.warn('[custom-ucl-sim] qual scorer attribution failed:', e) }
    setQual(q)
    setTables(allTables)
    setCustomUclQual(q)
    setCustomUclLeagues(allTables)
    const potted = buildCLTeams(q.leaguePhaseField.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })))
    setClTeamsLocal(potted)
    setClTeams(potted)
  }

  // Player's berth from their domestic finish (null = not qualified outright —
  // but a holder injection can still put them in the field, so check that too).
  const mine = playerAssocRef.current
  const domesticBerth = mine && domesticFinish ? berthForPosition(mine.rank, domesticFinish) : null
  const inFieldViaHolders = !domesticBerth && !!qual?.leaguePhaseField.some(t => t.clubId === playerClubId)
  const notQualified = domesticFinish !== null && !domesticBerth && !inFieldViaHolders &&
    !qual?.ties.some(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)

  // ── World reveal (slower — one league every 400ms) ──────────────────────────
  useEffect(() => {
    if (phase !== 'world_sim') return
    if (worldRevealed >= tables.length) return
    const t = setTimeout(() => setWorldRevealed(n => n + 1), 400)
    return () => clearTimeout(t)
  }, [phase, worldRevealed, tables.length])

  // ── Qualifying reveal (one round every ~4s) ────────────────────────────────
  const qualRoundsWithTies = QUAL_ROUND_ORDER.filter(r => qual?.ties.some(t => t.round === r))
  useEffect(() => {
    if (phase !== 'qualifying') return
    if (qualRoundIdx >= qualRoundsWithTies.length) return
    const t = setTimeout(() => setQualRoundIdx(n => n + 1), 4200)
    return () => clearTimeout(t)
  }, [phase, qualRoundIdx, qualRoundsWithTies.length])

  useEffect(() => {
    if (phase === 'qualifying' && qualRoundsWithTies.length > 0 && qualRoundIdx >= qualRoundsWithTies.length) {
      setPhase('quali_result')
    }
  }, [phase, qualRoundIdx, qualRoundsWithTies.length])

  // ── UCL league phase setup + loop ───────────────────────────────────────────
  useEffect(() => {
    if (clTeamsLocal.length === 0 || !playerReachedLeaguePhase) return
    setFixtures(generateCLLeagueFixtures(clTeamsLocal))
    loadLeaguePools(clTeamsLocal, fullSquad, clYear ?? 2025, useSubstitutes)
      .then(p => { poolByClubRef.current = p.poolByClub })
      .catch(e => console.warn('[custom-ucl-sim] pool load failed:', e))
  }, [clTeamsLocal, playerReachedLeaguePhase])

  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    const timer = setTimeout(simulateNextMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, clTeamsLocal, fixtures, speed])

  function simulateNextMD() {
    if (currentMD > totalMatchdays) { finishLeaguePhase(); return }
    const mdFixtures = fixtures.filter(f => f.matchday === currentMD)
    const teams = [...clTeamsLocal]
    const results: MDResult[] = []
    mdFixtures.forEach(({ home: h, away: a }) => {
      const home = teams.find(t => t.clubId === h.clubId)!, away = teams.find(t => t.clubId === a.clubId)!
      const r = simulateMatch(home, away)
      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
      const scorers = attributeFixtureScorers(poolByClubRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals)
      leagueHistoryRef.current.push({
        matchday: currentMD,
        home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
        away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
        homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers,
      })
      results.push({
        homeId: home.clubId, awayId: away.clubId, home: home.clubName, away: away.clubName,
        hg: r.homeGoals, ag: r.awayGoals, playerHome: home.isPlayer, playerAway: away.isPlayer,
        hs: summariseScorers(scorers.home), as: summariseScorers(scorers.away),
      })
    })
    results.sort((a, b) => Number(b.playerHome || b.playerAway) - Number(a.playerHome || a.playerAway))
    setRecentResults(results)
    setLpHistory(h => [...h, results])
    setClTeamsLocal(teams)
    setCurrentMD(md => md + 1)
  }

  // Skip All (UCL league phase): play every remaining matchday headlessly.
  function skipUclLeaguePhase() {
    setIsPlaying(false)
    const teams = [...clTeamsLocal]
    for (let md = currentMD; md <= totalMatchdays; md++) {
      for (const { home: h, away: a } of fixtures.filter(f => f.matchday === md)) {
        const home = teams.find(t => t.clubId === h.clubId)!, away = teams.find(t => t.clubId === a.clubId)!
        const r = simulateMatch(home, away)
        home.stats.played++; away.stats.played++
        home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
        away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
        if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
        else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
        else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
        const scorers = attributeFixtureScorers(poolByClubRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals)
        leagueHistoryRef.current.push({
          matchday: md,
          home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
          away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
          homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers,
        })
      }
    }
    setClTeamsLocal(teams)
    setCurrentMD(totalMatchdays + 1)
    void finishLeaguePhaseWith(teams)
  }

  async function finishLeaguePhase() {
    await finishLeaguePhaseWith(clTeamsLocal)
  }

  async function finishLeaguePhaseWith(finalTeams: CLTeam[]) {
    setIsPlaying(false)
    const sorted = sortStandings(finalTeams)
    const koResult = simulateCLKnockoutsOnly(sorted)
    const result: CLSeasonResult = { leaguePhaseStandings: sorted, ...koResult, leagueMatchdays: leagueHistoryRef.current }
    try {
      let pool = poolByClubRef.current
      if (pool.size === 0) pool = (await loadLeaguePools(sorted, fullSquad, clYear ?? 2025, useSubstitutes)).poolByClub
      attributeCLResultScorers(result, pool)
    } catch (e) { console.warn('[custom-ucl-sim] scorer attribution failed:', e) }
    await revealKnockouts(result)
  }

  async function revealKnockouts(result: CLSeasonResult) {
    const allMatches: CLKnockoutMatch[] = [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf, ...(result.final ? [result.final] : [])]
    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachCLShootoutNames in run-stats.ts).
    await attachCLShootoutNames(allMatches, playerClubId ?? undefined, fullSquad)
    finalResultRef.current = result
    const rounds = [
      result.playoffRound.length > 0 ? { round: 'playoff', label: 'Knockout Play-off (9th–24th)', ties: result.playoffRound } : null,
      result.r16.length > 0 ? { round: 'r16', label: 'Round of 16', ties: result.r16 } : null,
      result.qf.length > 0 ? { round: 'qf', label: 'Quarter-Finals', ties: result.qf } : null,
      result.sf.length > 0 ? { round: 'sf', label: 'Semi-Finals', ties: result.sf } : null,
      result.final ? { round: 'final', label: 'Final', ties: [result.final] } : null,
    ].filter(Boolean) as { round: string; label: string; ties: CLKnockoutMatch[] }[]
    setKoRounds(rounds)
    setKoVisibleCount(0)   // 0 = show the bracket preview first; play begins on tap
    setPhase('knockout_phase')
  }

  function finishAll() {
    if (finishedRef.current || !finalResultRef.current) return
    finishedRef.current = true
    setClResult(finalResultRef.current)
    router.push('/game/custom-ucl-result')
  }

  // ── Player out before the league phase (qualifying exit / never qualified) ──
  function buildNoPlayerResult(finalRound: CLSeasonResult['playerFinalRound']): CLSeasonResult {
    // The tournament still plays out in full — league phase + knockouts without
    // the player — so the result screen can show all of it.
    const potted = buildCLTeams((qual?.leaguePhaseField ?? []).map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: false })))
    const fx = generateCLLeagueFixtures(potted)
    const matchdays: CLLeagueMatch[] = []
    for (const f of fx) {
      const home = potted.find(t => t.clubId === f.home.clubId)!, away = potted.find(t => t.clubId === f.away.clubId)!
      const r = simulateMatch(home, away)
      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
      // Recorded so the result screen can still show every match (scorers get
      // attributed once in handleOutOfEurope, same as a normal run).
      matchdays.push({
        matchday: f.matchday,
        home: { clubId: home.clubId, clubName: home.clubName, isPlayer: false },
        away: { clubId: away.clubId, clubName: away.clubName, isPlayer: false },
        homeGoals: r.homeGoals, awayGoals: r.awayGoals,
      })
    }
    const sorted = sortStandings(potted)
    const ko = simulateCLKnockoutsOnly(sorted)

    // Synthesise the player's team record for the header card.
    const exitTie = [...(qual?.ties ?? [])].reverse().find(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    const stats = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
    let clubName = mine?.clubs.find(c => c.clubId === playerClubId)?.clubName ?? 'Your Club'
    if (exitTie?.legs) {
      const isA = exitTie.teamA.clubId === playerClubId
      clubName = isA ? exitTie.teamA.clubName : exitTie.teamB!.clubName
      stats.played = 2
      stats.goalsFor = isA ? exitTie.legs.totalA : exitTie.legs.totalB
      stats.goalsAgainst = isA ? exitTie.legs.totalB : exitTie.legs.totalA
      stats.lost = 1
    }
    const playerTeam: CLTeam = { clubId: playerClubId ?? 'player', clubName, ovr: totalTeamOvr, isPlayer: true, form: 0, stats, pot: 4 }
    return { leaguePhaseStandings: sorted, ...ko, leagueMatchdays: matchdays, playerTeam, playerFinalRound: finalRound, playerPot: 4 }
  }

  async function handleOutOfEurope(finalRound: CLSeasonResult['playerFinalRound']) {
    if (finishedRef.current) return
    finishedRef.current = true
    const result = buildNoPlayerResult(finalRound)
    try {
      const rosters = await getRostersForClubs(result.leaguePhaseStandings.map(t => t.clubId), clYear ?? 2025)
      attributeCLResultScorers(result, rosters)
    } catch (e) { console.warn('[custom-ucl-sim] scorer attribution failed:', e) }
    setClResult(result)
    router.push('/game/custom-ucl-result')
  }

  // Knockout auto-advance — but WAIT while the player's tie is playing out live.
  useEffect(() => {
    if (phase !== 'knockout_phase' || koVisibleCount < 1 || koVisibleCount > koRounds.length) return
    const latest = koRounds[koVisibleCount - 1]
    const playerTie = latest?.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    if (playerTie && !liveDone[latest.round]) return   // hold until the live watch finishes
    const t = setTimeout(() => setKoVisibleCount(c => c + 1), playerTie ? 2200 : 4200)
    return () => clearTimeout(t)
  }, [phase, koVisibleCount, koRounds.length, liveDone])

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!formation || draftedPlayers.length === 0 || !playerClubId) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No custom UCL run in progress.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back</Text>
        </Pressable>
      </View>
    )
  }

  if (phase === 'loading' || !mine) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={CL.accent} size="large" />
        <Text style={styles.loadingText}>Setting up your season…</Text>
      </View>
    )
  }

  const leaguesButton = tables.length > 0 && (
    <Pressable style={styles.leaguesBtn} onPress={() => setBrowserOpen(true)}>
      <Text style={styles.leaguesBtnText}>🌍</Text>
    </Pressable>
  )

  // ── Phase: domestic review (season preview — placement already introduced
  //    the club/league, so this is just the table you're about to fight in) ────
  if (phase === 'domestic_review') {
    const preview = [...domTeamsRef.current].sort((a, b) => b.ovr - a.ovr)
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={[styles.header, styles.headerRow]}>
          <Text style={[styles.headerTitle, { color: CL.accent }]}>{mine.name}</Text>
          {mine.format && isSpecialFormat(mine.format)
            ? <InfoBubble topic={`format_${mine.format}`} />
            : <InfoBubble topic="league_simulation" />}
        </View>
        <Text style={styles.phaseHint}>The field by squad strength · badges show what each finish earns</Text>
        {mine.format && isSpecialFormat(mine.format) && (
          <View style={styles.splitBanner}>
            <Text style={styles.splitBannerText}>ℹ️ {FORMAT_LABEL[mine.format]} — {FORMAT_EXPLAINER[mine.format]}</Text>
          </View>
        )}
        <View style={[styles.tableCard, { flex: 1, marginHorizontal: spacing.lg, marginBottom: spacing.md }]}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCol, styles.colPos]}>#</Text>
            <Text style={[styles.tableCol, styles.colName]}>Club</Text>
            <Text style={[styles.tableCol, styles.colStat]}>OVR</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {preview.map((t, i) => (
              <View key={t.clubId} style={[styles.standRow, t.isPlayer && styles.standRowPlayer]}>
                <Text style={styles.standPos}>{i + 1}</Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TeamLabel clubId={t.clubId} name={t.clubName} textStyle={[styles.standName, t.isPlayer && { color: CL.accent, fontWeight: typography.bold }]} size={13} gap={4} />
                  <BerthBadge rank={mine.rank} position={i + 1} />
                </View>
                <Text style={[styles.standStat, { width: 34 }]}>{t.ovr}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={styles.footerBar}>
          <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent }]} onPress={() => { setPhase('domestic_sim'); setIsPlaying(true) }}>
            <Text style={styles.primaryBtnText}>KICK OFF THE SEASON →</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // ── Phase: domestic live sim (mirrors the normal league-mode sim layout) ───
  if (phase === 'domestic_sim') {
    const totalMDs = domMatchdaysRef.current.length
    const playedMDs = Math.min(domMD, totalMDs)
    const ordered = domStage === 'split'
      ? lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current)
      : sortLeagueTable(domTeamsRef.current)
    const atSplitPause = !isPlaying && domStage === 'split' && domMD === 0
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: CL.accent }]}>{mine.name}</Text>
          <Text style={styles.headerSub}>
            {domStage === 'split' ? domStageLabelRef.current : 'Season 2025/26'}
            {'  '}{mine.format && isSpecialFormat(mine.format) ? '' : ''}
          </Text>
        </View>
        <View style={styles.simContainer}>
          {/* Progress card — matchday, status, bar, controls (league-mode look) */}
          <View style={styles.progressCard}>
            <View style={styles.progressTextRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.matchdayLabel}>Matchday {Math.min(domMD + (isPlaying ? 1 : 0), totalMDs) || 1} / {totalMDs}</Text>
                {mine.format && isSpecialFormat(mine.format)
                  ? <InfoBubble topic={`format_${mine.format}`} size={15} />
                  : <InfoBubble topic="league_simulation" size={15} />}
              </View>
              <Text style={styles.simStatusText}>{isPlaying ? 'Simulating...' : atSplitPause ? 'Split reached' : 'Paused'}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${(playedMDs / Math.max(1, totalMDs)) * 100}%`, backgroundColor: CL.accent }]} />
            </View>
            <View style={styles.controlsRow}>
              <Pressable style={[styles.controlBtn, isPlaying && styles.controlBtnActive]} onPress={() => setIsPlaying(p => !p)}>
                <Text style={styles.controlBtnText}>{isPlaying ? '⏸ Pause' : atSplitPause ? '▶ Play Split' : '▶ Play'}</Text>
              </Pressable>
              <Pressable style={[styles.controlBtn, styles.skipAllBtn]} onPress={skipDomesticSeason}>
                <Text style={styles.controlBtnText}>⏩ Skip All</Text>
              </Pressable>
              <View style={styles.speedSelector}>
                {(['slow', 'normal', 'fast'] as Speed[]).map(s => (
                  <Pressable key={s} style={[styles.speedBtn, speed === s && { backgroundColor: CL.accent, borderColor: CL.accent }]} onPress={() => setSpeed(s)}>
                    <Text style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}>{s.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {atSplitPause && (
              <Text style={styles.splitBannerText}>⚡ {domStageLabelRef.current} — {FORMAT_EXPLAINER[mine.format ?? 'double_round_robin'] ?? ''}</Text>
            )}
          </View>

          <View style={styles.simSplitGrid}>
            {/* Live Standings */}
            <View style={styles.tableCard}>
              <View style={styles.mdCardHead}>
                <Text style={[styles.cardHeaderTitle, { flexShrink: 1 }]} numberOfLines={1}>
                  {domStage === 'split' && showRegularTable ? 'Regular Season (final)' : 'Live Standings'}
                </Text>
                {domStage === 'split' && domRegularSnapshotRef.current && (
                  <Pressable style={[styles.mdLiveBtn, { borderColor: CL.accent }]} onPress={() => setShowRegularTable(v => !v)}>
                    <Text style={[styles.mdLiveText, { color: CL.accent }]}>{showRegularTable ? 'LIVE' : 'PRE-SPLIT'}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Club</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat]}>PTS</Text>
              </View>
              {domStage === 'split' && showRegularTable && domRegularSnapshotRef.current ? (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {domRegularSnapshotRef.current.map((t, i) => {
                    const gd = t.goalsFor - t.goalsAgainst
                    const isPlayer = t.clubId === playerClubId
                    const pText = isPlayer ? { color: CL.accent, fontWeight: typography.bold } : null
                    return (
                      <View key={t.clubId} style={[styles.tableRow, isPlayer && styles.tableRowPlayer]}>
                        <Text style={[styles.tableColData, styles.colPos, pText]}>{i + 1}</Text>
                        <View style={[styles.colName, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <TeamLabel clubId={t.clubId} name={t.clubName} textStyle={[styles.tableColData, pText]} size={14} gap={4} containerStyle={{ flexShrink: 1 }} />
                        </View>
                        <Text style={[styles.tableColData, styles.colStat, pText]}>{t.played}</Text>
                        <Text style={[styles.tableColData, styles.colStat, pText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                        <Text style={[styles.tableColData, styles.colStat, styles.colPts, pText]}>{t.points}</Text>
                      </View>
                    )
                  })}
                </ScrollView>
              ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {domStage === 'split' && domSplitIdsRef.current && (
                  <View style={[styles.splitGroupHeader, { borderColor: CL.accent }]}>
                    <Text style={[styles.splitGroupHeaderText, { color: CL.accent }]}>◆ CHAMPIONSHIP GROUP</Text>
                  </View>
                )}
                {ordered.map((t, i) => {
                  const gd = t.stats.goalsFor - t.stats.goalsAgainst
                  const pText = t.isPlayer ? { color: CL.accent, fontWeight: typography.bold } : null
                  // Visual split: divider where the championship group ends.
                  const inChamp = domStage === 'split' && domSplitIdsRef.current?.has(t.clubId)
                  const prevInChamp = i > 0 && domStage === 'split' && domSplitIdsRef.current?.has(ordered[i - 1].clubId)
                  const showRelHeader = domStage === 'split' && prevInChamp && !inChamp
                  return (
                    <React.Fragment key={t.clubId}>
                      {showRelHeader && (
                        <View style={styles.splitGroupHeader}>
                          <Text style={styles.splitGroupHeaderTextMuted}>RELEGATION / EUROPE GROUP</Text>
                        </View>
                      )}
                      <View style={[styles.tableRow, t.isPlayer && styles.tableRowPlayer]}>
                        <Text style={[styles.tableColData, styles.colPos, pText]}>{i + 1}</Text>
                        <View style={[styles.colName, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <TeamLabel clubId={t.clubId} name={t.clubName} textStyle={[styles.tableColData, pText]} size={14} gap={4} containerStyle={{ flexShrink: 1 }} />
                          <BerthBadge rank={mine.rank} position={i + 1} />
                        </View>
                        <Text style={[styles.tableColData, styles.colStat, pText]}>{t.stats.played}</Text>
                        <Text style={[styles.tableColData, styles.colStat, pText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                        <Text style={[styles.tableColData, styles.colStat, styles.colPts, pText]}>{t.stats.points}</Text>
                      </View>
                    </React.Fragment>
                  )
                })}
              </ScrollView>
              )}
            </View>

            {/* Matchday Results — scrub back through the whole season */}
            <MatchdayResultsCard history={domHistory} />
          </View>
        </View>
      </View>
    )
  }

  // ── Phase: domestic result ─────────────────────────────────────────────────
  if (phase === 'domestic_result') {
    const pos = domesticFinish ?? 0
    const berth = domesticBerth
    const holderIn = inFieldViaHolders
    const qualified = !!berth || holderIn
    const berthText = berth
      ? (berth.round === 'league_phase' ? 'Straight into the League Phase!' : `You enter at the ${QUAL_ROUND_LABEL[berth.round]} (${PATH_LABEL[berth.path]}).`)
      : holderIn ? 'No spot through the league — but as TITLE HOLDERS you\'re in the League Phase anyway!' : 'No Champions League this season.'
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl }]}>
        <Text style={{ fontSize: 56 }}>{qualified ? (pos === 1 ? '🏆' : '🎫') : '💔'}</Text>
        <Text style={[styles.resultBigText, { color: qualified ? colors.success : colors.danger }]}>
          {pos === 1 ? `${mine.name} CHAMPIONS` : `FINISHED ${pos}${pos === 2 ? 'ND' : pos === 3 ? 'RD' : 'TH'}`}
        </Text>
        <Text style={styles.resultSubText}>{berthText}</Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: CL.accent, alignSelf: 'stretch' }, !qual && { opacity: 0.5 }]}
          disabled={!qual}
          onPress={() => setPhase('world_sim')}
        >
          <Text style={styles.primaryBtnText}>{!qual ? 'RESOLVING EUROPE…' : qualified ? 'SEE THE REST OF EUROPE →' : 'SEE WHO TOOK YOUR PLACE →'}</Text>
        </Pressable>
      </View>
    )
  }

  // ── Phase: world reveal ────────────────────────────────────────────────────
  if (phase === 'world_sim') {
    const visible = tables.slice(0, worldRevealed)
    const done = worldRevealed >= tables.length
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={[styles.header, styles.headerRow]}>
          <Text style={[styles.headerTitle, { color: CL.accent }]}>Europe's Seasons Conclude</Text>
          <InfoBubble topic="league_simulation" />
        </View>
        <Text style={styles.phaseHint}>Every league simulated for real · tap any league to inspect its full table</Text>
        <ScrollView style={styles.leaguesScroll} contentContainerStyle={{ padding: spacing.lg, gap: 6 }}>
          {visible.map(t => (
            <Pressable key={t.rank} style={styles.leagueRevealRow} onPress={() => setOpenLeague(t)}>
              <Text style={styles.leagueRevealRank}>#{t.rank}</Text>
              <Text style={[styles.leagueRevealName, t.rank === mine.rank && { color: CL.accent, fontWeight: typography.bold }]} numberOfLines={1}>{t.name}</Text>
              <Text style={styles.leagueRevealChamp} numberOfLines={1}>🏆 {t.standings[0]?.clubName ?? '—'}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.footerBar}>
          {!done && <ActivityIndicator color={CL.accent} style={{ marginBottom: spacing.sm }} />}
          <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent }]} onPress={() => {
            setWorldRevealed(tables.length)
            if (done) {
              if (notQualified) { handleOutOfEurope('not_qualified'); return }
              setPhase('qualifying')
            }
          }}>
            <Text style={styles.primaryBtnText}>{done ? (notQualified ? 'VIEW FINAL RESULT →' : 'TO THE QUALIFIERS →') : 'REVEAL ALL →'}</Text>
          </Pressable>
        </View>
        <LeagueTableModal table={openLeague} playerClubId={playerClubId} onClose={() => setOpenLeague(null)} />
      </View>
    )
  }

  // ── Phase: qualifying reveal ───────────────────────────────────────────────
  if (phase === 'qualifying') {
    const visibleTies = (qual?.ties ?? []).filter(t => qualRoundsWithTies.indexOf(t.round) <= qualRoundIdx)
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={[styles.header, styles.headerRow]}>
          <Text style={[styles.headerTitle, { color: CL.accent }]}>Qualifying Rounds</Text>
          <InfoBubble topic="champions_vs_league_path" />
          {leaguesButton}
        </View>
        <Text style={styles.phaseHint}>Two-legged ties · tap any tie for legs, extra time & shootouts</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
          <QualifyingLadder ties={visibleTies} onTiePress={t => {
            const m = qualTieToKoMatch(t)
            if (m) setOpenKo({ m, label: `${QUAL_ROUND_LABEL[t.round]} · ${PATH_LABEL[t.path]}` })
          }} />
        </ScrollView>
        <View style={styles.footerBar}>
          <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent }]} onPress={() => setQualRoundIdx(qualRoundsWithTies.length)}>
            <Text style={styles.primaryBtnText}>SKIP →</Text>
          </Pressable>
        </View>
        <KoTieDetailModal match={openKo?.m ?? null} roundLabel={openKo?.label} onClose={() => setOpenKo(null)} playerClubId={playerClubId ?? undefined} draftedPlayers={draftedPlayers} />
        <LeaguesBrowserModal visible={browserOpen} tables={tables} playerClubId={playerClubId} onClose={() => setBrowserOpen(false)} />
      </View>
    )
  }

  // ── Phase: qualifying resolved ─────────────────────────────────────────────
  if (phase === 'quali_result') {
    const playerHadTies = qual?.ties.some(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    if (playerReachedLeaguePhase) {
      return (
        <View style={[styles.container, { backgroundColor: CL.bgTint, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl }]}>
          <Text style={{ fontSize: 56 }}>🎉</Text>
          <Text style={[styles.resultBigText, { color: colors.success }]}>{playerHadTies ? 'QUALIFIED!' : 'THE FIELD IS SET'}</Text>
          <Text style={styles.resultSubText}>
            {playerHadTies
              ? "You've battled through qualifying into the League Phase. 36 clubs, 8 games, top 8 go straight to the Round of 16."
              : 'Your league finish put you straight into the League Phase — the ladder just decided who joins you. 36 clubs, 8 games.'}
          </Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent, alignSelf: 'stretch' }]} onPress={() => setPhase('review')}>
            <Text style={styles.primaryBtnText}>CONTINUE →</Text>
          </Pressable>
        </View>
      )
    }
    const exitTie = [...(qual?.ties ?? [])].reverse().find(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    const exitKey = exitTie ? (Object.entries(QUAL_EXIT_ROUND).find(([, r]) => r === exitTie.round)?.[0] as CLSeasonResult['playerFinalRound'] | undefined) : undefined
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl }]}>
        <Text style={{ fontSize: 56 }}>💔</Text>
        <Text style={[styles.resultBigText, { color: colors.danger }]}>ELIMINATED</Text>
        <Text style={styles.resultSubText}>Your Champions League run ends in qualifying. The tournament continues without you — see how it plays out.</Text>
        <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent, alignSelf: 'stretch' }]} onPress={() => handleOutOfEurope(exitKey ?? 'q1_exit')}>
          <Text style={styles.primaryBtnText}>VIEW RESULT →</Text>
        </Pressable>
      </View>
    )
  }

  // ── Phase: league phase review ─────────────────────────────────────────────
  if (phase === 'review') {
    const playerTeam = clTeamsLocal.find(t => t.isPlayer)
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={[styles.header, styles.headerRow]}>
          <Text style={[styles.headerTitle, { color: CL.accent }]}>League Phase</Text>
          <InfoBubble topic="league_phase" />
          {leaguesButton}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewClub}>{playerTeam?.clubName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.reviewMeta}>OVR {playerTeam?.ovr} · Pot {playerTeam?.pot} · {clTeamsLocal.length} clubs</Text>
              <InfoBubble topic="pots" size={15} />
            </View>
            <Text style={styles.reviewNote}>8 matches — 2 opponents from each of the 4 pots. Top 8 go straight to the Round of 16, 9th–24th enter the Playoff Round, 25th and below are out.</Text>
          </View>

          {/* Who you actually play, and from which pot, before a ball is kicked */}
          <FixtureList
            accent={CL.accent}
            items={fixtures
              .filter(f => f.home.isPlayer || f.away.isPlayer)
              .map(f => {
                const isHome = f.home.isPlayer
                const opp = isHome ? f.away : f.home
                return { matchday: f.matchday, clubId: opp.clubId, clubName: opp.clubName, pot: opp.pot, isHome }
              })}
          />

          {formation && draftedPlayers.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.reviewClub}>Your Lineup ({formation})</Text>
              <LineupPitch formation={formation} draftedPlayers={draftedPlayers} benchPlayers={benchPlayers} />
            </View>
          )}
        </ScrollView>
        <View style={styles.footerBar}>
          <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent }]} onPress={() => { setPhase('simulating'); setIsPlaying(true) }}>
            <Text style={styles.primaryBtnText}>SIMULATE LEAGUE PHASE →</Text>
          </Pressable>
        </View>
        <LeaguesBrowserModal visible={browserOpen} tables={tables} playerClubId={playerClubId} onClose={() => setBrowserOpen(false)} />
      </View>
    )
  }

  // ── Phase: UCL league phase (mirrors the normal league-mode sim layout) ────
  if (phase === 'simulating') {
    const standings = sortStandings(clTeamsLocal)
    const playedMDs = Math.min(currentMD - 1, totalMatchdays)
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            <Text style={[styles.headerTitle, { color: CL.accent }]}>League Phase</Text>
            {leaguesButton}
          </View>
          <Text style={styles.headerSub}>36 clubs · one table · 8 matchdays</Text>
        </View>
        <View style={styles.simContainer}>
          <View style={styles.progressCard}>
            <View style={styles.progressTextRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.matchdayLabel}>Matchday {Math.min(currentMD, totalMatchdays)} / {totalMatchdays}</Text>
                <InfoBubble topic="league_phase_zones" size={15} />
              </View>
              <Text style={styles.simStatusText}>{isPlaying ? 'Simulating...' : 'Paused'}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${(playedMDs / totalMatchdays) * 100}%`, backgroundColor: CL.accent }]} />
            </View>
            <View style={styles.controlsRow}>
              <Pressable style={[styles.controlBtn, isPlaying && styles.controlBtnActive]} onPress={() => setIsPlaying(p => !p)}>
                <Text style={styles.controlBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
              </Pressable>
              <Pressable style={[styles.controlBtn, styles.skipAllBtn]} onPress={skipUclLeaguePhase}>
                <Text style={styles.controlBtnText}>⏩ Skip All</Text>
              </Pressable>
              <View style={styles.speedSelector}>
                {(['slow', 'normal', 'fast'] as Speed[]).map(s => (
                  <Pressable key={s} style={[styles.speedBtn, speed === s && { backgroundColor: CL.accent, borderColor: CL.accent }]} onPress={() => setSpeed(s)}>
                    <Text style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}>{s.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.simSplitGrid}>
            <View style={styles.tableCard}>
              <Text style={styles.cardHeaderTitle}>Live Standings</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Club</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat]}>PTS</Text>
              </View>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {standings.map((t, i) => {
                  const gd = t.stats.goalsFor - t.stats.goalsAgainst
                  const pText = t.isPlayer ? { color: CL.accent, fontWeight: typography.bold } : null
                  return (
                    <View key={t.clubId} style={[styles.tableRow, t.isPlayer && styles.tableRowPlayer]}>
                      <View style={[styles.colPos, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                        <View style={[styles.zoneDot, { backgroundColor: i < 8 ? colors.success : i < 24 ? colors.warning : colors.danger }]} />
                        <Text style={[styles.tableColData, pText]}>{i + 1}</Text>
                      </View>
                      <TeamLabel clubId={t.clubId} name={t.clubName} textStyle={[styles.tableColData, pText]} size={14} gap={4} containerStyle={styles.colName} />
                      <Text style={[styles.tableColData, styles.colStat, pText]}>{t.stats.played}</Text>
                      <Text style={[styles.tableColData, styles.colStat, pText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                      <Text style={[styles.tableColData, styles.colStat, styles.colPts, pText]}>{t.stats.points}</Text>
                    </View>
                  )
                })}
                <Text style={styles.zoneLegend}>
                  <Text style={{ color: colors.success }}>■</Text> 1-8 → R16   ·   <Text style={{ color: colors.warning }}>■</Text> 9-24 → Playoff   ·   <Text style={{ color: colors.danger }}>■</Text> 25+ out
                </Text>
              </ScrollView>
            </View>

            <MatchdayResultsCard history={lpHistory} />
          </View>
        </View>
        <LeaguesBrowserModal visible={browserOpen} tables={tables} playerClubId={playerClubId} onClose={() => setBrowserOpen(false)} />
      </View>
    )
  }

  // ── Phase: knockout bracket preview (before a ball is kicked) ───────────────
  if (koVisibleCount === 0 && koRounds.length > 0) {
    const startIdx = Math.max(0, koRounds.findIndex(r => r.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)))
    const first = koRounds[startIdx]
    return (
      <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
        <View style={[styles.header, styles.headerRow]}>
          <Text style={[styles.headerTitle, { color: CL.accent }]}>Knockout Bracket</Text>
          <InfoBubble topic="knockout_bracket" />
        </View>
        <BracketPreview
          firstLabel={first.label}
          firstTies={first.ties.map(t => ({ teamA: t.teamA, teamB: t.teamB }))}
          road={koRounds.slice(startIdx + 1).map(r => ({ label: r.label, count: r.ties.length }))}
          accent={CL.accent}
          onStart={() => setKoVisibleCount(1)}
        />
      </View>
    )
  }

  // ── Phase: knockout reveal ─────────────────────────────────────────────────
  const visibleRounds = koRounds.slice(0, koVisibleCount)
  const allRevealed = koVisibleCount >= koRounds.length
  return (
    <View style={[styles.container, { backgroundColor: CL.bgTint }]}>
      <View style={[styles.header, styles.headerRow]}>
        <Text style={[styles.headerTitle, { color: CL.accent }]}>Knockout Rounds</Text>
        <InfoBubble topic="knockout_bracket" />
        {leaguesButton}
      </View>
      <Text style={styles.phaseHint}>Tap any tie for legs, extra time & shootout detail</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {visibleRounds.map((r, ri) => {
          const isLatest = ri === visibleRounds.length - 1
          const playerTie = r.ties.find(m => m.teamA.isPlayer || m.teamB.isPlayer)
          const watchLive = isLatest && playerTie && !liveDone[r.round]
          return (
            <View key={r.round} style={styles.koRoundBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={styles.koRoundLabel}>{r.label}</Text>
                {r.round === 'playoff' && <InfoBubble topic="knockout_playoff" size={15} />}
              </View>
              {/* your tie plays out minute-by-minute FIRST; the rest of the round
                  is held back until your match settles, then revealed. */}
              {watchLive && playerTie ? (
                <LiveMatch
                  teamA={playerTie.teamA} teamB={playerTie.teamB}
                  periods={playerTie.leg1 ? periodsForTwoLegTie(playerTie) : [{ label: r.label, homeId: playerTie.teamA.clubId, awayId: playerTie.teamB.clubId, fromMin: 0, toMin: playerTie.extraTime ? 120 : 90, scorers: playerTie.leg1Scorers }]}
                  pens={playerTie.aPens !== undefined ? { a: playerTie.aPens, b: playerTie.bPens ?? 0, kicksA: playerTie.penKicksA, kicksB: playerTie.penKicksB } : null}
                  aggregate={!!playerTie.leg1}
                  onDone={() => setLiveDone(d => ({ ...d, [r.round]: true }))}
                />
              ) : (
                r.ties.map((m, i) => <KoTieCard key={i} m={m} onPress={() => setOpenKo({ m, label: r.label })} />)
              )}
            </View>
          )
        })}
      </ScrollView>
      <View style={styles.footerBar}>
        {!allRevealed
          ? <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent }]} onPress={() => { setLiveDone(Object.fromEntries(koRounds.map(r => [r.round, true]))); setKoVisibleCount(koRounds.length) }}><Text style={styles.primaryBtnText}>SKIP →</Text></Pressable>
          : <Pressable style={[styles.primaryBtn, { backgroundColor: CL.accent }]} onPress={finishAll}><Text style={styles.primaryBtnText}>VIEW FINAL RESULT →</Text></Pressable>}
      </View>
      <KoTieDetailModal match={openKo?.m ?? null} roundLabel={openKo?.label} onClose={() => setOpenKo(null)} playerClubId={playerClubId ?? undefined} draftedPlayers={draftedPlayers} />
      <LeaguesBrowserModal visible={browserOpen} tables={tables} playerClubId={playerClubId} onClose={() => setBrowserOpen(false)} />
    </View>
  )
}

function KoTieCard({ m, onPress }: { m: CLKnockoutMatch; onPress?: () => void }) {
  const aWon = m.winner.clubId === m.teamA.clubId
  const suffix = m.aPens !== undefined ? `pens ${m.aPens}-${m.bPens}` : m.extraTime ? 'AET' : null
  const isPM = m.teamA.isPlayer || m.teamB.isPlayer
  return (
    <Pressable style={[styles.koCard, isPM && { borderColor: CL.accent, backgroundColor: CL.accent + '11' }]} onPress={onPress}>
      <View style={styles.koCardRow}>
        <TeamLabel clubId={m.teamA.clubId} name={m.teamA.clubName} textStyle={[styles.koCardName, aWon && styles.koCardWon]} size={14} gap={4} containerStyle={{ flex: 1 }} />
        <Text style={styles.koCardScore}>{m.aGoals} – {m.bGoals}</Text>
        <TeamLabel clubId={m.teamB.clubId} name={m.teamB.clubName} textStyle={[styles.koCardName, !aWon && styles.koCardWon]} size={14} gap={4} containerStyle={{ flex: 1, justifyContent: 'flex-end' }} />
      </View>
      {m.leg1 && m.leg2 && <Text style={styles.koCardLegs}>{m.leg1.aGoals}-{m.leg1.bGoals} · {m.leg2.aGoals}-{m.leg2.bGoals}{suffix ? ` · ${suffix}` : ''}</Text>}
      {!m.leg1 && suffix && <Text style={styles.koCardSuffix}>{suffix}</Text>}
      {m.penKicksA && m.penKicksB && isPM && <PenShootout teamA={m.teamA.clubName} teamB={m.teamB.clubName} kicksA={m.penKicksA} kicksB={m.penKicksB} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontSize: typography.sm, color: colors.textSecondary },
  header: { paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  headerTitle: { fontSize: typography.xl, fontWeight: typography.black },
  phaseHint: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },

  leaguesBtn: { marginLeft: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  leaguesBtnText: { fontSize: 15 },

  leaguesScroll: { flex: 1 },
  leagueRevealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  leagueRevealRank: { width: 30, fontSize: 11, color: CL.accent, fontWeight: typography.bold },
  leagueRevealName: { flex: 1, fontSize: 12, color: colors.textSecondary },
  leagueRevealChamp: { fontSize: 12, color: colors.textPrimary, fontWeight: typography.bold },

  footerBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  primaryBtn: { borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', ...shadows.md },
  secondaryBtn: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  primaryBtnText: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 1.5 },

  resultBigText: { fontSize: typography.xxl, fontWeight: typography.black, textAlign: 'center' },
  resultSubText: { fontSize: typography.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },

  reviewCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  reviewClub: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  reviewMeta: { fontSize: typography.sm, color: colors.textSecondary },
  reviewNote: { fontSize: typography.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  formatNote: { fontSize: 11, color: colors.textSecondary, backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: spacing.sm, lineHeight: 16, marginTop: spacing.xs },
  stakesTitle: { fontSize: typography.xs, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 1 },

  splitBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: CL.accent + '15', borderWidth: 1, borderColor: CL.accent, borderRadius: radius.md, padding: spacing.sm },
  splitBannerText: { fontSize: 11, color: colors.textPrimary, lineHeight: 16, marginTop: spacing.xs },
  splitGroupHeader: { paddingVertical: 4, paddingHorizontal: 6, marginTop: 4, borderLeftWidth: 2, borderColor: colors.border, backgroundColor: colors.bgElevated },
  splitGroupHeaderText: { fontSize: 9, fontWeight: typography.black, letterSpacing: 1 },
  splitGroupHeaderTextMuted: { fontSize: 9, fontWeight: typography.black, letterSpacing: 1, color: colors.textMuted },
  headerSub: { fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },

  // ── League-mode sim clone (progress card + split grid) — mirrors simulation.tsx ──
  simContainer: { flex: 1, padding: spacing.md, gap: spacing.md },
  progressCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchdayLabel: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  simStatusText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.medium },
  progressBarBg: { height: 8, backgroundColor: colors.bgElevated, borderRadius: radius.full, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  controlBtn: { backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  controlBtnActive: { borderColor: CL.accent },
  skipAllBtn: { backgroundColor: colors.warning, borderColor: colors.warning },
  controlBtnText: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.bold },
  speedSelector: { flexDirection: 'row', gap: 4 },
  speedBtn: { backgroundColor: colors.bgElevated, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  speedBtnText: { fontSize: 9, fontWeight: typography.bold, color: colors.textSecondary },
  speedBtnTextActive: { color: colors.bg },
  simSplitGrid: { flex: 1, flexDirection: 'row', gap: spacing.md },
  tableCard: { flex: 1.2, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  cardHeaderTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.xs },
  mdCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  mdScrub: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  mdScrubBtn: { paddingHorizontal: 6, paddingVertical: 1 },
  mdScrubText: { fontSize: 18, fontWeight: typography.black, color: colors.textPrimary },
  mdScrubCount: { fontSize: typography.xs, color: colors.textMuted, minWidth: 34, textAlign: 'center' },
  mdLiveBtn: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 1, marginLeft: 2 },
  mdLiveText: { fontSize: 9, fontWeight: typography.black, letterSpacing: 1 },
  tableHeaderRow: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableRowPlayer: { backgroundColor: CL.accent + '11', borderColor: CL.accent, borderWidth: 1, borderRadius: radius.sm },
  tableCol: { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  tableColData: { fontSize: 11, color: colors.textSecondary },
  colPos: { width: 34 },
  colName: { flex: 1, paddingLeft: spacing.xs },
  colStat: { width: 26, textAlign: 'center' as any },
  colPts: { fontWeight: typography.bold, color: colors.textPrimary },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  zoneLegend: { fontSize: 9, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.sm },
  resultsCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  emptyResultsBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyResultsText: { fontSize: typography.xs, color: colors.textMuted, fontStyle: 'italic' },
  resultRowWrap: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultRowPlayerHighlight: { backgroundColor: CL.accent + '09', borderRadius: radius.sm },
  resultRowInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultTeamSide: { flex: 1 },
  resultClubNameText: { fontSize: 10, color: colors.textSecondary },
  scoreBadge: { backgroundColor: colors.bgElevated, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, minWidth: 40, alignItems: 'center' },
  scoreText: { fontSize: 10, fontWeight: typography.bold, color: colors.textPrimary },
  scorerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: 3, paddingHorizontal: 2 },
  scorerHalf: { flex: 1, fontSize: 9, color: colors.textMuted },

  standingsScroll: { flex: 1 },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  standRowPlayer: { backgroundColor: CL.accent + '11', borderRadius: radius.sm },
  standPos: { width: 22, fontSize: 11, fontWeight: typography.bold, textAlign: 'center', color: colors.textMuted },
  standName: { fontSize: 12, color: colors.textSecondary },
  standStat: { width: 26, fontSize: 11, color: colors.textMuted, textAlign: 'center' },

  speedRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  speedChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  speedChipText: { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },

  koRoundBlock: { gap: spacing.sm },
  koRoundLabel: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary },
  koCard: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  koCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  koCardName: { fontSize: 13, color: colors.textMuted },
  koCardWon: { color: colors.textPrimary, fontWeight: typography.black },
  koCardScore: { fontSize: 15, fontWeight: typography.black, color: colors.textPrimary },
  koCardSuffix: { fontSize: 10, color: colors.warning, fontWeight: typography.bold, textAlign: 'center' },
  koCardLegs: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
})
