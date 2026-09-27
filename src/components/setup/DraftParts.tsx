// The draft's own pieces (docs/ui-overhaul/08 §3.1): the rack spin, the pitch
// hangers, player tags and the landed club card. Kit Drop, cotton ground.
import { useReducedMotion } from '@/hooks/useReducedMotion'
import React, { useEffect, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, Image, type LayoutChangeEvent } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, cancelAnimation, runOnJS, Easing,
} from 'react-native-reanimated'
import { type Roles, space, border, prim, ROLES, towardInk } from '@/theme'
import { spring } from '@/lib/motion'
import { KitText, Stripe, Tape, ZipTag, RoundFlag, Plate, Crest } from '@/components/kit'
import { getFlag } from '@/lib/flagMap'
import { flagImageOf } from '@/lib/flags'
import { flagForCountry } from '@/data/geo-iso'

// ── SwingTag ─────────────────────────────────────────────────────────────────
// The zip tag, attached with the app's one overshoot. Remounting it (a new
// `key`) replays the swing.
export function SwingTag({ size = 14, style }: { size?: number; style?: any }) {
  const reduced = useReducedMotion()
  const r = useSharedValue(reduced ? 0 : -40)
  useEffect(() => { if (!reduced) r.value = withSpring(0, spring.swing) }, [reduced])
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }))
  return (
    <Animated.View style={[{ transformOrigin: 'top' } as any, style, a]} pointerEvents="none">
      <ZipTag size={size} />
    </Animated.View>
  )
}

// ── RackSpin ─────────────────────────────────────────────────────────────────
// A strip of club-season tags whips past and brakes onto the one already
// chosen (docs/ui-overhaul/06 §5.1). One translate on the UI thread, built
// once — no per-tick state. A tap lands it at once. Reduced motion skips the
// strip entirely.
// P8-05: the reel runs on past the landed club (TAIL more tags after it), so
// it brakes in the middle of a reel instead of at the end of a list, and the
// reel's edges strobe through the colour of whichever club is passing the
// marker. The landing's flash and tint live on the ClubCard, which is what
// mounts the moment the reel lands.
export type SpinItem = { title: string; sub?: string; colour?: string }
const ITEM_W = 156
const TAIL = 5

export function RackSpin({ roles, items, durationMs, onLanded }: {
  roles: Roles
  items: SpinItem[]        // the last item is the landed one
  durationMs: number
  onLanded: () => void
}) {
  const reduced = useReducedMotion()
  const [width, setWidth] = useState(0)
  const x = useSharedValue(0)
  const done = useRef(false)
  const land = () => { if (!done.current) { done.current = true; onLanded() } }

  const start = width > 0 ? (width - ITEM_W) / 2 : 0
  const end = start - (items.length - 1) * ITEM_W

  useEffect(() => {
    if (width === 0) return
    if (reduced) { const t = setTimeout(land, 150); return () => clearTimeout(t) }
    x.value = start
    x.value = withTiming(end, { duration: durationMs, easing: Easing.out(Easing.cubic) }, finished => {
      if (finished) runOnJS(land)()
    })
    return () => cancelAnimation(x)
  }, [width])

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  // The club under the marker, read off the one translate: no per-tick state.
  const reel = [...items, ...items.slice(0, TAIL)]
  const colours = reel.map(it => it.colour ?? prim.inkFaint)
  const edge = useAnimatedStyle(() => {
    const i = Math.max(0, Math.min(colours.length - 1, Math.round((start - x.value) / ITEM_W)))
    return { backgroundColor: colours[i] }
  })

  function skip() {
    cancelAnimation(x)
    x.value = end
    land()
  }

  const last = items[items.length - 1]
  return (
    <Pressable
      onPress={skip}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel="Spinning. Tap to land it now."
      style={[styles.spinFrame, { borderColor: roles.line, backgroundColor: roles.sunken }]}
    >
      {reduced ? (
        <View style={styles.spinCenter}><SpinCard roles={roles} item={last} /></View>
      ) : (
        <Animated.View style={[styles.strip, strip]}>
          {reel.map((it, i) => <SpinCard key={i} roles={roles} item={it} />)}
        </Animated.View>
      )}
      {!reduced && <Animated.View pointerEvents="none" style={[styles.spinEdge, styles.spinEdgeTop, edge]} />}
      {!reduced && <Animated.View pointerEvents="none" style={[styles.spinEdge, styles.spinEdgeBottom, edge]} />}
      <View pointerEvents="none" style={[styles.spinMarker, { backgroundColor: prim.orange }]} />
    </Pressable>
  )
}

function SpinCard({ roles, item }: { roles: Roles; item: SpinItem }) {
  return (
    <View style={[styles.spinCard, { borderColor: roles.line, backgroundColor: roles.surface }]}>
      {item.colour ? <Tape colours={[item.colour]} roles={roles} vertical thickness={4} /> : null}
      <View style={styles.spinCardBody}>
        <KitText t="title" color={roles.text} numberOfLines={1}>{item.title}</KitText>
        {item.sub ? <KitText t="tag" color={roles.textMuted}>{item.sub}</KitText> : null}
      </View>
    </View>
  )
}

// ── ClubCard ─────────────────────────────────────────────────────────────────
// The landed club-season as a tag. Flip it to read its fact on the back.
// P8-05: it lands in the club's colour. A hard flash of that colour on arrival
// (a cut, then gone: "stamps, not fades"), the card itself on a near-black tint
// of it, read in cotton, and the zip tag swinging on. Reduced motion keeps the
// tint and drops the flash and the swing.
export function ClubCard({ roles, name, sub, colour, flag, fact, onReroll, rerollsLeft, clubId }: {
  roles: Roles
  name: string
  clubId?: string   // P8-12: the landed club's own crest
  sub?: string
  colour?: string
  flag?: string
  fact?: string | null
  onReroll?: () => void
  rerollsLeft: number
}) {
  const [flipped, setFlipped] = useState(false)
  const reduced = useReducedMotion()
  const flash = useSharedValue(reduced || !colour ? 0 : 1)
  useEffect(() => { if (!reduced) flash.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.quad) }) }, [])
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }))
  // The card reads in cotton on the club's near-black tint, whatever the ground.
  const on = ROLES.nylon
  return (
    <View style={[styles.club, { borderColor: roles.line, backgroundColor: towardInk(colour ?? prim.nylon, 0.82) }]}>
      {flag ? <View style={styles.clubFlag}><RoundFlag roles={on} emoji={flag} code={name} size={24} /></View>
        : colour ? <Tape colours={[colour]} roles={on} vertical thickness={6} /> : null}
      {!flag && <View style={styles.clubCrest}><Crest roles={on} clubId={clubId} name={name} size={24} /></View>}
      <View style={styles.clubBody}>
        {flipped && fact ? (
          <KitText t="body" color={on.text}>{fact}</KitText>
        ) : (
          <>
            <KitText t="title" color={on.text} numberOfLines={1}>{name}</KitText>
            {sub ? <KitText t="tag" color={on.textMuted}>{sub}</KitText> : null}
          </>
        )}
      </View>
      <View style={styles.clubActions}>
        {fact ? (
          <Pressable onPress={() => setFlipped(f => !f)} hitSlop={8} accessibilityRole="button"
            accessibilityLabel={flipped ? 'Show the club' : 'Read a fact about this club'} style={styles.flip}>
            <KitText t="tag" color={on.text}>{flipped ? 'BACK' : 'FLIP'}</KitText>
          </Pressable>
        ) : null}
        {onReroll && rerollsLeft > 0 ? (
          <Plate label="Reroll" variant="secondary" roles={on} onPress={onReroll}
            accessibilityHint={`${rerollsLeft} left`} style={styles.reroll} />
        ) : null}
      </View>
      {colour ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colour }, flashStyle]} /> : null}
      <SwingTag size={14} style={styles.clubTag} />
    </View>
  )
}

// ── MarkBackdrop (P8-125) ────────────────────────────────────────────────────
// A player's nation and club behind him, faintly. A national side's player
// (the World Cup) has his flag behind him; a club player his club's crest,
// with his nation's flag small in a corner. `full` is the whole screen while
// he's held or picked. Faint on purpose: the words on top stay the reading.
export type PlayerMark = { clubId?: string | null; clubName: string; nationality: string }

export function MarkBackdrop({ roles, clubId, clubName, nationality, full }: PlayerMark & { roles: Roles; full?: boolean }) {
  const nationSide = getFlag(clubId)
  const flag = flagImageOf(nationSide ?? flagForCountry(nationality))
  const opacity = full ? 0.07 : 0.16
  if (nationSide) {
    return flag ? (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image source={flag} resizeMode="cover" style={{ opacity, width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
      </View>
    ) : null
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.markCentre, { opacity }]}>
        <Crest roles={roles} clubId={clubId} name={clubName} size={full ? 280 : 40} />
      </View>
      {!full && flag ? <Image source={flag} resizeMode="cover" style={styles.markFlag} accessibilityIgnoresInvertColors /> : null}
    </View>
  )
}

// ── Hanger ───────────────────────────────────────────────────────────────────
// One position on the draft pitch. Empty shows its position; filled shows the
// player's surname and effective rating (a striped edge when he's out of
// position, so the cost isn't colour-only). "target" is lit: the thing you're
// holding can go here, and `note` says what that would do ("IN 84").
export type HangerState = 'empty' | 'filled' | 'holding' | 'target' | 'focus'

export function Hanger({ roles, label, surname, rating, outOfPosition, state, note, onPress, swingKey, a11y, onPitch, mark }: {
  roles: Roles
  label: string
  surname?: string
  rating?: string
  outOfPosition?: boolean
  state: HangerState
  note?: string
  onPress?: () => void
  swingKey?: string      // change it to replay the zip tag's swing on this hanger
  /** Standing on the green pitch (P8-50): the empty and lit states take the
   *  pitch's inks, since the ground's own (ink on cotton) vanish on dark green.
   *  A filled hanger stays a cotton card, which reads on both. */
  onPitch?: boolean
  /** P8-125: whose he is, drawn faintly behind him. */
  mark?: PlayerMark
  a11y: string
}) {
  const holding = state === 'holding'
  const lit = state === 'target' || state === 'focus'
  const filled = !!surname
  const edge = lit || holding || filled ? (onPitch && !filled ? prim.cotton : roles.line) : (onPitch ? prim.pitchLine : roles.rule)
  const onGround = onPitch && !filled && !holding   // text sitting straight on the green
  const muted = holding ? prim.ink : onGround ? prim.cottonMuted : roles.textMuted
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: holding }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.hanger,
        {
          borderColor: edge,
          borderWidth: lit ? border.plate : border.thin,
          borderStyle: filled || lit || holding ? 'solid' : 'dashed',
          backgroundColor: holding ? prim.orange : filled ? roles.surface : 'transparent',
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {filled && mark && !holding && <MarkBackdrop roles={roles} {...mark} />}
      {outOfPosition && filled && <Stripe roles={roles} band={4} style={styles.hangerStripe} />}
      <KitText t="tag" color={muted} numberOfLines={1}>{label}</KitText>
      {filled ? (
        <>
          <KitText t="tag" color={holding ? prim.ink : roles.text} numberOfLines={1} style={styles.hangerName}>{surname}</KitText>
          <KitText t="figure" color={holding ? prim.ink : roles.text}>{rating}</KitText>
        </>
      ) : null}
      {note ? <KitText t="tag" color={onGround ? prim.cotton : roles.text} style={styles.hangerNote}>{note}</KitText> : null}
      {/* P8-39: picking a player up is its own mount (`hold`), so tapping the
          pinned player replays the swing instead of keeping the still tag. */}
      {(holding || swingKey) && <SwingTag key={holding ? 'hold' : swingKey} size={12} style={styles.hangerTag} />}
    </Pressable>
  )
}

// ── PlayerTag ────────────────────────────────────────────────────────────────
export function PlayerTag({ roles, name, position, nationality, rating, available, chosen, onPress, blocked }: {
  roles: Roles
  name: string
  position: string
  nationality: string
  rating: string
  available: boolean
  chosen?: boolean
  onPress: () => void
  /** Why an unavailable player can't be picked, when it isn't "no open slot" (P8-30: YOURS). */
  blocked?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!available}
      accessibilityRole="button"
      accessibilityState={{ disabled: !available, selected: chosen }}
      accessibilityLabel={`${name}, ${position}, ${nationality}, rating ${rating}${available ? '' : blocked ? `, ${blocked.toLowerCase()}` : ', no open position'}`}
      style={({ pressed }) => [
        styles.player,
        {
          borderColor: available ? roles.line : roles.rule,
          backgroundColor: chosen ? prim.orange : roles.surface,
          borderWidth: chosen ? border.plate : border.thin,
        },
        pressed && available && { backgroundColor: roles.sunken },
      ]}
    >
      {!available && <Stripe roles={roles} band={4} style={styles.playerStripe} />}
      <View style={[styles.playerBody, !available && { opacity: 0.6 }]}>
        <View style={styles.playerTop}>
          <KitText t="tag" color={chosen ? prim.ink : roles.text}>{position}</KitText>
          <KitText t="figure" color={chosen ? prim.ink : roles.text}>{available ? rating : blocked ?? 'NO SLOT'}</KitText>
        </View>
        <KitText t="body" color={chosen ? prim.ink : roles.text} numberOfLines={1}>{name}</KitText>
        <KitText t="tag" color={chosen ? prim.ink : roles.textMuted} numberOfLines={1}>{nationality}</KitText>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  spinFrame: { height: 84, borderWidth: border.thin, overflow: 'hidden', justifyContent: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center' },
  spinCenter: { alignItems: 'center' },
  spinCard: { width: ITEM_W - 8, marginHorizontal: 4, height: 60, borderWidth: border.thin, flexDirection: 'row', overflow: 'hidden' },
  spinCardBody: { flex: 1, paddingHorizontal: space[2], justifyContent: 'center', gap: 2 },
  spinEdge: { position: 'absolute', left: 0, right: 0, height: 4 },
  spinEdgeTop: { top: 0 },
  spinEdgeBottom: { bottom: 0 },
  clubTag: { position: 'absolute', top: 0, right: space[3] },   // inside the card: it clips its overflow
  spinMarker: { position: 'absolute', left: '50%', marginLeft: -1, top: 0, bottom: 0, width: 2 },

  club: { flexDirection: 'row', alignItems: 'stretch', borderWidth: border.plate, minHeight: 64, overflow: 'hidden' },
  clubCrest: { justifyContent: 'center', paddingLeft: space[3] },
  clubFlag: { justifyContent: 'center', paddingLeft: space[3] },
  clubBody: { flex: 1, paddingHorizontal: space[3], paddingVertical: space[2], justifyContent: 'center', gap: 2 },
  clubActions: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingRight: space[2] },
  flip: { paddingHorizontal: space[2], minHeight: 44, justifyContent: 'center' },
  reroll: { minWidth: 0 },

  hanger: {
    width: 66, minHeight: 46, paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center', overflow: 'visible',
  },
  hangerStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  markCentre: { alignItems: 'center', justifyContent: 'center' },
  // The nation, small in the corner of a club player's spot.
  markFlag: { position: 'absolute', right: 2, bottom: 2, width: 12, height: 8, opacity: 0.9 },
  hangerName: { fontSize: 9 },
  hangerNote: { position: 'absolute', bottom: -14, fontSize: 9 },
  hangerTag: { position: 'absolute', top: -14, right: 2 },

  player: { flex: 1, minHeight: 72, overflow: 'hidden' },
  playerStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  playerBody: { padding: space[2], paddingLeft: space[3], gap: 2 },
  playerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
