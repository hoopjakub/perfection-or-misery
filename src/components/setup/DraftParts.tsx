// The draft's own pieces (docs/ui-overhaul/08 §3.1): the rack spin, the pitch
// hangers, player tags and the landed club card. Kit Drop, cotton ground.
import { t } from '@/i18n'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import React, { useEffect, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, Image, type LayoutChangeEvent } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence, cancelAnimation, runOnJS, Easing,
  useAnimatedReaction, type SharedValue,
} from 'react-native-reanimated'
import { type Roles, space, border, prim, ROLES, towardInk, LINE_TINT, lineOf } from '@/theme'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { spring } from '@/lib/motion'
import { KitText, Stripe, Tape, ZipTag, RoundFlag, Plate, Crest } from '@/components/kit'
import { getFlag } from '@/lib/flagMap'
import { flagImageOf, flagLargeOf } from '@/lib/flags'
import { flagForNationality, nationalityCountry } from '@/data/geo-iso'
import { countryName } from '@/data/countries-sk'
import { crestFor, markColoursOf } from '@/lib/brand'
import { ratio } from '@/lib/contrast'

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
// P8-163: each item wears its own mark. A club's card is its crest's colour
// with the crest big across it, bleeding off the edge; a nation's card is its
// flag. The colour is read off the picture itself (markColoursOf), so a nation
// has one too, and the scrapers' slate placeholder never shows. The name sits
// on a small ink label, so it reads on any colour. And two things that make
// the spin feel like one: the card passing the marker swells (a lens), and the
// marker is a flapper that clicks over as each card goes by, slowing with the
// reel like a prize wheel's. Both live on the UI thread, off the one translate.
export type SpinItem = { title: string; sub?: string; colour?: string; clubId?: string; flag?: string | null }
const ITEM_W = 156
const TAIL = 5
const FLAG_CARD_H = Math.round((ITEM_W - 8) / 1.5)   // a flag's 3:2
const LENS = 0.12       // how much the card under the marker swells
const FLAP_DEG = 22     // how far the flapper kicks as a card passes

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
  const colours = reel.map(it => markColoursOf(it.clubId, it.flag)?.[0] ?? it.colour ?? prim.inkFaint)
  // The flapper: each time a new card reaches the marker it kicks over and
  // springs back. Fast at first (a blur of clicks), then one by one.
  const flap = useSharedValue(0)
  useAnimatedReaction(
    () => Math.round((start - x.value) / ITEM_W),
    (cur, prev) => {
      if (reduced || prev === null || cur === prev) return
      flap.value = withSequence(withTiming(1, { duration: 35 }), withSpring(0, { damping: 9, stiffness: 320 }))
    },
    [start, reduced],
  )
  const flapper = useAnimatedStyle(() => ({ transform: [{ rotate: `${-flap.value * FLAP_DEG}deg` }] }))
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
  // A nation's reel (the World Cup) stands taller: its cards are flag-shaped.
  const nations = flagLargeOf(last.flag ?? getFlag(last.clubId)) != null
  return (
    <Pressable
      onPress={skip}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={t('draft.spinningA11y')}
      style={[styles.spinFrame, nations && styles.spinFrameFlags, { borderColor: roles.line, backgroundColor: roles.sunken }]}
    >
      {reduced ? (
        <View style={styles.spinCenter}><SpinCard roles={roles} item={last} /></View>
      ) : (
        <Animated.View style={[styles.strip, strip]}>
          {reel.map((it, i) => <SpinCard key={i} roles={roles} item={it} x={x} i={i} start={start} />)}
        </Animated.View>
      )}
      {!reduced && <Animated.View pointerEvents="none" style={[styles.spinEdge, styles.spinEdgeTop, edge]} />}
      {!reduced && <Animated.View pointerEvents="none" style={[styles.spinEdge, styles.spinEdgeBottom, edge]} />}
      <View pointerEvents="none" style={[styles.spinMarker, { backgroundColor: prim.orange }]} />
      {/* The flapper, hanging from the top of the marker. */}
      <Animated.View pointerEvents="none" style={[styles.flapper, { transformOrigin: 'top' } as any, flapper]}>
        <View style={[styles.flapperTip, { backgroundColor: prim.orange, borderColor: prim.ink }]} />
      </Animated.View>
    </Pressable>
  )
}

function SpinCard({ roles, item, x, i = 0, start = 0 }: { roles: Roles; item: SpinItem; x?: SharedValue<number>; i?: number; start?: number }) {
  const flagImage = flagLargeOf(item.flag ?? getFlag(item.clubId))
  // A nation's card is its flag and nothing else, as the draft's backdrop and
  // the landed card show it (the maintainer, 28 Sept: the flag with its own
  // colours banded on top "looks awful"). A club's card wears its crest's colours.
  const marks = flagImage != null ? null : markColoursOf(item.clubId, item.flag)
  const bg = flagImage != null ? prim.ink : marks?.[0] ?? item.colour ?? roles.surface
  const crest = !flagImage && item.clubId ? crestFor(item.clubId, item.title) : null
  // The second colour as a band along the foot, in whichever of ink and cotton
  // stands out when it's the same as the ground (a one-colour crest).
  const second = marks && marks[1] !== marks[0] ? marks[1] : ratio(bg, prim.ink) >= ratio(bg, prim.cotton) ? prim.ink : prim.cotton
  // The lens: 1 at a card's width from the marker, 1 + LENS right under it.
  const lens = useAnimatedStyle(() => {
    if (!x) return {}
    const d = Math.abs(x.value + i * ITEM_W - start) / ITEM_W
    return { transform: [{ scale: 1 + LENS * Math.max(0, 1 - d) }] }
  })
  return (
    <Animated.View style={[styles.spinCard, flagImage != null && styles.spinCardFlag, { borderColor: roles.line, backgroundColor: bg }, lens]}>
      {flagImage != null ? (
        // P9.75-24, second pass (the phone, 9 Oct: still zoomed, on the middle
        // or the top right): the flag fills the card as a player's tag does,
        // sized the same way (an Android Image given only absoluteFill drew at
        // its own 640 px), on a card that is itself a flag's shape (3:2), so
        // "cover" cuts nothing from a 3:2 flag and only the ends of a 2:1 one.
        <Image source={flagImage} style={styles.playerFlag} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : crest?.kind === 'image' ? (
        <Image source={crest.source} style={styles.spinCrest} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : null}
      {flagImage == null && <View style={[styles.spinSecond, { backgroundColor: second }]} />}
      <View style={styles.spinCardBody}>
        <View style={[styles.spinLabel, { backgroundColor: prim.ink }]}>
          <KitText t="title" color={prim.cotton} numberOfLines={1}>{item.title}</KitText>
        </View>
        {item.sub ? <View style={[styles.spinLabel, { backgroundColor: prim.ink }]}><KitText t="tag" color={prim.cotton}>{item.sub}</KitText></View> : null}
      </View>
    </Animated.View>
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
  // The card reads in cotton on the club's near-black tint, whatever the ground,
  // so its text always takes nylon's roles. It took the page's opposite ground
  // (P8.5-25), which in dark mode meant ink on near-black: the club's name all
  // but vanished the moment it landed (found filming the trailer, 3 Oct 2026).
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
            accessibilityLabel={flipped ? t('draft.showClub') : t('draft.readFact')} style={styles.flip}>
            <KitText t="tag" color={on.text}>{flipped ? t('draft.back') : t('draft.flip')}</KitText>
          </Pressable>
        ) : null}
        {onReroll && rerollsLeft > 0 ? (
          <Plate label={t('draft.reroll')} variant="secondary" roles={on} onPress={onReroll}
            accessibilityHint={t('draft.left', { n: rerollsLeft })} style={styles.reroll} />
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
  const flag = flagImageOf(nationSide ?? flagForNationality(nationality))
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

export function Hanger({ roles, label, surname, rating, outOfPosition, state, note, onPress, swingKey, a11y, onPitch, mark, dim }: {
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
  /** P9.75-03: something is held and this can't take it, so it steps back
   *  and the places that can read at a glance. */
  dim?: boolean
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
        dim && { opacity: 0.35 },
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
// P8-180: a player to pick is a card with his country behind him — the flag,
// full bleed — and his name on an ink label across it, like a sticker in an
// album: the position and the rating on the top corners, and under the name
// his nation, his age that season and the other positions he plays. A legend
// of the game wears a gold ICON tag. Picked: an orange frame and label. Not
// pickable: the flag dims under the hazard stripe, and the rating says why.
export function PlayerTag({ roles, name, position, nationality, rating, available, chosen, onPress, blocked, age, also, icon }: {
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
  /** His age in the season he's drafted from. */
  age?: number | null
  /** His other positions, e.g. "RW, CF". */
  also?: string
  icon?: boolean
}) {
  const flag = flagLargeOf(flagForNationality(nationality))
  const tint = LINE_TINT[lineOf(position)]
  // One label per country, whichever form the data stored (SPAIN, never SPANISH beside it).
  const nation = countryName(nationalityCountry(nationality))
  const detail = [nation.toUpperCase(), age ? `${age}` : null, alsoOf(also)].filter(Boolean).join(' · ')
  return (
    <Pressable
      onPress={onPress}
      disabled={!available}
      accessibilityRole="button"
      accessibilityState={{ disabled: !available, selected: chosen }}
      accessibilityLabel={t('draft.playerA11y', { name, pos: position, nation }) + (age ? t('draft.aged', { age }) : '') + t('draft.ratingA11y', { rating })
        + (available ? '' : blocked ? `, ${blocked.toLowerCase()}` : t('draft.noOpenPosition'))}
      style={({ pressed }) => [
        styles.player,
        {
          borderColor: chosen ? prim.orange : available ? roles.line : roles.rule,
          backgroundColor: prim.nylonRaised,
          borderWidth: chosen ? border.plate : border.thin,
        },
        pressed && available && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* The flag is the card, edge to edge and level (P8.5-11: the tilted,
          oversized flag lost its corners and read as a small thing behind him). */}
      {flag != null && (
        <Image source={flag} resizeMode="cover" accessibilityIgnoresInvertColors
          style={[styles.playerFlag, !available && { opacity: 0.3 }]} />
      )}
      {/* A shade rising from the foot, so the name reads on any flag (white
          stripes included) without a flat black band cutting the card in two.
          It starts halfway down: the top half is all flag (P8.5-11). */}
      {/* Sized explicitly: react-native-svg on web draws a zero-size SVG from a
          style alone, so the shade never showed and white stripes ate the name. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id="tagShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={prim.ink} stopOpacity={0} />
            <Stop offset="0.5" stopColor={prim.ink} stopOpacity={0.2} />
            {/* Dark enough by the name's line that a white stripe can't swallow it. */}
            <Stop offset="0.68" stopColor={prim.ink} stopOpacity={0.72} />
            <Stop offset="1" stopColor={prim.ink} stopOpacity={0.92} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill="url(#tagShade)" />
      </Svg>
      {!available && <Stripe roles={roles} band={4} style={styles.playerStripe} />}
      <View style={styles.playerTop}>
        <View style={[styles.playerChip, { backgroundColor: tint }]}><KitText t="tag" color={prim.ink}>{position}</KitText></View>
        {icon ? <View style={[styles.playerChip, { backgroundColor: prim.gold }]}><KitText t="tag" color={prim.ink}>{t('draft.icon')}</KitText></View> : null}
        <View style={{ flex: 1 }} />
        <View style={[styles.playerRating, { backgroundColor: prim.cotton, borderColor: prim.ink }]}>
          <KitText t="figure" color={prim.ink}>{available ? rating : blocked ?? t('draft.noSlot')}</KitText>
        </View>
      </View>
      <View style={styles.playerLabel}>
        <KitText t="body" color={prim.cotton} numberOfLines={1}>{name}</KitText>
        <KitText t="tag" color={prim.cottonMuted} numberOfLines={1}>{detail}</KitText>
      </View>
      {/* The line's colour along the foot; yours in orange once he's picked. */}
      <View style={[styles.playerFoot, { backgroundColor: chosen ? prim.orange : tint }]} />
    </Pressable>
  )
}

// The scrapers store other positions as a JSON list ("[\"RW\",\"CF\"]", or
// "[]" for none), so the card printed "[]". Read it as a list; take a plain
// "RW, CF" too.
function alsoOf(also?: string): string | null {
  if (!also) return null
  let list: string[]
  try { list = also.trim().startsWith('[') ? JSON.parse(also) : also.split(',') } catch { list = [] }
  const clean = list.map(p => String(p).trim()).filter(Boolean)
  return clean.length ? clean.join('/') : null
}

const styles = StyleSheet.create({
  spinFrame: { height: 84, borderWidth: border.thin, overflow: 'hidden', justifyContent: 'center' },
  spinFrameFlags: { height: 84 + FLAG_CARD_H - 60 },
  strip: { flexDirection: 'row', alignItems: 'center' },
  spinCenter: { alignItems: 'center' },
  spinCard: { width: ITEM_W - 8, marginHorizontal: 4, height: 60, borderWidth: border.thin, flexDirection: 'row', overflow: 'hidden' },
  spinCardFlag: { height: FLAG_CARD_H, alignItems: 'flex-end' },
  spinCardBody: { flex: 1, paddingHorizontal: space[2], justifyContent: 'center', alignItems: 'flex-start', gap: 2 },
  // The crest, big and off the right edge: a background, not a badge.
  spinCrest: { position: 'absolute', right: -18, top: -14, width: 88, height: 88 },
  spinSecond: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5 },
  spinLabel: { paddingHorizontal: 5, paddingVertical: 1, maxWidth: '100%' },
  // The flapper: a short orange tongue from the top of the marker that kicks
  // over as each card passes.
  flapper: { position: 'absolute', left: '50%', marginLeft: -6, top: 0, width: 12, height: 18, alignItems: 'center' },
  flapperTip: { width: 12, height: 18, borderWidth: border.thin, borderTopWidth: 0 },
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

  player: { flex: 1, minHeight: 108, overflow: 'hidden', justifyContent: 'space-between' },
  playerFlag: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  playerRating: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: border.thin },
  playerFoot: { height: 4 },
  playerStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  playerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, padding: space[1] },
  playerChip: { paddingHorizontal: 5, paddingVertical: 1 },
  // The name, on the shade at the foot of the card.
  playerLabel: { paddingHorizontal: space[2], paddingTop: 4, paddingBottom: 3, gap: 1 },
})
