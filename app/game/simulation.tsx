import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Animated, ActivityIndicator
} from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr, calcChemistry } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { generateFixtures } from '@/engine/fixtures'
import { simulateMatch } from '@/engine/match'
import { assignTier } from '@/engine/tier'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { SimTeam, Fixture, SeasonResult, MatchResult } from '@/types/simulation'

type SimPhase = 'review' | 'simulating' | 'completed'
type Speed = 'slow' | 'normal' | 'fast'

const SPEED_MS: Record<Speed, number> = {
  slow: 1000,
  normal: 400,
  fast: 100,
}

export default function SimulationScreen() {
  const {
    draftedPlayers,
    formation,
    placedLeague,
    setSimResult
  } = useGameStore()

  // Calculate OVR & Chem safely at the top with defaults in case of empty store
  const slots = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const chem = draftedPlayers.length > 0 ? calcChemistry(draftedPlayers) : { bonusOvr: 0, bonuses: [] }
  const totalTeamOvr = baseTeamOvr + chem.bonusOvr

  const [phase, setPhase] = useState<SimPhase>('review')
  const [currentMatchday, setCurrentMatchday] = useState(1)
  const [simTeams, setSimTeams] = useState<SimTeam[]>([])
  const [allFixtures, setAllFixtures] = useState<Fixture[]>([])
  const [recentResults, setRecentResults] = useState<Fixture[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>('normal')

  const totalMatchdays = placedLeague?.gamesPerSeason ?? 38

  // Upsets and Margins tracker for the final SeasonResult
  const upsetsRef = useRef<{ score: string; opponent: string; ovrGap: number }[]>([])
  const biggestWinRef = useRef<{ score: string; opponent: string } | null>(null)
  const biggestWinMarginRef = useRef<number>(-1)
  const worstLossRef = useRef<{ score: string; opponent: string } | null>(null)
  const worstLossMarginRef = useRef<number>(-1)

  // Matchday history tracker
  const matchdayHistoryRef = useRef<{ matchday: number; standings: SimTeam[]; fixtures: Fixture[] }[]>([])

  // Initialize Teams & Fixtures
  useEffect(() => {
    if (!placedLeague) return
    const teams: SimTeam[] = placedLeague.teams.map(t => {
      // If it's the player team, assign our simulated OVR (with chem bonus)
      const ovr = t.isPlayer ? totalTeamOvr : t.ovr
      return {
        clubId: t.clubId,
        clubName: t.clubName,
        ovr,
        isPlayer: t.isPlayer,
        form: 0,
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
      }
    })

    const fixtures = generateFixtures(teams)
    setSimTeams(teams)
    setAllFixtures(fixtures)
  }, [placedLeague, totalTeamOvr])

  // Simulation loop
  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return

    const timer = setInterval(() => {
      simulateNextMatchday()
    }, SPEED_MS[speed])

    return () => clearInterval(timer)
  }, [phase, isPlaying, currentMatchday, simTeams, allFixtures, speed])

  // Guard clause for incomplete data (Safe after hooks)
  if (!formation || !placedLeague || draftedPlayers.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No squad or placement found.</Text>
        <Pressable onPress={() => router.replace('/game/draft')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Draft</Text>
        </Pressable>
      </View>
    )
  }

  function startSimulation() {
    setPhase('simulating')
    setIsPlaying(true)
  }

  function simulateNextMatchday() {
    if (currentMatchday > totalMatchdays) {
      finishSimulation()
      return
    }

    const mdFixtures = allFixtures.filter(f => f.matchday === currentMatchday)
    const updatedTeams = [...simTeams]
    const completedFixtures: Fixture[] = []

    // Simulate each fixture on this matchday
    mdFixtures.forEach(fixture => {
      const homeTeam = updatedTeams.find(t => t.clubId === fixture.home.clubId)!
      const awayTeam = updatedTeams.find(t => t.clubId === fixture.away.clubId)!

      const result = simulateMatch(homeTeam, awayTeam)
      fixture.result = result

      // Update statistics
      homeTeam.stats.played++
      awayTeam.stats.played++
      homeTeam.stats.goalsFor += result.homeGoals
      homeTeam.stats.goalsAgainst += result.awayGoals
      awayTeam.stats.goalsFor += result.awayGoals
      awayTeam.stats.goalsAgainst += result.homeGoals

      if (result.outcome === 'home') {
        homeTeam.stats.won++
        homeTeam.stats.points += 3
        awayTeam.stats.lost++
      } else if (result.outcome === 'away') {
        awayTeam.stats.won++
        awayTeam.stats.points += 3
        homeTeam.stats.lost++
      } else {
        homeTeam.stats.drawn++
        homeTeam.stats.points += 1
        awayTeam.stats.drawn++
        awayTeam.stats.points += 1
      }

      // Update Form
      const updateForm = (team: SimTeam, outcome: 'win' | 'draw' | 'loss') => {
        const delta = outcome === 'win' ? 0.15 : outcome === 'draw' ? 0 : -0.15
        team.form = Math.max(-1.0, Math.min(1.0, team.form * 0.85 + delta))
      }
      updateForm(homeTeam, result.outcome === 'home' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')
      updateForm(awayTeam, result.outcome === 'away' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')

      completedFixtures.push(fixture)

      // Track Player Team stats for margins & upsets
      if (homeTeam.isPlayer || awayTeam.isPlayer) {
        const isPlayerHome = homeTeam.isPlayer
        const playerGoals = isPlayerHome ? result.homeGoals : result.awayGoals
        const oppGoals = isPlayerHome ? result.awayGoals : result.homeGoals
        const oppName = isPlayerHome ? awayTeam.clubName : homeTeam.clubName
        const oppOvr = isPlayerHome ? awayTeam.ovr : homeTeam.ovr
        const margin = playerGoals - oppGoals

        // Biggest Win
        if (margin > biggestWinMarginRef.current) {
          biggestWinMarginRef.current = margin
          biggestWinRef.current = { score: `${playerGoals}-${oppGoals}`, opponent: oppName }
        }

        // Worst Loss
        if (worstLossMarginRef.current === -1 || margin < worstLossMarginRef.current) {
          worstLossMarginRef.current = margin
          if (margin < 0) {
            worstLossRef.current = { score: `${playerGoals}-${oppGoals}`, opponent: oppName }
          }
        }

        // Upset (Player lost to a lower-rated team)
        if (result.isUpset) {
          const playerLost =
            (isPlayerHome && result.outcome === 'away') ||
            (!isPlayerHome && result.outcome === 'home')
          if (playerLost) {
            upsetsRef.current.push({
              score: `${playerGoals}-${oppGoals}`,
              opponent: oppName,
              ovrGap: totalTeamOvr - oppOvr,
            })
          }
        }
      }
    })

    setSimTeams(updatedTeams)
    setRecentResults(completedFixtures)

    // Save matchday snapshot for history
    matchdayHistoryRef.current.push({
      matchday: currentMatchday,
      standings: sortTeams([...updatedTeams]),
      fixtures: completedFixtures,
    })

    if (currentMatchday === totalMatchdays) {
      setIsPlaying(false)
      setPhase('completed')
    } else {
      setCurrentMatchday(prev => prev + 1)
    }
  }

  function finishSimulation() {
    const sorted = sortTeams(simTeams)
    const playerTeam = sorted.find(t => t.isPlayer)!
    const finalPosition = sorted.findIndex(t => t.isPlayer) + 1

    const { won, drawn, lost, goalsFor, goalsAgainst } = playerTeam.stats
    const unbeaten = lost === 0
    const perfectSeason = lost === 0 && drawn === 0

    const resultObject: SeasonResult = {
      table: sorted,
      playerTeam,
      finalPosition,
      teamsInLeague: sorted.length,
      wins: won,
      draws: drawn,
      losses: lost,
      goalsFor,
      goalsAgainst,
      biggestWin: biggestWinRef.current,
      worstLoss: worstLossRef.current,
      upsets: upsetsRef.current,
      unbeaten,
      perfectSeason,
      tier: assignTier(finalPosition, sorted.length, unbeaten, perfectSeason),
      matchdayHistory: matchdayHistoryRef.current,
    }

    setSimResult(resultObject)
    router.push('/game/result')
  }

  function sortTeams(teams: SimTeam[]) {
    return [...teams].sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
      const gdA = a.stats.goalsFor - a.stats.goalsAgainst
      const gdB = b.stats.goalsFor - b.stats.goalsAgainst
      if (gdB !== gdA) return gdB - gdA
      return b.stats.goalsFor - a.stats.goalsFor
    })
  }

  const sortedStandings = sortTeams(simTeams)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{placedLeague.leagueName}</Text>
          <Text style={styles.headerSub}>
            Season {placedLeague.yearStart}/{String(placedLeague.yearStart + 1).slice(-2)}
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {phase === 'review' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* OVR Details */}
          <View style={styles.ovrOverview}>
            <View style={styles.ovrCol}>
              <Text style={styles.ovrLabel}>Squad OVR</Text>
              <Text style={styles.ovrValue}>{baseTeamOvr}</Text>
            </View>
            <View style={styles.ovrDivider} />
            <View style={styles.ovrCol}>
              <Text style={styles.ovrLabel}>Chem Bonus</Text>
              <Text style={[styles.ovrValue, { color: colors.success }]}>+{chem.bonusOvr}</Text>
            </View>
            <View style={styles.ovrDivider} />
            <View style={styles.ovrCol}>
              <Text style={styles.ovrLabel}>Total OVR</Text>
              <Text style={[styles.ovrValue, { color: colors.accent }]}>{totalTeamOvr}</Text>
            </View>
          </View>

          {/* Replacement Box */}
          <View style={styles.replacementCard}>
            <Text style={styles.replacementTitle}>Entering the League</Text>
            <Text style={styles.replacementText}>
              Your squad replaces <Text style={styles.replacementHighlight}>{placedLeague.replacedTeamName}</Text> for this season. Good luck!
            </Text>
          </View>

          {/* Chem Links */}
          <View style={styles.chemCard}>
            <Text style={styles.sectionTitle}>Chemistry Breakdown</Text>
            {chem.bonuses.length === 0 ? (
              <Text style={styles.emptyChemText}>No active chemistry bonuses. Try linking players from the same club or country next time!</Text>
            ) : (
              <View style={styles.chemList}>
                {chem.bonuses.map((bonus, idx) => (
                  <View key={idx} style={styles.chemRow}>
                    <Text style={styles.chemLabel}>{bonus.label}</Text>
                    <Text style={styles.chemBonusText}>+{bonus.bonus.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Squad Pitch Layout */}
          <View style={styles.pitchContainer}>
            <Text style={styles.sectionTitle}>Your Lineup ({formation})</Text>
            <View style={styles.pitch}>
              {/* Attackers */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LW' || s.label === 'ST' || s.label === 'RW').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.ST }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? player.ovr : '--'}</Text>
                    </View>
                  )
                })}
              </View>

              {/* Midfielders */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LM' || s.label === 'CM' || s.label === 'CAM' || s.label === 'CDM' || s.label === 'RM').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.CM }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? player.ovr : '--'}</Text>
                    </View>
                  )
                })}
              </View>

              {/* Defenders */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LB' || s.label === 'CB' || s.label === 'RB').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.CB }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? player.ovr : '--'}</Text>
                    </View>
                  )
                })}
              </View>

              {/* Goalkeeper */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'GK').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.GK }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? player.ovr : '--'}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          </View>

          {/* Action button */}
          <Pressable style={styles.actionBtn} onPress={startSimulation}>
            <Text style={styles.actionBtnText}>START SEASON SIMULATION</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.simContainer}>
          {/* Progress Header */}
          <View style={styles.progressCard}>
            <View style={styles.progressTextRow}>
              <Text style={styles.matchdayLabel}>Matchday {currentMatchday} / {totalMatchdays}</Text>
              <Text style={styles.simStatusText}>
                {phase === 'completed' ? 'Season Complete' : isPlaying ? 'Simulating...' : 'Paused'}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${(currentMatchday / totalMatchdays) * 100}%` }
                ]}
              />
            </View>

            {/* Controls */}
            {phase !== 'completed' && (
              <View style={styles.controlsRow}>
                <Pressable
                  style={[styles.controlBtn, isPlaying && styles.controlBtnActive]}
                  onPress={() => setIsPlaying(!isPlaying)}
                >
                  <Text style={styles.controlBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
                </Pressable>

                <View style={styles.speedSelector}>
                  {(['slow', 'normal', 'fast'] as Speed[]).map(s => (
                    <Pressable
                      key={s}
                      style={[styles.speedBtn, speed === s && styles.speedBtnActive]}
                      onPress={() => setSpeed(s)}
                    >
                      <Text style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}>
                        {s.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Main Sim Content */}
          <View style={styles.simSplitGrid}>
            {/* Live Standings Table */}
            <View style={styles.tableCard}>
              <Text style={styles.cardHeaderTitle}>Live Standings</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Club</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
              </View>
              <ScrollView style={styles.tableScroll} showsVerticalScrollIndicator={false}>
                {sortedStandings.map((team, idx) => {
                  const gd = team.stats.goalsFor - team.stats.goalsAgainst
                  return (
                    <View
                      key={team.clubId}
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
                        {gd > 0 ? `+${gd}` : gd}
                      </Text>
                      <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>
                        {team.stats.points}
                      </Text>
                    </View>
                  )
                })}
              </ScrollView>
            </View>

            {/* Live Match ticker (Recent Results) */}
            <View style={styles.resultsCard}>
              <Text style={styles.cardHeaderTitle}>Matchday Results</Text>
              {recentResults.length === 0 ? (
                <View style={styles.emptyResultsBox}>
                  <Text style={styles.emptyResultsText}>Waiting for kickoff...</Text>
                </View>
              ) : (
                <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>
                  {recentResults.map((fixture, i) => {
                    const result = fixture.result!
                    const isPlayerHome = fixture.home.isPlayer
                    const isPlayerAway = fixture.away.isPlayer
                    return (
                      <View
                        key={i}
                        style={[
                          styles.resultRow,
                          (isPlayerHome || isPlayerAway) && styles.resultRowPlayerHighlight
                        ]}
                      >
                        <Text
                          style={[
                            styles.resultClubName,
                            styles.alignRight,
                            isPlayerHome && styles.highlightClubText
                          ]}
                          numberOfLines={1}
                        >
                          {fixture.home.clubName}
                        </Text>
                        <View style={styles.scoreBadge}>
                          <Text style={styles.scoreText}>
                            {result.homeGoals} - {result.awayGoals}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.resultClubName,
                            styles.alignLeft,
                            isPlayerAway && styles.highlightClubText
                          ]}
                          numberOfLines={1}
                        >
                          {fixture.away.clubName}
                        </Text>
                      </View>
                    )
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Completed CTA */}
          {phase === 'completed' && (
            <Pressable style={styles.finishBtn} onPress={finishSimulation}>
              <Text style={styles.finishBtnText}>VIEW FINAL RESULTS & REWARDS →</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.textPrimary,
    fontSize: typography.xl,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  ovrOverview: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  ovrCol: {
    alignItems: 'center',
    gap: 4,
  },
  ovrLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ovrValue: {
    fontSize: typography.xl,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  ovrDivider: {
    width: 1,
    height: '60%',
    backgroundColor: colors.border,
  },
  replacementCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  replacementTitle: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  replacementText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  replacementHighlight: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  chemCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  emptyChemText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  chemList: {
    gap: spacing.xs,
  },
  chemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chemLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  chemBonusText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.success,
  },
  pitchContainer: {
    gap: spacing.xs,
  },
  pitch: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  pitchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  pitchPlayer: {
    alignItems: 'center',
    width: 70,
  },
  posIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  posText: {
    fontSize: 8,
    fontWeight: typography.black,
    color: colors.bg,
  },
  playerNameText: {
    fontSize: typography.xs,
    fontWeight: typography.medium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  playerOvrText: {
    fontSize: 10,
    fontWeight: typography.bold,
    color: colors.textSecondary,
  },
  actionBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
  },
  actionBtnText: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  simContainer: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  progressCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchdayLabel: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  simStatusText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  controlBtn: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  controlBtnActive: {
    borderColor: colors.accent,
  },
  controlBtnText: {
    fontSize: typography.sm,
    color: colors.textPrimary,
    fontWeight: typography.bold,
  },
  speedSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  speedBtn: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  speedBtnText: {
    fontSize: 9,
    fontWeight: typography.bold,
    color: colors.textSecondary,
  },
  speedBtnTextActive: {
    color: colors.bg,
  },
  simSplitGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  tableCard: {
    flex: 1.2,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardHeaderTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  tableScroll: {
    flex: 1,
  },
  resultsCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  emptyResultsBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyResultsText: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  resultsScroll: {
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultRowPlayerHighlight: {
    backgroundColor: colors.accent + '09',
    borderRadius: radius.sm,
  },
  resultClubName: {
    flex: 1,
    fontSize: 10,
    color: colors.textSecondary,
  },
  alignRight: {
    textAlign: 'right',
    paddingRight: spacing.xs,
  },
  alignLeft: {
    textAlign: 'left',
    paddingLeft: spacing.xs,
  },
  highlightClubText: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  scoreBadge: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    minWidth: 40,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 10,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  finishBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.md,
  },
  finishBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.black,
    color: colors.bg,
    letterSpacing: 1,
  },
})
