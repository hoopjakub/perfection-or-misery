import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { router, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useGameStore } from '@/store/gameStore'
import { getSlotsForFormation, getFormationRows } from '@/engine/formations'
import { calcTeamOvr, effectiveOvr, positionPenalty } from '@/engine/rating'
import { getPlayersForClubSeason, type PlayerRow } from '@/db/queries/players'
import { getClubSeasonsForMode } from '@/db/queries/seasons'
import { spinClubSeason } from '@/engine/draft'
import { rerollLimitFor, ratingsHiddenFor, resolveDifficulty } from '@/engine/difficulty'
import { getRandomFact } from '@/lib/clubFacts'
import { flagForCountry } from '@/data/geo-iso'
import { haptic } from '@/lib/haptics'
import { ROLES, space, border, colourwayFor } from '@/theme'
import {
  KitScreen, KitText, RunHeader, Plate, Tag, Chips, StripedNotice, InlineConfirm,
} from '@/components/kit'
import { RackSpin, ClubCard, Hanger, PlayerTag, type SpinItem } from '@/components/setup/DraftParts'
import { openConfirm } from '@/lib/confirm'
import type { PositionSlot, DraftedPlayer } from '@/types/game'
import type { ClubSeasonRow } from '@/engine/draft'

// Stage 4 · The draft — docs/ui-overhaul/07b B4 and B5.
//
// The pitch is the screen: eleven hangers in your shape, then the bench rail,
// then whatever you spun. One tap picks a player: if exactly one open hanger
// fits him he goes straight there (the old "Where does X play?" modal on every
// pick is gone); if several fit, those hangers light and you tap one. Moves are
// the same gesture: tap a filled hanger to hold it, tap a lit hanger to move or
// swap. The bench is drafted on the same screen once the XI is full.
//
// Draft RULES are unchanged from the old screen: the same spin pool, reroll
// allowance, Cursed position spin, hidden-rating sort, and the move/swap
// conditions (a swap only when both players can cover each other's slot).
const roles = ROLES.cotton
const BENCH_SIZE = 5

type SpinPhase = 'idle' | 'position' | 'spinning' | 'picking'
type Holding = { kind: 'starter' | 'sub'; player: DraftedPlayer } | null
type Sort = 'ovr' | 'position' | 'name'

const surname = (name: string) => name.split(' ').slice(-1)[0]
const seasonLabel = (y: number) => `${y}/${String(y + 1).slice(-2)}`
const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']

function toDrafted(p: PlayerRow, club: ClubSeasonRow, slotIndex: number, isBench = false): DraftedPlayer {
  return {
    playerId: p.id,
    playerSeasonId: `${p.id}_${club.year_start}`,
    name: p.name,
    nationality: p.nationality,
    primaryPosition: p.primary_position as DraftedPlayer['primaryPosition'],
    secondaryPositions: (() => { try { return JSON.parse(p.secondary_positions ?? '[]') } catch { return [] } })(),
    ovr: p.ovr,
    attack: p.attack,
    isBench: isBench || undefined,
    clubName: club.club_name,
    season: seasonLabel(club.year_start),
    slotIndex,
    isIcon: p.is_icon === 1,
    birthYear: p.birth_year ?? null,
    yearStart: club.year_start,
  }
}

export default function DraftScreen() {
  const {
    mode, formation, difficulty, customDifficulty, selectedLeague,
    draftedPlayers, benchPlayers, spunSeasonIds, rerollsUsed, useSubstitutes,
    addPlayer, addBenchPlayer, movePlayer, markSeasonSpun, useReroll, swapBenchAndStarter,
    weightedPicksOverride,
  } = useGameStore()
  const colourway = colourwayFor(mode)
  const weightedPicks = resolveDifficulty(difficulty ?? null, customDifficulty, mode ?? null, weightedPicksOverride).weightedPicksEffective
  const ratingsHidden = ratingsHiddenFor(difficulty ?? null, customDifficulty, mode ?? null)
  const rerollsLeft = rerollLimitFor(difficulty ?? null, customDifficulty, mode ?? null) - rerollsUsed

  const [slots, setSlots] = useState<PositionSlot[]>([])
  const [pool, setPool] = useState<ClubSeasonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [poolFailed, setPoolFailed] = useState(false)

  const [phase, setPhase] = useState<SpinPhase>('idle')
  const [spin, setSpin] = useState<{ club: ClubSeasonRow; items: SpinItem[]; duration: number } | null>(null)
  const [squad, setSquad] = useState<PlayerRow[]>([])
  const [fact, setFact] = useState<string | null>(null)
  const [spinsDone, setSpinsDone] = useState(0)
  const [spunPosition, setSpunPosition] = useState<PositionSlot | null>(null)   // Cursed
  const [placing, setPlacing] = useState<PlayerRow | null>(null)                // chosen, several hangers fit
  const [holding, setHolding] = useState<Holding>(null)
  const [justFilled, setJustFilled] = useState<string | null>(null)            // replays the zip tag swing
  const [sortBy, setSortBy] = useState<Sort>(ratingsHidden ? 'position' : 'ovr')
  const squadLoad = useRef<Promise<PlayerRow[]> | null>(null)

  // ── Leaving guard ──────────────────────────────────────────────────────────
  // Leaving the draft throws the picks away (formation-select starts a fresh
  // run), so it asks first. usePreventRemove catches every way out at once:
  // the header back, Android's back gesture and the browser's back button
  // (React Navigation turns a browser back into the goBack it intercepts).
  // The held action is replayed once the player confirms; `leaving` switches
  // the guard off first or the replayed action would be caught again. This is
  // an inline confirmation rather than the ConfirmScreen route because a
  // pushed route would be popped by that same replayed action.
  const navigation = useNavigation()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const pendingLeave = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null)
  const pickCount = draftedPlayers.length + benchPlayers.length
  usePreventRemove(pickCount > 0 && !leaving, ({ data }) => {
    pendingLeave.current = data.action
    setConfirmLeave(true)
    // On web the address bar has already moved back by the time we're asked;
    // step it forward again so it matches the draft that's still showing.
    if (Platform.OS === 'web' && !window.location.pathname.endsWith('/game/draft')) window.history.forward()
  })
  useEffect(() => {
    if (!leaving) return
    if (pendingLeave.current) navigation.dispatch(pendingLeave.current)
    else router.back()
  }, [leaving])

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!formation) return
    setSlots(getSlotsForFormation(formation))
    setLoading(true)
    getClubSeasonsForMode(mode ?? 'league', selectedLeague)
      .then(setPool)
      .catch(e => { console.warn('[draft] pool failed:', e); setPoolFailed(true) })
      .finally(() => setLoading(false))
  }, [formation])

  const openSlots = slots.filter(s => !s.filledBy)
  const xiDone = slots.length > 0 && openSlots.length === 0
  const benchNeeded = useSubstitutes ? Math.max(0, BENCH_SIZE - benchPlayers.length) : 0
  const draftingBench = xiDone && benchNeeded > 0
  const squadDone = xiDone && benchNeeded === 0
  // In Cursed you're drafting for ONE spun position, so eligibility has to match it.
  const eligibleSlots = mode === 'cursed' && spunPosition ? [spunPosition] : openSlots
  const teamOvr = draftedPlayers.length > 0 && slots.length > 0 ? calcTeamOvr(draftedPlayers, slots) : null

  const fitsFor = (pos: string) => eligibleSlots.filter(s => positionPenalty(pos, s.primary) !== null)
  const ratingText = (n: number) => (ratingsHidden ? '??' : String(n))

  // ── Spinning ───────────────────────────────────────────────────────────────
  function clearSpin() {
    setSpin(null); setSquad([]); setFact(null); setPlacing(null)
    setPhase('idle'); setSpunPosition(null)
  }

  function startClubSpin() {
    let club: ClubSeasonRow
    try {
      club = spinClubSeason(pool, spunSeasonIds, mode ?? 'league', weightedPicks)
    } catch (e: any) {
      console.warn('[draft] spin failed:', e?.message)
      setPhase('idle')
      return
    }
    markSeasonSpun(club.id)
    // Start loading the squad now so it's usually ready when the strip lands.
    squadLoad.current = getPlayersForClubSeason(club.id)
    const decoys: SpinItem[] = Array.from({ length: 11 }, () => {
      const c = pool[Math.floor(Math.random() * pool.length)]
      return spinItem(c)
    })
    // The first spin of a run plays in full; later ones are quick (06 §5.1).
    setSpin({ club, items: [...decoys, spinItem(club)], duration: spinsDone === 0 ? 1400 : 450 })
    setSpinsDone(n => n + 1)
    setSquad([]); setFact(null); setPlacing(null)
    setPhase('spinning')
  }

  function spinItem(c: ClubSeasonRow): SpinItem {
    return mode === 'world_cup'
      ? { title: c.club_name, sub: undefined }
      : { title: c.club_name, sub: seasonLabel(c.year_start), colour: c.primary_color }
  }

  async function onLanded() {
    if (!spin) return
    haptic('medium')
    try {
      const players = await (squadLoad.current ?? getPlayersForClubSeason(spin.club.id))
      setSquad(players)
    } catch (e) {
      console.warn('[draft] squad failed:', e)
      setSquad([])
    }
    setFact(getRandomFact(spin.club.id))
    setPhase('picking')
  }

  function handleSpin() {
    if (pool.length === 0 || phase === 'spinning' || phase === 'position') return
    haptic('light')
    setHolding(null)
    if (mode === 'cursed' && !draftingBench) {
      // The position is decided first and shown on its hanger, then the club.
      const target = openSlots[Math.floor(Math.random() * openSlots.length)]
      setSpunPosition(target)
      setPhase('position')
      setTimeout(startClubSpin, 700)
      return
    }
    startClubSpin()
  }

  function handleReroll() {
    if (rerollsLeft <= 0 || phase !== 'picking') return
    useReroll()
    startClubSpin()
  }

  // ── Picking ────────────────────────────────────────────────────────────────
  function assign(p: PlayerRow, slot: PositionSlot) {
    if (!spin) return
    const drafted = toDrafted(p, spin.club, slot.slotIndex)
    setSlots(prev => prev.map((s, i) => (i === slot.slotIndex ? { ...s, filledBy: drafted } : s)))
    addPlayer(drafted)
    setJustFilled(`${slot.slotIndex}:${p.id}`)
    haptic('light')
    clearSpin()
  }

  function pickPlayer(p: PlayerRow) {
    if (!spin) return
    if (draftingBench) {
      addBenchPlayer(toDrafted(p, spin.club, 11 + benchPlayers.length, true))
      haptic('light')
      clearSpin()
      return
    }
    const fits = fitsFor(p.primary_position)
    if (fits.length === 0) return
    if (fits.length === 1) { assign(p, fits[0]); return }
    setPlacing(prev => (prev?.id === p.id ? null : p))
  }

  // ── Moving ─────────────────────────────────────────────────────────────────
  // What the held player could do, per hanger. Same rules as the old move
  // sheet: a starter moves to an open slot he can play, or swaps with a
  // starter when each can cover the other's slot, or is replaced by a sub who
  // can play his slot. A sub comes on anywhere he can play.
  function starterTarget(held: DraftedPlayer, slot: PositionSlot): string | null {
    if (slot.slotIndex === held.slotIndex) return null
    const pen = positionPenalty(held.primaryPosition, slot.primary)
    if (pen === null) return null
    if (slot.filledBy) {
      const back = positionPenalty(slot.filledBy.primaryPosition, slots[held.slotIndex].primary)
      if (back === null) return null
    }
    return `IN ${ratingText(Math.max(40, held.ovr - pen))}`
  }
  function subTarget(sub: DraftedPlayer, slot: PositionSlot): string | null {
    const pen = positionPenalty(sub.primaryPosition, slot.primary)
    return pen === null ? null : `IN ${ratingText(Math.max(40, sub.ovr - pen))}`
  }
  const benchCanCover = (sub: DraftedPlayer, starter: DraftedPlayer) =>
    positionPenalty(sub.primaryPosition, slots[starter.slotIndex].primary) !== null

  function moveStarter(held: DraftedPlayer, target: PositionSlot) {
    const from = held.slotIndex
    const occupant = target.filledBy
    setSlots(prev => prev.map((s, i) => {
      if (i === from) return { ...s, filledBy: occupant ? { ...occupant, slotIndex: from } : null }
      if (i === target.slotIndex) return { ...s, filledBy: { ...held, slotIndex: target.slotIndex } }
      return s
    }))
    movePlayer(held.playerId, target.slotIndex)
    if (occupant) movePlayer(occupant.playerId, from)
    setJustFilled(`${target.slotIndex}:${held.playerId}`)
    setHolding(null)
  }

  function bringOn(sub: DraftedPlayer, slotIndex: number) {
    setSlots(prev => prev.map((s, i) => (i === slotIndex ? { ...s, filledBy: { ...sub, isBench: false, slotIndex } } : s)))
    swapBenchAndStarter(sub.playerId, slotIndex)
    setJustFilled(`${slotIndex}:${sub.playerId}`)
    setHolding(null)
  }

  function tapHanger(slot: PositionSlot) {
    if (placing) {
      if (fitsFor(placing.primary_position).some(s => s.slotIndex === slot.slotIndex)) assign(placing, slot)
      return
    }
    if (holding?.kind === 'starter') {
      if (holding.player.slotIndex === slot.slotIndex) { setHolding(null); return }
      if (starterTarget(holding.player, slot)) moveStarter(holding.player, slot)
      return
    }
    if (holding?.kind === 'sub') {
      if (subTarget(holding.player, slot)) bringOn(holding.player, slot.slotIndex)
      return
    }
    if (slot.filledBy && phase !== 'spinning' && phase !== 'position') {
      haptic('light')
      setHolding({ kind: 'starter', player: slot.filledBy })
    }
  }

  function tapBench(sub: DraftedPlayer | undefined) {
    if (!sub) return
    if (holding?.kind === 'starter') {
      if (benchCanCover(sub, holding.player)) bringOn(sub, holding.player.slotIndex)
      return
    }
    if (holding?.kind === 'sub' && holding.player.playerId === sub.playerId) { setHolding(null); return }
    haptic('light')
    setHolding({ kind: 'sub', player: sub })
  }

  function skipBench() {
    openConfirm({
      question: 'No bench?',
      consequence: `Nobody gets subs this run, you or anyone else.${benchPlayers.length ? ` Your ${benchPlayers.length} sub${benchPlayers.length === 1 ? '' : 's'} will be dropped.` : ''}`,
      confirmLabel: 'Play without a bench',
      stayLabel: 'Keep drafting subs',
      onConfirm: () => {
        useGameStore.setState({ useSubstitutes: false, benchPlayers: [] })
        clearSpin()
      },
    })
  }

  // ── Derived views ──────────────────────────────────────────────────────────
  const lines = useMemo(() => {
    const remaining = [...slots]
    return getFormationRows(formation ?? '4-3-3').map(row => row
      .map(label => {
        const i = remaining.findIndex(s => s.label === label)
        return i >= 0 ? remaining.splice(i, 1)[0] : null
      })
      .filter((s): s is PositionSlot => s !== null))
  }, [slots, formation])

  const sortedSquad = useMemo(() => {
    const avail = (p: PlayerRow) => draftingBench || fitsFor(p.primary_position).length > 0
    const byName = (a: PlayerRow, b: PlayerRow) => surname(a.name).localeCompare(surname(b.name))
    return [...squad].sort((a, b) => {
      const d = Number(avail(b)) - Number(avail(a))
      if (d) return d
      // Ratings hidden: never order by OVR, or the list order would leak it.
      if (ratingsHidden || sortBy === 'name') return byName(a, b)
      if (sortBy === 'position') {
        const p = POS_ORDER.indexOf(a.primary_position) - POS_ORDER.indexOf(b.primary_position)
        return p || b.ovr - a.ovr
      }
      return b.ovr - a.ovr
    })
  }, [squad, sortBy, ratingsHidden, draftingBench, eligibleSlots])

  const nobodyFits = phase === 'picking' && squad.length > 0 && !draftingBench
    && squad.every(p => fitsFor(p.primary_position).length === 0)

  function hangerFor(slot: PositionSlot) {
    const p = slot.filledBy
    const pen = p ? positionPenalty(p.primaryPosition, slot.primary) : null
    let state: 'empty' | 'filled' | 'holding' | 'target' | 'focus' = p ? 'filled' : 'empty'
    let note: string | undefined
    if (holding?.kind === 'starter' && holding.player.slotIndex === slot.slotIndex) state = 'holding'
    else if (holding?.kind === 'starter') { const t = starterTarget(holding.player, slot); if (t) { state = 'target'; note = t } }
    else if (holding?.kind === 'sub') { const t = subTarget(holding.player, slot); if (t) { state = 'target'; note = t } }
    else if (placing) {
      const fit = fitsFor(placing.primary_position).find(s => s.slotIndex === slot.slotIndex)
      if (fit) {
        state = 'target'
        note = `OVR ${ratingText(Math.max(40, placing.ovr - (positionPenalty(placing.primary_position, fit.primary) ?? 0)))}`
      }
    } else if (spunPosition?.slotIndex === slot.slotIndex) state = 'focus'

    return (
      <Hanger
        key={slot.slotIndex}
        roles={roles}
        label={slot.label}
        surname={p ? surname(p.name) : undefined}
        rating={p ? ratingText(effectiveOvr(p, slot)) : undefined}
        outOfPosition={!!pen}
        state={state}
        note={note}
        swingKey={p && justFilled === `${slot.slotIndex}:${p.playerId}` ? justFilled : undefined}
        onPress={() => tapHanger(slot)}
        a11y={p
          ? `${slot.label}: ${p.name}, rating ${ratingText(effectiveOvr(p, slot))}${pen ? ', out of position' : ''}${note ? `. ${note}` : ''}`
          : `${slot.label}: empty${note ? `. ${note}` : ''}`}
      />
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <KitScreen ground="cotton" scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={roles.text} />
        <KitText t="tag" color={roles.textMuted}>Loading the pool…</KitText>
      </KitScreen>
    )
  }

  const next = ratingsHidden ? '/game/reveal' : '/game/placement'

  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.screen}>
      <RunHeader
        roles={roles}
        stage={4}
        colourway={colourway}
        skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []}
        right={<Tag roles={roles}>{`REROLLS ${Math.max(0, rerollsLeft)}`}</Tag>}
      />

      {confirmLeave && (
        <InlineConfirm
          roles={roles}
          message={`Leave the draft? Your ${pickCount} pick${pickCount === 1 ? '' : 's'} will be discarded.`}
          cancelLabel="Keep drafting"
          confirmLabel={`Discard ${pickCount} pick${pickCount === 1 ? '' : 's'}`}
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => { setConfirmLeave(false); setLeaving(true) }}
        />
      )}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* The pitch */}
        <View style={[styles.pitch, { backgroundColor: roles.sunken, borderColor: roles.line }]}>
          {lines.map((row, i) => <View key={i} style={styles.pitchRow}>{row.map(hangerFor)}</View>)}
          <View style={styles.pitchFoot}>
            <KitText t="tag" color={roles.textMuted}>{`${slots.length - openSlots.length}/11`}</KitText>
            <KitText t="tag" color={roles.text}>
              {`TEAM OVR ${ratingsHidden ? '??' : teamOvr ?? '—'}`}
            </KitText>
          </View>
        </View>

        {/* The bench rail */}
        {useSubstitutes && (
          <View style={styles.benchRow}>
            {Array.from({ length: BENCH_SIZE }, (_, i) => {
              const sub = benchPlayers[i]
              const lit = !!sub && holding?.kind === 'starter' && benchCanCover(sub, holding.player)
              const held = !!sub && holding?.kind === 'sub' && holding.player.playerId === sub.playerId
              return (
                <Hanger
                  key={i}
                  roles={roles}
                  label={`SUB ${i + 1}`}
                  surname={sub ? surname(sub.name) : undefined}
                  rating={sub ? ratingText(sub.ovr) : undefined}
                  state={held ? 'holding' : lit ? 'target' : sub ? 'filled' : 'empty'}
                  note={lit ? 'SWAP' : undefined}
                  onPress={sub ? () => tapBench(sub) : undefined}
                  a11y={sub ? `Sub ${i + 1}: ${sub.name}, ${sub.primaryPosition}` : `Sub ${i + 1}: empty`}
                />
              )
            })}
          </View>
        )}

        {holding && (
          <View style={styles.holdLine}>
            <KitText t="body" color={roles.text} style={{ flex: 1 }}>
              {`Holding ${surname(holding.player.name)}. Tap a lit spot to move him, or tap him again to let go.`}
            </KitText>
            <Plate label="Let go" variant="quiet" roles={roles} onPress={() => setHolding(null)} />
          </View>
        )}

        {poolFailed && (
          <StripedNotice roles={roles}>The player pool didn't load. Go back and try again.</StripedNotice>
        )}

        {/* The spin */}
        {phase === 'idle' && !squadDone && (
          <KitText t="bodyL" color={roles.textMuted} style={styles.lead}>
            {draftingBench
              ? `Now the bench: ${benchNeeded} to go. Subs come on in the second half and score less often.`
              : mode === 'cursed'
                ? 'Spin. A position is picked first, then a club-season. You pick one player for that spot.'
                : 'Spin a club-season. Pick one player from it.'}
            {ratingsHidden && !draftingBench && slots.length - openSlots.length === 0
              ? ' Ratings are hidden until the squad is complete.' : ''}
          </KitText>
        )}
        {phase === 'position' && spunPosition && (
          <KitText t="superS" color={roles.text} style={styles.lead}>{`THIS PICK IS YOUR ${spunPosition.label}`}</KitText>
        )}
        {phase === 'spinning' && spin && (
          <RackSpin key={`${spin.club.id}:${spinsDone}`} roles={roles} items={spin.items} durationMs={spin.duration} onLanded={onLanded} />
        )}

        {phase === 'picking' && spin && (
          <View style={styles.picking}>
            <ClubCard
              roles={roles}
              name={spin.club.club_name}
              sub={mode === 'world_cup' ? undefined : seasonLabel(spin.club.year_start)}
              colour={spin.club.primary_color}
              flag={mode === 'world_cup' ? flagForCountry(spin.club.club_name) || undefined : undefined}
              fact={fact}
              rerollsLeft={rerollsLeft}
              onReroll={handleReroll}
            />
            {mode === 'cursed' && spunPosition && !draftingBench && (
              <KitText t="tag" color={roles.text}>{`PICKING FOR ${spunPosition.label}`}</KitText>
            )}
            {placing && (
              <View style={styles.holdLine}>
                <KitText t="body" color={roles.text} style={{ flex: 1 }}>
                  {`${surname(placing.name)} fits more than one spot. Tap a lit one.`}
                </KitText>
                <Plate label="Cancel" variant="quiet" roles={roles} onPress={() => setPlacing(null)} />
              </View>
            )}
            {nobodyFits ? (
              <StripedNotice roles={roles} actionLabel="Spin again" onAction={() => { clearSpin(); handleSpin() }}>
                Nobody here fits your open positions. Spinning again is free.
              </StripedNotice>
            ) : (
              <Chips
                roles={roles}
                label="SORT"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  ...(ratingsHidden ? [] : [{ id: 'ovr' as const, label: 'OVR' }]),
                  { id: 'position' as const, label: 'POS' },
                  { id: 'name' as const, label: 'A–Z' },
                ]}
              />
            )}
            <View style={styles.grid}>
              {sortedSquad.map(p => (
                <View key={p.id} style={styles.gridCell}>
                  <PlayerTag
                    roles={roles}
                    name={p.name}
                    position={p.primary_position}
                    nationality={p.nationality}
                    rating={ratingText(p.ovr)}
                    available={draftingBench || fitsFor(p.primary_position).length > 0}
                    chosen={placing?.id === p.id}
                    onPress={() => pickPlayer(p)}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {draftingBench && phase === 'idle' && (
          <Plate label="Play without a bench" variant="quiet" roles={roles} onPress={skipBench} style={styles.quiet} />
        )}
      </ScrollView>

      {/* The thumb zone */}
      <View style={styles.actions}>
        {squadDone ? (
          <Plate
            label={ratingsHidden ? 'See your ratings' : 'To the draw'}
            icon="forward"
            roles={roles}
            onPress={() => { haptic('success'); router.push(next) }}
          />
        ) : phase === 'idle' ? (
          <Plate
            label={draftingBench ? `Spin for sub ${benchPlayers.length + 1}` : 'Spin'}
            icon="again"
            roles={roles}
            onPress={handleSpin}
            disabled={pool.length === 0}
            missingStep="No clubs to spin"
          />
        ) : null}
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: space[3] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] },
  body: { flex: 1 },
  bodyContent: { gap: space[3], paddingBottom: space[5] },
  pitch: { borderWidth: border.thin, paddingTop: space[4], paddingBottom: space[2], gap: space[4] },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly' },
  pitchFoot: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[2] },
  benchRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space[3] },
  holdLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  lead: { marginTop: space[1] },
  picking: { gap: space[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  gridCell: { width: '48.5%' },
  quiet: { alignSelf: 'flex-start', marginLeft: -space[2] },
  actions: { paddingTop: space[2] },
})
