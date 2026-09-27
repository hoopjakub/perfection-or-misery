import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { Loader } from '@/components/kit'
import { useSizeClass } from '@/hooks/useSizeClass'
import { WebKeys } from '@/lib/webKeys'
import { View, ScrollView, StyleSheet, Platform } from 'react-native'
import { router, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useGameStore, nextBenchIndex } from '@/store/gameStore'
import { useSettingsStore } from '@/store/settingsStore'
import { getSlotsForFormation, getFormationRows } from '@/engine/formations'
import { calcTeamOvr, effectiveOvr, positionPenalty } from '@/engine/rating'
import { getPlayersForClubSeason, type PlayerRow } from '@/db/queries/players'
import { getClubSeasonsForMode } from '@/db/queries/seasons'
import { spinClubSeason, footballerKey } from '@/engine/draft'
import { rerollLimitFor, ratingsHiddenFor, resolveDifficulty } from '@/engine/difficulty'
import { getRandomFact } from '@/lib/clubFacts'
import { flagForCountry } from '@/data/geo-iso'
import { ROLES, space, border, colourwayFor, prim } from '@/theme'
import {
  KitScreen, KitText, RunHeader, Plate, Tag, Chips, StripedNotice, InlineConfirm, Pitch, Tape,
} from '@/components/kit'
import { RackSpin, ClubCard, Hanger, PlayerTag, MarkBackdrop, type SpinItem } from '@/components/setup/DraftParts'
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
// swap. The bench is open from the first spin (P8-06): "Pick for: Bench" sends
// a pick there, and a held starter can drop onto an empty bench spot, opening
// his slot again. The draft is done when both are full, or the bench is skipped.
//
// Draft RULES are unchanged from the old screen: the same spin pool, reroll
// allowance, Cursed position spin, hidden-rating sort, and the move/swap
// conditions (a swap only when both players can cover each other's slot).
const roles = ROLES.cotton
const BENCH_SIZE = 5

type SpinPhase = 'idle' | 'position' | 'spinning' | 'picking'
type Holding = { kind: 'starter' | 'sub'; player: DraftedPlayer } | null
type Sort = 'ovr' | 'position' | 'name'

const SPIN_MS = 800
// P8-98: how often the curse takes the pick out of your hands, and how long
// its moment lasts before the player it chose goes in.
const CURSE_CHANCE = 0.3
const OMEN_MS = 1600
// A small stable tilt per player for Chaos's cards (never the same twice in a
// row, never enough to hurt reading).
const tiltOf = (id: string) => { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return ((h % 7) - 3) * 0.6 }
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
    clubId: club.club_id,
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
    addPlayer, addBenchPlayer, movePlayer, markSeasonSpun, useReroll, swapBenchAndStarter, benchStarter,
    weightedPicksOverride,
  } = useGameStore()
  const colourway = colourwayFor(mode)
  const weightedPicks = resolveDifficulty(difficulty ?? null, customDifficulty, mode ?? null, weightedPicksOverride).weightedPicksEffective
  const ratingsHidden = ratingsHiddenFor(difficulty ?? null, customDifficulty, mode ?? null)
  const rerollsLeft = rerollLimitFor(difficulty ?? null, customDifficulty, mode ?? null) - rerollsUsed

  const [slots, setSlots] = useState<PositionSlot[]>([])
  const [pool, setPool] = useState<ClubSeasonRow[]>([])
  const [loading, setLoading] = useState(true)
  const wide = useSizeClass() === 'expanded'
  const [poolFailed, setPoolFailed] = useState(false)

  const [phase, setPhase] = useState<SpinPhase>('idle')
  const [spin, setSpin] = useState<{ club: ClubSeasonRow; items: SpinItem[]; duration: number } | null>(null)
  const [squad, setSquad] = useState<PlayerRow[]>([])
  const [fact, setFact] = useState<string | null>(null)
  const [spinsDone, setSpinsDone] = useState(0)
  const [spunPosition, setSpunPosition] = useState<PositionSlot | null>(null)   // Cursed
  const [placing, setPlacing] = useState<PlayerRow | null>(null)                // chosen, several hangers fit
  // P8-98: what Chaos or the curse just did, said for a moment ("THE CURSE CHOSE …").
  const [omen, setOmen] = useState<{ line: string; tone: 'chaos' | 'cursed' } | null>(null)
  // Cursed: the name each tag shows right now — the squad's names, shuffled
  // again every second, so you can't be sure who you're picking.
  const [scramble, setScramble] = useState<Map<string, string> | null>(null)
  const [holding, setHolding] = useState<Holding>(null)
  // P8-06: where the next pick goes while the eleven isn't finished. The bench
  // is open from the first spin, not only once the eleven is full.
  const [pickTo, setPickTo] = useState<'xi' | 'bench'>('xi')
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
    // P8-149: a continued run brings its picks; a new one brings none.
    const kept = useGameStore.getState().draftedPlayers
    setSlots(getSlotsForFormation(formation).map(sl => ({ ...sl, filledBy: kept.find(d => d.slotIndex === sl.slotIndex && !d.isBench) ?? null })))
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
  // Cursed spins the position for you, so its picks stay on the pitch.
  const canBenchEarly = !xiDone && benchNeeded > 0 && mode !== 'cursed'
  const toBench = draftingBench || (canBenchEarly && pickTo === 'bench')
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
    // Every spin plays at one speed (P8-83). 06 §5.1 had the first spin of a
    // run play in full (1.4 s) and later ones quick (0.45 s); in play the first
    // one just read as oddly slow. P8-05 kept the length (the maintainer called
    // it right) and added the reel's tail, strobe and landing instead.
    setSpin({ club, items: [...decoys, spinItem(club)], duration: SPIN_MS })
    setSpinsDone(n => n + 1)
    setSquad([]); setFact(null); setPlacing(null)
    // P8-39: one pin on screen. While a club is being drafted the pin is on
    // its card, so the last pick's comes off; the next pick takes it.
    setJustFilled(null)
    setPhase('spinning')
  }

  function spinItem(c: ClubSeasonRow): SpinItem {
    return mode === 'world_cup'
      ? { title: c.club_name, sub: undefined }
      : { title: c.club_name, sub: seasonLabel(c.year_start), colour: c.primary_color }
  }

  async function onLanded() {
    if (!spin) return
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
    clearSpin()
  }

  function pickPlayer(p: PlayerRow) {
    if (!spin || omen || taken.has(footballerKey(p.name, p.birth_year, p.nationality))) return
    // P8-98, Cursed: now and then the curse takes the pick out of your hands —
    // another player who can fill the spun position goes in instead.
    if (mode === 'cursed' && !toBench && Math.random() < CURSE_CHANCE) {
      const others = squad.filter(o => o.id !== p.id && !taken.has(footballerKey(o.name, o.birth_year, o.nationality)) && fitsFor(o.primary_position).length > 0)
      if (others.length) {
        const cursed = others[Math.floor(Math.random() * others.length)]
        setOmen({ line: `THE CURSE CHOSE ${surname(cursed.name).toUpperCase()}`, tone: 'cursed' })
        setTimeout(() => { setOmen(null); assign(cursed, fitsFor(cursed.primary_position)[0]) }, OMEN_MS)
        return
      }
    }
    if (toBench) {
      addBenchPlayer(toDrafted(p, spin.club, nextBenchIndex(benchPlayers), true))
      setJustFilled(`bench:${p.id}`)   // a bench pick wears the pin too (P8-39)
      if (benchNeeded === 1) setPickTo('xi')   // that filled it
      clearSpin()
      return
    }
    const fits = fitsFor(p.primary_position)
    if (fits.length === 0) return
    // P8-98, Chaos: you pick the player, chaos picks where he plays — any open
    // spot he can play, at whatever it costs him.
    if (mode === 'chaos') {
      const slot = fits[Math.floor(Math.random() * fits.length)]
      setOmen({ line: `CHAOS PUT ${surname(p.name).toUpperCase()} AT ${slot.label}`, tone: 'chaos' })
      setTimeout(() => setOmen(null), OMEN_MS)
      assign(p, slot)
      return
    }
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
      // P8-39: one pin on screen — the held player wears it, so the last
      // pick's comes off (before, the drafted player kept his pin while
      // another was held, and two showed).
      setJustFilled(null)
      setHolding({ kind: 'starter', player: slot.filledBy })
    }
  }

  // P8-06: the held starter goes to the bench, and his slot opens again.
  function sendToBench(p: DraftedPlayer) {
    setSlots(prev => prev.map((s, i) => (i === p.slotIndex ? { ...s, filledBy: null } : s)))
    benchStarter(p.playerId)
    setHolding(null)
  }

  function tapBench(sub: DraftedPlayer | undefined) {
    if (!sub) {
      if (holding?.kind === 'starter' && benchNeeded > 0) sendToBench(holding.player)
      return
    }
    if (holding?.kind === 'starter') {
      if (benchCanCover(sub, holding.player)) bringOn(sub, holding.player.slotIndex)
      return
    }
    if (holding?.kind === 'sub' && holding.player.playerId === sub.playerId) { setHolding(null); return }
    setJustFilled(null)   // P8-39: one pin on screen
    setHolding({ kind: 'sub', player: sub })
  }

  function skipBench() {
    const drop = () => {
      useGameStore.setState({ useSubstitutes: false, benchPlayers: [] })
      clearSpin()
    }
    // P8-21: the question can be switched off here, and back on in You › Settings.
    if (!useSettingsStore.getState().noBenchWarning) { drop(); return }
    openConfirm({
      question: 'No bench?',
      consequence: `Nobody gets subs this run, you or anyone else.${benchPlayers.length ? ` Your ${benchPlayers.length} sub${benchPlayers.length === 1 ? '' : 's'} will be dropped.` : ''}`,
      confirmLabel: 'Play without a bench',
      stayLabel: 'Keep drafting subs',
      onConfirm: drop,
      optOut: {
        label: "Don't ask again. You can turn it back on in Settings.",
        apply: () => useSettingsStore.getState().setNoBenchWarning(false),
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

  // Every footballer already in the XI or on the bench, in any season (P8-30).
  const taken = useMemo(
    () => new Set([...draftedPlayers, ...benchPlayers].map(d => footballerKey(d.name, d.birthYear, d.nationality))),
    [draftedPlayers, benchPlayers],
  )
  useEffect(() => {
    if (mode !== 'cursed' || phase !== 'picking' || squad.length < 2) { setScramble(null); return }
    const shuffle = () => {
      const names = squad.map(p => p.name).sort(() => Math.random() - 0.5)
      setScramble(new Map(squad.map((p, i) => [p.id, names[i]])))
    }
    shuffle()
    const t = setInterval(shuffle, 1000)
    return () => clearInterval(t)
  }, [mode, phase, squad])

  const sortedSquad = useMemo(() => {
    const avail = (p: PlayerRow) => draftingBench || fitsFor(p.primary_position).length > 0
    const byName = (a: PlayerRow, b: PlayerRow) => surname(a.name).localeCompare(surname(b.name))
    return [...squad].sort((a, b) => {
      const d = Number(avail(b)) - Number(avail(a))
      if (d) return d
      // P8-109: the hidden-ratings check used to come first, so with ratings
      // hidden (Hard, Chaos, Cursed) every choice fell through to A–Z and the
      // POS chip did nothing. Hidden ratings only rule out ordering BY rating,
      // which would leak it — position still sorts, then by name inside a
      // position so the order still says nothing about who's better.
      if (sortBy === 'position') {
        const rank = (x: PlayerRow) => { const i = POS_ORDER.indexOf(x.primary_position); return i < 0 ? POS_ORDER.length : i }
        return (rank(a) - rank(b)) || (ratingsHidden ? byName(a, b) : b.ovr - a.ovr)
      }
      if (ratingsHidden || sortBy === 'name') return byName(a, b)
      return b.ovr - a.ovr
    })
  }, [squad, sortBy, ratingsHidden, draftingBench, eligibleSlots])

  // A footballer you already have doesn't count as someone who fits (P8-30).
  const nobodyFits = phase === 'picking' && squad.length > 0
    && squad.every(p => taken.has(footballerKey(p.name, p.birth_year, p.nationality)) || (!toBench && fitsFor(p.primary_position).length === 0))

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
        onPitch
        label={slot.label}
        surname={p ? surname(p.name) : undefined}
        rating={p ? ratingText(effectiveOvr(p, slot)) : undefined}
        outOfPosition={!!pen}
        state={state}
        note={note}
        swingKey={p && justFilled === `${slot.slotIndex}:${p.playerId}` ? justFilled : undefined}
        mark={p ? { clubId: p.clubId, clubName: p.clubName, nationality: p.nationality } : undefined}
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
        <Loader color={roles.text} />
        <KitText t="tag" color={roles.textMuted}>Loading the pool…</KitText>
      </KitScreen>
    )
  }

  const next = ratingsHidden ? '/game/reveal' : '/game/placement'

  // Expanded (10-ADAPT §2.2): your team on the left (pitch, bench, what
  // you're holding), the spin and the pick on the right with the plate under
  // it, so the pitch never scrolls away while you choose. Compact stacks them.
  const teamPane = (
    <>
      {/* The pitch */}
      {/* P8-50: the same pitch as every other formation in the app. */}
      <Pitch rows={lines.map(row => row.map(hangerFor))} footer={
        <View style={styles.pitchFoot}>
          <KitText t="tag" color={prim.cottonMuted}>{`${slots.length - openSlots.length}/11`}</KitText>
          <KitText t="tag" color={prim.cotton}>
            {`TEAM OVR ${ratingsHidden ? '??' : teamOvr ?? '—'}`}
          </KitText>
        </View>
      } />

      {/* The bench rail */}
      {useSubstitutes && (
        <View style={styles.benchRow}>
          {Array.from({ length: BENCH_SIZE }, (_, i) => {
            const sub = benchPlayers[i]
            const lit = !!sub && holding?.kind === 'starter' && benchCanCover(sub, holding.player)
            // An empty spot takes a held starter (P8-06).
            const open = !sub && holding?.kind === 'starter' && benchNeeded > 0
            const held = !!sub && holding?.kind === 'sub' && holding.player.playerId === sub.playerId
            return (
              <Hanger
                key={i}
                roles={roles}
                label={`SUB ${i + 1}`}
                surname={sub ? surname(sub.name) : undefined}
                rating={sub ? ratingText(sub.ovr) : undefined}
                state={held ? 'holding' : lit || open ? 'target' : sub ? 'filled' : 'empty'}
                note={lit ? 'SWAP' : open ? 'BENCH' : undefined}
                onPress={sub || open ? () => tapBench(sub) : undefined}
                swingKey={sub && justFilled === `bench:${sub.playerId}` ? justFilled : undefined}
                a11y={sub ? `Sub ${i + 1}: ${sub.name}, ${sub.primaryPosition}` : `Sub ${i + 1}: empty`}
              />
            )
          })}
        </View>
      )}

      {holding && (
        <View style={styles.holdLine}>
          <KitText t="body" color={roles.text} style={{ flex: 1 }}>
            {/* P8-125: the full name; a surname alone can be two players in one squad. */}
            {`Holding ${holding.player.name}. Tap a lit spot to move him, or tap him again to let go.`}
          </KitText>
          <Plate label="Let go" variant="quiet" roles={roles} onPress={() => setHolding(null)} />
        </View>
      )}
    </>
  )
  const spinPane = (
    <>
      {poolFailed && (
        <StripedNotice roles={roles} failed>The player pool didn't load. Go back and try again.</StripedNotice>
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
            clubId={spin.club.club_id ?? undefined}
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
          {omen && <Omen line={omen.line} tone={omen.tone} />}
          {placing && (
            <View style={styles.holdLine}>
              <KitText t="body" color={roles.text} style={{ flex: 1 }}>
                {`${placing.name} fits more than one spot. Tap a lit one.`}
              </KitText>
              <Plate label="Cancel" variant="quiet" roles={roles} onPress={() => setPlacing(null)} />
            </View>
          )}
          {/* P8-06: this pick for the eleven or the bench. */}
          {canBenchEarly && (
            <Chips roles={roles} label="PICK FOR" value={pickTo} onChange={setPickTo}
              options={[{ id: 'xi' as const, label: 'XI' }, { id: 'bench' as const, label: `BENCH ${BENCH_SIZE - benchNeeded}/${BENCH_SIZE}` }]} />
          )}
          {nobodyFits ? (
            <StripedNotice roles={roles} actionLabel="Spin again" onAction={() => { clearSpin(); handleSpin() }}>
              {canBenchEarly
                ? 'Nobody here fits your open positions. Pick for the bench instead, or spin again for free.'
                : 'Nobody here fits your open positions. Spinning again is free.'}
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
                // Cursed's names swap every second, so an A–Z order sorted the
                // real names under shown ones that aren't, and looked like no
                // order at all. Position still sorts: that's never hidden.
                ...(mode === 'cursed' ? [] : [{ id: 'name' as const, label: 'A–Z' }]),
              ]}
            />
          )}
          <View style={styles.grid}>
            {sortedSquad.map(p => (
              // Chaos's cards sit askew; Cursed's names won't stay still (P8-98).
              <View key={p.id} style={[styles.gridCell, mode === 'chaos' && { transform: [{ rotate: `${tiltOf(p.id)}deg` }] }]}>
                <PlayerTag
                  roles={roles}
                  name={scramble?.get(p.id) ?? p.name}
                  position={p.primary_position}
                  nationality={p.nationality}
                  rating={ratingText(p.ovr)}
                  available={!taken.has(footballerKey(p.name, p.birth_year, p.nationality)) && (toBench || fitsFor(p.primary_position).length > 0)}
                  blocked={taken.has(footballerKey(p.name, p.birth_year, p.nationality)) ? 'YOURS' : undefined}
                  chosen={placing?.id === p.id}
                  onPress={() => pickPlayer(p)}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {draftingBench && phase === 'idle' && (
        // P8-07: a real choice, so a real plate: secondary, under the orange
        // "Spin for sub" plate that stays the main action.
        <Plate label="Play without a bench" variant="secondary" roles={roles} onPress={skipBench} style={styles.noBench} />
      )}

      {!useSubstitutes && xiDone && phase === 'idle' && (
        // P8-110: the mirror of it. Turning the bench off isn't final: once the
        // eleven is done you can change your mind, in the same place you turned
        // it off, not up by the draw.
        <Plate label="Draft a bench after all" variant="secondary" roles={roles}
          onPress={() => useGameStore.setState({ useSubstitutes: true })} style={styles.noBench} />
      )}
    </>
  )
  const actionsPane = (
    <>
      {/* The thumb zone */}
      <View style={styles.actions}>
        {squadDone ? (
          <Plate
            label={ratingsHidden ? 'See your ratings' : 'To the draw'}
            icon="forward"
            roles={roles}
            onPress={() => { router.push(next) }}
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
    </>
  )

  return (
    <KitScreen ground="cotton" scroll={false} width={wide ? 'wide' : 'column'} contentStyle={styles.screen}>
      {/* P8-125: while a player is held or picked, the screen quietly takes
          his mark, as the spin tints the club card (P8-05). */}
      {holding ? <MarkBackdrop roles={roles} full clubId={holding.player.clubId} clubName={holding.player.clubName} nationality={holding.player.nationality} />
        : placing && spin ? <MarkBackdrop roles={roles} full clubId={spin.club.club_id} clubName={spin.club.club_name} nationality={placing.nationality} />
        : null}
      {/* Space spins only when the Spin plate is showing. handleSpin itself allows a
          spin while picking, so without this guard Space was a free reroll. */}
      <WebKeys onKey={k => { if (k === ' ' && phase === 'idle' && !squadDone && pool.length > 0) handleSpin() }} />
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

      {wide ? (
        <View style={styles.wide}>
          <ScrollView style={styles.wideTeam} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>{teamPane}</ScrollView>
          <View style={styles.wideSpin}>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>{spinPane}</ScrollView>
            {actionsPane}
          </View>
        </View>
      ) : (
        <>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>
            {teamPane}
            {spinPane}
          </ScrollView>
          {actionsPane}
        </>
      )}
    </KitScreen>
  )
}

// P8-98: what Chaos or the curse just did, flickering for a moment. The
// curse's flickers like a bad signal; Chaos's is a warning tape.
function Omen({ line, tone }: { line: string; tone: 'chaos' | 'cursed' }) {
  const reduced = useReducedMotion()
  const flicker = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    flicker.value = withRepeat(withSequence(withTiming(0.25, { duration: 70 }), withTiming(1, { duration: 110 }), withTiming(0.6, { duration: 60 }), withTiming(1, { duration: 260 })), -1)
  }, [reduced])
  const style = useAnimatedStyle(() => ({ opacity: flicker.value }))
  return (
    <Animated.View style={[styles.omen, { borderColor: tone === 'cursed' ? '#7234F0' : prim.misery, backgroundColor: prim.ink }, style]}
      accessibilityLiveRegion="assertive">
      <Tape colours={colourwayFor(tone)} roles={roles} thickness={border.tape} />
      <KitText t="superS" color={prim.cotton} style={styles.omenText}>{line}</KitText>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  omen: { borderWidth: border.plate, overflow: 'hidden' },
  omenText: { paddingHorizontal: space[3], paddingVertical: space[2] },
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
  noBench: { marginTop: space[3] },
  actions: { paddingTop: space[2] },
  wide: { flex: 1, flexDirection: 'row', gap: space[6] },
  wideTeam: { flex: 1 },
  wideSpin: { flex: 1, minWidth: 0 },
})
