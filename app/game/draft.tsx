import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Animated, Easing, ActivityIndicator
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { PressCard, BackButton } from '@/components/ui'
import { useGameStore, type Difficulty } from '@/store/gameStore'
import { getSlotsForFormation, getFormationRows } from '@/engine/formations'
import { calcTeamOvr, effectiveOvr, positionPenalty, derivedSecondaryPositions } from '@/engine/rating'
import { getPlayersForClubSeason } from '@/db/queries/players'
import { getAllClubSeasons, getClubSeasonsForMode } from '@/db/queries/seasons'
import { spinClubSeason, isPlayerAvailable } from '@/engine/draft'
import { rerollLimitFor, ratingsHiddenFor } from '@/engine/difficulty'
import { getRandomFact } from '@/lib/clubFacts'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'
import { useModeTheme } from '@/hooks/useModeTheme'
import type { PositionSlot, DraftedPlayer } from '@/types/game'
import type { PlayerRow } from '@/db/queries/players'
import type { ClubSeasonRow } from '@/engine/draft'


type DraftPhase = 'idle' | 'spinning_position' | 'spinning' | 'picking' | 'done'

export default function DraftScreen() {
  const {
    mode, formation, era, difficulty, customDifficulty,
    selectedLeague,
    draftedPlayers, spunSeasonIds,
    rerollsUsed, addPlayer, movePlayer, markSeasonSpun, useReroll,
    useSubstitutes, benchPlayers, addBenchPlayer, swapBenchAndStarter,
  } = useGameStore()
  const theme = useModeTheme()

  // Bench draft — a separate, simpler mini-flow that runs after the main XI
  // is complete (see the 'done' phase below). Deliberately NOT wired into the
  // slot-machine phase state above: subs don't fill a formation slot, so they
  // don't need any of that machinery, and keeping it separate means this can
  // never destabilize the (already complex) starting-XI draft.
  const BENCH_SIZE = 5
  const [benchPhase, setBenchPhase] = useState<'idle' | 'spinning' | 'picking'>('idle')
  const [benchSpinDisplay, setBenchSpinDisplay] = useState<ClubSeasonRow | null>(null)
  const [benchSpin, setBenchSpin] = useState<ClubSeasonRow | null>(null)
  const [benchSquad, setBenchSquad] = useState<PlayerRow[]>([])
  const [benchFact, setBenchFact] = useState<string | null>(null)
  const benchNeeded = useSubstitutes ? Math.max(0, BENCH_SIZE - benchPlayers.length) : 0

  // Same slot-machine tick + fade/scale reveal as the main draft's runSpinAnimation
  // — its own Animated.Values so it can never step on the starting-XI spin.
  const benchFadeAnim  = useRef(new Animated.Value(0)).current
  const benchScaleAnim = useRef(new Animated.Value(0.8)).current

  function runBenchSpinAnimation(finalSpin: ClubSeasonRow) {
    let ticks = 0
    const totalTicks = 20
    function tick() {
      const randomIdx = Math.floor(Math.random() * pool.length)
      setBenchSpinDisplay(pool[randomIdx])
      ticks++
      const delay = ticks < totalTicks * 0.6 ? 60 : ticks < totalTicks * 0.8 ? 120 : 220
      if (ticks < totalTicks) {
        setTimeout(tick, delay)
      } else {
        setBenchSpinDisplay(finalSpin)
        setBenchSpin(finalSpin)
        Animated.parallel([
          Animated.timing(benchFadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(benchScaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
        ]).start(async () => {
          const clubPlayers = await getPlayersForClubSeason(finalSpin.id)
          setBenchSquad(clubPlayers)
          setBenchFact(getRandomFact(finalSpin.id ?? finalSpin.id))
          setBenchPhase('picking')
        })
      }
    }
    benchFadeAnim.setValue(0)
    benchScaleAnim.setValue(0.8)
    tick()
  }

  function handleBenchSpin() {
    if (pool.length === 0 || benchPhase !== 'idle') return
    setBenchPhase('spinning')
    setBenchSquad([])
    setBenchFact(null)
    try {
      const eraYear = era ? parseInt(era.replace('s+', '').replace('s', '')) : undefined
      const spun = spinClubSeason(pool, spunSeasonIds, mode ?? 'league', eraYear)
      markSeasonSpun(spun.id)
      runBenchSpinAnimation(spun)
    } catch {
      setBenchPhase('idle')
    }
  }

  // Bench spins share the SAME reroll pool as the starting-XI draft — not a
  // separate bench-only allowance — so this just re-uses useReroll()/rerollsLeft.
  function handleBenchReroll() {
    if (rerollsLeft <= 0 || benchPhase !== 'picking') return
    useReroll()
    setBenchPhase('spinning')
    setBenchSquad([])
    setBenchFact(null)
    try {
      const eraYear = era ? parseInt(era.replace('s+', '').replace('s', '')) : undefined
      const spun = spinClubSeason(pool, spunSeasonIds, mode ?? 'league', eraYear)
      markSeasonSpun(spun.id)
      runBenchSpinAnimation(spun)
    } catch {
      setBenchPhase('picking')
    }
  }

  function handleBenchPick(p: PlayerRow) {
    if (!benchSpin) return
    addBenchPlayer({
      playerId: p.id, playerSeasonId: `${p.id}_${benchSpin.year_start}`, name: p.name,
      nationality: p.nationality, primaryPosition: p.primary_position as any,
      secondaryPositions: (() => { try { return JSON.parse(p.secondary_positions ?? '[]') } catch { return [] } })(),
      ovr: p.ovr, attack: p.attack, isBench: true,
      clubName: benchSpin.club_name, season: `${benchSpin.year_start}/${String(benchSpin.year_start + 1).slice(-2)}`,
      slotIndex: 11 + benchPlayers.length, isIcon: p.is_icon === 1,
      birthYear: p.birth_year ?? null, yearStart: benchSpin.year_start,
    })
    setBenchPhase('idle'); setBenchSpin(null); setBenchSpinDisplay(null); setBenchSquad([]); setBenchFact(null)
  }

  // Can this bench player relocate into the starting XI at all?
  function canBenchRelocate(p: DraftedPlayer): boolean {
    return slots.some(s => positionPenalty(p.primaryPosition, s.primary) !== null)
  }

  function handleBenchSwap(sub: DraftedPlayer, starterSlotIndex: number) {
    setSlots(prev => prev.map((s, i) =>
      i === starterSlotIndex ? { ...s, filledBy: { ...sub, isBench: false, slotIndex: starterSlotIndex } } : s
    ))
    swapBenchAndStarter(sub.playerId, starterSlotIndex)
    setMovingPlayer(null)
  }

  const [slots,         setSlots]         = useState<PositionSlot[]>([])
  const [pool,          setPool]          = useState<ClubSeasonRow[]>([])
  const [phase,         setPhase]         = useState<DraftPhase>('idle')
  const [currentSpin,   setCurrentSpin]   = useState<ClubSeasonRow | null>(null)
  const [players,       setPlayers]       = useState<PlayerRow[]>([])
  const [fact,          setFact]          = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [spinDisplay,   setSpinDisplay]   = useState<ClubSeasonRow | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null)
  const [showSlotPicker, setShowSlotPicker] = useState(false)
  const [spunPosition,  setSpunPosition]  = useState<PositionSlot | null>(null)
  const [movingPlayer,  setMovingPlayer]  = useState<DraftedPlayer | null>(null)
  const [sortBy,        setSortBy]        = useState<'ovr' | 'position' | 'name'>('ovr')
  const [positionSpinDisplay, setPositionSpinDisplay] = useState<string>('')

  // spin animation
  const spinAnim   = useRef(new Animated.Value(0)).current
  const fadeAnim   = useRef(new Animated.Value(0)).current
  const scaleAnim  = useRef(new Animated.Value(0.8)).current
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const rerollLimit  = rerollLimitFor(difficulty ?? null, customDifficulty, mode ?? null)
  const rerollsLeft  = rerollLimit - rerollsUsed
  const openSlots    = slots.filter(s => s.filledBy === null)
  const filledSlots  = slots.filter(s => s.filledBy !== null)
  const isDraftDone = slots.length > 0 && openSlots.length === 0
  // Hidden ratings: chaos/cursed always, hard preset, or a custom run with the
  // ratings toggle off (engine/difficulty.ts resolves all three).
  const ratingsHidden = ratingsHiddenFor(difficulty ?? null, customDifficulty, mode ?? null)

  // Squad OVR for display — pure positional team rating (no chemistry)
  const baseTeamOvr = slots.length > 0 && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0

  function getPlayerInitials(name: string): string {
    const parts = name.split(' ')
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return parts.map(part => part.charAt(0).toUpperCase()).join('')
  }

  useEffect(() => {
    async function init() {
      if (!formation) return
      setLoading(true)
      const formationSlots = getSlotsForFormation(formation)
      setSlots(formationSlots)

      const allSeasons = await getClubSeasonsForMode(mode ?? 'league', selectedLeague)  
      setPool(allSeasons)
      setLoading(false)
    }
    init()
  }, [formation])

  useEffect(() => {
    if (isDraftDone) {
      setPhase('done')
    }
  }, [isDraftDone])
  
  function handleAssignSlot(slot: PositionSlot) {
    if (!selectedPlayer || !currentSpin) return

    const drafted: DraftedPlayer = {
      playerId:           selectedPlayer.id,
      playerSeasonId:     `${selectedPlayer.id}_${currentSpin.year_start}`,
      name:               selectedPlayer.name,
      nationality:        selectedPlayer.nationality,
      primaryPosition:    selectedPlayer.primary_position as any,
      secondaryPositions: JSON.parse(selectedPlayer.secondary_positions ?? '[]'),
      ovr:                selectedPlayer.ovr,
      attack:             selectedPlayer.attack,
      clubName:           currentSpin.club_name,
      season:             `${currentSpin.year_start}/${String(currentSpin.year_start + 1).slice(-2)}`,
      slotIndex:          slot.slotIndex,
      isIcon:             selectedPlayer.is_icon === 1,
      birthYear:          selectedPlayer.birth_year ?? null,
      yearStart:          currentSpin.year_start,
    }

    setSlots(prev => prev.map((s, i) =>
      i === slot.slotIndex ? { ...s, filledBy: drafted } : s
    ))

    addPlayer(drafted)
    setSelectedPlayer(null)
    setShowSlotPicker(false)
    setPhase('idle')
    setCurrentSpin(null)
    setPlayers([])
    fadeAnim.setValue(0)
    scaleAnim.setValue(0.8)
  }

  // Move a drafted player to a different slot. If the target is OPEN, the old
  // slot frees up. If it's OCCUPIED, the two players SWAP (only offered when both
  // can play each other's position — see the move modal).
  function handleMovePlayer(target: PositionSlot) {
    if (!movingPlayer) return
    const oldIndex = movingPlayer.slotIndex
    const occupant = target.filledBy
    setSlots(prev => prev.map((s, i) => {
      if (i === oldIndex)         return { ...s, filledBy: occupant ? { ...occupant, slotIndex: oldIndex } : null }
      if (i === target.slotIndex) return { ...s, filledBy: { ...movingPlayer, slotIndex: target.slotIndex } }
      return s
    }))
    movePlayer(movingPlayer.playerId, target.slotIndex)
    if (occupant) movePlayer(occupant.playerId, oldIndex)
    setMovingPlayer(null)
  }

  // Can this player relocate at all — to an open compatible slot, or a swap where
  // both players can cover each other's position?
  function canRelocate(p: DraftedPlayer): boolean {
    const slotSwap = slots.some(s => {
      if (s.slotIndex === p.slotIndex) return false
      if (positionPenalty(p.primaryPosition, s.primary) === null) return false
      if (s.filledBy) return positionPenalty(s.filledBy.primaryPosition, slots[p.slotIndex].primary) !== null
      return true
    })
    if (slotSwap) return true
    // Or: bring on a compatible sub in this player's place.
    return benchPlayers.some(b => positionPenalty(b.primaryPosition, slots[p.slotIndex].primary) !== null)
  }
  function runSpinAnimation(finalSpin: ClubSeasonRow) {
    // rapid cycling through random clubs for slot machine effect
    let ticks = 0
    const totalTicks = 20
    const startInterval = 60
    let currentInterval = startInterval

    function tick() {
      const randomIdx = Math.floor(Math.random() * pool.length)
      setSpinDisplay(pool[randomIdx])
      ticks++

      // slow down toward the end
      if (ticks < totalTicks * 0.6) {
        currentInterval = startInterval
      } else if (ticks < totalTicks * 0.8) {
        currentInterval = 120
      } else {
        currentInterval = 220
      }

      if (ticks < totalTicks) {
        intervalRef.current = setTimeout(tick, currentInterval)
      } else {
        // lock on final result
        setSpinDisplay(finalSpin)
        setCurrentSpin(finalSpin)

        // fade in the result
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue:         1,
            duration:        400,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue:         1,
            friction:        6,
            useNativeDriver: true,
          }),
        ]).start(async () => {
          // load players for this club season
          const clubPlayers = await getPlayersForClubSeason(finalSpin.id)
          setPlayers(clubPlayers)
          setFact(getRandomFact(finalSpin.id ?? finalSpin.id))
          setPhase('picking')
        })
      }
    }

    // reset anim values
    fadeAnim.setValue(0)
    scaleAnim.setValue(0.8)
    tick()
  }

  async function handleSpin() {
    if (pool.length === 0 || phase === 'spinning' || phase === 'spinning_position') return
    setSpunPosition(null)
    
    if (mode === 'cursed') {
      setPhase('spinning_position')
      runPositionSpinAnimation()
    } else {
      setPhase('spinning')
      setPlayers([])
      setFact(null)

      try {
        const eraYear = era
          ? parseInt(era.replace('s+', '').replace('s', ''))
          : undefined

        const spun = spinClubSeason(
          pool, spunSeasonIds,
          mode ?? 'league',
          eraYear
        )

        markSeasonSpun(spun.id)
        runSpinAnimation(spun)
      } catch (e: any) {
        if (e.message === 'POOL_EXHAUSTED') {
          setPhase('idle')
          // all seasons spun — just proceed
        }
      }
    }
  }

  function runPositionSpinAnimation() {
    let ticks = 0
    const totalTicks = 20

    function tick() {
      const randomSlot = openSlots[Math.floor(Math.random() * openSlots.length)]
      setPositionSpinDisplay(randomSlot.label)
      ticks++

      const delay = ticks < totalTicks * 0.6 ? 80
                  : ticks < totalTicks * 0.8 ? 160 : 280

      if (ticks < totalTicks) {
        setTimeout(tick, delay)
      } else {
        const finalSlot = openSlots[Math.floor(Math.random() * openSlots.length)]
        setSpunPosition(finalSlot)
        setPositionSpinDisplay(finalSlot.label)

        // After position is revealed, spin for club
        setTimeout(() => {
          setPhase('spinning')
          setPlayers([])
          setFact(null)

          try {
            const eraYear = era
              ? parseInt(era.replace('s+', '').replace('s', ''))
              : undefined

            const spun = spinClubSeason(
              pool, spunSeasonIds,
              mode ?? 'league',
              eraYear
            )

            markSeasonSpun(spun.id)
            runSpinAnimation(spun)
          } catch (e: any) {
            if (e.message === 'POOL_EXHAUSTED') {
              setPhase('idle')
            }
          }
        }, 1000)
      }
    }

    tick()
  }

  async function handleReroll() {
    if (rerollsLeft <= 0 || phase !== 'picking') return
    useReroll()
    setPhase('spinning')
    setPlayers([])
    setFact(null)
    setCurrentSpin(null)

    // unmark the last spun season so it can be re-spun later
    // actually just spin a new one
    try {
      const eraYear = era
        ? parseInt(era.replace('s+', '').replace('s', ''))
        : undefined

      const spun = spinClubSeason(
        pool, spunSeasonIds,
        mode ?? 'league',
        eraYear
      )

      markSeasonSpun(spun.id)
      runSpinAnimation(spun)
    } catch {
      setPhase('picking')
    }
  }

  function handleSelectPlayer(player: PlayerRow) {
    if (!isPlayerAvailable(
      player.primary_position,
      JSON.parse(player.secondary_positions ?? '[]'),
      openSlots
    )) return
    setSelectedPlayer(player)
    setShowSlotPicker(true)
  }


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      {/* header */}
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.accent }]}>Draft</Text>
          <Text style={styles.headerSub}>
            {filledSlots.length}/11 picked
          </Text>
        </View>
        <View style={styles.rerollBadge}>
          <Text style={styles.rerollText}>{rerollsLeft}</Text>
          <Ionicons name="refresh" size={12} color={colors.textSecondary} />
        </View>
      </View>

      {/* slot picker modal - positioned at top */}
      {showSlotPicker && selectedPlayer && (
        <View style={styles.topModalOverlay}>
          <View style={styles.topModalCard}>
            <Text style={styles.modalTitle}>
              Where does {selectedPlayer.name.split(' ').slice(-1)[0]} play?
            </Text>
            <Text style={styles.modalSubtitle}>
              Primary: {selectedPlayer.primary_position}
              {derivedSecondaryPositions(selectedPlayer.primary_position).length > 0
                ? ` · Also: ${derivedSecondaryPositions(selectedPlayer.primary_position).join(', ')}`
                : ''}
            </Text>
            {mode === 'cursed' && spunPosition && (
              <Text style={styles.cursedPositionHint}>
                Cursed Mode: Must pick {spunPosition.label} position
              </Text>
            )}

            <View style={styles.modalSlots}>
              {openSlots.map(slot => {
                // In cursed mode, only show the spun position
                if (mode === 'cursed' && spunPosition && slot.slotIndex !== spunPosition.slotIndex) {
                  return null
                }

                // Same fit logic as effectiveOvr so the rating shown here matches
                // the rating applied once the player is placed.
                const pen = positionPenalty(selectedPlayer.primary_position, slot.primary)
                if (pen === null) return null   // genuinely can't play here
                const penaltyOvr = Math.max(40, selectedPlayer.ovr - pen)
                const isNatural  = pen === 0

                return (
                  <PressCard
                    key={slot.slotIndex}
                    style={[
                      styles.slotOption,
                      styles.slotOptionAvailable,
                    ]}
                    onPress={() => handleAssignSlot(slot)}
                  >
                    <View style={[
                      styles.slotOptionBadge,
                      { backgroundColor: (colors.positions as any)[slot.primary] + '33' }
                    ]}>
                      <Text style={[
                        styles.slotOptionBadgeText,
                        { color: (colors.positions as any)[slot.primary] }
                      ]}>
                        {slot.label}
                      </Text>
                    </View>
                    {!ratingsHidden && (
                      isNatural ? (
                        <Text style={styles.slotNatural}>OVR {penaltyOvr}</Text>
                      ) : (
                        <Text style={styles.slotPenalty}>OVR {penaltyOvr}</Text>
                      )
                    )}
                  </PressCard>
                )
              })}
              {/* fallback if no compatible slot exists */}
              {openSlots.every(slot => positionPenalty(selectedPlayer.primary_position, slot.primary) === null) && (
                <Text style={styles.noSlotText}>No compatible slots open for this player.</Text>
              )}
            </View>

            <PressCard
              style={styles.modalCancel}
              onPress={() => { setShowSlotPicker(false); setSelectedPlayer(null) }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </PressCard>
          </View>
        </View>
      )}

      {/* move picker — relocate to an open slot, swap with a compatible starter,
          or bring on / send off a substitute */}
      {movingPlayer && (() => {
        const isBenchMove = !!movingPlayer.isBench
        const fromSlot = isBenchMove ? null : slots[movingPlayer.slotIndex]

        // A bench player moving IN: any XI slot it can play (always displaces
        // whoever's there — no reciprocal check needed since they head to the bench).
        const slotTargets = isBenchMove
          ? slots.filter(s => positionPenalty(movingPlayer.primaryPosition, s.primary) !== null)
          : slots.filter(s => {
              if (s.slotIndex === movingPlayer.slotIndex) return false
              if (positionPenalty(movingPlayer.primaryPosition, s.primary) === null) return false
              if (s.filledBy) return positionPenalty(s.filledBy.primaryPosition, fromSlot!.primary) !== null
              return true
            })

        // A starter moving OUT: which subs could come on in their place.
        const benchTargets = isBenchMove ? [] : benchPlayers.filter(b =>
          positionPenalty(b.primaryPosition, fromSlot!.primary) !== null
        )

        return (
        <View style={styles.topModalOverlay}>
          <View style={styles.topModalCard}>
            <Text style={styles.modalTitle}>
              {isBenchMove ? `Bring on ${movingPlayer.name.split(' ').slice(-1)[0]} at…` : `Move ${movingPlayer.name.split(' ').slice(-1)[0]} to…`}
            </Text>
            <Text style={styles.modalSubtitle}>
              {movingPlayer.primaryPosition}
              {derivedSecondaryPositions(movingPlayer.primaryPosition).length > 0
                ? ` · Also: ${derivedSecondaryPositions(movingPlayer.primaryPosition).join(', ')}`
                : ''}
            </Text>
            <View style={styles.modalSlots}>
              {slotTargets.map(slot => {
                const pen = positionPenalty(movingPlayer.primaryPosition, slot.primary)!
                const ovrThere = Math.max(40, movingPlayer.ovr - pen)
                const occ = slot.filledBy
                return (
                  <PressCard
                    key={slot.slotIndex}
                    style={[styles.slotOption, styles.slotOptionAvailable]}
                    onPress={() => isBenchMove ? handleBenchSwap(movingPlayer, slot.slotIndex) : handleMovePlayer(slot)}
                  >
                    <View style={[styles.slotOptionBadge, { backgroundColor: (colors.positions as any)[slot.primary] + '33' }]}>
                      <Text style={[styles.slotOptionBadgeText, { color: (colors.positions as any)[slot.primary] }]}>{slot.label}</Text>
                    </View>
                    {occ ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        {/* Swap preview: the player coming IN (their OVR at this slot)
                            and the one going OUT (their OVR back at the vacated slot,
                            or SUB if they're heading to the bench). */}
                        <Text style={styles.slotSwap} numberOfLines={1}>
                          ⇄ {occ.name.split(' ').slice(-1)[0]}
                        </Text>
                        {!ratingsHidden && (() => {
                          const inOvr = ovrThere
                          if (isBenchMove) return (
                            <Text style={styles.slotSwapDetail}>
                              in <Text style={pen === 0 ? styles.slotNatural : styles.slotPenalty}>{inOvr}</Text> · out <Text style={{ color: colors.warning, fontWeight: '900' }}>SUB</Text>
                            </Text>
                          )
                          const backPen = positionPenalty(occ.primaryPosition, fromSlot!.primary)
                          const outOvr = backPen !== null ? Math.max(40, occ.ovr - backPen) : occ.ovr
                          return (
                            <Text style={styles.slotSwapDetail}>
                              in <Text style={pen === 0 ? styles.slotNatural : styles.slotPenalty}>{inOvr}</Text> · out <Text style={backPen === 0 ? styles.slotNatural : styles.slotPenalty}>{outOvr}</Text>
                            </Text>
                          )
                        })()}
                      </View>
                    ) : (!ratingsHidden && <Text style={pen === 0 ? styles.slotNatural : styles.slotPenalty}>OVR {ovrThere}</Text>)}
                  </PressCard>
                )
              })}
              {slotTargets.length === 0 && (
                <Text style={styles.noSlotText}>No slots to move or swap this player into.</Text>
              )}
            </View>

            {!isBenchMove && benchTargets.length > 0 && (
              <>
                <Text style={[styles.modalSubtitle, { marginTop: spacing.md }]}>Or bring on from the bench</Text>
                <View style={styles.modalSlots}>
                  {benchTargets.map(sub => {
                    const subPen = positionPenalty(sub.primaryPosition, fromSlot!.primary)
                    const subOvr = subPen !== null ? Math.max(40, sub.ovr - subPen) : sub.ovr
                    return (
                      <PressCard
                        key={sub.playerId}
                        style={[styles.slotOption, styles.slotOptionAvailable]}
                        onPress={() => handleBenchSwap(sub, movingPlayer.slotIndex)}
                      >
                        <View style={[styles.slotOptionBadge, { backgroundColor: colors.warning + '33' }]}>
                          <Text style={[styles.slotOptionBadgeText, { color: colors.warning }]}>SUB</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                          <Text style={styles.slotSwap} numberOfLines={1}>{sub.name.split(' ').slice(-1)[0]}</Text>
                          {!ratingsHidden && (
                            <Text style={styles.slotSwapDetail}>
                              in <Text style={subPen === 0 ? styles.slotNatural : styles.slotPenalty}>{subOvr}</Text> · out <Text style={{ color: colors.warning, fontWeight: '900' }}>SUB</Text>
                            </Text>
                          )}
                        </View>
                      </PressCard>
                    )
                  })}
                </View>
              </>
            )}

            <PressCard style={styles.modalCancel} onPress={() => setMovingPlayer(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </PressCard>
          </View>
        </View>
        )
      })()}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* formation pitch view – group by position line */}
        {(() => {
          const shape = getFormationRows(formation || '4-3-3')
          const remainingSlots = [...slots]
          const lines = shape.map(row => {
            return row.map(label => {
              const idx = remainingSlots.findIndex(s => s.label === label)
              if (idx !== -1) {
                const slot = remainingSlots[idx]
                remainingSlots.splice(idx, 1)
                return slot
              }
              return null
            }).filter((s): s is PositionSlot => s !== null)
          })

          return (
            <View style={styles.formationPitch}>
              {lines.map((line, li) => (
                <View key={li} style={styles.formationLine}>
                  {line.map(slot => (
                    <View
                      key={slot.slotIndex}
                      style={[
                        styles.formationDot,
                        slot.filledBy && styles.formationDotFilled,
                        !slot.filledBy && openSlots[0]?.slotIndex === slot.slotIndex && styles.formationDotNext,
                      ]}
                    >
                      <Text style={styles.formationDotText}>
                        {slot.filledBy ? getPlayerInitials(slot.filledBy.name) : slot.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )
        })()}

        {/* spin zone */}
        {(phase === 'idle' || phase === 'spinning' || phase === 'spinning_position') && (
          <View style={styles.spinZone}>
            {phase === 'spinning_position' && (
              <View style={styles.spinCard}>
                <Text style={styles.spinClubName}>Position Spin</Text>
                <Text style={styles.spinSeason}>{positionSpinDisplay}</Text>
                <Text style={styles.spinOvr}>Cursed Mode</Text>
              </View>
            )}
            {phase === 'spinning' && spinDisplay ? (
              <View style={styles.spinCard}>
                <View style={styles.spinFlagRow}>
                  {mode === 'world_cup' && flagForCountry(spinDisplay.club_name)
                    ? <Text style={styles.spinFlagInline}>{flagForCountry(spinDisplay.club_name)}</Text> : null}
                  <Text style={styles.spinClubName}>{spinDisplay.club_name}</Text>
                </View>
                {mode !== 'world_cup' && (
                  <Text style={styles.spinSeason}>
                    {spinDisplay.year_start}/{String(spinDisplay.year_start + 1).slice(-2)}
                  </Text>
                )}
              </View>
            ) : phase !== 'spinning_position' && (
              <View style={styles.spinPlaceholder}>
                <Ionicons name="albums-outline" size={34} color={colors.textMuted} style={{ marginBottom: spacing.xs }} />
                <Text style={styles.spinPlaceholderText}>
                  {openSlots.length > 0
                    ? `${openSlots.length} slot${openSlots.length !== 1 ? 's' : ''} remaining`
                    : 'Draft complete'}
                </Text>
                {openSlots.length > 0 && (
                  <Text style={styles.spinPlaceholderHint}>
                    {mode === 'cursed' ? 'Spin for position first' : 'Spin a club to pick from'}
                  </Text>
                )}
              </View>
            )}

            {phase === 'idle' && openSlots.length > 0 && (
              <Pressable
                style={({ pressed }) => [styles.spinBtn, { backgroundColor: theme.accent }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleSpin}
              >
                <Text style={styles.spinBtnText}>SPIN</Text>
              </Pressable>
            )}

            {(phase === 'spinning' || phase === 'spinning_position') && (
              <View style={[styles.spinBtn, styles.spinBtnSpinning]}>
                <ActivityIndicator color={colors.textPrimary} />
              </View>
            )}
          </View>
        )}

        {/* your squad — shown ABOVE the picker so you always see who you've drafted */}
        {filledSlots.length > 0 && (
          <View style={styles.draftedSection}>
            <Text style={styles.draftedTitle}>Your Squad</Text>
            {!ratingsHidden && (
              <View style={styles.teamOvrRow}>
                <Text style={styles.teamOvrLabel}>Team OVR: </Text>
                <Text style={[styles.teamOvrValue, { color: colors.warning }]}>{baseTeamOvr}</Text>
              </View>
            )}
            {slots.filter(s => s.filledBy).map((slot, i) => {
              const player = slot.filledBy!
              const effectiveRating = effectiveOvr(player, slot)
              const isAffected = effectiveRating !== player.ovr
              const canMove = canRelocate(player)
              return (
                <View key={i} style={styles.draftedRow}>
                  <View style={[styles.draftedPosBadge, { backgroundColor: (colors.positions as any)[slot.primary] + '22' }]}>
                    <Text style={[styles.draftedPosText, { color: (colors.positions as any)[slot.primary] }]}>{slot.label}</Text>
                  </View>
                  <Text style={styles.draftedName}>{player.name}</Text>
                  <Text style={styles.draftedClub}>{player.clubName}</Text>
                  {!ratingsHidden && (
                    <Text style={[styles.draftedOvr, isAffected && { color: colors.warning }]}>{effectiveRating}</Text>
                  )}
                  {canMove && (
                    <PressCard style={styles.moveBtn} onPress={() => setMovingPlayer(player)}>
                      <Text style={[styles.moveBtnText, { color: theme.accent }]}>MOVE</Text>
                    </PressCard>
                  )}
                </View>
              )
            })}

            {/* your bench — drafted subs, separate from the XI above */}
            {benchPlayers.length > 0 && (
              <>
                <Text style={styles.benchSectionTitle}>Bench</Text>
                {benchPlayers.map((player, i) => {
                  const canMove = canBenchRelocate(player)
                  return (
                    <View key={i} style={[styles.draftedRow, styles.benchRow]}>
                      <View style={[styles.draftedPosBadge, { backgroundColor: (colors.positions as any)[player.primaryPosition] + '22' }]}>
                        <Text style={[styles.draftedPosText, { color: (colors.positions as any)[player.primaryPosition] }]}>{player.primaryPosition}</Text>
                      </View>
                      <Text style={styles.draftedName}>{player.name}</Text>
                      <Text style={styles.draftedClub}>{player.clubName}</Text>
                      {!ratingsHidden && <Text style={styles.draftedOvr}>{player.ovr}</Text>}
                      {canMove && (
                        <PressCard style={styles.moveBtn} onPress={() => setMovingPlayer(player)}>
                          <Text style={[styles.moveBtnText, { color: theme.accent }]}>MOVE</Text>
                        </PressCard>
                      )}
                    </View>
                  )
                })}
              </>
            )}
          </View>
        )}

        {/* picking phase — club revealed + player cards */}
        {phase === 'picking' && currentSpin && (
          <Animated.View style={[
            styles.pickingZone,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
          ]}>
            {/* club header */}
            <View style={styles.clubHeader}>
              {mode === 'world_cup' && flagForCountry(currentSpin.club_name)
                ? <Text style={{ fontSize: 26, lineHeight: 34, paddingLeft: spacing.md, paddingVertical: spacing.md }}>{flagForCountry(currentSpin.club_name)}</Text>
                : <View style={[styles.clubColorBar, { backgroundColor: currentSpin.primary_color ?? colors.accent }]} />}
              <View style={styles.clubHeaderInfo}>
                <Text style={styles.clubName}>{currentSpin.club_name}</Text>
                {mode !== 'world_cup' && (
                  <Text style={styles.clubSeason}>
                    {currentSpin.year_start}/{String(currentSpin.year_start + 1).slice(-2)}
                  </Text>
                )}
              </View>
              {rerollsLeft > 0 && (
                <PressCard style={styles.rerollBtn} onPress={handleReroll}>
                  <Ionicons name="refresh" size={12} color={colors.textPrimary} />
                  <Text style={styles.rerollBtnText}>Reroll</Text>
                </PressCard>
              )}
            </View>

            {/* fun fact */}
            {fact && (
              <View style={styles.factBox}>
                <Text style={styles.factLabel}>Did you know?</Text>
                <Text style={styles.factText}>{fact}</Text>
              </View>
            )}

            <Text style={styles.pickingLabel}>
              Pick a player{mode === 'cursed' && spunPosition ? ` (${spunPosition.label})` : ''}
            </Text>

            {/* sort controls — OVR only when ratings are visible */}
            <View style={styles.sortRow}>
              <Text style={styles.sortRowLabel}>Sort:</Text>
              {(['ovr', 'position', 'name'] as const).filter(o => o !== 'ovr' || !ratingsHidden).map(o => (
                <PressCard key={o} style={[styles.sortChip, sortBy === o && { borderColor: theme.accent, backgroundColor: theme.accent + '22' }]} onPress={() => setSortBy(o)}>
                  <Text style={[styles.sortChipText, sortBy === o && { color: theme.accent }]}>{o === 'ovr' ? 'OVR' : o === 'position' ? 'Position' : 'A–Z'}</Text>
                </PressCard>
              ))}
            </View>

            {/* skip if no compatible players at all */}
            {players.length > 0 && players.every(p =>
              !isPlayerAvailable(
                p.primary_position,
                JSON.parse(p.secondary_positions ?? '[]'),
                openSlots
              )
            ) && (
              <View style={styles.noPlayersBox}>
                <Text style={styles.noPlayersText}>
                  No players fit your remaining slots. Spin another club.
                </Text>
                <PressCard style={styles.skipBtn} onPress={() => {
                  setPhase('idle')
                  setCurrentSpin(null)
                  setPlayers([])
                  fadeAnim.setValue(0)
                  scaleAnim.setValue(0.8)
                }}>
                  <Text style={styles.skipBtnText}>SKIP →</Text>
                </PressCard>
              </View>
            )}

            {/* player cards — available first, then greyed out */}
            <View style={styles.playerList}>
                {[...players]
                  .sort((a, b) => {
                    const aAvail = isPlayerAvailable(a.primary_position, JSON.parse(a.secondary_positions ?? '[]'), openSlots)
                    const bAvail = isPlayerAvailable(b.primary_position, JSON.parse(b.secondary_positions ?? '[]'), openSlots)
                    if (aAvail && !bAvail) return -1
                    if (!aAvail && bAvail) return 1
                    // Ratings hidden (Chaos/Cursed/hard) → always order by surname
                    // so OVR can't be inferred from list position.
                    const byName = () => a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0])
                    if (ratingsHidden) return byName()
                    if (sortBy === 'name') return byName()
                    if (sortBy === 'position') {
                      const order = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']
                      const d = order.indexOf(a.primary_position) - order.indexOf(b.primary_position)
                      return d !== 0 ? d : b.ovr - a.ovr
                    }
                    return b.ovr - a.ovr
                  })
                  .map(player => {
                  const available = isPlayerAvailable(
                    player.primary_position,
                    JSON.parse(player.secondary_positions ?? '[]'),
                    openSlots
                  )

                  return (
                    <PressCard
                      key={player.id}
                      style={[styles.playerCard, !available && styles.playerCardDisabled]}
                      onPress={() => handleSelectPlayer(player)}
                      disabled={!available}
                    >
                      <View style={styles.playerCardLeft}>
                        <View style={[
                          styles.positionBadge,
                          { backgroundColor: (colors.positions as any)[player.primary_position] + '33' }
                        ]}>
                          <Text style={[
                            styles.positionBadgeText,
                            { color: (colors.positions as any)[player.primary_position] }
                          ]}>
                            {player.primary_position}
                          </Text>
                        </View>
                        <View>
                          <Text style={[styles.playerName, !available && styles.playerNameDisabled]}>
                            {player.name}
                          </Text>
                          <Text style={styles.playerNationality}>{player.nationality}</Text>
                        </View>
                      </View>
                      <View style={styles.playerCardRight}>
                        {!available && <Text style={styles.unavailableLabel}>no slot</Text>}
                        {!ratingsHidden && (
                          <View style={[styles.ovrBadge, !available && styles.ovrBadgeDisabled]}>
                            <Text style={styles.ovrBadgeText}>{player.ovr}</Text>
                          </View>
                        )}
                      </View>
                    </PressCard>
                  )
                })}
            </View>
          </Animated.View>
        )}

        {/* done state */}
        {phase === 'done' && benchNeeded > 0 && (
          <View style={styles.doneZone}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={styles.doneTitle}>Draft Your Bench</Text>
            <Text style={styles.doneSub}>
              {benchPlayers.length}/{BENCH_SIZE} subs drafted — {benchNeeded} more to go.
              Subs get real minutes off the bench, at reduced odds to score or assist.
            </Text>

            {/* spin zone — identical slot-machine feel to the starting-XI spin */}
            {benchPhase === 'idle' && (
              <Pressable
                style={({ pressed }) => [styles.continueBtn, { backgroundColor: theme.accent }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleBenchSpin}
              >
                <Text style={styles.continueBtnText}>SPIN FOR A SUB →</Text>
              </Pressable>
            )}
            {benchPhase === 'spinning' && benchSpinDisplay && (
              <View style={[styles.spinCard, styles.benchStretch]}>
                <View style={styles.spinFlagRow}>
                  {mode === 'world_cup' && flagForCountry(benchSpinDisplay.club_name)
                    ? <Text style={styles.spinFlagInline}>{flagForCountry(benchSpinDisplay.club_name)}</Text> : null}
                  <Text style={styles.spinClubName}>{benchSpinDisplay.club_name}</Text>
                </View>
                {mode !== 'world_cup' && (
                  <Text style={styles.spinSeason}>
                    {benchSpinDisplay.year_start}/{String(benchSpinDisplay.year_start + 1).slice(-2)}
                  </Text>
                )}
              </View>
            )}

            {/* picking phase — same club header + rich player cards as the XI draft.
                alignSelf: 'stretch' on every level here matters: doneZone centers its
                children (alignItems: 'center'), so without it these would shrink-wrap
                to content width instead of filling the card — which is exactly what
                squished the flag/name text into a single narrow column before. */}
            {benchPhase === 'picking' && benchSpin && (
              <Animated.View style={[
                styles.pickingZone, styles.benchStretch,
                { opacity: benchFadeAnim, transform: [{ scale: benchScaleAnim }] },
              ]}>
                <View style={styles.clubHeader}>
                  {mode === 'world_cup' && flagForCountry(benchSpin.club_name)
                    ? <Text style={{ fontSize: 26, lineHeight: 34, paddingLeft: spacing.md, paddingVertical: spacing.md }}>{flagForCountry(benchSpin.club_name)}</Text>
                    : <View style={[styles.clubColorBar, { backgroundColor: benchSpin.primary_color ?? colors.accent }]} />}
                  <View style={styles.clubHeaderInfo}>
                    <Text style={styles.clubName}>{benchSpin.club_name}</Text>
                    {mode !== 'world_cup' && (
                      <Text style={styles.clubSeason}>
                        {benchSpin.year_start}/{String(benchSpin.year_start + 1).slice(-2)}
                      </Text>
                    )}
                  </View>
                  {rerollsLeft > 0 && (
                    <PressCard style={styles.rerollBtn} onPress={handleBenchReroll}>
                      <Ionicons name="refresh" size={12} color={colors.textPrimary} />
                      <Text style={styles.rerollBtnText}>Reroll</Text>
                    </PressCard>
                  )}
                </View>

                {benchFact && (
                  <View style={styles.factBox}>
                    <Text style={styles.factLabel}>Did you know?</Text>
                    <Text style={styles.factText}>{benchFact}</Text>
                  </View>
                )}

                <Text style={styles.pickingLabel}>Pick your sub</Text>

                <ScrollView style={styles.benchPlayerScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                <View style={styles.playerList}>
                  {[...benchSquad].sort((a, b) => b.ovr - a.ovr).map(player => (
                    <PressCard key={player.id} style={styles.playerCard} onPress={() => handleBenchPick(player)}>
                      <View style={styles.playerCardLeft}>
                        <View style={[styles.positionBadge, { backgroundColor: (colors.positions as any)[player.primary_position] + '33' }]}>
                          <Text style={[styles.positionBadgeText, { color: (colors.positions as any)[player.primary_position] }]}>{player.primary_position}</Text>
                        </View>
                        <View style={{ flexShrink: 1 }}>
                          <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
                          <Text style={styles.playerNationality}>{player.nationality}</Text>
                        </View>
                      </View>
                      <View style={styles.playerCardRight}>
                        {!ratingsHidden && (
                          <View style={styles.ovrBadge}>
                            <Text style={styles.ovrBadgeText}>{player.ovr}</Text>
                          </View>
                        )}
                      </View>
                    </PressCard>
                  ))}
                </View>
                </ScrollView>
              </Animated.View>
            )}

            <PressCard style={styles.skipBenchBtn} onPress={() => useGameStore.setState({ useSubstitutes: false, benchPlayers: [] })}>
              <Text style={styles.skipBenchText}>Skip — play with no bench this run</Text>
            </PressCard>
          </View>
        )}

        {phase === 'done' && benchNeeded === 0 && (
          <View style={styles.doneZone}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <Text style={styles.doneTitle}>Squad Complete</Text>
            <Text style={styles.doneSub}>Time to find out where you end up.</Text>
            <Pressable
              style={({ pressed }) => [styles.continueBtn, { backgroundColor: theme.accent }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={() => router.push('/game/placement')}
            >
              <Text style={styles.continueBtnText}>SPIN PLACEMENT →</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
  back: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backText: {
    color:    colors.textPrimary,
    fontSize: typography.xl,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize:   typography.lg,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  headerSub: {
    fontSize: typography.xs,
    color:    colors.textSecondary,
  },
  rerollBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: colors.bgCard,
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  rerollText: {
    fontSize: typography.sm,
    color:    colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding:    spacing.lg,
    gap:        spacing.lg,
    paddingBottom: spacing.xxl,
  },
  formationPitch: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.sm,
    gap:             spacing.xs,
  },
  formationLine: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            spacing.xs,
  },
  formationDot: {
    width:          32,
    height:         32,
    borderRadius:   16,
    backgroundColor: colors.bgElevated,
    borderWidth:    1,
    borderColor:    colors.border,
    alignItems:     'center',
    justifyContent: 'center',
  },
  formationDotFilled: {
    backgroundColor: colors.accent + '44',
    borderColor:     colors.accent,
  },
  formationDotNext: {
    borderColor: colors.warning,
    borderWidth: 2,
  },
  formationDotText: {
    fontSize:   6,
    fontWeight: '700',
    color:      colors.textSecondary,
  },
  spinZone: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.xl,
    alignItems:      'center',
    gap:             spacing.lg,
    minHeight:       180,
    justifyContent:  'center',
    ...shadows.md,
  },
  spinCard: {
    alignItems: 'center',
    gap:        spacing.xs,
  },
  // Flag + nation name side by side, not stacked — a flag centered on its own
  // line above the name read as two disconnected lines rather than one label.
  spinFlagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  spinFlagInline: { fontSize: 34, lineHeight: 40 },
  spinClubName: {
    fontSize:   typography.xxl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
    textAlign:  'center',
  },
  spinSeason: {
    fontSize: typography.md,
    color:    colors.textSecondary,
  },
  spinOvr: {
    fontSize:   typography.lg,
    fontWeight: typography.bold,
    color:      colors.accent,
  },
  spinPlaceholder: {
    alignItems: 'center',
    gap:        spacing.sm,
  },
  spinPlaceholderEmoji: {
    fontSize: 40,
  },
  spinPlaceholderText: {
    fontSize:  typography.md,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  spinPlaceholderHint: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
    textAlign: 'center',
  },
  spinBtn: {
    backgroundColor: colors.accent,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    ...shadows.md,
  },
  spinBtnSpinning: {
    opacity: 0.7,
  },
  spinBtnText: {
    fontSize:      typography.lg,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 4,
  },
  pickingZone: {
    gap: spacing.md,
  },
  clubHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    overflow:        'hidden',
    ...shadows.sm,
  },
  clubColorBar: {
    width:  6,
    height: '100%',
    minHeight: 60,
  },
  clubHeaderInfo: {
    flex:    1,
    padding: spacing.md,
  },
  clubName: {
    fontSize:   typography.lg,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  clubSeason: {
    fontSize:  typography.sm,
    color:     colors.textSecondary,
    marginTop: 2,
  },
  rerollBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    marginRight:     spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  rerollBtnText: {
    fontSize: typography.sm,
    color:    colors.textPrimary,
  },
  factBox: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.borderLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding:         spacing.md,
    gap:             spacing.xs,
  },
  factLabel: {
    fontSize:   typography.xs,
    color:      colors.accent,
    fontWeight: typography.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  factText: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    lineHeight: 20,
  },
  pickingLabel: {
    fontSize:   typography.lg,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },
  playerList: {
    gap: spacing.sm,
  },
  playerCard: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    ...shadows.sm,
  },
  playerCardDisabled: {
    opacity:     0.4,
    borderColor: colors.border,
  },
  playerCardLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
    flex:          1,
  },
  positionBadge: {
    borderRadius:      radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    minWidth:          40,
    alignItems:        'center',
  },
  positionBadgeText: {
    fontSize:   typography.xs,
    fontWeight: typography.black,
  },
  playerName: {
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },
  playerNameDisabled: {
    color: colors.textMuted,
  },
  playerNationality: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
    marginTop: 1,
  },
  playerCardRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  unavailableLabel: {
    fontSize: typography.xs,
    color:    colors.textMuted,
  },
  noSlotText: {
    fontSize:  typography.sm,
    color:     colors.warning,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  noPlayersBox: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.warning,
    padding:         spacing.md,
    alignItems:      'center',
    gap:             spacing.sm,
  },
  noPlayersText: {
    fontSize:  typography.sm,
    color:     colors.warning,
    textAlign: 'center',
  },
  skipBtn: {
    backgroundColor: colors.warning,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  skipBtnText: {
    fontSize:   typography.sm,
    fontWeight: typography.black,
    color:      colors.bg,
    letterSpacing: 2,
  },
  ovrBadge: {
    backgroundColor: colors.accent,
    borderRadius:    radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    minWidth:          40,
    alignItems:        'center',
  },
  ovrBadgeDisabled: {
    backgroundColor: colors.bgElevated,
  },
  ovrBadgeText: {
    fontSize:   typography.sm,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sortRowLabel: { fontSize: typography.xs, color: colors.textMuted, marginRight: 2 },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  sortChipText: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textSecondary },
  draftedSection: {
    gap: spacing.sm,
  },
  draftedTitle: {
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },
  teamOvrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamOvrLabel: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  teamOvrValue: {
    fontSize: typography.md,
    fontWeight: typography.black,
  },
  draftedRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    padding:         spacing.sm,
    gap:             spacing.sm,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  benchSectionTitle: {
    fontSize: typography.xs, fontWeight: typography.black, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.sm,
  },
  benchRow: { borderStyle: 'dashed', opacity: 0.9 },
  draftedPosBadge: {
    borderRadius:      radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    minWidth:          36,
    alignItems:        'center',
  },
  draftedPosText: {
    fontSize:   typography.xs,
    fontWeight: typography.black,
  },
  draftedName: {
    flex:       1,
    fontSize:   typography.sm,
    fontWeight: typography.medium,
    color:      colors.textPrimary,
  },
  draftedClub: {
    fontSize: typography.xs,
    color:    colors.textMuted,
  },
  draftedOvr: {
    fontSize:   typography.sm,
    fontWeight: typography.black,
    color:      colors.accent,
    minWidth:   28,
    textAlign:  'right',
  },
  moveBtn: {
    marginLeft:        8,
    paddingVertical:   3,
    paddingHorizontal: 8,
    borderRadius:      6,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  moveBtnText: {
    fontSize:   10,
    fontWeight: typography.bold,
    letterSpacing: 0.5,
  },
  doneZone: {
    alignItems:      'center',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.accent,
    padding:         spacing.xl,
    gap:             spacing.md,
    ...shadows.md,
  },
  // doneZone centers its children by content width — this forces the spin
  // card / picking zone to fill it instead, which is what the main draft gets
  // for free from its ScrollView's default full-width layout.
  benchStretch: { alignSelf: 'stretch', width: '100%' },
  benchPlayerScroll: { alignSelf: 'stretch', width: '100%', maxHeight: 420 },
  doneEmoji: {
    fontSize: 48,
  },
  doneTitle: {
    fontSize:   typography.xxl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  doneSub: {
    fontSize:  typography.sm,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  skipBenchBtn: { marginTop: spacing.xs, paddingVertical: spacing.sm },
  skipBenchText: { fontSize: typography.xs, color: colors.textMuted, textDecorationLine: 'underline' },
  continueBtn: {
    backgroundColor: colors.accent,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop:       spacing.sm,
    ...shadows.md,
  },
  continueBtnText: {
    fontSize:      typography.md,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 2,
  },
  modalOverlay: {
  position:        'absolute',
  top:             0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.7)',
  justifyContent:  'flex-end',
  zIndex:          100,
},
modalCard: {
  backgroundColor: colors.bgCard,
  borderTopLeftRadius:  radius.lg,
  borderTopRightRadius: radius.lg,
  padding:         spacing.xl,
  gap:             spacing.md,
  borderTopWidth:  1,
  borderTopColor:  colors.border,
},
topModalOverlay: {
  position:        'absolute',
  top:             0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.7)',
  justifyContent:  'center',
  alignItems:      'center',
  zIndex:          100,
  paddingTop:      80,
},
topModalCard: {
  backgroundColor: colors.bgCard,
  borderRadius:    radius.lg,
  padding:         spacing.xl,
  gap:             spacing.md,
  borderWidth:     1,
  borderColor:     colors.border,
  width:           '90%',
  maxWidth:         400,
},
modalTitle: {
  fontSize:   typography.lg,
  fontWeight: typography.black,
  color:      colors.textPrimary,
},
modalSubtitle: {
  fontSize: typography.sm,
  color:    colors.textSecondary,
},
cursedPositionHint: {
  fontSize: typography.xs,
  color:    colors.warning,
  fontStyle: 'italic',
  marginBottom: spacing.sm,
},
modalSlots: {
  gap: spacing.sm,
},
slotOption: {
  flexDirection:   'row',
  alignItems:      'center',
  justifyContent:  'space-between',
  backgroundColor: colors.bgElevated,
  borderRadius:    radius.md,
  borderWidth:     1,
  borderColor:     colors.border,
  padding:         spacing.md,
},
slotOptionAvailable: {
  borderColor: colors.accent,
},
slotOptionWeak: {
  opacity: 0.6,
},
slotOptionBadge: {
  borderRadius:      radius.sm,
  paddingHorizontal: spacing.sm,
  paddingVertical:   3,
  minWidth:          44,
  alignItems:        'center',
},
slotOptionBadgeText: {
  fontSize:   typography.sm,
  fontWeight: typography.black,
},
slotNatural: {
  fontSize: typography.xs,
  color:    colors.success,
},
slotPenalty: {
  fontSize: typography.xs,
  color:    colors.warning,
},
slotSwap: {
  fontSize: typography.xs,
  color:    colors.accent,
  fontWeight: typography.bold,
},
slotSwapDetail: {
  fontSize: 10,
  color:    colors.textMuted,
  marginTop: 1,
},
modalCancel: {
  alignItems:      'center',
  paddingVertical: spacing.md,
  borderTopWidth:  1,
  borderTopColor:  colors.border,
  marginTop:       spacing.xs,
},
modalCancelText: {
  fontSize: typography.sm,
  color:    colors.textMuted,
},
})