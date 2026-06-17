import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Animated, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr, calcChemistry, effectiveOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { generateFixtures } from '@/engine/fixtures'
import { simulateMatch } from '@/engine/match'
import { assignTier } from '@/engine/tier'
import { generateCLLeagueFixtures, simulateCLKnockoutsOnly } from '@/engine/cl-sim'
import type { CLTeam, CLKnockoutMatch, CLSeasonResult } from '@/engine/cl-sim'
import { assignGroups, generateWCGroupFixtures, simulateWCKnockoutsOnly } from '@/engine/world-cup-sim'
import type { WCTeam, WCGroup, WCKnockoutMatch, WCSeasonResult } from '@/engine/world-cup-sim'
import { expandPenaltyKicks } from '@/engine/knockout-match'
import type { PenKick } from '@/engine/knockout-match'
import { getTopKickers } from '@/db/queries/seasons'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { SimTeam, Fixture, SeasonResult, MatchResult } from '@/types/simulation'
import { getFlag } from '@/lib/flagMap'

type SimPhase = 'review' | 'simulating' | 'completed' | 'group_review' | 'knockout_phase'
type Speed = 'slow' | 'normal' | 'fast'

// Knockout display types (local to this file)
type KnockoutTie = {
  teamA: { clubId: string; clubName: string; isPlayer: boolean }
  teamB: { clubId: string; clubName: string; isPlayer: boolean }
  winner: { clubId: string; clubName: string; isPlayer: boolean }
  aGoals: number
  bGoals: number
  leg1?: { aGoals: number; bGoals: number }
  leg2?: { aGoals: number; bGoals: number }
  extraTime: boolean
  aPens?: number
  bPens?: number
  penKicksA?: PenKick[]
  penKicksB?: PenKick[]
}
type KnockoutRound = {
  round: string
  label: string
  ties: KnockoutTie[]
  autoDelay: number  // ms before auto-advancing to next round
}

const SPEED_MS: Record<Speed, number> = {
  slow: 2000,
  normal: 400,
  fast: 100,
}

type CompMatchResult = {
  home: SimTeam
  away: SimTeam
  homeGoals: number
  awayGoals: number
  outcome: 'home' | 'away' | 'draw'
}

function sortByStats(teams: SimTeam[]): SimTeam[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst
    const gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}

// Top-level router — delegates to the right simulation per mode
export default function SimulationScreen() {
  const mode = useGameStore(s => s.mode)
  if (mode === 'champions_league') return <CLSimulation />
  if (mode === 'world_cup')        return <WCSimulation />
  return <LeagueSimulation />
}

function LeagueSimulation() {
  const {
    draftedPlayers,
    formation,
    placedLeague,
    setSimResult,
    difficulty
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
  const prevPlayerPosRef = useRef<number | null>(null)
  const [playerPosDelta, setPlayerPosDelta] = useState<number | null>(null)
  const [positionChangeAnim] = useState(new Animated.Value(0))
  const [isStartingSimulation, setIsStartingSimulation] = useState(false)
  const [isFinishingSimulation, setIsFinishingSimulation] = useState(false)

  const totalMatchdays = placedLeague?.gamesPerSeason ?? 38

  // Upsets and Margins tracker for the final SeasonResult
  const upsetsRef = useRef<{ score: string; opponent: string; ovrGap: number }[]>([])
  const biggestWinRef = useRef<{ score: string; opponent: string } | null>(null)
  const biggestWinMarginRef = useRef<number>(-1)
  const worstLossRef = useRef<{ score: string; opponent: string } | null>(null)
  const worstLossMarginRef = useRef<number>(-1)

  // Matchday history tracker
  const matchdayHistoryRef = useRef<{ matchday: number; standings: SimTeam[]; fixtures: Fixture[] }[]>([])

  // Smooth row-slide animation (FLIP technique via useLayoutEffect)
  const rowTransAnims = useRef<Record<string, Animated.Value>>({})
  const prevRankRef   = useRef<Record<string, number>>({})
  const rowHeightRef  = useRef<number>(32)
  const pendingSlideRef = useRef<null | (() => void)>(null)

  // Fire pending FLIP animation synchronously after every render (before paint)
  useLayoutEffect(() => {
    if (pendingSlideRef.current) {
      pendingSlideRef.current()
      pendingSlideRef.current = null
    }
  })

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

    // Seed animation refs with initial row order
    teams.forEach((t, idx) => {
      rowTransAnims.current[t.clubId] = new Animated.Value(0)
      prevRankRef.current[t.clubId] = idx
    })

    const fixtures = generateFixtures(teams)
    setSimTeams(teams)
    setAllFixtures(fixtures)
  }, [placedLeague, totalTeamOvr])

  // Simulation loop — setTimeout (not setInterval) so each step fires exactly once.
  // setInterval can fire twice between React re-renders, causing the functional updater
  // prev+1 to be called twice and jump matchdays by 2.
  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    const timer = setTimeout(simulateNextMatchday, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMatchday, simTeams, allFixtures, speed])

  // Guard clause for incomplete data (Safe after hooks)
  if (!formation || !placedLeague || draftedPlayers.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No squad or placement found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Mode Select</Text>
        </Pressable>
      </View>
    )
  }

  function startSimulation() {
    setIsStartingSimulation(true)
    // Small delay to show loading animation
    setTimeout(() => {
      setPhase('simulating')
      setIsPlaying(true)
      setIsStartingSimulation(false)
    }, 500)
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

    // Save matchday snapshot for history with deep copy of team stats
    const standingsSnapshot = sortTeams([...updatedTeams]).map(team => ({
      ...team,
      stats: { ...team.stats }
    }))
    matchdayHistoryRef.current.push({
      matchday: currentMatchday,
      standings: standingsSnapshot,
      fixtures: completedFixtures,
    })

    // Track player position delta for ↑↓ indicator
    const newPos = standingsSnapshot.findIndex(t => t.isPlayer) + 1
    if (prevPlayerPosRef.current !== null) {
      const delta = prevPlayerPosRef.current - newPos
      if (delta !== 0) {
        setPlayerPosDelta(delta)
        positionChangeAnim.setValue(0)
        Animated.timing(positionChangeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      } else {
        setPlayerPosDelta(null)
      }
    }
    prevPlayerPosRef.current = newPos

    // Set up FLIP slide animation for slow mode (fires in useLayoutEffect after render)
    const newRankMap = Object.fromEntries(standingsSnapshot.map((t, i) => [t.clubId, i]))
    if (speed === 'slow') {
      const captured = standingsSnapshot.map((t, i) => ({ clubId: t.clubId, newIdx: i }))
      pendingSlideRef.current = () => {
        const h = rowHeightRef.current
        const anims: Animated.CompositeAnimation[] = []
        captured.forEach(({ clubId, newIdx }) => {
          const oldIdx = prevRankRef.current[clubId] ?? newIdx
          if (oldIdx === newIdx) return
          const anim = rowTransAnims.current[clubId]
          if (!anim) return
          anim.setValue((oldIdx - newIdx) * h)
          anims.push(Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: true }))
        })
        prevRankRef.current = newRankMap
        if (anims.length) Animated.parallel(anims).start()
      }
    } else {
      prevRankRef.current = newRankMap
    }

    if (currentMatchday === totalMatchdays) {
      setIsPlaying(false)
      setPhase('completed')
    } else {
      setCurrentMatchday(prev => prev + 1)
    }
  }

  function skipAllMatchdays() {
    setIsPlaying(false)
    let updatedTeams = [...simTeams]
    
    for (let md = currentMatchday; md <= totalMatchdays; md++) {
      const mdFixtures = allFixtures.filter(f => f.matchday === md)
      
      // Skip if no fixtures for this matchday
      if (mdFixtures.length === 0) {
        // Don't add to matchday history if no fixtures
        continue
      }
      
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

      // Save matchday snapshot for history with deep copy of team stats
      const standingsSnapshot = sortTeams([...updatedTeams]).map(team => ({
        ...team,
        stats: { ...team.stats }
      }))
      matchdayHistoryRef.current.push({
        matchday: md,
        standings: standingsSnapshot,
        fixtures: completedFixtures,
      })
    }

    setSimTeams(updatedTeams)
    setRecentResults(allFixtures.filter(f => f.matchday === totalMatchdays))
    setCurrentMatchday(totalMatchdays)
    setPhase('completed')
  }

  function finishSimulation() {
    setIsFinishingSimulation(true)
    // Small delay to show loading animation
    setTimeout(() => {
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
      setIsFinishingSimulation(false)
      router.push('/game/result')
    }, 500)
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
  
  // Get standings for the current matchday from history
  // Match the header matchday counter with the standings display
  const currentMatchdayStandings = matchdayHistoryRef.current.length > 0
    ? matchdayHistoryRef.current.find(h => h.matchday === currentMatchday)?.standings
      ?? matchdayHistoryRef.current[matchdayHistoryRef.current.length - 1].standings
    : sortedStandings

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
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.ST }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>

              {/* Midfielders */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LM' || s.label === 'CM' || s.label === 'CAM' || s.label === 'CDM' || s.label === 'RM').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.CM }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>

              {/* Defenders */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LB' || s.label === 'CB' || s.label === 'RB').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.CB }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>

              {/* Goalkeeper */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'GK').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.GK }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          </View>

          {/* Action button */}
          <Pressable 
            style={[styles.actionBtn, isStartingSimulation && styles.actionBtnDisabled]} 
            onPress={startSimulation}
            disabled={isStartingSimulation}
          >
            {isStartingSimulation ? (
              <View style={styles.actionBtnContent}>
                <ActivityIndicator color={colors.textPrimary} size="small" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextLoading]}>Starting simulation...</Text>
              </View>
            ) : (
              <Text style={styles.actionBtnText}>START SEASON SIMULATION</Text>
            )}
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

                <Pressable
                  style={[styles.controlBtn, styles.skipAllBtn]}
                  onPress={skipAllMatchdays}
                >
                  <Text style={styles.controlBtnText}>⏩ Skip All</Text>
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
                {currentMatchdayStandings.map((team, idx) => {
                  const gd = team.stats.goalsFor - team.stats.goalsAgainst
                  const slideAnim = rowTransAnims.current[team.clubId]
                  return (
                    <Animated.View
                      key={team.clubId}
                      onLayout={idx === 0 ? e => { rowHeightRef.current = e.nativeEvent.layout.height } : undefined}
                      style={[
                        styles.tableRow,
                        team.isPlayer && styles.tableRowPlayer,
                        slideAnim && speed === 'slow' ? { transform: [{ translateY: slideAnim }] } : undefined,
                      ]}
                    >
                      <View style={[styles.colPos, { flexDirection: 'row', alignItems: 'center' }]}>
                        <Text style={[styles.tableColData, team.isPlayer && styles.playerRowText]}>{idx + 1}</Text>
                        {team.isPlayer && playerPosDelta !== null && (
                          <Animated.Text style={[
                            styles.positionChangeIndicator,
                            playerPosDelta > 0 ? styles.positionUp : styles.positionDown,
                            { opacity: positionChangeAnim }
                          ]}>
                            {playerPosDelta > 0 ? ` ↑${Math.abs(playerPosDelta)}` : ` ↓${Math.abs(playerPosDelta)}`}
                          </Animated.Text>
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
                        {gd > 0 ? `+${gd}` : gd}
                      </Text>
                      <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>
                        {team.stats.points}
                      </Text>
                    </Animated.View>
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
                    const isPlayerMatch = isPlayerHome || isPlayerAway
                    
                    // Determine result color for player's matches
                    let resultColor = null
                    if (isPlayerMatch) {
                      if (isPlayerHome && result.outcome === 'home') {
                        resultColor = colors.success
                      } else if (isPlayerAway && result.outcome === 'away') {
                        resultColor = colors.success
                      } else if (result.outcome === 'draw') {
                        resultColor = colors.warning
                      } else {
                        resultColor = '#DC2626' // red for losses
                      }
                    }
                    
                    return (
                      <View
                        key={i}
                        style={[
                          styles.resultRow,
                          isPlayerMatch && styles.resultRowPlayerHighlight,
                          resultColor && { backgroundColor: resultColor + '15' }
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
                        <View style={[styles.scoreBadge, resultColor && { backgroundColor: resultColor + '33' }]}>
                          <Text style={[styles.scoreText, resultColor && { color: resultColor }]}>
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
            <Pressable 
              style={[styles.finishBtn, isFinishingSimulation && styles.finishBtnDisabled]} 
              onPress={finishSimulation}
              disabled={isFinishingSimulation}
            >
              {isFinishingSimulation ? (
                <View style={styles.finishBtnContent}>
                  <ActivityIndicator color={colors.textPrimary} size="small" />
                  <Text style={[styles.finishBtnText, styles.finishBtnTextLoading]}>Loading results...</Text>
                </View>
              ) : (
                <Text style={styles.finishBtnText}>VIEW FINAL RESULTS & REWARDS →</Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

// ── Champions League Simulation ──────────────────────────────────────────────

function CLSimulation() {
  const { draftedPlayers, formation, clTeams, setClResult } = useGameStore()

  const slots       = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const chem        = draftedPlayers.length > 0 ? calcChemistry(draftedPlayers) : { bonusOvr: 0, bonuses: [] }
  const totalTeamOvr = baseTeamOvr + chem.bonusOvr

  const [phase,                  setPhase]                  = useState<SimPhase>('review')
  const [currentMD,              setCurrentMD]              = useState(1)
  const [simTeams,               setSimTeams]               = useState<CLTeam[]>([])
  const [fixtures,               setFixtures]               = useState<{ matchday: number; home: CLTeam; away: CLTeam }[]>([])
  const [recentResults,          setRecentResults]          = useState<CompMatchResult[]>([])
  const [isPlaying,              setIsPlaying]              = useState(false)
  const [speed,                  setSpeed]                  = useState<Speed>('normal')
  const [isStarting,   setIsStarting]   = useState(false)
  const [isFinishing,  setIsFinishing]  = useState(false)
  const clPrevPosRef = useRef<number | null>(null)
  const [clPosDelta, setClPosDelta]     = useState<number | null>(null)
  const [positionChangeAnim]            = useState(new Animated.Value(0))

  // FLIP animation refs for CL standings
  const clRowTransAnims  = useRef<Record<string, Animated.Value>>({})
  const clPrevRankRef    = useRef<Record<string, number>>({})
  const clRowHeightRef   = useRef<number>(32)
  const clPendingSlideRef = useRef<null | (() => void)>(null)

  useLayoutEffect(() => {
    if (clPendingSlideRef.current) {
      clPendingSlideRef.current()
      clPendingSlideRef.current = null
    }
  })

  // Knockout phase state
  const [koRounds, setKoRounds]             = useState<KnockoutRound[]>([])
  const [koVisibleCount, setKoVisibleCount] = useState(0)
  const [koPenReveal, setKoPenReveal]       = useState(0)
  const koStoredResultRef = useRef<CLSeasonResult | null>(null)
  const koFinishedRef = useRef(false)

  // Auto-advance knockout rounds
  useEffect(() => {
    if (phase !== 'knockout_phase' || koVisibleCount < 1) return
    const currentRound = koRounds[koVisibleCount - 1]
    if (!currentRound) return

    const playerTie = currentRound.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    const totalPenKicks = playerTie?.penKicksA
      ? playerTie.penKicksA.length + (playerTie.penKicksB?.length ?? 0)
      : 0

    if (totalPenKicks > 0 && koPenReveal < totalPenKicks) {
      // Pen animation in progress — tick one kick at a time
      const kickDelay = currentRound.round === 'final' ? 1200
        : currentRound.round === 'sf' ? 1000
        : currentRound.round === 'qf' ? 800 : 600
      const t = setTimeout(() => setKoPenReveal(p => p + 1), kickDelay)
      return () => clearTimeout(t)
    }

    // Pens done (or none) — auto-advance to next round
    if (koVisibleCount < koRounds.length) {
      const t = setTimeout(() => {
        setKoVisibleCount(p => p + 1)
        setKoPenReveal(0)
      }, currentRound.autoDelay)
      return () => clearTimeout(t)
    }
    // All rounds visible — nothing to do, user taps "VIEW FINAL RESULTS"
  }, [phase, koVisibleCount, koPenReveal, koRounds])

  const totalMatchdays = 8

  useEffect(() => {
    if (!clTeams) return
    const teams: CLTeam[] = clTeams.map(t => ({
      ...t,
      ovr:  t.isPlayer ? totalTeamOvr : t.ovr,
      form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    teams.forEach((t, idx) => {
      clRowTransAnims.current[t.clubId] = new Animated.Value(0)
      clPrevRankRef.current[t.clubId] = idx
    })
    setSimTeams(teams)
    setFixtures(generateCLLeagueFixtures(teams))
  }, [clTeams, totalTeamOvr])

  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    const timer = setTimeout(simulateNextMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, simTeams, fixtures, speed])

  if (!clTeams || !formation || draftedPlayers.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No CL data found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back</Text>
        </Pressable>
      </View>
    )
  }

  function simulateNextMD() {
    if (currentMD > totalMatchdays) { handleFinish(); return }

    const mdFixtures = fixtures.filter(f => f.matchday === currentMD)
    const teams      = [...simTeams]
    const results: CompMatchResult[] = []

    mdFixtures.forEach(({ home: h, away: a }) => {
      const home = teams.find(t => t.clubId === h.clubId)!
      const away = teams.find(t => t.clubId === a.clubId)!
      const r    = simulateMatch(home, away)

      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals

      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }

      const upd = (t: CLTeam, out: 'win' | 'draw' | 'loss') => {
        t.form = Math.max(-1, Math.min(1, t.form * 0.85 + (out === 'win' ? 0.15 : out === 'draw' ? 0 : -0.15)))
      }
      upd(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
      upd(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')

      results.push({ home, away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, outcome: r.outcome })
    })

    // Track player position delta for ↑↓ indicator
    const clSorted = sortByStats(teams) as CLTeam[]
    const newPos = clSorted.findIndex(t => t.isPlayer) + 1
    if (clPrevPosRef.current !== null) {
      const delta = clPrevPosRef.current - newPos
      if (delta !== 0) {
        setClPosDelta(delta)
        positionChangeAnim.setValue(0)
        Animated.timing(positionChangeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      } else {
        setClPosDelta(null)
      }
    }
    clPrevPosRef.current = newPos

    // Set up FLIP slide animation for slow mode
    const newRankMap = Object.fromEntries(clSorted.map((t, i) => [t.clubId, i]))
    if (speed === 'slow') {
      const captured = clSorted.map((t, i) => ({ clubId: t.clubId, newIdx: i }))
      clPendingSlideRef.current = () => {
        const h = clRowHeightRef.current
        const anims: Animated.CompositeAnimation[] = []
        captured.forEach(({ clubId, newIdx }) => {
          const oldIdx = clPrevRankRef.current[clubId] ?? newIdx
          if (oldIdx === newIdx) return
          const anim = clRowTransAnims.current[clubId]
          if (!anim) return
          anim.setValue((oldIdx - newIdx) * h)
          anims.push(Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: true }))
        })
        clPrevRankRef.current = newRankMap
        if (anims.length) Animated.parallel(anims).start()
      }
    } else {
      clPrevRankRef.current = newRankMap
    }

    setSimTeams(teams)
    setRecentResults(results)

    if (currentMD === totalMatchdays) { setIsPlaying(false); setPhase('completed') }
    else { setCurrentMD(prev => prev + 1) }
  }

  function skipAll() {
    setIsPlaying(false)
    let teams = [...simTeams]
    for (let md = currentMD; md <= totalMatchdays; md++) {
      fixtures.filter(f => f.matchday === md).forEach(({ home: h, away: a }) => {
        const home = teams.find(t => t.clubId === h.clubId)!
        const away = teams.find(t => t.clubId === a.clubId)!
        const r = simulateMatch(home, away)
        home.stats.played++; away.stats.played++
        home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
        away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
        if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
        else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
        else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
      })
    }
    setSimTeams(teams)
    setCurrentMD(totalMatchdays)
    setRecentResults([])
    setPhase('completed')
  }

  async function handleFinish() {
    setIsFinishing(true)
    koFinishedRef.current = false
    const sorted = sortByStats(simTeams) as CLTeam[]
    const result = simulateCLKnockoutsOnly(sorted)

    // Collect all ties with pen shootouts to fetch kicker names
    const allMatches: CLKnockoutMatch[] = [
      ...result.playoffRound, ...result.r16, ...result.qf, ...result.sf,
      ...(result.final ? [result.final] : []),
    ]
    const penTeamIds = new Set<string>()
    allMatches.filter(m => m.aPens !== undefined).forEach(m => {
      penTeamIds.add(m.teamA.clubId)
      penTeamIds.add(m.teamB.clubId)
    })
    const kickerMap: Record<string, string[]> = {}
    await Promise.all(Array.from(penTeamIds).map(async id => {
      kickerMap[id] = await getTopKickers(id)
    }))

    function buildTie(m: CLKnockoutMatch): KnockoutTie {
      let penKicksA: PenKick[] | undefined
      let penKicksB: PenKick[] | undefined
      if (m.aPens !== undefined && m.bPens !== undefined) {
        const expanded = expandPenaltyKicks(
          kickerMap[m.teamA.clubId] ?? [], kickerMap[m.teamB.clubId] ?? [],
          m.aPens, m.bPens
        )
        penKicksA = expanded.kicksA
        penKicksB = expanded.kicksB
      }
      return {
        teamA: m.teamA, teamB: m.teamB, winner: m.winner,
        aGoals: m.aGoals, bGoals: m.bGoals,
        leg1: m.leg1, leg2: m.leg2,
        extraTime: m.extraTime,
        aPens: m.aPens, bPens: m.bPens,
        penKicksA, penKicksB,
      }
    }

    const rounds: KnockoutRound[] = [
      result.playoffRound.length > 0
        ? { round: 'playoff', label: 'Playoff Round', autoDelay: 2500, ties: result.playoffRound.map(buildTie) }
        : null,
      result.r16.length > 0
        ? { round: 'r16', label: 'Round of 16', autoDelay: 3000, ties: result.r16.map(buildTie) }
        : null,
      result.qf.length > 0
        ? { round: 'qf', label: 'Quarter-Finals', autoDelay: 4000, ties: result.qf.map(buildTie) }
        : null,
      result.sf.length > 0
        ? { round: 'sf', label: 'Semi-Finals', autoDelay: 5000, ties: result.sf.map(buildTie) }
        : null,
      result.final
        ? { round: 'final', label: 'UCL Final', autoDelay: 0, ties: [buildTie(result.final)] }
        : null,
    ].filter(Boolean) as KnockoutRound[]

    koStoredResultRef.current = { leaguePhaseStandings: sorted, ...result }
    setKoRounds(rounds)
    setKoVisibleCount(1)
    setKoPenReveal(0)
    setIsFinishing(false)
    setPhase('knockout_phase')
  }

  function finishKnockoutPhase() {
    if (koFinishedRef.current) return
    koFinishedRef.current = true
    if (koStoredResultRef.current) setClResult(koStoredResultRef.current)
    router.push('/game/cl-result')
  }

  const sorted = sortByStats(simTeams)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>UEFA Champions League</Text>
          <Text style={styles.headerSub}>League Phase · 8 matchdays</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {phase === 'review' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.ovrOverview}>
            <View style={styles.ovrCol}><Text style={styles.ovrLabel}>Squad OVR</Text><Text style={styles.ovrValue}>{baseTeamOvr}</Text></View>
            <View style={styles.ovrDivider} />
            <View style={styles.ovrCol}><Text style={styles.ovrLabel}>Chem Bonus</Text><Text style={[styles.ovrValue, { color: colors.success }]}>+{chem.bonusOvr}</Text></View>
            <View style={styles.ovrDivider} />
            <View style={styles.ovrCol}><Text style={styles.ovrLabel}>Total OVR</Text><Text style={[styles.ovrValue, { color: colors.accent }]}>{totalTeamOvr}</Text></View>
          </View>
          <View style={styles.replacementCard}>
            <Text style={styles.replacementTitle}>UCL League Phase</Text>
            <Text style={styles.replacementText}>
              Your squad plays <Text style={styles.replacementHighlight}>8 games</Text> in a 36-team single league table.{'\n'}
              Top 8 → Round of 16 direct · 9th-24th → Playoff round · Bottom 12 eliminated.
            </Text>
          </View>
          <Pressable
            style={[styles.actionBtn, isStarting && styles.actionBtnDisabled]}
            onPress={() => { setIsStarting(true); setTimeout(() => { setPhase('simulating'); setIsPlaying(true); setIsStarting(false) }, 500) }}
            disabled={isStarting}
          >
            {isStarting
              ? <View style={styles.actionBtnContent}><ActivityIndicator color={colors.textPrimary} size="small" /><Text style={[styles.actionBtnText, styles.actionBtnTextLoading]}>Starting...</Text></View>
              : <Text style={styles.actionBtnText}>START UCL SIMULATION</Text>}
          </Pressable>
        </ScrollView>
      ) : phase === 'knockout_phase' ? (
        <KnockoutPhaseView
          rounds={koRounds}
          visibleCount={koVisibleCount}
          penReveal={koPenReveal}
          competitionLabel="UEFA Champions League"
          onFinish={finishKnockoutPhase}
          onSkipToRound={(idx) => { setKoVisibleCount(idx + 1); setKoPenReveal(Infinity) }}
        />
      ) : (
        <View style={styles.simContainer}>
          <View style={styles.progressCard}>
            <View style={styles.progressTextRow}>
              <Text style={styles.matchdayLabel}>Matchday {currentMD} / {totalMatchdays}</Text>
              <Text style={styles.simStatusText}>{phase === 'completed' ? 'Phase Complete' : isPlaying ? 'Simulating...' : 'Paused'}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${(currentMD / totalMatchdays) * 100}%` }]} />
            </View>
            {phase !== 'completed' && (
              <View style={styles.controlsRow}>
                <Pressable style={[styles.controlBtn, isPlaying && styles.controlBtnActive]} onPress={() => setIsPlaying(!isPlaying)}>
                  <Text style={styles.controlBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
                </Pressable>
                <Pressable style={[styles.controlBtn, styles.skipAllBtn]} onPress={skipAll}>
                  <Text style={styles.controlBtnText}>⏩ Skip All</Text>
                </Pressable>
                <View style={styles.speedSelector}>
                  {(['slow', 'normal', 'fast'] as Speed[]).map(s => (
                    <Pressable key={s} style={[styles.speedBtn, speed === s && styles.speedBtnActive]} onPress={() => setSpeed(s)}>
                      <Text style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}>{s.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={styles.simSplitGrid}>
            <View style={styles.tableCard}>
              <Text style={styles.cardHeaderTitle}>League Phase</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Club</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
              </View>
              <ScrollView style={styles.tableScroll} showsVerticalScrollIndicator={false}>
                {sorted.map((team, idx) => {
                  const gd = team.stats.goalsFor - team.stats.goalsAgainst
                  const slideAnim = clRowTransAnims.current[team.clubId]
                  return (
                    <Animated.View
                      key={team.clubId}
                      onLayout={idx === 0 ? e => { clRowHeightRef.current = e.nativeEvent.layout.height } : undefined}
                      style={[
                        styles.tableRow,
                        team.isPlayer && styles.tableRowPlayer,
                        slideAnim && speed === 'slow' ? { transform: [{ translateY: slideAnim }] } : undefined,
                      ]}
                    >
                      <View style={[styles.colPos, { flexDirection: 'row', alignItems: 'center' }]}>
                        <Text style={[styles.tableColData, team.isPlayer && styles.playerRowText]}>{idx + 1}</Text>
                        {team.isPlayer && clPosDelta !== null && (
                          <Animated.Text style={[
                            styles.positionChangeIndicator,
                            clPosDelta > 0 ? styles.positionUp : styles.positionDown,
                            { opacity: positionChangeAnim }
                          ]}>
                            {clPosDelta > 0 ? ` ↑${Math.abs(clPosDelta)}` : ` ↓${Math.abs(clPosDelta)}`}
                          </Animated.Text>
                        )}
                      </View>
                      <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerRowText]} numberOfLines={1}>{team.clubName}</Text>
                      <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>{team.stats.played}</Text>
                      <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                      <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>{team.stats.points}</Text>
                    </Animated.View>
                  )
                })}
              </ScrollView>
            </View>

            <View style={styles.resultsCard}>
              <Text style={styles.cardHeaderTitle}>MD Results</Text>
              {recentResults.length === 0 ? (
                <View style={styles.emptyResultsBox}><Text style={styles.emptyResultsText}>Waiting for kickoff...</Text></View>
              ) : (
                <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>
                  {recentResults.map((r, i) => {
                    const isPM = r.home.isPlayer || r.away.isPlayer
                    const rc = isPM
                      ? (r.home.isPlayer && r.outcome === 'home') || (r.away.isPlayer && r.outcome === 'away') ? colors.success
                        : r.outcome === 'draw' ? colors.warning : '#DC2626'
                      : null
                    return (
                      <View key={i} style={[styles.resultRow, isPM && styles.resultRowPlayerHighlight, rc && { backgroundColor: rc + '15' }]}>
                        <Text style={[styles.resultClubName, styles.alignRight, r.home.isPlayer && styles.highlightClubText]} numberOfLines={1}>{r.home.clubName}</Text>
                        <View style={[styles.scoreBadge, rc && { backgroundColor: rc + '33' }]}>
                          <Text style={[styles.scoreText, rc && { color: rc }]}>{r.homeGoals} - {r.awayGoals}</Text>
                        </View>
                        <Text style={[styles.resultClubName, styles.alignLeft, r.away.isPlayer && styles.highlightClubText]} numberOfLines={1}>{r.away.clubName}</Text>
                      </View>
                    )
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {phase === 'completed' && (
            <Pressable style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]} onPress={handleFinish} disabled={isFinishing}>
              {isFinishing
                ? <View style={styles.finishBtnContent}><ActivityIndicator color={colors.textPrimary} size="small" /><Text style={[styles.finishBtnText, styles.finishBtnTextLoading]}>Simulating knockouts...</Text></View>
                : <Text style={styles.finishBtnText}>VIEW UCL RESULTS →</Text>}
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

// ── World Cup Simulation ─────────────────────────────────────────────────────

function WCSimulation() {
  const { draftedPlayers, formation, wcTeams, setWcResult } = useGameStore()

  const slots        = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr  = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const chem         = draftedPlayers.length > 0 ? calcChemistry(draftedPlayers) : { bonusOvr: 0, bonuses: [] }
  const totalTeamOvr = baseTeamOvr + chem.bonusOvr

  const [phase,         setPhase]         = useState<SimPhase>('review')
  const [currentMD,     setCurrentMD]     = useState(1)
  const [simTeams,      setSimTeams]      = useState<WCTeam[]>([])
  const [groups,        setGroups]        = useState<WCGroup[]>([])
  const [fixtures,      setFixtures]      = useState<{ matchday: number; home: WCTeam; away: WCTeam }[]>([])
  const [recentResults, setRecentResults] = useState<CompMatchResult[]>([])
  const [isPlaying,     setIsPlaying]     = useState(false)
  // World Cup group stage always runs at "slow" — the pace is locked.
  const speed: Speed = 'slow'
  const [isStarting,    setIsStarting]    = useState(false)
  const [isFinishing,   setIsFinishing]   = useState(false)

  // WC Knockout phase state
  const [wcKoRounds,       setWcKoRounds]       = useState<KnockoutRound[]>([])
  const [wcKoVisibleCount, setWcKoVisibleCount] = useState(0)
  const [wcKoPenReveal,    setWcKoPenReveal]    = useState(0)
  const wcKoStoredResultRef = useRef<WCSeasonResult | null>(null)
  const wcKoFinishedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'knockout_phase' || wcKoVisibleCount < 1) return
    const currentRound = wcKoRounds[wcKoVisibleCount - 1]
    if (!currentRound) return

    const playerTie = currentRound.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    const totalPenKicks = playerTie?.penKicksA
      ? playerTie.penKicksA.length + (playerTie.penKicksB?.length ?? 0)
      : 0

    if (totalPenKicks > 0 && wcKoPenReveal < totalPenKicks) {
      const kickDelay = currentRound.round === 'final' ? 1200
        : currentRound.round === 'sf' ? 1000
        : currentRound.round === 'qf' ? 800 : 600
      const t = setTimeout(() => setWcKoPenReveal(p => p + 1), kickDelay)
      return () => clearTimeout(t)
    }

    if (wcKoVisibleCount < wcKoRounds.length) {
      const t = setTimeout(() => {
        setWcKoVisibleCount(p => p + 1)
        setWcKoPenReveal(0)
      }, currentRound.autoDelay)
      return () => clearTimeout(t)
    }
  }, [phase, wcKoVisibleCount, wcKoPenReveal, wcKoRounds])

  const totalMatchdays = 3

  useEffect(() => {
    if (!wcTeams) return
    const teams: WCTeam[] = wcTeams.map(t => ({
      ...t,
      ovr:  t.isPlayer ? totalTeamOvr : t.ovr,
      form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    const assignedGroups = assignGroups(teams)
    setGroups(assignedGroups)
    setSimTeams(teams)
    setFixtures(generateWCGroupFixtures(assignedGroups))
  }, [wcTeams, totalTeamOvr])

  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    const timer = setTimeout(simulateNextMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, simTeams, fixtures, speed])

  if (!wcTeams || !formation || draftedPlayers.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No World Cup data found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back</Text>
        </Pressable>
      </View>
    )
  }

  function simulateNextMD() {
    if (currentMD > totalMatchdays) { handleFinish(); return }

    const mdFixtures = fixtures.filter(f => f.matchday === currentMD)
    const teams      = [...simTeams]
    const results: CompMatchResult[] = []

    mdFixtures.forEach(({ home: h, away: a }) => {
      const home = teams.find(t => t.clubId === h.clubId)!
      const away = teams.find(t => t.clubId === a.clubId)!
      const r    = simulateMatch(home, away)

      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals

      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }

      const upd = (t: WCTeam, out: 'win' | 'draw' | 'loss') => {
        t.form = Math.max(-1, Math.min(1, t.form * 0.85 + (out === 'win' ? 0.15 : out === 'draw' ? 0 : -0.15)))
      }
      upd(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
      upd(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')

      results.push({ home, away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, outcome: r.outcome })
    })

    setSimTeams(teams)
    setRecentResults(results)

    if (currentMD === totalMatchdays) { setIsPlaying(false); setPhase('group_review') }
    else { setCurrentMD(prev => prev + 1) }
  }

  function skipAll() {
    setIsPlaying(false)
    let teams = [...simTeams]
    for (let md = currentMD; md <= totalMatchdays; md++) {
      fixtures.filter(f => f.matchday === md).forEach(({ home: h, away: a }) => {
        const home = teams.find(t => t.clubId === h.clubId)!
        const away = teams.find(t => t.clubId === a.clubId)!
        const r = simulateMatch(home, away)
        home.stats.played++; away.stats.played++
        home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
        away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
        if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
        else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
        else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
      })
    }
    setSimTeams(teams)
    setCurrentMD(totalMatchdays)
    setRecentResults([])
    setPhase('group_review')
  }

  async function handleFinish() {
    setIsFinishing(true)
    wcKoFinishedRef.current = false

    const clonedGroups: WCGroup[] = groups.map(g => ({
      id: g.id,
      teams: g.teams.map(t => ({ ...t, stats: { ...t.stats } })),
    }))
    const result = simulateWCKnockoutsOnly(clonedGroups, simTeams)

    // Collect teams involved in pen shootouts
    const penTeamIds = new Set<string>()
    result.knockoutRounds.forEach(r => {
      r.matches.filter(m => m.result.homePens !== null).forEach(m => {
        penTeamIds.add(m.teamA.clubId)
        penTeamIds.add(m.teamB.clubId)
      })
    })
    const kickerMap: Record<string, string[]> = {}
    await Promise.all(Array.from(penTeamIds).map(async id => {
      kickerMap[id] = await getTopKickers(id)
    }))

    function buildWCTie(m: WCKnockoutMatch): KnockoutTie {
      const { result: r } = m
      let penKicksA: PenKick[] | undefined
      let penKicksB: PenKick[] | undefined
      if (r.homePens !== null && r.awayPens !== null) {
        const expanded = expandPenaltyKicks(
          kickerMap[m.teamA.clubId] ?? [], kickerMap[m.teamB.clubId] ?? [],
          r.homePens, r.awayPens
        )
        penKicksA = expanded.kicksA
        penKicksB = expanded.kicksB
      }
      return {
        teamA: m.teamA, teamB: m.teamB, winner: m.winner,
        aGoals: r.homeGoals, bGoals: r.awayGoals,
        extraTime: r.extraTime,
        aPens: r.homePens ?? undefined,
        bPens: r.awayPens ?? undefined,
        penKicksA, penKicksB,
      }
    }

    const ROUND_DELAYS: Record<string, number> = {
      r32: 1500, r16: 2500, qf: 4000, sf: 5000, final: 0,
    }
    const ROUND_LABELS: Record<string, string> = {
      r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-Finals', sf: 'Semi-Finals', final: 'World Cup Final',
    }

    const wcRounds: KnockoutRound[] = result.knockoutRounds.map(r => ({
      round: r.round,
      label: ROUND_LABELS[r.round] ?? r.round,
      autoDelay: ROUND_DELAYS[r.round] ?? 3000,
      ties: r.matches.map(buildWCTie),
    }))

    wcKoStoredResultRef.current = { groups: clonedGroups, ...result }
    setWcKoRounds(wcRounds)
    setWcKoVisibleCount(1)
    setWcKoPenReveal(0)
    setIsFinishing(false)
    setPhase('knockout_phase')
  }

  function finishWCKnockoutPhase() {
    if (wcKoFinishedRef.current) return
    wcKoFinishedRef.current = true
    if (wcKoStoredResultRef.current) setWcResult(wcKoStoredResultRef.current)
    router.push('/game/wc-result')
  }

  // Find player's group for the left standings panel
  const playerGroup = groups.find(g => g.teams.some(t => t.isPlayer))
  const playerGroupSorted = playerGroup
    ? [...playerGroup.teams].sort((a, b) => {
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
        const gd = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
        return gd !== 0 ? gd : b.stats.goalsFor - a.stats.goalsFor
      })
    : []

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>FIFA World Cup</Text>
          <Text style={styles.headerSub}>Group Stage{playerGroup ? ` · Group ${playerGroup.id}` : ''}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {phase === 'review' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.ovrOverview}>
            <View style={styles.ovrCol}><Text style={styles.ovrLabel}>Squad OVR</Text><Text style={styles.ovrValue}>{baseTeamOvr}</Text></View>
            <View style={styles.ovrDivider} />
            <View style={styles.ovrCol}><Text style={styles.ovrLabel}>Chem Bonus</Text><Text style={[styles.ovrValue, { color: colors.success }]}>+{chem.bonusOvr}</Text></View>
            <View style={styles.ovrDivider} />
            <View style={styles.ovrCol}><Text style={styles.ovrLabel}>Total OVR</Text><Text style={[styles.ovrValue, { color: colors.accent }]}>{totalTeamOvr}</Text></View>
          </View>
          <View style={styles.replacementCard}>
            <Text style={styles.replacementTitle}>World Cup Group Stage</Text>
            <Text style={styles.replacementText}>
              Your squad plays <Text style={styles.replacementHighlight}>3 group stage games</Text> in a group of 4.{'\n'}
              Top 2 per group + 8 best 3rd-place teams qualify for the Round of 32.
            </Text>
          </View>

          {/* Chemistry Breakdown */}
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
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.ST }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>
              {/* Midfielders */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LM' || s.label === 'CM' || s.label === 'CAM' || s.label === 'CDM' || s.label === 'RM').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.CM }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>
              {/* Defenders */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'LB' || s.label === 'CB' || s.label === 'RB').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.CB }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>
              {/* Goalkeeper */}
              <View style={styles.pitchRow}>
                {slots.filter(s => s.label === 'GK').map((slot, i) => {
                  const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
                  const playerOvr = player ? effectiveOvr(player, slot) : 0
                  return (
                    <View key={i} style={styles.pitchPlayer}>
                      <View style={[styles.posIndicator, { backgroundColor: colors.positions.GK }]}>
                        <Text style={styles.posText}>{slot.label}</Text>
                      </View>
                      <Text style={styles.playerNameText} numberOfLines={1}>
                        {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
                      </Text>
                      <Text style={styles.playerOvrText}>{player ? playerOvr : '--'}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          </View>

          <Pressable
            style={[styles.actionBtn, isStarting && styles.actionBtnDisabled]}
            onPress={() => { setIsStarting(true); setTimeout(() => { setPhase('simulating'); setIsPlaying(true); setIsStarting(false) }, 500) }}
            disabled={isStarting}
          >
            {isStarting
              ? <View style={styles.actionBtnContent}><ActivityIndicator color={colors.textPrimary} size="small" /><Text style={[styles.actionBtnText, styles.actionBtnTextLoading]}>Drawing groups...</Text></View>
              : <Text style={styles.actionBtnText}>START WORLD CUP SIMULATION</Text>}
          </Pressable>
        </ScrollView>
      ) : phase === 'group_review' ? (() => {
        // Compute sorted groups and third-place standings
        const sortFn = (a: WCTeam, b: WCTeam) => {
          if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
          const gdDiff = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
          return gdDiff !== 0 ? gdDiff : b.stats.goalsFor - a.stats.goalsFor
        }
        const sortedGroups = groups.map(g => ({ ...g, teams: [...g.teams].sort(sortFn) }))
        const thirdPlaceTeams = sortedGroups
          .map(g => g.teams[2]).filter(Boolean).sort(sortFn)
        const q3Count = Math.min(8, thirdPlaceTeams.length)

        return (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}>
            <Text style={styles.groupReviewTitle}>Group Stage Complete</Text>
            <Text style={styles.groupReviewSub}>All {groups.length} groups · Top 2 + 8 best 3rd qualify</Text>

            <View style={styles.groupsGrid}>
              {sortedGroups.map(group => {
                const playerInGroup = group.teams.some(t => t.isPlayer)
                return (
                  <View key={group.id} style={[styles.groupCard, playerInGroup && styles.groupCardPlayer]}>
                    <Text style={styles.groupCardTitle}>Group {group.id}</Text>
                    {group.teams.map((team, idx) => {
                      const flag = getFlag(team.clubId)
                      const qualified = idx < 2
                      return (
                        <View key={team.clubId} style={[styles.groupTeamRow, qualified && styles.groupTeamRowQ, team.isPlayer && styles.groupTeamRowSelf]}>
                          <Text style={[styles.groupTeamRank, team.isPlayer && styles.groupTeamRankSelf]}>{idx + 1}</Text>
                          <Text style={[styles.groupTeamName, team.isPlayer && styles.groupTeamNameSelf]} numberOfLines={1}>
                            {flag ? `${flag} ` : ''}{team.clubName}
                          </Text>
                          <Text style={[styles.groupTeamPts, team.isPlayer && styles.groupTeamNameSelf]}>{team.stats.points}</Text>
                        </View>
                      )
                    })}
                  </View>
                )
              })}
            </View>

            {thirdPlaceTeams.length > 0 && (
              <View style={styles.thirdPlaceSection}>
                <Text style={styles.thirdPlaceTitle}>Best Third-Place Teams</Text>
                <Text style={styles.thirdPlaceSub}>Top {q3Count} advance to Round of 32</Text>
                {thirdPlaceTeams.map((team, idx) => {
                  const flag = getFlag(team.clubId)
                  const advances = idx < q3Count
                  return (
                    <View key={team.clubId} style={[styles.thirdPlaceRow, advances && styles.thirdPlaceRowQ, team.isPlayer && styles.groupTeamRowSelf]}>
                      <Text style={styles.thirdPlaceRank}>{idx + 1}</Text>
                      <Text style={[styles.thirdPlaceTeamName, team.isPlayer && styles.groupTeamNameSelf]} numberOfLines={1}>
                        {flag ? `${flag} ` : ''}{team.clubName}
                      </Text>
                      <Text style={[styles.thirdPlacePts, advances && { color: colors.success }]}>{team.stats.points} pts</Text>
                    </View>
                  )
                })}
              </View>
            )}

            <Pressable
              style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]}
              onPress={handleFinish}
              disabled={isFinishing}
            >
              {isFinishing
                ? <View style={styles.finishBtnContent}><ActivityIndicator color={colors.textPrimary} size="small" /><Text style={[styles.finishBtnText, styles.finishBtnTextLoading]}>Simulating knockouts...</Text></View>
                : <Text style={styles.finishBtnText}>CONTINUE TO KNOCKOUTS →</Text>}
            </Pressable>
          </ScrollView>
        )
      })() : phase === 'knockout_phase' ? (
        <KnockoutPhaseView
          rounds={wcKoRounds}
          visibleCount={wcKoVisibleCount}
          penReveal={wcKoPenReveal}
          competitionLabel="FIFA World Cup"
          onFinish={finishWCKnockoutPhase}
          onSkipToRound={(idx) => { setWcKoVisibleCount(idx + 1); setWcKoPenReveal(Infinity) }}
        />
      ) : (
        <View style={styles.simContainer}>
          <View style={styles.progressCard}>
            <View style={styles.progressTextRow}>
              <Text style={styles.matchdayLabel}>Round {currentMD} / {totalMatchdays}</Text>
              <Text style={styles.simStatusText}>{phase === 'completed' ? 'Groups Complete' : isPlaying ? 'Simulating...' : 'Paused'}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${(currentMD / totalMatchdays) * 100}%` }]} />
            </View>
            {phase !== 'completed' && (
              <View style={styles.controlsRow}>
                <Pressable style={[styles.controlBtn, isPlaying && styles.controlBtnActive]} onPress={() => setIsPlaying(!isPlaying)}>
                  <Text style={styles.controlBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
                </Pressable>
                <Pressable style={[styles.controlBtn, styles.skipAllBtn]} onPress={skipAll}>
                  <Text style={styles.controlBtnText}>⏩ Skip All</Text>
                </Pressable>
                <View style={styles.speedLockBadge}>
                  <Text style={styles.speedLockText}>🐢 SLOW</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.simSplitGrid}>
            <View style={styles.tableCard}>
              <Text style={styles.cardHeaderTitle}>
                {playerGroup ? `Group ${playerGroup.id}` : 'Your Group'}
              </Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Team</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
              </View>
              {playerGroupSorted.map((team, idx) => {
                const gd = team.stats.goalsFor - team.stats.goalsAgainst
                const flag = getFlag(team.clubId)
                return (
                  <View key={team.clubId} style={[styles.tableRow, team.isPlayer && styles.tableRowPlayer]}>
                    <Text style={[styles.tableColData, styles.colPos as any, team.isPlayer && styles.playerRowText]}>{idx + 1}</Text>
                    <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerRowText]} numberOfLines={1}>
                      {flag ? `${flag} ` : ''}{team.clubName}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>{team.stats.played}</Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                    <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>{team.stats.points}</Text>
                  </View>
                )
              })}
            </View>

            <View style={styles.resultsCard}>
              <Text style={styles.cardHeaderTitle}>Round Results</Text>
              {recentResults.length === 0 ? (
                <View style={styles.emptyResultsBox}><Text style={styles.emptyResultsText}>Waiting for kickoff...</Text></View>
              ) : (
                <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>
                  {recentResults.map((r, i) => {
                    const isPM = r.home.isPlayer || r.away.isPlayer
                    const rc = isPM
                      ? (r.home.isPlayer && r.outcome === 'home') || (r.away.isPlayer && r.outcome === 'away') ? colors.success
                        : r.outcome === 'draw' ? colors.warning : '#DC2626'
                      : null
                    const homeFlag = getFlag(r.home.clubId)
                    const awayFlag = getFlag(r.away.clubId)
                    return (
                      <View key={i} style={[styles.resultRow, isPM && styles.resultRowPlayerHighlight, rc && { backgroundColor: rc + '15' }]}>
                        <Text style={[styles.resultClubName, styles.alignRight, r.home.isPlayer && styles.highlightClubText]} numberOfLines={1}>
                          {homeFlag ? `${homeFlag} ` : ''}{r.home.clubName}
                        </Text>
                        <View style={[styles.scoreBadge, rc && { backgroundColor: rc + '33' }]}>
                          <Text style={[styles.scoreText, rc && { color: rc }]}>{r.homeGoals} - {r.awayGoals}</Text>
                        </View>
                        <Text style={[styles.resultClubName, styles.alignLeft, r.away.isPlayer && styles.highlightClubText]} numberOfLines={1}>
                          {awayFlag ? `${awayFlag} ` : ''}{r.away.clubName}
                        </Text>
                      </View>
                    )
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {phase === 'completed' && (
            <Pressable style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]} onPress={handleFinish} disabled={isFinishing}>
              {isFinishing
                ? <View style={styles.finishBtnContent}><ActivityIndicator color={colors.textPrimary} size="small" /><Text style={[styles.finishBtnText, styles.finishBtnTextLoading]}>Simulating knockouts...</Text></View>
                : <Text style={styles.finishBtnText}>VIEW WORLD CUP RESULTS →</Text>}
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

// ── Knockout Phase View ────────────────────────────────────────────────────────

type KnockoutPhaseViewProps = {
  rounds: KnockoutRound[]
  visibleCount: number
  penReveal: number   // number of interleaved pen kicks revealed in current round
  competitionLabel: string
  onFinish: () => void
  onSkipToRound: (idx: number) => void  // reserved for future skip UI
}

function KnockoutPhaseView({ rounds, visibleCount, penReveal, competitionLabel, onFinish }: KnockoutPhaseViewProps) {
  const allVisible = visibleCount >= rounds.length
  const currentRound = rounds[visibleCount - 1]

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}>
        <Text style={styles.koTitle}>{competitionLabel}</Text>
        <Text style={styles.koSubtitle}>Knockout Phase</Text>

        {rounds.slice(0, visibleCount).map((round, roundIdx) => {
          const isPast = roundIdx < visibleCount - 1
          const isCurrent = roundIdx === visibleCount - 1
          const playerTie = round.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
          const totalPenKicks = playerTie?.penKicksA
            ? playerTie.penKicksA.length + (playerTie.penKicksB?.length ?? 0)
            : 0
          const currentPenReveal = isCurrent ? penReveal : Infinity

          return (
            <View key={round.round} style={[styles.koRoundCard, isPast && styles.koRoundCardPast]}>
              <Text style={styles.koRoundLabel}>{round.label}</Text>

              {/* Non-player ties: compact grid */}
              <View style={styles.koTiesGrid}>
                {round.ties.filter(t => !t.teamA.isPlayer && !t.teamB.isPlayer).map((tie, i) => (
                  <KnockoutTieCompact key={i} tie={tie} />
                ))}
              </View>

              {/* Player's tie: full display */}
              {playerTie && (
                <KnockoutTieFull
                  tie={playerTie}
                  penReveal={currentPenReveal}
                  isFinal={round.round === 'final'}
                />
              )}
            </View>
          )
        })}

        {/* Loading indicator between rounds */}
        {!allVisible && visibleCount > 0 && (
          <View style={styles.koLoadingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.koLoadingText}>Next round incoming...</Text>
          </View>
        )}

        {/* Final CTA */}
        {allVisible && (
          <Pressable style={styles.finishBtn} onPress={onFinish}>
            <Text style={styles.finishBtnText}>VIEW FINAL RESULTS →</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
}

function KnockoutTieCompact({ tie }: { tie: KnockoutTie }) {
  const { teamA, teamB, winner, aGoals, bGoals, extraTime, aPens, bPens } = tie
  const aWins = winner.clubId === teamA.clubId
  const flagA = getFlag(teamA.clubId)
  const flagB = getFlag(teamB.clubId)

  let suffix = ''
  if (aPens !== undefined) suffix = ` (P ${aPens}-${bPens})`
  else if (extraTime) suffix = ' (AET)'

  return (
    <View style={styles.koTieCompact}>
      <Text style={[styles.koTieCompactTeam, aWins && styles.koTieWinner]} numberOfLines={1}>
        {flagA ? `${flagA} ` : ''}{teamA.clubName}
      </Text>
      <Text style={styles.koTieCompactScore}>
        {aGoals}-{bGoals}{suffix}
      </Text>
      <Text style={[styles.koTieCompactTeam, !aWins && styles.koTieWinner]} numberOfLines={1}>
        {flagB ? `${flagB} ` : ''}{teamB.clubName}
      </Text>
    </View>
  )
}

function KnockoutTieFull({ tie, penReveal }: { tie: KnockoutTie; penReveal: number; isFinal: boolean }) {
  const { teamA, teamB, winner, aGoals, bGoals, leg1, leg2, extraTime, aPens, bPens, penKicksA, penKicksB } = tie
  const aWins = winner.clubId === teamA.clubId
  const flagA = getFlag(teamA.clubId)
  const flagB = getFlag(teamB.clubId)
  const hasPens = aPens !== undefined && bPens !== undefined

  // Build interleaved kick list for reveal
  const interleavedKicks: { team: 'a' | 'b'; kick: PenKick; globalIdx: number }[] = []
  if (penKicksA && penKicksB) {
    const maxKicks = Math.max(penKicksA.length, penKicksB.length)
    for (let i = 0; i < maxKicks; i++) {
      if (penKicksA[i]) interleavedKicks.push({ team: 'a', kick: penKicksA[i], globalIdx: i * 2 })
      if (penKicksB[i]) interleavedKicks.push({ team: 'b', kick: penKicksB[i], globalIdx: i * 2 + 1 })
    }
  }
  const totalPenKicks = interleavedKicks.length
  const revealedKicks = interleavedKicks.filter(k => k.globalIdx < penReveal)

  // Suspense: for shootouts, hold back the winner (and final pens score) until
  // every kick has been revealed. Non-pen ties resolve immediately.
  const penComplete = !hasPens || penReveal >= totalPenKicks
  const shootoutStarted = hasPens && revealedKicks.length > 0

  return (
    <View style={[styles.koTieFull, penComplete ? (winner.isPlayer ? styles.koTileWin : styles.koTileLoss) : styles.koTilePending]}>
      {/* Header row */}
      <View style={styles.koTileHeader}>
        <Text style={[styles.koTileTeam, penComplete && aWins && styles.koTileTeamWinner]} numberOfLines={1}>
          {flagA ? `${flagA} ` : ''}{teamA.clubName}
        </Text>
        <View style={styles.koTileScoreBadge}>
          <Text style={styles.koTileScore}>{aGoals} – {bGoals}</Text>
          {hasPens && penComplete && <Text style={styles.koTilePenScore}>pens {aPens}-{bPens}</Text>}
          {hasPens && !penComplete && <Text style={styles.koTileAet}>{extraTime ? 'AET' : 'FT'} · PENS</Text>}
          {!hasPens && extraTime && <Text style={styles.koTileAet}>AET</Text>}
        </View>
        <Text style={[styles.koTileTeam, penComplete && !aWins && styles.koTileTeamWinner]} numberOfLines={1}>
          {flagB ? `${flagB} ` : ''}{teamB.clubName}
        </Text>
      </View>

      {/* Two-leg details (UCL) */}
      {leg1 && leg2 && (
        <View style={styles.koLegRows}>
          <Text style={styles.koLegRow}>
            Leg 1: {teamA.clubName} {leg1.aGoals}–{leg1.bGoals} {teamB.clubName}
          </Text>
          <Text style={styles.koLegRow}>
            Leg 2: {teamB.clubName} {leg2.bGoals}–{leg2.aGoals} {teamA.clubName}
          </Text>
        </View>
      )}

      {/* Extra-time note (decided in ET, no shootout) */}
      {!hasPens && extraTime && (
        <Text style={styles.koStageNote}>Decided in extra time</Text>
      )}

      {/* Shootout staging — communicates ET happened, builds suspense */}
      {hasPens && (
        <Text style={styles.koStageNote}>
          {penComplete
            ? 'Settled from the spot'
            : 'Level after extra time — it goes to penalties'}
        </Text>
      )}

      {/* Penalty shootout */}
      {shootoutStarted && (
        <View style={styles.koPenContainer}>
          <Text style={styles.koPenTitle}>Penalty Shootout</Text>
          <View style={styles.koPenHeader}>
            <Text style={styles.koPenHeaderTeam}>{teamA.clubName}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.koPenHeaderTeam}>{teamB.clubName}</Text>
          </View>
          {Array.from({ length: Math.ceil(revealedKicks.length / 2) }, (_, i) => {
            const kickA = revealedKicks.find(k => k.team === 'a' && k.globalIdx === i * 2)
            const kickB = revealedKicks.find(k => k.team === 'b' && k.globalIdx === i * 2 + 1)
            return (
              <View key={i} style={styles.koPenRow}>
                {kickA ? (
                  <>
                    <Text style={styles.koPenName} numberOfLines={1}>{kickA.kick.playerName}</Text>
                    <Text style={styles.koPenIcon}>{kickA.kick.scored ? '✅' : '❌'}</Text>
                  </>
                ) : <View style={{ flex: 1 }} />}
                <View style={styles.koPenDivider} />
                {kickB ? (
                  <>
                    <Text style={styles.koPenIcon}>{kickB.kick.scored ? '✅' : '❌'}</Text>
                    <Text style={[styles.koPenName, { textAlign: 'right' }]} numberOfLines={1}>{kickB.kick.playerName}</Text>
                  </>
                ) : <View style={{ flex: 1 }} />}
              </View>
            )
          })}
          {/* Running score */}
          {(() => {
            let scoreA = 0, scoreB = 0
            revealedKicks.forEach(k => {
              if (k.team === 'a' && k.kick.scored) scoreA++
              if (k.team === 'b' && k.kick.scored) scoreB++
            })
            return (
              <Text style={styles.koPenRunningScore}>{scoreA} – {scoreB}</Text>
            )
          })()}
        </View>
      )}

      {/* Winner banner — only once the result is no longer a spoiler */}
      {penComplete && (
        <Text style={[styles.koWinnerBanner, winner.isPlayer ? { color: colors.success } : { color: '#DC2626' }]}>
          {winner.isPlayer ? 'YOU ADVANCE' : `${winner.clubName} advances`}
        </Text>
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
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtnText: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  actionBtnTextLoading: {
    marginLeft: spacing.sm,
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
  skipAllBtn: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
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
  speedLockBadge: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedLockText: {
    fontSize: 9,
    fontWeight: typography.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
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
  positionChangeIndicator: {
    fontSize: 10,
    fontWeight: typography.bold,
    marginLeft: 4,
  },
  positionUp: {
    color: colors.success,
  },
  positionDown: {
    color: '#DC2626',
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
  finishBtnDisabled: {
    opacity: 0.6,
  },
  finishBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  finishBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.black,
    color: colors.bg,
    letterSpacing: 1,
  },
  finishBtnTextLoading: {
    marginLeft: spacing.sm,
  },

  // ── WC Group Review ────────────────────────────────────────────────────────
  groupReviewTitle: {
    fontSize: typography.xl,
    fontWeight: typography.black,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  groupReviewSub: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  groupsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  groupCard: {
    width: '47%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupCardPlayer: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  groupCardTitle: {
    fontSize: typography.sm,
    fontWeight: typography.black,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  groupTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: 4,
  },
  groupTeamRowQ: {
    borderLeftWidth: 2,
    borderLeftColor: colors.success,
    paddingLeft: 4,
  },
  groupTeamRowSelf: {
    backgroundColor: colors.accent + '18',
    borderRadius: radius.xs,
  },
  groupTeamRank: {
    fontSize: 10,
    color: colors.textSecondary,
    width: 12,
    textAlign: 'center',
  },
  groupTeamRankSelf: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  groupTeamName: {
    flex: 1,
    fontSize: 10,
    color: colors.textSecondary,
  },
  groupTeamNameSelf: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  groupTeamPts: {
    fontSize: 10,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    width: 16,
    textAlign: 'right',
  },
  thirdPlaceSection: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  thirdPlaceTitle: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  thirdPlaceSub: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  thirdPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  thirdPlaceRowQ: {
    borderLeftWidth: 2,
    borderLeftColor: colors.success,
    paddingLeft: spacing.sm,
  },
  thirdPlaceRank: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    width: 20,
  },
  thirdPlaceTeamName: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  thirdPlacePts: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textSecondary,
  },

  // ── Knockout Phase ──────────────────────────────────────────────────────────
  koTitle: {
    fontSize: typography.xl,
    fontWeight: typography.black,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  koSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  koRoundCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  koRoundCardPast: {
    opacity: 0.7,
  },
  koRoundLabel: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  koTiesGrid: {
    gap: 4,
  },
  koTieCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  koTieCompactTeam: {
    flex: 1,
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  koTieWinner: {
    color: colors.textPrimary,
    fontWeight: typography.bold,
  },
  koTieCompactScore: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    minWidth: 80,
    textAlign: 'center',
  },
  koTieFull: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent + '44',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  koTileWin: {
    borderColor: colors.success + '66',
  },
  koTileLoss: {
    borderColor: '#DC262666',
  },
  koTilePending: {
    borderColor: colors.warning + '66',
  },
  koStageNote: {
    fontSize: typography.xs,
    color: colors.warning,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  koTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  koTileTeam: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  koTileTeamWinner: {
    color: colors.textPrimary,
    fontWeight: typography.black,
  },
  koTileScoreBadge: {
    alignItems: 'center',
    minWidth: 80,
  },
  koTileScore: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  koTilePenScore: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  koTileAet: {
    fontSize: typography.xs,
    color: colors.warning,
    fontWeight: typography.bold,
  },
  koLegRows: {
    gap: 2,
    paddingLeft: spacing.xs,
  },
  koLegRow: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  koWinnerBanner: {
    fontSize: typography.xs,
    fontWeight: typography.black,
    color: colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  koPenContainer: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
    marginTop: spacing.xs,
  },
  koPenTitle: {
    fontSize: typography.xs,
    fontWeight: typography.black,
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  koPenHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  koPenHeaderTeam: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  koPenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  koPenName: {
    flex: 1,
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  koPenIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  koPenDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  koPenRunningScore: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  koLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  koLoadingText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
})
