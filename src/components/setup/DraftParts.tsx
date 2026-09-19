// The draft's own pieces (docs/ui-overhaul/08 §3.1): the rack spin, the pitch
// hangers, player tags and the landed club card. Kit Drop, cotton ground.
import React, { useEffect, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, cancelAnimation, runOnJS, Easing, useReducedMotion,
} from 'react-native-reanimated'
import { type Roles, space, border, prim } from '@/theme'
import { spring } from '@/lib/motion'
import { KitText, Stripe, Tape, ZipTag, RoundFlag, Plate } from '@/components/kit'

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
export type SpinItem = { title: string; sub?: string; colour?: string }
const ITEM_W = 156

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
          {items.map((it, i) => <SpinCard key={i} roles={roles} item={it} />)}
        </Animated.View>
      )}
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
export function ClubCard({ roles, name, sub, colour, flag, fact, onReroll, rerollsLeft }: {
  roles: Roles
  name: string
  sub?: string
  colour?: string
  flag?: string
  fact?: string | null
  onReroll?: () => void
  rerollsLeft: number
}) {
  const [flipped, setFlipped] = useState(false)
  return (
    <View style={[styles.club, { borderColor: roles.line, backgroundColor: roles.surface }]}>
      {flag ? <View style={styles.clubFlag}><RoundFlag roles={roles} emoji={flag} code={name} size={24} /></View>
        : colour ? <Tape colours={[colour]} roles={roles} vertical thickness={6} /> : null}
      <View style={styles.clubBody}>
        {flipped && fact ? (
          <KitText t="body" color={roles.text}>{fact}</KitText>
        ) : (
          <>
            <KitText t="title" color={roles.text} numberOfLines={1}>{name}</KitText>
            {sub ? <KitText t="tag" color={roles.textMuted}>{sub}</KitText> : null}
          </>
        )}
      </View>
      <View style={styles.clubActions}>
        {fact ? (
          <Pressable onPress={() => setFlipped(f => !f)} hitSlop={8} accessibilityRole="button"
            accessibilityLabel={flipped ? 'Show the club' : 'Read a fact about this club'} style={styles.flip}>
            <KitText t="tag" color={roles.text}>{flipped ? 'BACK' : 'FLIP'}</KitText>
          </Pressable>
        ) : null}
        {onReroll && rerollsLeft > 0 ? (
          <Plate label="Reroll" variant="secondary" roles={roles} onPress={onReroll}
            accessibilityHint={`${rerollsLeft} left`} style={styles.reroll} />
        ) : null}
      </View>
    </View>
  )
}

// ── Hanger ───────────────────────────────────────────────────────────────────
// One position on the draft pitch. Empty shows its position; filled shows the
// player's surname and effective rating (a striped edge when he's out of
// position, so the cost isn't colour-only). "target" is lit: the thing you're
// holding can go here, and `note` says what that would do ("IN 84").
export type HangerState = 'empty' | 'filled' | 'holding' | 'target' | 'focus'

export function Hanger({ roles, label, surname, rating, outOfPosition, state, note, onPress, swingKey, a11y }: {
  roles: Roles
  label: string
  surname?: string
  rating?: string
  outOfPosition?: boolean
  state: HangerState
  note?: string
  onPress?: () => void
  swingKey?: string      // change it to replay the zip tag's swing on this hanger
  a11y: string
}) {
  const holding = state === 'holding'
  const lit = state === 'target' || state === 'focus'
  const filled = !!surname
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
          borderColor: lit || holding || filled ? roles.line : roles.rule,
          borderWidth: lit ? border.plate : border.thin,
          borderStyle: filled || lit || holding ? 'solid' : 'dashed',
          backgroundColor: holding ? prim.orange : filled ? roles.surface : 'transparent',
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {outOfPosition && filled && <Stripe roles={roles} band={4} style={styles.hangerStripe} />}
      <KitText t="tag" color={holding ? prim.ink : roles.textMuted} numberOfLines={1}>{label}</KitText>
      {filled ? (
        <>
          <KitText t="tag" color={holding ? prim.ink : roles.text} numberOfLines={1} style={styles.hangerName}>{surname}</KitText>
          <KitText t="figure" color={holding ? prim.ink : roles.text}>{rating}</KitText>
        </>
      ) : null}
      {note ? <KitText t="tag" color={roles.text} style={styles.hangerNote}>{note}</KitText> : null}
      {(holding || swingKey) && <SwingTag key={swingKey ?? 'hold'} size={12} style={styles.hangerTag} />}
    </Pressable>
  )
}

// ── PlayerTag ────────────────────────────────────────────────────────────────
export function PlayerTag({ roles, name, position, nationality, rating, available, chosen, onPress }: {
  roles: Roles
  name: string
  position: string
  nationality: string
  rating: string
  available: boolean
  chosen?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!available}
      accessibilityRole="button"
      accessibilityState={{ disabled: !available, selected: chosen }}
      accessibilityLabel={`${name}, ${position}, ${nationality}, rating ${rating}${available ? '' : ', no open position'}`}
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
          <KitText t="figure" color={chosen ? prim.ink : roles.text}>{available ? rating : 'NO SLOT'}</KitText>
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
  spinMarker: { position: 'absolute', left: '50%', marginLeft: -1, top: 0, bottom: 0, width: 2 },

  club: { flexDirection: 'row', alignItems: 'stretch', borderWidth: border.plate, minHeight: 64, overflow: 'hidden' },
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
  hangerName: { fontSize: 9 },
  hangerNote: { position: 'absolute', bottom: -14, fontSize: 9 },
  hangerTag: { position: 'absolute', top: -14, right: 2 },

  player: { flex: 1, minHeight: 72, overflow: 'hidden' },
  playerStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  playerBody: { padding: space[2], paddingLeft: space[3], gap: 2 },
  playerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
