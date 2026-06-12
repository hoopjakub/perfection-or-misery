import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  Animated, ActivityIndicator
} from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getAllClubSeasons, getLeagueSeasonWithTeams } from '@/db/queries/seasons'
import { filterEligibleLeagues, spinPlacement, buildLeagueSeason } from '@/engine/placement'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'

type Phase = 'ready' | 'spinning' | 'revealed'

export default function PlacementScreen() {
  const {
    draftedPlayers, formation,
    mode
  } = useGameStore()

  const [phase,           setPhase]           = useState<Phase>('ready')
  const [eligibleSeasons, setEligibleSeasons] = useState<LeagueSeasonWithTeams[]>([])
  const [placedLeague,    setPlacedLeague]    = useState<LeagueSeason | null>(null)
  const [spinDisplay,     setSpinDisplay]     = useState<string>('')
  const [teamOvr,         setTeamOvr]         = useState(0)
  const [loading,         setLoading]         = useState(true)

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current

  const leagueNames = [
    'Premier League', 'La Liga', 'Bundesliga',
    'Serie A', 'Ligue 1', 'Eredivisie',
    'Primeira Liga', 'Championship',
  ]

  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) {
        setLoading(false)
        return
      }
      setLoading(true)

      const slots = getSlotsForFormation(formation)
      const ovr   = calcTeamOvr(draftedPlayers, slots)
      setTeamOvr(ovr)

      // get all seasons and filter eligible
      const allSeasons = await getAllClubSeasons()

      // group by league+year into LeagueSeasonWithTeams format
      const seasonMap = new Map<string, LeagueSeasonWithTeams>()
      for (const cs of allSeasons) {
        const key = `${cs.league_id}_${cs.year_start}`
        if (!seasonMap.has(key)) {
          seasonMap.set(key, {
            leagueId:       cs.league_id,
            leagueName:     cs.league_name,
            yearStart:      cs.year_start,
            gamesPerSeason: cs.games_per_season,
            teams: [],
          })
        }
        seasonMap.get(key)!.teams.push({
          club_id:        cs.club_id,
          club_name:      cs.club_name,
          historical_ovr: cs.historical_ovr,
        })
      }

      const allLeagueSeasons = Array.from(seasonMap.values())
      const eligible = filterEligibleLeagues(
        ovr,
        allLeagueSeasons,
        mode === 'chaos'
      )

      setEligibleSeasons(eligible)
      setLoading(false)
    }
    init()
  }, [])

  function runSpinAnimation(final: LeagueSeasonWithTeams) {
    let ticks = 0
    const totalTicks = 24

    function tick() {
      const name = leagueNames[Math.floor(Math.random() * leagueNames.length)]
      setSpinDisplay(name)
      ticks++

      const delay = ticks < totalTicks * 0.6 ? 80
                  : ticks < totalTicks * 0.8 ? 160 : 280

      if (ticks < totalTicks) {
        setTimeout(tick, delay)
      } else {
        setSpinDisplay(`${final.leagueName} ${final.yearStart}/${String(final.yearStart + 1).slice(-2)}`)

        const built = buildLeagueSeason(final, teamOvr)
        setPlacedLeague(built)

        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1, duration: 500, useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1, friction: 5, useNativeDriver: true,
          }),
        ]).start(() => setPhase('revealed'))
      }
    }

    fadeAnim.setValue(0)
    scaleAnim.setValue(0.8)
    tick()
  }

  function handleSpin() {
    if (eligibleSeasons.length === 0) return
    setPhase('spinning')
    const chosen = spinPlacement(eligibleSeasons)
    runSpinAnimation(chosen)
  }

  function handleContinue() {
    if (!placedLeague) return
    // store placement in game store
    useGameStore.getState().setPlacement(placedLeague)
    router.push('/game/simulation')
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Analysing your squad...</Text>
      </View>
    )
  }

  if (!formation || draftedPlayers.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No squad drafted yet.</Text>
        <Pressable onPress={() => router.replace('/game/draft')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Draft</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Placement</Text>
        <View style={styles.ovrPill}>
          <Text style={styles.ovrPillText}>Team OVR {teamOvr}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* squad summary */}
        <View style={styles.squadCard}>
          <Text style={styles.squadLabel}>Your XI</Text>
          <View style={styles.squadRow}>
            {draftedPlayers
              .sort((a, b) => b.ovr - a.ovr)
              .slice(0, 5)
              .map((p, i) => (
                <View key={i} style={styles.squadPlayer}>
                  <Text style={styles.squadPlayerOvr}>{p.ovr}</Text>
                  <Text style={styles.squadPlayerName} numberOfLines={1}>
                    {p.name.split(' ').slice(-1)[0]}
                  </Text>
                </View>
              ))}
            {draftedPlayers.length > 5 && (
              <View style={styles.squadPlayer}>
                <Text style={styles.squadPlayerOvr}>+{draftedPlayers.length - 5}</Text>
                <Text style={styles.squadPlayerName}>more</Text>
              </View>
            )}
          </View>
        </View>

        {/* spin zone */}
        <View style={styles.spinZone}>
          {phase === 'ready' && (
            <>
              <Text style={styles.spinReadyEmoji}>🌍</Text>
              <Text style={styles.spinReadyTitle}>Where will you land?</Text>
              <Text style={styles.spinReadySubtitle}>
                {eligibleSeasons.length} league{eligibleSeasons.length !== 1 ? 's' : ''} eligible
              </Text>
            </>
          )}

          {phase === 'spinning' && (
            <>
              <Text style={styles.spinningDisplay}>{spinDisplay}</Text>
              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.sm }} />
            </>
          )}

          {phase === 'revealed' && placedLeague && (
            <Animated.View style={[
              styles.revealCard,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
            ]}>
              <Text style={styles.revealLabel}>You've been placed in</Text>
              <Text style={styles.revealLeague}>{placedLeague.leagueName}</Text>
              <Text style={styles.revealSeason}>
                {placedLeague.yearStart}/{String(placedLeague.yearStart + 1).slice(-2)}
              </Text>
              <Text style={styles.revealReplaced}>
                Replacing {placedLeague.replacedTeamName}
              </Text>

              {/* top opponents */}
              <View style={styles.opponentsSection}>
                <Text style={styles.opponentsLabel}>Top opposition</Text>
                {placedLeague.teams
                  .filter(t => !t.isPlayer)
                  .sort((a, b) => b.ovr - a.ovr)
                  .slice(0, 3)
                  .map((team, i) => (
                    <View key={i} style={styles.opponentRow}>
                      <Text style={styles.opponentName}>{team.clubName}</Text>
                      <Text style={[
                        styles.opponentOvr,
                        team.ovr > teamOvr && { color: colors.danger },
                        team.ovr < teamOvr && { color: colors.success },
                      ]}>
                        OVR {team.ovr}
                      </Text>
                    </View>
                  ))}
              </View>
            </Animated.View>
          )}
        </View>

        {/* action button */}
        {phase === 'ready' && (
          <Pressable style={styles.spinBtn} onPress={handleSpin}>
            <Text style={styles.spinBtnText}>SPIN PLACEMENT</Text>
          </Pressable>
        )}

        {phase === 'revealed' && (
          <Pressable style={styles.continueBtn} onPress={handleContinue}>
            <Text style={styles.continueBtnText}>START SEASON →</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex:            1,
    backgroundColor: colors.bg,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.md,
  },
  loadingText: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop:        56,
    paddingBottom:     spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  ovrPill: {
    backgroundColor: colors.accent + '33',
    borderRadius:    radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
    borderWidth:     1,
    borderColor:     colors.accent,
  },
  ovrPillText: {
    fontSize:   typography.sm,
    fontWeight: typography.bold,
    color:      colors.accent,
  },
  body: {
    flex:              1,
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
    gap:               spacing.lg,
  },
  squadCard: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             spacing.sm,
  },
  squadLabel: {
    fontSize:   typography.xs,
    color:      colors.textMuted,
    fontWeight: typography.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  squadRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  squadPlayer: {
    alignItems: 'center',
    gap:        2,
    flex:       1,
  },
  squadPlayerOvr: {
    fontSize:   typography.sm,
    fontWeight: typography.black,
    color:      colors.accent,
  },
  squadPlayerName: {
    fontSize:  typography.xs,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  spinZone: {
    flex:            1,
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xl,
    gap:             spacing.md,
    ...shadows.md,
  },
  spinReadyEmoji: {
    fontSize: 56,
  },
  spinReadyTitle: {
    fontSize:   typography.xxl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
    textAlign:  'center',
  },
  spinReadySubtitle: {
    fontSize:  typography.sm,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  spinningDisplay: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
    textAlign:  'center',
  },
  revealCard: {
    alignItems: 'center',
    gap:        spacing.sm,
    width:      '100%',
  },
  revealLabel: {
    fontSize:  typography.sm,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  revealLeague: {
    fontSize:   typography.hero,
    fontWeight: typography.black,
    color:      colors.textPrimary,
    textAlign:  'center',
  },
  revealSeason: {
    fontSize:   typography.xl,
    fontWeight: typography.bold,
    color:      colors.accent,
  },
  revealReplaced: {
    fontSize:  typography.sm,
    color:     colors.textMuted,
    textAlign: 'center',
  },
  opponentsSection: {
    width:         '100%',
    marginTop:     spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop:    spacing.md,
    gap:           spacing.sm,
  },
  opponentsLabel: {
    fontSize:   typography.xs,
    color:      colors.textMuted,
    fontWeight: typography.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  opponentRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  opponentName: {
    fontSize: typography.sm,
    color:    colors.textPrimary,
  },
  opponentOvr: {
    fontSize:   typography.sm,
    fontWeight: typography.bold,
    color:      colors.textSecondary,
  },
  spinBtn: {
    backgroundColor: colors.accent,
    borderRadius:    radius.md,
    paddingVertical: spacing.lg,
    alignItems:      'center',
    ...shadows.md,
  },
  spinBtnText: {
    fontSize:      typography.lg,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 3,
  },
  continueBtn: {
    backgroundColor: colors.success,
    borderRadius:    radius.md,
    paddingVertical: spacing.lg,
    alignItems:      'center',
    ...shadows.md,
  },
  continueBtnText: {
    fontSize:      typography.lg,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 2,
  },
})