import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Animated, Easing, ActivityIndicator
} from 'react-native'
import { router } from 'expo-router'
import { useGameStore, type Difficulty } from '@/store/gameStore'
import { getSlotsForFormation } from '@/engine/formations'
import { calcTeamOvr, calcChemistry, effectiveOvr, positionFitMultiplier } from '@/engine/rating'
import { getPlayersForClubSeason } from '@/db/queries/players'
import { getAllClubSeasons, getClubSeasonsForMode } from '@/db/queries/seasons'
import { spinClubSeason, isPlayerAvailable, getRerollLimit } from '@/engine/draft'
import { getRandomFact } from '@/lib/clubFacts'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import { useModeTheme } from '@/hooks/useModeTheme'
import type { PositionSlot, DraftedPlayer } from '@/types/game'
import type { PlayerRow } from '@/db/queries/players'
import type { ClubSeasonRow } from '@/engine/draft'


type DraftPhase = 'idle' | 'spinning_position' | 'spinning' | 'picking' | 'done'

const FORMATION_SHAPES: Record<string, string[][]> = {
  '4-3-3': [
    ['LW', 'ST', 'RW'],
    ['CM', 'CM', 'CM'],
    ['LB', 'CB', 'CB', 'RB'],
    ['GK'],
  ],
  '4-4-2': [
    ['ST', 'ST'],
    ['LM', 'CM', 'CM', 'RM'],
    ['LB', 'CB', 'CB', 'RB'],
    ['GK'],
  ],
  '4-2-3-1': [
    ['ST'],
    ['LW', 'CAM', 'RW'],
    ['CDM', 'CDM'],
    ['LB', 'CB', 'CB', 'RB'],
    ['GK'],
  ],
  '3-5-2': [
    ['ST', 'ST'],
    ['LB', 'CM', 'CDM', 'CM', 'RB'],
    ['CB', 'CB', 'CB'],
    ['GK'],
  ],
  '5-3-2': [
    ['ST', 'ST'],
    ['CM', 'CDM', 'CM'],
    ['LB', 'CB', 'CB', 'CB', 'RB'],
    ['GK'],
  ]
}

export default function DraftScreen() {
  const {
    mode, formation, era, difficulty,
    selectedLeague,
    draftedPlayers, spunSeasonIds,
    rerollsUsed, addPlayer, markSeasonSpun, useReroll,
  } = useGameStore()
  const theme = useModeTheme()

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
  const [positionSpinDisplay, setPositionSpinDisplay] = useState<string>('')

  // spin animation
  const spinAnim   = useRef(new Animated.Value(0)).current
  const fadeAnim   = useRef(new Animated.Value(0)).current
  const scaleAnim  = useRef(new Animated.Value(0.8)).current
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const rerollLimit  = getRerollLimit(difficulty ?? null, mode ?? null)
  const rerollsLeft  = rerollLimit - rerollsUsed
  const openSlots    = slots.filter(s => s.filledBy === null)
  const filledSlots  = slots.filter(s => s.filledBy !== null)
  const isDraftDone = slots.length > 0 && openSlots.length === 0
  // Hide ratings in chaos/cursed modes and hard mode
  const ratingsHidden = mode === 'chaos' || mode === 'cursed' || difficulty === 'hard'

  // Calculate chemistry-affected OVR for squad display
  const baseTeamOvr = slots.length > 0 && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const chem = draftedPlayers.length > 0 ? calcChemistry(draftedPlayers) : { bonusOvr: 0, bonuses: [] }
  const totalTeamOvr = baseTeamOvr + chem.bonusOvr

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
      clubName:           currentSpin.club_name,
      season:             `${currentSpin.year_start}/${String(currentSpin.year_start + 1).slice(-2)}`,
      slotIndex:          slot.slotIndex,
      isIcon:             selectedPlayer.is_icon === 1,
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
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.accent }]}>Draft</Text>
          <Text style={styles.headerSub}>
            {filledSlots.length}/11 picked
          </Text>
        </View>
        <View style={styles.rerollBadge}>
          <Text style={styles.rerollText}>{rerollsLeft} 🔄</Text>
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
              {JSON.parse(selectedPlayer.secondary_positions ?? '[]').length > 0
                ? ` · Also: ${JSON.parse(selectedPlayer.secondary_positions ?? '[]').join(', ')}`
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

                // Use the exact same fit logic as effectiveOvr so the rating
                // shown here matches the rating applied once the player is placed.
                const fitPlayer = {
                  primaryPosition: selectedPlayer.primary_position,
                  secondaryPositions: JSON.parse(selectedPlayer.secondary_positions ?? '[]'),
                } as any
                const fitMult  = positionFitMultiplier(fitPlayer, slot)
                const penaltyOvr = Math.round(selectedPlayer.ovr * fitMult)
                const isNatural  = fitMult >= 1.0
                const canFill    = fitMult >= 0.93  // primary, accepted, or secondary fit

                // Hide slots this player genuinely cannot fill
                if (!canFill) return null

                return (
                  <Pressable
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
                  </Pressable>
                )
              })}
              {/* fallback if no compatible slot exists */}
              {openSlots.every(slot => {
                const allPos = [selectedPlayer.primary_position, ...JSON.parse(selectedPlayer.secondary_positions ?? '[]')]
                return !allPos.includes(slot.primary) && !slot.accepts.some(a => allPos.includes(a))
              }) && (
                <Text style={styles.noSlotText}>No compatible slots open for this player.</Text>
              )}
            </View>

            <Pressable
              style={styles.modalCancel}
              onPress={() => { setShowSlotPicker(false); setSelectedPlayer(null) }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* formation pitch view – group by position line */}
        {(() => {
          const shape = FORMATION_SHAPES[formation || '4-3-3'] || [['ST'], ['CM'], ['CB'], ['GK']]
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
                <Text style={styles.spinClubName}>{spinDisplay.club_name}</Text>
                <Text style={styles.spinSeason}>
                  {spinDisplay.year_start}/{String(spinDisplay.year_start + 1).slice(-2)}
                </Text>
                <Text style={styles.spinOvr}>OVR {spinDisplay.historical_ovr}</Text>
              </View>
            ) : phase !== 'spinning_position' && (
              <View style={styles.spinPlaceholder}>
                <Text style={styles.spinPlaceholderEmoji}>🎰</Text>
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
              <Pressable style={[styles.spinBtn, { backgroundColor: theme.accent }]} onPress={handleSpin}>
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

        {/* picking phase — club revealed + player cards */}
        {phase === 'picking' && currentSpin && (
          <Animated.View style={[
            styles.pickingZone,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
          ]}>
            {/* club header */}
            <View style={styles.clubHeader}>
              <View style={[
                styles.clubColorBar,
                { backgroundColor: currentSpin.primary_color ?? colors.accent }
              ]} />
              <View style={styles.clubHeaderInfo}>
                <Text style={styles.clubName}>{currentSpin.club_name}</Text>
                <Text style={styles.clubSeason}>
                  {currentSpin.year_start}/{String(currentSpin.year_start + 1).slice(-2)}
                  {'  ·  '}OVR {currentSpin.historical_ovr}
                </Text>
              </View>
              {rerollsLeft > 0 && (
                <Pressable style={styles.rerollBtn} onPress={handleReroll}>
                  <Text style={styles.rerollBtnText}>🔄 Reroll</Text>
                </Pressable>
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
                <Pressable style={styles.skipBtn} onPress={() => {
                  setPhase('idle')
                  setCurrentSpin(null)
                  setPlayers([])
                  fadeAnim.setValue(0)
                  scaleAnim.setValue(0.8)
                }}>
                  <Text style={styles.skipBtnText}>SKIP →</Text>
                </Pressable>
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
                    // In Chaos/Cursed modes, scramble to last-name order so OVR
                    // can't be inferred from the list. Everything else (incl.
                    // hard mode, CL and WC) stays ordered by OVR, highest first.
                    if (mode === 'chaos' || mode === 'cursed') {
                      const aLastName = a.name.split(' ').slice(-1)[0]
                      const bLastName = b.name.split(' ').slice(-1)[0]
                      return aLastName.localeCompare(bLastName)
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
                    <Pressable
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
                      
                    </Pressable>
                  )
                })}
            </View>
          </Animated.View>
        )}

        {/* drafted players */}
        {filledSlots.length > 0 && (
          <View style={styles.draftedSection}>
            <Text style={styles.draftedTitle}>Your Squad</Text>
            {!ratingsHidden && (
              <View style={styles.teamOvrRow}>
                <Text style={styles.teamOvrLabel}>Team OVR: </Text>
                <Text style={[styles.teamOvrValue, { color: colors.warning }]}>{totalTeamOvr}</Text>
                <Text style={styles.teamOvrBreakdown}>({baseTeamOvr} +{chem.bonusOvr})</Text>
              </View>
            )}
            {slots.filter(s => s.filledBy).map((slot, i) => {
              const player = slot.filledBy!
              const effectiveRating = effectiveOvr(player, slot)
              const isAffected = effectiveRating !== player.ovr
              return (
                <View key={i} style={styles.draftedRow}>
                  <View style={[
                    styles.draftedPosBadge,
                    { backgroundColor: (colors.positions as any)[slot.primary] + '22' }
                  ]}>
                    <Text style={[
                      styles.draftedPosText,
                      { color: (colors.positions as any)[slot.primary] }
                    ]}>
                      {slot.label}
                    </Text>
                  </View>
                  <Text style={styles.draftedName}>{player.name}</Text>
                  <Text style={styles.draftedClub}>{player.clubName}</Text>
                  {!ratingsHidden && (
                    <Text style={[
                      styles.draftedOvr,
                      isAffected && { color: colors.warning }
                    ]}>
                      {effectiveRating}
                    </Text>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* done state */}
        {phase === 'done' && (
          <View style={styles.doneZone}>
            <Text style={styles.doneEmoji}>✅</Text>
            <Text style={styles.doneTitle}>Squad Complete</Text>
            <Text style={styles.doneSub}>Time to find out where you end up.</Text>
            <Pressable
              style={[styles.continueBtn, { backgroundColor: theme.accent }]}
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
  teamOvrBreakdown: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginLeft: spacing.xs,
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