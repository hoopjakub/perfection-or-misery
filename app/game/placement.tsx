import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  Animated, ActivityIndicator, ScrollView
} from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getAllClubSeasons, getLeagueSeasonWithTeams, getClubSeasonsForMode } from '@/db/queries/seasons'
import { filterEligibleLeagues, spinPlacement, buildLeagueSeason } from '@/engine/placement'
import { calcTeamOvr, effectiveOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { buildCLTeams } from '@/engine/cl-sim'
import { buildWCTeams } from '@/engine/world-cup-sim'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'
import { useModeTheme } from '@/hooks/useModeTheme'
import { GlobeReveal } from '@/components/GlobeReveal'
import { isoForLeague, isoForNationId } from '@/data/geo-iso'
import type { LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'

// Top-level router — delegates to the right placement component per mode
export default function PlacementScreen() {
  const { mode } = useGameStore()
  if (mode === 'champions_league') return <CLPlacement />
  if (mode === 'world_cup')        return <WCPlacement />
  return <LeaguePlacement />
}

// ── League Placement (original logic) ──────────────────────────────────────

type Phase = 'ready' | 'spinning' | 'revealed'

function LeaguePlacement() {
  const {
    draftedPlayers, formation,
    mode, selectedLeague
  } = useGameStore()
  const theme = useModeTheme()

  const [phase,           setPhase]           = useState<Phase>('ready')
  const [eligibleSeasons, setEligibleSeasons] = useState<LeagueSeasonWithTeams[]>([])
  const [placedLeague,    setPlacedLeague]    = useState<LeagueSeason | null>(null)
  const [teamOvr,         setTeamOvr]         = useState(0)
  const [loading,         setLoading]         = useState(true)
  const [leagueFilter,    setLeagueFilter]    = useState<'all' | 'specific'>('all')
  const [allSeasons,      setAllSeasons]      = useState<LeagueSeasonWithTeams[]>([])

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slots = formation ? getSlotsForFormation(formation) : []

  // Fetch the league-season pool once. Champions League / World Cup are their
  // own modes — exclude their competitions entirely so they can never appear in
  // domestic (League / All-Time / Era) placement.
  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
      setLoading(true)
      const slots = getSlotsForFormation(formation)
      setTeamOvr(calcTeamOvr(draftedPlayers, slots))

      const rows = await getAllClubSeasons()
      const seasonMap = new Map<string, LeagueSeasonWithTeams>()
      for (const cs of rows) {
        if (cs.league_id.startsWith('ucl_') || cs.league_id.startsWith('wc_')) continue
        const key = `${cs.league_id}_${cs.year_start}`
        if (!seasonMap.has(key)) {
          seasonMap.set(key, {
            leagueId: cs.league_id, leagueName: cs.league_name,
            yearStart: cs.year_start, gamesPerSeason: cs.games_per_season, teams: [],
          })
        }
        seasonMap.get(key)!.teams.push({
          club_id: cs.club_id, club_name: cs.club_name, historical_ovr: cs.historical_ovr,
        })
      }
      setAllSeasons(Array.from(seasonMap.values()))
      setLoading(false)
    }
    init()
  }, [])

  // Re-derive the eligible pool whenever the league filter (or OVR) changes.
  // This is what makes the "All Leagues / One League" toggle actually do
  // something — previously the pool was only computed once on mount.
  useEffect(() => {
    if (allSeasons.length === 0) return
    let pool = allSeasons
    if (mode === 'league' && selectedLeague && leagueFilter === 'specific') {
      pool = pool.filter(s => s.leagueId === selectedLeague)
    }
    setEligibleSeasons(filterEligibleLeagues(teamOvr, pool, mode === 'chaos'))
  }, [allSeasons, leagueFilter, teamOvr, mode, selectedLeague])

  // The globe IS the spin now: pick the placement up front, then let the globe
  // rotate and lock onto the country before we reveal the league/season text.
  function handleSpin() {
    if (eligibleSeasons.length === 0) return
    const built = buildLeagueSeason(spinPlacement(eligibleSeasons), teamOvr)
    setPlacedLeague(built)
    fadeAnim.setValue(0); scaleAnim.setValue(0.8)
    setPhase('spinning')
  }

  function handleGlobeLock() {
    setPhase('revealed')
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start()
  }

  function handleContinue() {
    if (!placedLeague) return
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
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.accent }]}>Placement</Text>
        <View style={[styles.ovrPill, { backgroundColor: theme.accent + '33', borderColor: theme.accent }]}>
          <Text style={[styles.ovrPillText, { color: theme.accent }]}>Team OVR {teamOvr}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Squad summary */}
        <View style={styles.squadCard}>
          <Text style={styles.squadLabel}>Your XI</Text>
          <View style={styles.squadRow}>
            {draftedPlayers.sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p, i) => {
              const slot = slots[p.slotIndex]
              const eff  = slot ? effectiveOvr(p, slot) : p.ovr
              return (
                <View key={i} style={styles.squadPlayer}>
                  <Text style={styles.squadPlayerOvr}>{eff}</Text>
                  <Text style={styles.squadPlayerName} numberOfLines={1}>{p.name.split(' ').slice(-1)[0]}</Text>
                </View>
              )
            })}
            {draftedPlayers.length > 5 && (
              <View style={styles.squadPlayer}>
                <Text style={styles.squadPlayerOvr}>+{draftedPlayers.length - 5}</Text>
                <Text style={styles.squadPlayerName}>more</Text>
              </View>
            )}
          </View>
        </View>

        {/* League filter (league mode only) */}
        {mode === 'league' && selectedLeague && (
          <View style={styles.filterCard}>
            <Text style={styles.filterLabel}>League Pool</Text>
            <View style={styles.filterOptions}>
              {(['all', 'specific'] as const).map(opt => (
                <Pressable key={opt}
                  style={[styles.filterOption, leagueFilter === opt && styles.filterOptionActive]}
                  onPress={() => setLeagueFilter(opt)}>
                  <Text style={[styles.filterOptionText, leagueFilter === opt && styles.filterOptionTextActive]}>
                    {opt === 'all' ? 'All Leagues' : 'One League Specific'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Spin zone */}
        <View style={styles.spinZone}>
          {phase === 'ready' && (
            <>
              <Text style={styles.spinReadyEmoji}>🌍</Text>
              <Text style={styles.spinReadyTitle}>Where will you land?</Text>
              <Text style={styles.spinReadySubtitle}>{eligibleSeasons.length} league{eligibleSeasons.length !== 1 ? 's' : ''} eligible</Text>
            </>
          )}
          {phase !== 'ready' && placedLeague && (
            <View style={{ alignItems: 'center' }}>
              <GlobeReveal targetId={isoForLeague(placedLeague.leagueId)} accent={theme.accent} onLock={handleGlobeLock} />
              {phase === 'spinning' && <Text style={styles.spinningDisplay}>Spinning the globe…</Text>}
            </View>
          )}
          {phase === 'revealed' && placedLeague && (
            <Animated.View style={[styles.revealCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              <Text style={styles.revealLabel}>You've been placed in</Text>
              <Text style={styles.revealLeague}>{placedLeague.leagueName}</Text>
              <Text style={[styles.revealSeason, { color: theme.accent }]}>{placedLeague.yearStart}/{String(placedLeague.yearStart + 1).slice(-2)}</Text>
              <Text style={styles.revealReplaced}>Replacing {placedLeague.replacedTeamName}</Text>
              <View style={styles.opponentsSection}>
                <Text style={styles.opponentsLabel}>Top opposition</Text>
                {placedLeague.teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((team, i) => (
                  <View key={i} style={styles.opponentRow}>
                    <Text style={styles.opponentName}>{team.clubName}</Text>
                    <Text style={[styles.opponentOvr,
                      team.ovr > teamOvr && { color: colors.danger },
                      team.ovr < teamOvr && { color: colors.success }]}>
                      OVR {team.ovr}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </View>

        {phase === 'ready'    && <Pressable style={[styles.spinBtn, { backgroundColor: theme.accent }]} onPress={handleSpin}>    <Text style={styles.spinBtnText}>SPIN PLACEMENT</Text></Pressable>}
        {phase === 'revealed' && <Pressable style={styles.continueBtn} onPress={handleContinue}><Text style={styles.continueBtnText}>START SEASON →</Text></Pressable>}
      </View>
    </View>
  )
}

// ── Champions League Placement ──────────────────────────────────────────────

function CLPlacement() {
  const { draftedPlayers, formation, setClTeams, setClYear } = useGameStore()
  const theme = MODE_THEMES.champions_league

  const [phase,       setPhase]       = useState<Phase>('ready')
  const [teamOvr,     setTeamOvr]     = useState(0)
  const [pot,         setPot]         = useState<1 | 2 | 3 | 4>(4)
  const [teamCount,   setTeamCount]   = useState(0)
  const [yearLabel,   setYearLabel]   = useState('')
  const [chosenName,  setChosenName]  = useState('')
  const [spinDisplay, setSpinDisplay] = useState('')
  const [loading,     setLoading]     = useState(true)
  const candidatesRef = useRef<{ club_id: string; club_name: string; historical_ovr: number }[]>([])

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
      const slots = getSlotsForFormation(formation)
      const ovr   = calcTeamOvr(draftedPlayers, slots)
      setTeamOvr(ovr)

      const rows = await getClubSeasonsForMode('champions_league')
      if (rows.length === 0) { setLoading(false); return }

      // Pick a RANDOM UCL edition (both 2024 & 2025 are in the pool). Which club
      // you take over within it is revealed via the spin.
      const years = [...new Set(rows.map(r => r.year_start))]
      const chosenYear = years[Math.floor(Math.random() * years.length)]
      const editionRows = rows.filter(r => r.year_start === chosenYear)
      setYearLabel(`${chosenYear}/${String(chosenYear + 1).slice(-2)}`)
      setClYear(chosenYear)
      candidatesRef.current = [...editionRows].sort((a, b) => a.historical_ovr - b.historical_ovr)
      setTeamCount(editionRows.length)
      setLoading(false)
    }
    init()
  }, [])

  // Build the UCL field with the player in the chosen club's slot, then store it.
  function buildAndStore(replaceIdx: number) {
    const sorted = candidatesRef.current
    const clubs = sorted.map((r, idx) => ({
      clubId:   r.club_id,
      clubName: r.club_name,
      ovr:      r.historical_ovr,
      isPlayer: idx === replaceIdx,
    }))
    clubs[replaceIdx].ovr = teamOvr
    const teams = buildCLTeams(clubs)
    setClTeams(teams)
    setPot(teams.find(t => t.isPlayer)!.pot)
    setTeamCount(teams.length)
  }

  function handleSpin() {
    const sorted = candidatesRef.current
    if (sorted.length === 0) return
    setPhase('spinning')

    // You can now take over ANY of the UCL clubs — Real Madrid or a minnow.
    const replaceIdx = Math.floor(Math.random() * sorted.length)
    const finalName  = sorted[replaceIdx].club_name

    let ticks = 0
    const totalTicks = 24
    function tick() {
      const rnd = sorted[Math.floor(Math.random() * sorted.length)]
      setSpinDisplay(rnd.club_name)
      ticks++
      const delay = ticks < totalTicks * 0.6 ? 80 : ticks < totalTicks * 0.8 ? 160 : 280
      if (ticks < totalTicks) {
        setTimeout(tick, delay)
      } else {
        setSpinDisplay(finalName)
        setChosenName(finalName)
        buildAndStore(replaceIdx)
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(scaleAnim, { toValue: 1, friction: 5,   useNativeDriver: true }),
        ]).start(() => setPhase('revealed'))
      }
    }
    fadeAnim.setValue(0); scaleAnim.setValue(0.9)
    tick()
  }

  function handleEnter() {
    router.push('/game/simulation')
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={styles.loadingText}>Loading UCL draw...</Text>
      </View>
    )
  }

  if (!formation || draftedPlayers.length === 0 || teamCount < 8) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>
          {teamCount < 8 && teamCount > 0
            ? `Only ${teamCount} UCL club${teamCount !== 1 ? 's' : ''} found. Seed at least 8 clubs to play.`
            : 'No UCL data found. Run the database seeder first.'}
        </Text>
        <Pressable onPress={() => router.replace('/game/draft')} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.accent, fontWeight: '700' }}>← Back</Text>
        </Pressable>
      </View>
    )
  }

  const potColors: Record<number, string> = { 1: '#F59E0B', 2: '#A78BFA', 3: '#34D399', 4: '#60A5FA' }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.accent }]}>UCL Draw</Text>
        <View style={[styles.ovrPill, { backgroundColor: theme.accent + '33', borderColor: theme.accent }]}>
          <Text style={[styles.ovrPillText, { color: theme.accent }]}>OVR {teamOvr}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.spinZone}>
          {phase === 'ready' && (
            <>
              <Text style={styles.spinReadyEmoji}>🏆</Text>
              <Text style={styles.spinReadyTitle}>Which club will you take over?</Text>
              <Text style={styles.spinReadySubtitle}>{teamCount} clubs in the {yearLabel} Champions League</Text>
            </>
          )}
          {phase === 'spinning' && (
            <>
              <Text style={styles.spinningDisplay}>{spinDisplay}</Text>
              <ActivityIndicator color={theme.accent} style={{ marginTop: spacing.sm }} />
            </>
          )}
          {phase === 'revealed' && (
            <Animated.View style={[styles.revealCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              <Text style={[styles.compRevealBadge, { color: theme.accent }]}>UEFA CHAMPIONS LEAGUE · {yearLabel}</Text>
              <Text style={styles.revealLabel}>You take over</Text>
              <Text style={styles.revealLeague}>{chosenName}</Text>
              <View style={[styles.potBadge, { backgroundColor: potColors[pot] + '22', borderColor: potColors[pot], marginTop: spacing.sm }]}>
                <Text style={[styles.potBadgeText, { color: potColors[pot] }]}>POT {pot}</Text>
              </View>
              <Text style={styles.compRevealSubtitle}>
                Seeded into Pot {pot} for the league-phase draw among {teamCount} clubs · 8 games · Top 8 → R16 direct.
              </Text>
            </Animated.View>
          )}
        </View>

        {phase === 'ready' && (
          <Pressable style={[styles.spinBtn, { backgroundColor: theme.accent }]} onPress={handleSpin}>
            <Text style={styles.spinBtnText}>SPIN UCL DRAW</Text>
          </Pressable>
        )}
        {phase === 'revealed' && (
          <Pressable style={styles.continueBtn} onPress={handleEnter}>
            <Text style={styles.continueBtnText}>ENTER THE UCL →</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

// ── World Cup Placement ─────────────────────────────────────────────────────

function WCPlacement() {
  const { draftedPlayers, formation, setWcTeams } = useGameStore()
  const theme = MODE_THEMES.world_cup

  const [teamOvr,      setTeamOvr]      = useState(0)
  const [teamCount,    setTeamCount]    = useState(0)
  const [yearLabel,    setYearLabel]    = useState('')
  const [replacedName, setReplacedName] = useState('')
  const [replacedId,   setReplacedId]   = useState('')
  const [loading,      setLoading]      = useState(true)
  const [revealed,     setRevealed]     = useState(false)

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
      const slots = getSlotsForFormation(formation)
      const ovr   = calcTeamOvr(draftedPlayers, slots)
      setTeamOvr(ovr)

      const rows = await getClubSeasonsForMode('world_cup')
      if (rows.length === 0) { setLoading(false); return }

      const latestYear = Math.max(...rows.map(r => r.year_start))
      const editionRows = rows.filter(r => r.year_start === latestYear)
      setYearLabel(String(latestYear))

      // You can now land on ANY of the 48 nations — uniform over the full field,
      // so you might take over Brazil *or* a minnow. The globe makes it dramatic.
      const sortedRows = [...editionRows].sort((a, b) => a.historical_ovr - b.historical_ovr)
      const replaceIdx = Math.floor(Math.random() * sortedRows.length)
      setReplacedName(sortedRows[replaceIdx].club_name)
      setReplacedId(sortedRows[replaceIdx].club_id)

      const clubs = sortedRows.map((r, idx) => ({
        clubId:   r.club_id,
        clubName: idx === replaceIdx ? `${r.club_name} XI` : r.club_name,
        ovr:      r.historical_ovr,
        isPlayer: idx === replaceIdx,
      }))

      clubs[replaceIdx].ovr = ovr

      const teams = buildWCTeams(clubs)
      setTeamCount(teams.length)
      setWcTeams(teams)
      setLoading(false)
      // The globe spin drives the reveal now (see handleGlobeLock).
    }
    init()
  }, [])

  function handleGlobeLock() {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5,   useNativeDriver: true }),
    ]).start(() => setRevealed(true))
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading World Cup draw...</Text>
      </View>
    )
  }

  if (!formation || draftedPlayers.length === 0 || teamCount < 4) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>
          {teamCount < 4 && teamCount > 0
            ? `Only ${teamCount} team${teamCount !== 1 ? 's' : ''} found. Seed at least 4 teams to play.`
            : 'No World Cup data found. Run the database seeder first.'}
        </Text>
        <Pressable onPress={() => router.replace('/game/draft')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.accent }]}>World Cup Draw</Text>
        <View style={[styles.ovrPill, { backgroundColor: theme.accent + '33', borderColor: theme.accent }]}>
          <Text style={[styles.ovrPillText, { color: theme.accent }]}>OVR {teamOvr}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          <GlobeReveal targetId={isoForNationId(replacedId)} accent={theme.accent} onLock={handleGlobeLock} />
          {!revealed && <Text style={styles.spinningDisplay}>Spinning the globe…</Text>}
        </View>

        <Animated.View style={[styles.compRevealCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }], borderColor: theme.accent }]}>
          <Text style={[styles.compRevealBadge, { color: theme.accent }]}>FIFA WORLD CUP</Text>
          <Text style={styles.compRevealYear}>{yearLabel}</Text>

          <Text style={styles.compRevealSubtitle}>
            Your squad takes the place of <Text style={{ color: theme.accent, fontWeight: typography.bold }}>{replacedName}</Text> at the World Cup {yearLabel}, among {teamCount} national teams. Groups will be drawn at the start of simulation.
          </Text>

          <View style={styles.compInfoRow}>
            <View style={styles.compInfoItem}>
              <Text style={styles.compInfoValue}>3</Text>
              <Text style={styles.compInfoLabel}>Group Games</Text>
            </View>
            <View style={styles.compInfoDivider} />
            <View style={styles.compInfoItem}>
              <Text style={styles.compInfoValue}>{teamCount}</Text>
              <Text style={styles.compInfoLabel}>Teams</Text>
            </View>
            <View style={styles.compInfoDivider} />
            <View style={styles.compInfoItem}>
              <Text style={styles.compInfoValue}>12</Text>
              <Text style={styles.compInfoLabel}>Groups</Text>
            </View>
          </View>
        </Animated.View>

        {revealed && (
          <Pressable style={styles.continueBtn} onPress={() => router.push('/game/simulation')}>
            <Text style={styles.continueBtnText}>ENTER THE WORLD CUP →</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText:      { fontSize: typography.sm, color: colors.textSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle:   { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  ovrPill: {
    backgroundColor: colors.accent + '33', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.accent,
  },
  ovrPillText: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.accent },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },

  // Squad card
  squadCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  squadLabel:      { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  squadRow:        { flexDirection: 'row', gap: spacing.sm },
  squadPlayer:     { alignItems: 'center', gap: 2, flex: 1 },
  squadPlayerOvr:  { fontSize: typography.sm, fontWeight: typography.black, color: colors.accent },
  squadPlayerName: { fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center' },

  // Filter card
  filterCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  filterLabel:           { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  filterOptions:         { flexDirection: 'row', gap: spacing.sm },
  filterOption:          { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  filterOptionActive:    { backgroundColor: colors.accent, borderColor: colors.accent },
  filterOptionText:      { fontSize: typography.sm, color: colors.textSecondary, fontWeight: typography.medium },
  filterOptionTextActive:{ color: colors.textPrimary, fontWeight: typography.bold },

  // Spin zone
  spinZone: {
    flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, gap: spacing.md, ...shadows.md,
  },
  spinReadyEmoji:    { fontSize: 56 },
  spinReadyTitle:    { fontSize: typography.xxl, fontWeight: typography.black, color: colors.textPrimary, textAlign: 'center' },
  spinReadySubtitle: { fontSize: typography.sm,  color: colors.textSecondary, textAlign: 'center' },
  spinningDisplay:   { fontSize: typography.xl,  fontWeight: typography.black, color: colors.textPrimary, textAlign: 'center' },

  // Reveal cards
  revealCard: { alignItems: 'center', gap: spacing.sm, width: '100%' },
  revealLabel:    { fontSize: typography.sm, color: colors.textSecondary, textAlign: 'center' },
  revealLeague:   { fontSize: typography.hero, fontWeight: typography.black, color: colors.textPrimary, textAlign: 'center' },
  revealSeason:   { fontSize: typography.xl, fontWeight: typography.bold, color: colors.accent },
  revealReplaced: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center' },
  opponentsSection: { width: '100%', marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  opponentsLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  opponentRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  opponentName:   { fontSize: typography.sm, color: colors.textPrimary },
  opponentOvr:    { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textSecondary },

  // Competition reveal card (CL / WC)
  compRevealCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, alignItems: 'center', gap: spacing.lg,
    ...shadows.md,
  },
  compRevealBadge: {
    fontSize: typography.xs, fontWeight: typography.black,
    color: colors.accent, letterSpacing: 3, textTransform: 'uppercase',
  },
  compRevealYear: {
    fontSize: 48, fontWeight: typography.black, color: colors.textPrimary,
  },
  compRevealSubtitle: {
    fontSize: typography.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20,
  },
  potBadge: {
    borderRadius: radius.full, borderWidth: 2,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  potBadgeText: { fontSize: typography.xl, fontWeight: typography.black },
  compInfoRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  compInfoItem:    { alignItems: 'center', gap: 4 },
  compInfoValue:   { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  compInfoLabel:   { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center' },
  compInfoDivider: { width: 1, height: 36, backgroundColor: colors.border },

  // Buttons
  spinBtn:      { backgroundColor: colors.accent,  borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', ...shadows.md },
  spinBtnText:  { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 3 },
  continueBtn:  { backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', ...shadows.md },
  continueBtnText: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 2 },
})
