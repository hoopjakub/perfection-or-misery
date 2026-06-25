import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, ActivityIndicator, Modal
} from 'react-native'
import Svg, { Line, Polyline, Text as SvgText, G } from 'react-native-svg'
import { router, useLocalSearchParams } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveRun, fetchRunById } from '@/db/queries/runs'
import { mergeCareerFromRun } from '@/db/queries/career'
import { getAllClubsData } from '@/db/queries/seasons'
import { summariseScorers, computeLeagueRunStats } from '@/engine/run-stats'
import { getSlotsForFormation } from '@/engine/formations'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import { useModeTheme } from '@/hooks/useModeTheme'
import type { Tier } from '@/types/simulation'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Custom SVG position chart — position 1 at top, scrollable horizontally
function PositionChart({ graphData }: { graphData: any }) {
  const TEAM_COUNT = graphData.teamsInLeague || 1
  const MATCH_COUNT = graphData.labels?.length ?? 0

  if (MATCH_COUNT === 0 || graphData.datasets?.length === 0) {
    return (
      <View style={styles.graphEmpty}>
        <Text style={styles.graphEmptyText}>No matchday data available.</Text>
      </View>
    )
  }

  const PAD_LEFT   = 28
  const PAD_RIGHT  = 46
  const PAD_TOP    = 14
  const PAD_BOTTOM = 26
  const CHART_H    = 300
  const cardPad    = spacing.lg * 2
  const MIN_COL_W  = 36
  const COL_W = Math.max(MIN_COL_W, (SCREEN_WIDTH - cardPad - PAD_LEFT - PAD_RIGHT) / MATCH_COUNT)
  const CHART_W = COL_W * MATCH_COUNT
  const SVG_W   = PAD_LEFT + CHART_W + PAD_RIGHT
  const SVG_H   = PAD_TOP + CHART_H + PAD_BOTTOM

  const yForPos = (pos: number) =>
    PAD_TOP + ((pos - 1) / Math.max(TEAM_COUNT - 1, 1)) * CHART_H
  const xForMD = (mi: number) => PAD_LEFT + mi * COL_W + COL_W / 2

  // Y-axis ticks
  const yTicks: number[] = []
  for (let p = 1; p <= TEAM_COUNT; p++) {
    if (p === 1 || p % 5 === 0 || p === TEAM_COUNT) yTicks.push(p)
  }

  // X-axis ticks (first, every 5, last)
  const xTicks = graphData.labels
    .map((lbl: string, i: number) => ({ i, lbl }))
    .filter(({ i }: { i: number }) => i === 0 || (i + 1) % 5 === 0 || i === MATCH_COUNT - 1)

  // Build team lines — convert inverted position back to actual position
  type TeamLine = { pts: string; color: string; isPlayer: boolean; acronym: string; lastPos: number }
  const lines: TeamLine[] = graphData.datasets.map((ds: any, idx: number) => {
    const isPlayer = graphData.isPlayerFlags?.[idx] ?? ds.isPlayer ?? false
    const color = graphData.teamColors?.[idx] ?? '#666'
    const positions = (ds.data as number[]).map(inv => TEAM_COUNT - inv + 1)
    const pts = positions.map((pos, mi) => `${xForMD(mi)},${yForPos(pos)}`).join(' ')
    const lastPos = positions[positions.length - 1] ?? 1
    return { pts, color, isPlayer, acronym: graphData.teamAcronyms?.[idx] ?? '', lastPos }
  })

  const nonPlayers = lines.filter(l => !l.isPlayer)
  const playerLine  = lines.find(l => l.isPlayer)

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.graphScrollH}>
      <Svg width={SVG_W} height={SVG_H}>
        {/* Horizontal grid lines + Y labels */}
        {yTicks.map(pos => (
          <G key={pos}>
            <Line
              x1={PAD_LEFT} y1={yForPos(pos)}
              x2={PAD_LEFT + CHART_W} y2={yForPos(pos)}
              stroke={colors.border} strokeWidth={0.5}
            />
            <SvgText
              x={PAD_LEFT - 4} y={yForPos(pos) + 4}
              fontSize={9} fill={colors.textMuted} textAnchor="end"
            >
              {pos}
            </SvgText>
          </G>
        ))}

        {/* X axis baseline */}
        <Line
          x1={PAD_LEFT} y1={PAD_TOP + CHART_H}
          x2={PAD_LEFT + CHART_W} y2={PAD_TOP + CHART_H}
          stroke={colors.border} strokeWidth={1}
        />

        {/* X labels */}
        {xTicks.map(({ i, lbl }: { i: number; lbl: string }) => (
          <SvgText key={i} x={xForMD(i)} y={SVG_H - 5} fontSize={8} fill={colors.textMuted} textAnchor="middle">
            {lbl}
          </SvgText>
        ))}

        {/* Non-player team lines (drawn first, behind player) */}
        {nonPlayers.map((l, idx) => (
          <Polyline
            key={idx} points={l.pts}
            stroke={l.color} strokeWidth={1.2} fill="none" strokeOpacity={0.55}
          />
        ))}

        {/* Player line on top */}
        {playerLine && (
          <Polyline
            points={playerLine.pts}
            stroke={playerLine.color} strokeWidth={3} fill="none"
          />
        )}

        {/* Right-side team acronym labels */}
        {lines.map((l, idx) => (
          <SvgText
            key={idx}
            x={PAD_LEFT + CHART_W + 4}
            y={yForPos(l.lastPos) + 4}
            fontSize={l.isPlayer ? 10 : 7}
            fontWeight={l.isPlayer ? 'bold' : 'normal'}
            fill={l.color}
          >
            {l.acronym}
          </SvgText>
        ))}
      </Svg>
    </ScrollView>
  )
}

const TIER_META: Record<Tier, { title: string; desc: string; emoji: string }> = {
  perfection: {
    title: 'ULTIMATE PERFECTION',
    desc: 'You won the league with a perfect 100% win record. A legendary achievement that will never be forgotten!',
    emoji: '👑',
  },
  almost_perfection: {
    title: 'ALMOST PERFECTION',
    desc: 'You went completely unbeaten throughout the season to lift the trophy. Simply sensational!',
    emoji: '🌟',
  },
  champions: {
    title: 'LEAGUE CHAMPIONS',
    desc: 'You won the league! Your name is etched in glory and your fans will celebrate for decades.',
    emoji: '🏆',
  },
  title_contender: {
    title: 'TITLE CONTENDERS',
    desc: 'A podium finish! You pushed the champions to the absolute limit and proved you belong at the top.',
    emoji: '🥈',
  },
  champions_league: {
    title: 'EUROPEAN ELITE',
    desc: 'Top 4 finish! You have qualified for the prestigious Champions League to face the best in Europe.',
    emoji: '🇪🇺',
  },
  europa_glory: {
    title: 'EUROPA LEAGUE GLORY',
    desc: 'You secured European football! A strong season finishing in the top 7. Continental nights await.',
    emoji: '🎫',
  },
  almost_matters: {
    title: 'MID-TABLE COMFORT',
    desc: 'A comfortable mid-table finish in the top half. Safe, respectable, but maybe a bit forgettable.',
    emoji: '📈',
  },
  respectful_mediocrity: {
    title: 'RESPECTABLY MEDIOCRE',
    desc: 'You survived relegation, but only just. A season of scraping by. You need to recruit better next time.',
    emoji: '🥱',
  },
  absolute_misery: {
    title: 'ABSOLUTE MISERY',
    desc: 'Relegation! A disastrous campaign finishing in the bottom 3. The board is furious. Total heartbreak.',
    emoji: '💀',
  },
}

export default function ResultScreen() {
  const store = useGameStore()
  const { simResult, resetRun, mode, formation, placedLeague, draftedPlayers, quickSim } = store
  const { user, isGuest } = useUserStore()
  const theme = useModeTheme()
  const params = useLocalSearchParams<{ runId: string }>()
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null)
  const [openTeam, setOpenTeam] = useState<{ clubId: string; clubName: string } | null>(null)
  const [runStats, setRunStats] = useState<{ stats: CompetitionStats; awards: SeasonAwards } | null>(null)

  // A "fresh" run has the live squad + scorers in store (vs a history load).
  const isFreshRun = !!(simResult?.matchdayHistory?.length && draftedPlayers.length > 0 && placedLeague)
  // Preload the squad stats up-front so the whole result page lands ready (a
  // slightly longer first load, but nothing pops in afterwards).
  const [preloading, setPreloading] = useState(isFreshRun)

  useEffect(() => {
    if (!isFreshRun) return
    computeLeagueRunStats(simResult!, draftedPlayers, placedLeague!)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[result] stats compute failed:', e))
      .finally(() => setPreloading(false))
  }, [])
  const [loadingRun, setLoadingRun] = useState(false)
  const [dbRunData, setDbRunData] = useState<any>(null)
  const [teamDataMap, setTeamDataMap] = useState<Record<string, { color: string; acronym: string }>>({})

  // Load run from database if runId is provided
  useEffect(() => {
    async function loadRun() {
      if (params.runId) {
        console.log('[result] Loading run from database, runId:', params.runId)
        setLoadingRun(true)
        try {
          const run = await fetchRunById(params.runId)
          console.log('[result] Successfully loaded run data:', run)
          setDbRunData(run)
        } catch (error) {
          console.error('[result] Failed to load run:', error)
        } finally {
          setLoadingRun(false)
        }
      }
    }
    loadRun()
  }, [params.runId])

  // Load team data from database
  useEffect(() => {
    async function loadTeamData() {
      try {
        const clubsData = await getAllClubsData()
        setTeamDataMap(clubsData)
      } catch (error) {
        console.error('[result] Failed to load team data:', error)
      }
    }
    loadTeamData()
  }, [])

  // Use simResult from store or dbRunData from database
  const resultData = dbRunData ? {
    finalPosition: dbRunData.final_position,
    teamsInLeague: dbRunData.teams_in_league,
    wins: dbRunData.wins,
    draws: dbRunData.draws,
    losses: dbRunData.losses,
    goalsFor: dbRunData.goals_for,
    goalsAgainst: dbRunData.goals_against,
    biggestWin: dbRunData.highlights?.biggestWin ?? null,
    worstLoss: dbRunData.highlights?.worstLoss ?? null,
    upsets: dbRunData.highlights?.upsets ?? [],
    tier: dbRunData.tier,
    playerTeam: { ovr: dbRunData.team_ovr, stats: { played: dbRunData.wins + dbRunData.draws + dbRunData.losses, won: dbRunData.wins, drawn: dbRunData.draws, lost: dbRunData.losses, goalsFor: dbRunData.goals_for, goalsAgainst: dbRunData.goals_against, points: dbRunData.wins * 3 + dbRunData.draws } },
    // Use final matchday standings as table if available
    table: dbRunData.matchday_history && dbRunData.matchday_history.length > 0 
      ? dbRunData.matchday_history[dbRunData.matchday_history.length - 1].standings 
      : [],
    // @ts-ignore - matchday_history column needs to be added to DB
    matchdayHistory: dbRunData.matchday_history || []
  } : simResult

  // Prepare graph data with memoization for performance (must be before early return)
  const graphData = useMemo(() => {
    if (!resultData || !resultData.matchdayHistory || resultData.matchdayHistory.length === 0) {
      return { labels: [], datasets: [], teamAcronyms: [], teamColors: [], teamsInLeague: 20 }
    }
    const currentMatchday = selectedMatchday ?? resultData.matchdayHistory.length
    
    // Generate team acronyms and colors from dynamic team data mapping
    // Use final standings order for acronyms
    const finalStandings = resultData.table || resultData.matchdayHistory[resultData.matchdayHistory.length - 1]?.standings || []
    const teamAcronyms = finalStandings.map((team: any) => {
      const teamData = teamDataMap[team.clubName]
      return teamData?.acronym || team.clubName.substring(0, 3).toUpperCase()
    }) || []

    // Generate team colors from dynamic team data mapping
    // Use final standings order for colors
    const teamColors = finalStandings.map((team: any) => {
      if (team.isPlayer) return colors.accent
      const teamData = teamDataMap[team.clubName]
      if (teamData?.color) return teamData.color
      // Fallback to hash-based color if not in mapping
      const hash = team.clubId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
      const hue = hash % 360
      return `hsl(${hue}, 70%, 50%)`
    }) || []

    // Y-axis: position 1 at top, teamsInLeague at bottom
    // Chart displays higher values at top, so invert position values
    const teamsInLeague = resultData.matchdayHistory[0]?.standings.length || 20
    return {
      labels: resultData.matchdayHistory.slice(0, currentMatchday).map((_: any, idx: number) => `MD${idx + 1}`),
      datasets: finalStandings.map((team: any, idx: number) => {
        const positions = resultData.matchdayHistory.slice(0, currentMatchday).map((snapshot: any) => {
          const position = snapshot.standings.findIndex((s: any) => s.clubId === team.clubId) + 1
          // Invert so position 1 appears at top (higher value in chart)
          return teamsInLeague - position + 1
        })
        return {
          data: positions,
          color: (opacity = 1) => teamColors[idx],
          strokeWidth: team.isPlayer ? 3 : 1,
          isPlayer: team.isPlayer,
        }
      }) || [],
      teamAcronyms,
      teamColors,
      isPlayerFlags: finalStandings.map((team: any) => !!team.isPlayer),
      teamsInLeague,
    }
  }, [resultData, selectedMatchday, teamDataMap, colors])

  if (loadingRun || preloading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={styles.loadingText}>{preloading ? 'Tallying the season…' : 'Loading run...'}</Text>
      </View>
    )
  }

  if (!resultData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No simulation result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Modes</Text>
        </Pressable>
      </View>
    )
  }

  const {
    finalPosition,
    teamsInLeague,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    biggestWin,
    worstLoss,
    upsets,
    tier,
    playerTeam,
    table,
    matchdayHistory
  } = resultData

  // Fall back gracefully for non-league tiers (e.g. World Cup / UCL runs loaded
  // from history store a round name like "winner" or "sf" as their tier).
  const meta = TIER_META[tier as Tier] ?? {
    title: String(tier ?? 'Result').replace(/_/g, ' ').toUpperCase(),
    desc: '',
    emoji: '🏆',
  }
  const tierColor = (colors.tiers as any)[tier as Tier] ?? colors.accent
  const gd = goalsFor - goalsAgainst

  // Default to final matchday if not selected
  const currentMatchday = selectedMatchday ?? matchdayHistory.length
  const currentSnapshot = matchdayHistory[currentMatchday - 1]

  // Accumulate this run's drafted players into your lifetime career.
  // Guards against the double-save bug: a quick double-tap (or tapping both
  // buttons) used to fire saveRun twice because the handlers were async with no
  // re-entry guard.
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  function persistCareer() {
    if (!user || isGuest || quickSim || !runStats) return
    const pots = runStats.awards.playerOfTheSeason[0]
    const u21  = runStats.awards.bestU21[0]
    mergeCareerFromRun(user.id, {
      competition: 'league',
      yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub),
      goalsFor, goalsAgainst,
      potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined,
      u21WinnerId:  u21?.isPlayerClub ? u21.playerId  : undefined,
    }).catch(e => console.warn('[career] merge failed:', e))
  }

  // Save once, guarded so it can never run twice for the same result.
  async function saveCurrentRun() {
    if (user && !isGuest && !quickSim && mode && formation && placedLeague && simResult) {
      try {
        await saveRun({
          userId: user.id,
          mode,
          formation,
          teamOvr: playerTeam.ovr,
          leagueId: placedLeague.leagueId,
          leagueName: placedLeague.leagueName,
          yearStart: placedLeague.yearStart,
          seasonResult: simResult,
          squad: draftedPlayers,
          matchdayHistory: simResult.matchdayHistory,
          stats: runStats?.stats,
          awards: runStats?.awards,
        })
      } catch (error) {
        console.error('Failed to save run:', error)
      }
    }
    persistCareer()
  }

  async function handlePlayAgain() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await saveCurrentRun()
    resetRun()
    router.replace('/game/mode-select')
  }

  async function handleReturnToHome() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await saveCurrentRun()
    resetRun()
    router.replace('/(tabs)')
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Season Summary</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Tier Card */}
        <View style={[styles.tierCard, { borderColor: tierColor }]}>
          <Text style={styles.tierEmoji}>{meta.emoji}</Text>
          <Text style={[styles.tierTitle, { color: tierColor }]}>{meta.title}</Text>
          <Text style={styles.positionText}>Finished #{finalPosition} out of {teamsInLeague} teams</Text>
          <Text style={styles.tierDesc}>{meta.desc}</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Campaign Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{playerTeam.stats.points}</Text>
              <Text style={styles.statLbl}>Points</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.success }]}>{wins}</Text>
              <Text style={styles.statLbl}>Wins</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.warning }]}>{draws}</Text>
              <Text style={styles.statLbl}>Draws</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: '#DC2626' }]}>{losses}</Text>
              <Text style={styles.statLbl}>Losses</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.rowStatText}>Goal Diff: <Text style={{ color: gd >= 0 ? colors.success : colors.danger }}>{gd > 0 ? `+${gd}` : gd}</Text></Text>
            <Text style={styles.rowStatText}>Goals Scored: <Text style={{ color: colors.textPrimary }}>{goalsFor}</Text></Text>
            <Text style={styles.rowStatText}>Goals Conceded: <Text style={{ color: colors.textPrimary }}>{goalsAgainst}</Text></Text>
          </View>
        </View>

        {/* Lineup + squad — from the live run, or rehydrated from a saved one */}
        {(() => {
          const squad = (isFreshRun ? draftedPlayers : dbRunData?.squad ?? []) as any[]
          const form  = (isFreshRun ? formation : dbRunData?.formation) as any
          const st    = runStats?.stats ?? dbRunData?.stats ?? null
          return (
            <>
              {form && squad.length > 0 && <LineupPitch formation={form} draftedPlayers={squad} title="Your Lineup" />}
              {st && <SquadSummary stats={st} draftedPlayers={squad} formation={form ?? null} accent={theme.accent} runId={params.runId} />}
            </>
          )
        })()}

        {/* Highlights */}
        <View style={styles.highlightsCard}>
          <Text style={styles.sectionTitle}>Season Highlights</Text>
          <View style={styles.highlightsList}>
            {biggestWin && (
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>🏆 Biggest Win</Text>
                <Text style={styles.highlightValue}>{biggestWin.score} vs {biggestWin.opponent}</Text>
              </View>
            )}
            {worstLoss && (
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>💔 Worst Loss</Text>
                <Text style={styles.highlightValue}>{worstLoss.score} vs {worstLoss.opponent}</Text>
              </View>
            )}
            {upsets.length > 0 && (
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>⚠️ Shock Defeats</Text>
                <Text style={styles.highlightValueBlock}>
                  {upsets.length} upset{upsets.length > 1 ? 's' : ''} — e.g. {upsets[0].score} vs {upsets[0].opponent}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Matchday History */}
        <View style={styles.matchdayCard}>
          <Text style={styles.sectionTitle}>Matchday History</Text>

          {/* Matchday Selector */}
          <View style={styles.matchdaySelector}>
            <Text style={styles.matchdaySelectorLabel}>Matchday {currentMatchday}/{matchdayHistory.length}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchdayScroll}>
              {matchdayHistory.map((_: any, idx: number) => (
                <Pressable
                  key={idx}
                  style={[
                    styles.matchdayChip,
                    currentMatchday === idx + 1 && styles.matchdayChipActive,
                  ]}
                  onPress={() => setSelectedMatchday(idx + 1)}
                >
                  <Text style={[
                    styles.matchdayChipText,
                    currentMatchday === idx + 1 && styles.matchdayChipTextActive,
                  ]}>
                    {idx + 1}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Matchday Fixtures */}
          {currentSnapshot && (
            <View style={styles.matchdayFixtures}>
              <Text style={styles.matchdaySectionTitle}>Matchday {currentMatchday} Results</Text>
              {currentSnapshot.fixtures.map((fixture: any, idx: number) => {
                const result = fixture.result
                if (!result) return null

                const isPlayerHome = fixture.home.isPlayer
                const isPlayerAway = fixture.away.isPlayer

                const homeScorers = summariseScorers(fixture.scorers?.home)
                const awayScorers = summariseScorers(fixture.scorers?.away)
                return (
                  <View key={idx} style={styles.fixtureRowWrap}>
                    <View style={[styles.fixtureRow, (isPlayerHome || isPlayerAway) && styles.fixtureRowPlayer]}>
                      <Text
                        style={[styles.fixtureTeam, styles.fixtureTeamHome, isPlayerHome && styles.fixtureTeamPlayer]}
                        numberOfLines={1}
                      >
                        {fixture.home.clubName}
                      </Text>
                      <View style={styles.fixtureScore}>
                        <Text style={[styles.fixtureScoreText, result.outcome === 'home' && styles.fixtureScoreWinner, isPlayerHome && styles.fixtureScorePlayer]}>
                          {result.homeGoals}
                        </Text>
                        <Text style={styles.fixtureScoreDivider}>-</Text>
                        <Text style={[styles.fixtureScoreText, result.outcome === 'away' && styles.fixtureScoreWinner, isPlayerAway && styles.fixtureScorePlayer]}>
                          {result.awayGoals}
                        </Text>
                      </View>
                      <Text
                        style={[styles.fixtureTeam, styles.fixtureTeamAway, isPlayerAway && styles.fixtureTeamPlayer]}
                        numberOfLines={1}
                      >
                        {fixture.away.clubName}
                      </Text>
                    </View>
                    {(homeScorers || awayScorers) && (
                      <View style={styles.fixtureScorers}>
                        <Text style={[styles.fixtureScorerHalf, { textAlign: 'right' }]} numberOfLines={2}>{homeScorers ? `⚽ ${homeScorers}` : ''}</Text>
                        <Text style={styles.fixtureScorerHalf} numberOfLines={2}>{awayScorers ? `${awayScorers} ⚽` : ''}</Text>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {/* Matchday Standings */}
          {currentSnapshot && (
            <View style={styles.matchdayStandings}>
              <Text style={styles.matchdaySectionTitle}>Standings after Matchday {currentMatchday}</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Club</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
              </View>
              {currentSnapshot.standings.map((team: any, idx: number) => {
                const teamGd = team.stats.goalsFor - team.stats.goalsAgainst
                
                // Calculate position change from previous matchday
                let positionChange = null
                if (currentMatchday > 1) {
                  const prevSnapshot = matchdayHistory[currentMatchday - 2]
                  if (prevSnapshot) {
                    const prevPosition = prevSnapshot.standings.findIndex((s: any) => s.clubId === team.clubId) + 1
                    positionChange = prevPosition - (idx + 1)
                  }
                }
                
                return (
                  <View
                    key={team.clubId}
                    style={[
                      styles.tableRow,
                      team.isPlayer && styles.tableRowPlayer,
                    ]}
                  >
                    <View style={[styles.colPos, { flexDirection: 'row', alignItems: 'center' }]}>
                      <Text style={[styles.tableColData, team.isPlayer && styles.playerRowText]}>{idx + 1}</Text>
                      {positionChange !== null && positionChange !== 0 && (
                        <Text style={[
                          styles.positionChangeIndicator,
                          positionChange > 0 ? styles.positionUp : styles.positionDown
                        ]}>
                          {positionChange > 0 ? ` ↑${Math.abs(positionChange)}` : ` ↓${Math.abs(positionChange)}`}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerRowText]}
                      numberOfLines={1}
                    >
                      {team.clubName}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                      {team.stats.played}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                      {teamGd > 0 ? `+${teamGd}` : teamGd}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>
                      {team.stats.points}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Position Tracking Graph */}
        <View style={styles.graphCard}>
          <Text style={styles.sectionTitle}>Position Tracking</Text>
          <Text style={styles.graphSubtitle}>Position {currentMatchday > 0 ? `after MD ${currentMatchday}` : 'throughout season'} — position 1 at top</Text>
          <PositionChart graphData={graphData} />
        </View>

        {/* Final Standings Table */}
        <View style={styles.tableCard}>
          <Text style={styles.sectionTitle}>Final Standings</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCol, styles.colPos]}>#</Text>
            <Text style={[styles.tableCol, styles.colName]}>Club</Text>
            <Text style={[styles.tableCol, styles.colStat]}>P</Text>
            <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
            <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
          </View>
          {table.map((team: any, idx: number) => {
            const teamGd = team.stats.goalsFor - team.stats.goalsAgainst
            return (
              <Pressable
                key={team.clubId}
                onPress={() => matchdayHistory.length > 0 && setOpenTeam({ clubId: team.clubId, clubName: team.clubName })}
                style={[
                  styles.tableRow,
                  team.isPlayer && styles.tableRowPlayer
                ]}
              >
                <Text style={[styles.tableColData, styles.colPos, team.isPlayer && styles.playerRowText]}>
                  {idx + 1}
                </Text>
                <Text
                  style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerRowText]}
                  numberOfLines={1}
                >
                  {team.clubName}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                  {team.stats.played}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                  {teamGd > 0 ? `+${teamGd}` : teamGd}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>
                  {team.stats.points}
                </Text>
              </Pressable>
            )
          })}
          {matchdayHistory.length > 0 && <Text style={styles.tapHint}>Tap a club to see all its matches</Text>}
        </View>

        {/* Player statistics — fresh run (compute from store) or a saved snapshot (by runId) */}
        {(isFreshRun || (params.runId && dbRunData?.stats)) ? (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.accent, marginTop: spacing.md }]}
            onPress={() => router.push(params.runId ? { pathname: '/game/stats', params: { runId: params.runId } } : '/game/stats')}
          >
            <Text style={styles.actionBtnText}>📊 View Stats</Text>
          </Pressable>
        ) : null}

        {/* Play Again Button */}
        <View style={styles.buttonRow}>
          <Pressable disabled={submitting} style={[styles.actionBtn, styles.actionBtnSecondary, submitting && { opacity: 0.5 }]} onPress={handleReturnToHome}>
            <Text style={styles.actionBtnText}>{submitting ? 'Saving…' : 'Return to Home'}</Text>
          </Pressable>
          <Pressable disabled={submitting} style={[styles.actionBtn, { backgroundColor: theme.accent }, submitting && { opacity: 0.5 }]} onPress={handlePlayAgain}>
            <Text style={styles.actionBtnText}>{submitting ? 'Saving…' : 'Play Again'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <TeamMatchesModal team={openTeam} history={matchdayHistory} accent={theme.accent} onClose={() => setOpenTeam(null)} />
    </View>
  )
}

// Every match a club played, in a scrollable modal (tap a club in the table).
function TeamMatchesModal({ team, history, accent, onClose }: {
  team: { clubId: string; clubName: string } | null
  history: any[]
  accent: string
  onClose: () => void
}) {
  const matches = team
    ? history.flatMap((s: any) => s.fixtures
        .filter((f: any) => f.result && (f.home.clubId === team.clubId || f.away.clubId === team.clubId))
        .map((f: any) => ({ md: s.matchday, ...f })))
    : []
  return (
    <Modal visible={team !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: accent }]} numberOfLines={1}>{team?.clubName}</Text>
          <ScrollView showsVerticalScrollIndicator>
            {matches.map((m: any, i: number) => {
              const isHome = m.home.clubId === team?.clubId
              const gf = isHome ? m.result.homeGoals : m.result.awayGoals
              const ga = isHome ? m.result.awayGoals : m.result.homeGoals
              const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
              const resColor = res === 'W' ? colors.success : res === 'L' ? colors.danger : colors.warning
              const opp = isHome ? m.away.clubName : m.home.clubName
              return (
                <View key={i} style={styles.mmRow}>
                  <Text style={styles.mmMd}>MD{m.md}</Text>
                  <View style={[styles.mmRes, { backgroundColor: resColor + '22' }]}><Text style={[styles.mmResText, { color: resColor }]}>{res}</Text></View>
                  <Text style={styles.mmOpp} numberOfLines={1}>{isHome ? 'vs' : '@'} {opp}</Text>
                  <Text style={styles.mmScore}>{gf}-{ga}</Text>
                </View>
              )
            })}
          </ScrollView>
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  placeholder: {
    width: 32,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  tierCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    gap: spacing.sm,
    ...shadows.md,
  },
  tierEmoji: {
    fontSize: 54,
  },
  tierTitle: {
    fontSize: typography.xl,
    fontWeight: typography.black,
    textAlign: 'center',
    letterSpacing: 1,
  },
  positionText: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  tierDesc: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statVal: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  statLbl: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  rowStatText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  highlightsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  highlightsList: {
    gap: spacing.sm,
  },
  highlightItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlightLabel: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  highlightValue: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  highlightValueBlock: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    flexWrap: 'wrap',
  },
  tableCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  tableRowPlayer: {
    backgroundColor: colors.accent + '11',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  playerRowText: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  tableCol: {
    fontSize: 10,
    fontWeight: typography.bold,
    color: colors.textMuted,
  },
  tableColData: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  colPos: {
    width: 20,
    textAlign: 'center',
  },
  colName: {
    flex: 1,
    paddingLeft: spacing.xs,
  },
  colStat: {
    width: 25,
    textAlign: 'center',
  },
  colPts: {
    width: 32,
    fontWeight: typography.bold,
  },
  actionBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
    flex: 1,
  },
  actionBtnSecondary: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  matchdayCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  matchdaySelector: {
    gap: spacing.sm,
  },
  matchdaySelectorLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  matchdayScroll: {
    flexDirection: 'row',
  },
  matchdayChip: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  matchdayChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  matchdayChipText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.bold,
  },
  matchdayChipTextActive: {
    color: colors.textPrimary,
  },
  matchdayFixtures: {
    gap: spacing.sm,
  },
  matchdaySectionTitle: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  squadStatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  squadPos: { width: 36, fontSize: 10, color: colors.textMuted, fontWeight: typography.bold },
  squadName: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  squadLine: { fontSize: typography.xs, color: colors.textSecondary },
  squadNotable: { fontSize: 10, fontWeight: typography.bold },
  squadMore: { fontSize: typography.sm, fontWeight: typography.bold, textAlign: 'center' },
  fixtureRowWrap: { marginBottom: spacing.sm },
  fixtureScorers: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginTop: 3 },
  fixtureScorerHalf: { flex: 1, fontSize: 10, color: colors.textMuted },
  fixtureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fixtureRowPlayer: {
    backgroundColor: colors.accent + '11',
    borderColor: colors.accent,
  },
  fixtureTeam: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  fixtureTeamHome: {
    textAlign: 'right',
  },
  fixtureTeamAway: {
    textAlign: 'left',
  },
  fixtureTeamPlayer: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  fixtureScore: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  fixtureScoreText: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  fixtureScoreWinner: {
    color: colors.success,
  },
  fixtureScorePlayer: {
    color: colors.accent,
  },
  fixtureScoreDivider: {
    fontSize: typography.md,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  matchdayStandings: {
    gap: spacing.sm,
  },
  graphCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  graphSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  graphScrollH: {
    marginHorizontal: -spacing.xs,
  },
  graphEmpty: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphEmptyText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  positionChangeIndicator: {
    fontSize: 10,
    fontWeight: typography.bold,
    marginLeft: 4,
  },
  tapHint: { fontSize: 10, color: colors.textMuted, textAlign: 'center', fontStyle: 'italic', paddingTop: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '80%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontWeight: typography.black, marginBottom: spacing.xs },
  modalClose: { marginTop: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCloseText: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  mmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  mmMd: { width: 38, fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold },
  mmRes: { width: 24, height: 20, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  mmResText: { fontSize: typography.xs, fontWeight: typography.black },
  mmOpp: { flex: 1, fontSize: typography.sm, color: colors.textSecondary },
  mmScore: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary, minWidth: 34, textAlign: 'right' },
  positionUp: {
    color: colors.success,
  },
  positionDown: {
    color: '#DC2626',
  },
})
