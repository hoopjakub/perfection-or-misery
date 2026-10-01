// Kit Drop primitives — text, the hazard stripe, tape, rivets, the zip tag and
// icons. Everything else in the kit is built from these. Rules live in
// DESIGN.md; the short version: radius 0, orange means you, the stripe means
// out, and nothing is colour-only.
import React, { useId } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Text, View, Image, StyleSheet, type TextProps, type StyleProp, type ViewStyle, type TextStyle, Platform } from 'react-native'
import Svg, { Defs, Pattern, Rect, Circle, Path, ClipPath, G, Polygon } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { type, prim, font, ROLES, choiceHex, type Roles, type TypeToken, border, ratingColor, ratingInk, formatRating } from '@/theme'
import { ratio } from '@/lib/contrast'
import { crestFor, competitionCrestFor, shortCrestInitials } from '@/lib/brand'
import { useCrestStore } from '@/store/crestStore'
import { crestImageUrl, type CrestChoice } from '@/lib/yourCrest'

// ── KitText ──────────────────────────────────────────────────────────────────
// All kit text goes through here so the type scale, the font-scaling cap on
// supers and Android's font padding are handled once.
const SUPERS: TypeToken[] = ['superXl', 'superL', 'superM', 'superS']
// The super face is a true italic, and Android measures a line's width without
// the italic's lean past the last letter. Where a title is sized to its own
// measured width, the drawn text is a hair wider than its box, so Android
// wraps the last word onto a second line the one-line box then cuts off —
// "FC METZ" showed as "FC", "AWARDS NIGHT" as "AWARDS" (the maintainer, 22–24
// Sept; "random" because it depends on each string's exact width). Room for
// the lean, on Android only, makes the box fit what's drawn.
const ITALIC_LEAN = 0.14

export function KitText({ t = 'body', color, style, children, ...rest }: TextProps & {
  t?: TypeToken
  color: string
  style?: StyleProp<TextStyle>
}) {
  const isSuper = SUPERS.includes(t)
  return (
    <Text
      // A big system font setting should grow the reading text, not push the
      // verdict word off the screen.
      maxFontSizeMultiplier={isSuper ? 1.3 : undefined}
      style={[type[t], { color, includeFontPadding: false }, isSuper && Platform.OS === 'android' && { paddingRight: Math.ceil((type[t].fontSize ?? 32) * ITALIC_LEAN) }, style]}
      {...rest}
    >
      {children}
    </Text>
  )
}

// ── ScaleText ────────────────────────────────────────────────────────────────
// P8-123: one type system everywhere. The screens not rebuilt on KitText yet
// (the match sheet and its tables, the old knockout and result pieces, a few
// old components) drew with React Native's Text: some in the system font
// (no family at all), and at sizes of their own (9, 10, 12, 20, 56). They
// draw through this instead, so every piece of text in the app is in one of
// the kit's families and on its scale:
// - a size snaps to the nearest step of the kit's scale (never under the tag's
//   11, which is the smallest the kit reads at);
// - a missing family becomes the body face, picked by the weight it asked for;
// - `fontWeight` goes, since each kit weight is its own family, and on Android
//   a custom font with a weight set can fall back to the system font;
// - a line height keeps its proportion to the new size.
// It's a floor, not a redesign: when a screen is rebuilt it moves to KitText
// and its tokens, and stops importing this.
const SCALE = [11, 13, 15, 18, 22, 28, 32, 48, 72]
export const snapToScale = (px: number) => SCALE.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), SCALE[0])
const familyForWeight = (w: TextStyle['fontWeight']) => {
  const n = w === 'bold' ? 700 : Number(w ?? 400) || 400
  return n >= 800 ? font.bodyBlack : n >= 700 ? font.bodyBold : n >= 500 ? font.bodyMedium : font.body
}

export function ScaleText({ style, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const from = flat.fontSize ?? 13
  const size = snapToScale(from)
  return (
    <Text {...rest} style={[style, {
      fontSize: size,
      fontFamily: flat.fontFamily ?? familyForWeight(flat.fontWeight),
      fontWeight: 'normal',
      ...(flat.lineHeight ? { lineHeight: Math.round((flat.lineHeight * size) / from) } : null),
    }]} />
  )
}

// ── Heading levels ────────────────────────────────────────────────────────────
// React Native Web renders every accessibilityRole="header" as an <h1>, so a
// page with section headings had six h1s (screen readers and search engines
// read that as six pages). Spread H2 onto a section heading to make it an
// <h2>. RN's types don't list aria-level yet; RN-web honours it, native ignores it.
export const H2 = { 'aria-level': 2 } as object

// ── Stripe ───────────────────────────────────────────────────────────────────
// The hazard pattern: OUT (loss, eliminated, relegated, disabled). A fill for
// other components, never under text. 45°, rising left to right.
export function Stripe({ roles, band = 4, style }: {
  roles: Roles
  band?: 4 | 6
  style?: StyleProp<ViewStyle>
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [a, b] = roles.stripe
  // The Svg is absolutely positioned so it only FILLS the box and never sizes
  // it. In the flow, a 100%-height Svg inside a box whose height comes from
  // its row (a notice beside text, a zone edge beside a table row) is a loop
  // on Android: the Svg asks for the parent's height, the parent grows to fit
  // the Svg, and the stripe runs down the screen forever. That one loop was
  // the "infinite strip" on the sign-in notice, the Chaos label, the World Cup
  // red card and the UCL league phase's OUT rows (P8-02, P8-62, P8-76, P8-82).
  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id={`hz${id}`} patternUnits="userSpaceOnUse" width={band * 2} height={band * 2} patternTransform="rotate(-45)">
            <Rect x={0} y={0} width={band * 2} height={band * 2} fill={b} />
            <Rect x={0} y={0} width={band} height={band * 2} fill={a} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#hz${id})`} />
      </Svg>
    </View>
  )
}

// ── Crest ───────────────────────────────────────────────────────────────────
// A club's mark (P8-12). In `original` brand mode — the default, and what a
// public release ships — it's drawn here: a square badge carrying one of the
// shirt's graphic devices (solid, hoop, sash, halves, chevron) and the club's
// initials, both fixed by the club's id so a club always wears the same mark.
// No club colour: colour is the tape's job (colour says WHERE you are).
export function Crest({ roles, clubId, name, size = 24, competition }: {
  roles: Roles
  clubId?: string | null
  name: string
  size?: number
  /** A competition's mark rather than a club's (P8-12). */
  competition?: boolean
}) {
  // P8-132: your side wears your crest (crestStore's `active`), wherever the
  // club it took over would have shown its own.
  const yours = useCrestStore(st => (!competition && clubId && st.active?.clubId === clubId && (st.active.choice.design || st.active.choice.imagePath) ? st.active.choice : null))
  if (yours) return <YourCrest choice={yours} size={size} name={name} />
  const crest = competition ? competitionCrestFor(clubId, name) : crestFor(clubId, name)
  if (crest.kind === 'image') {
    return <Image source={crest.source} resizeMode="contain" style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
  }
  const { device } = crest
  // Below 24px three letters don't fit the badge (P8-119): two, form words dropped.
  const initials = size < 24 ? shortCrestInitials(name) : crest.initials
  const band = Math.round(size / 3)
  return (
    <View style={[{ width: size, height: size, borderWidth: border.thin, borderColor: roles.line, backgroundColor: roles.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}
      accessible accessibilityLabel={name}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {device === 'hoop' && <View style={{ position: 'absolute', left: 0, right: 0, top: band, height: band, backgroundColor: roles.line }} />}
        {device === 'halves' && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', backgroundColor: roles.line }} />}
        {device === 'sash' && (
          <View style={{ position: 'absolute', left: -size / 2, top: 0, bottom: 0, width: band, backgroundColor: roles.line, transform: [{ rotate: '-45deg' }, { translateX: size / 2 }] }} />
        )}
        {device === 'chevron' && (
          <>
            <View style={{ position: 'absolute', left: -size / 4, top: size / 2, width: size, height: band / 2, backgroundColor: roles.line, transform: [{ rotate: '-35deg' }] }} />
            <View style={{ position: 'absolute', right: -size / 4, top: size / 2, width: size, height: band / 2, backgroundColor: roles.line, transform: [{ rotate: '35deg' }] }} />
          </>
        )}
        {device === 'solid' && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: band, backgroundColor: roles.line }} />}
      </View>
      <View style={{ backgroundColor: roles.bg, paddingHorizontal: 1 }}>
        <Text style={[type.tag, { fontSize: Math.max(8, Math.round(size / 2.8)), lineHeight: Math.max(9, Math.round(size / 2.4)), letterSpacing: 0, color: roles.text }]} numberOfLines={1}>
          {initials}
        </Text>
      </View>
    </View>
  )
}

// ── Twinkle (P8-38, P8-145) ──────────────────────────────────────────────────
// The pundits' sparkle, now the kit's: a small gold star that swells and turns
// now and then, on its own. The maintainer on it: it "makes it feel more
// alive... make more like these". Quiet and occasional (a beat, then two
// seconds still), staggered by `i` so a column of them never pulses in unison,
// and still under reduced motion. Gold means exactly right, or the best: the
// champion, a perfect verdict, the best player of a round, a hot streak.
export function Twinkle({ i = 0 }: { i?: number }) {
  const reduced = useReducedMotion()
  const s = useSharedValue(1)
  // A burst, then a plain timer for the next one (27 Sept, the maintainer: the
  // twinkle "drains a lot of resources"). It was one endless animation whose
  // two "still" seconds were an animation too, holding the same value, drawing
  // frames the whole time, on every twinkle on the screen. Now nothing runs
  // while it's still. Each waits its own staggered while, 3 to 5 seconds.
  React.useEffect(() => {
    if (reduced) return
    let t: ReturnType<typeof setTimeout>
    const next = (first: boolean) => {
      t = setTimeout(() => {
        s.value = withSequence(withTiming(1.35, { duration: 220 }), withTiming(1, { duration: 320 }))
        next(false)
      }, first ? (i * 370) % 2400 + 600 : 3000 + ((i * 911) % 2000))
    }
    next(true)
    return () => clearTimeout(t)
  }, [reduced])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${(s.value - 1) * 60}deg` }] }))
  // A drawn four-point star, not the icon font's "sparkles" (which read as the
  // ✨ emoji, the maintainer said): the kit's own mark, in gold.
  return (
    <Animated.View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path d="M8 0.5 L9.7 6.3 L15.5 8 L9.7 9.7 L8 15.5 L6.3 9.7 L0.5 8 L6.3 6.3 Z" fill={prim.gold} stroke={prim.ink} strokeWidth={0.6} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  )
}

// ── YourCrest (P8-132) ───────────────────────────────────────────────────────
// Your own crest: a picture, or the design (src/lib/yourCrest.ts) drawn the
// way the kit draws a club's badge: the shape in the first colour, the shirt
// device in the second, clipped to the shape, and the letters on top in the
// super face. At small sizes two letters, as a club's badge shows (P8-119).
// A crest colour: a palette id's colour, or (P8-177) any #rrggbb as it is.
export const crestHex = choiceHex

const SHAPE_PATH: Record<string, string> = {
  square: 'M3 3 H97 V97 H3 Z',
  shield: 'M6 4 H94 V52 C94 78 72 92 50 98 C28 92 6 78 6 52 Z',
  round: 'M50 3 A47 47 0 1 1 49.9 3 Z',
  // P8-175: six more.
  heater: 'M6 4 H94 V40 C94 72 76 88 50 98 C24 88 6 72 6 40 Z',
  pennant: 'M8 3 H92 V70 L50 97 L8 70 Z',
  oval: 'M50 3 C80 3 92 25 92 50 C92 75 80 97 50 97 C20 97 8 75 8 50 C8 25 20 3 50 3 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  hexagon: 'M50 3 L93 27 V73 L50 97 L7 73 V27 Z',
  octagon: 'M30 3 H70 L97 30 V70 L70 97 H30 L3 70 V30 Z',
}
// The five-point star and the ball's panel (P8-175's devices), as points.
const STAR_POINTS = '50.0,18.0 57.3,37.9 78.5,38.7 61.9,51.9 67.6,72.3 50.0,60.5 32.4,72.3 38.1,51.9 21.5,38.7 42.7,37.9'
const BALL_PANEL = '50.0,40.0 59.5,46.9 55.9,58.1 44.1,58.1 40.5,46.9'
export function YourCrest({ choice, size = 24, name = 'Your crest' }: { choice: CrestChoice; size?: number; name?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const uri = choice.imagePath ? crestImageUrl(choice.imagePath) : null
  if (uri) {
    return <Image source={{ uri }} resizeMode="cover" style={{ width: size, height: size }} accessible accessibilityLabel={name} accessibilityIgnoresInvertColors />
  }
  const d = choice.design
  if (!d) return null
  const bg = crestHex(d.primary), fg = crestHex(d.secondary)
  const outline = SHAPE_PATH[d.shape] ?? SHAPE_PATH.square
  const trim = d.trim ?? 'ink'
  // The letters in whichever of ink or cotton reads on the first colour.
  const ink = ratio(prim.ink, bg) >= ratio(prim.cotton, bg) ? prim.ink : prim.cotton
  const letters = size < 24 ? d.initials.slice(0, 2) : d.initials
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={name}>
      {/* Keyed by shape: a clip path whose outline changes in place doesn't
          redraw on every platform, so changing the shape left the old one
          (the maintainer, 27 Sept). A new key draws it fresh. */}
      <Svg key={d.shape} width={size} height={size} viewBox="0 0 100 100">
        <Defs><ClipPath id={`c${id}${d.shape}`}><Path d={SHAPE_PATH[d.shape] ?? SHAPE_PATH.square} /></ClipPath></Defs>
        <G clipPath={`url(#c${id}${d.shape})`}>
          <Rect x={0} y={0} width={100} height={100} fill={bg} />
          {d.device === 'hoop' && <Rect x={0} y={36} width={100} height={28} fill={fg} />}
          {d.device === 'halves' && <Rect x={0} y={0} width={50} height={100} fill={fg} />}
          {d.device === 'sash' && <Polygon points="0,72 72,0 100,0 100,28 28,100 0,100" fill={fg} />}
          {d.device === 'chevron' && <Polygon points="0,30 50,58 100,30 100,52 50,80 0,52" fill={fg} />}
          {d.device === 'solid' && <Rect x={0} y={68} width={100} height={32} fill={fg} />}
          {d.device === 'stripes' && [1, 3, 5].map(k => <Rect key={k} x={k * (100 / 7)} y={0} width={100 / 7} height={100} fill={fg} />)}
          {d.device === 'hoops' && [14, 42, 70].map(y => <Rect key={y} x={0} y={y} width={100} height={16} fill={fg} />)}
          {d.device === 'quarters' && <><Rect x={0} y={0} width={50} height={50} fill={fg} /><Rect x={50} y={50} width={50} height={50} fill={fg} /></>}
          {d.device === 'cross' && <><Rect x={40} y={0} width={20} height={100} fill={fg} /><Rect x={0} y={38} width={100} height={20} fill={fg} /></>}
          {d.device === 'saltire' && <><Polygon points="0,0 14,0 100,86 100,100 86,100 0,14" fill={fg} /><Polygon points="100,0 100,14 14,100 0,100 0,86 86,0" fill={fg} /></>}
          {d.device === 'star' && <Polygon points={STAR_POINTS} fill={fg} />}
          {d.device === 'ball' && <><Circle cx={50} cy={50} r={28} fill={fg} /><Polygon points={BALL_PANEL} fill={bg} /></>}
        </G>
        {/* The trim (P8-175): the outline's weight, a second line inside it, or gold. */}
        {trim === 'gold' && <Path d={outline} fill="none" stroke={prim.gold} strokeWidth={8} />}
        {trim !== 'none' && <Path d={outline} fill="none" stroke={prim.ink} strokeWidth={trim === 'thin' ? 2 : trim === 'gold' ? 2.5 : 4} />}
        {trim === 'double' && <G transform="translate(9 9) scale(0.82)"><Path d={outline} fill="none" stroke={prim.ink} strokeWidth={3} /></G>}
      </Svg>
      {letters ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, crestStyles.letters]}>
          <View style={{ backgroundColor: bg, paddingHorizontal: 1 }}>
            <Text allowFontScaling={false} numberOfLines={1}
              style={{ fontFamily: font.super, fontSize: Math.max(7, Math.round(size * (letters.length > 2 ? 0.3 : 0.38))), lineHeight: Math.max(8, Math.round(size * 0.42)), color: ink, includeFontPadding: false }}>
              {letters}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

// ── PitchSurface ─────────────────────────────────────────────────────────────
// The floodlit pitch (P8-04): prim.pitch with barely-there lines, the outline,
// halfway line, centre circle and both boxes. Drawn from plain, absolutely
// placed views, so it only FILLS its box and never sizes it (an SVG sized by
// its row is the layout loop behind P8-82). Whatever's inside lays out on top.
export function PitchSurface({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const line = { borderColor: prim.pitchLine }
  return (
    <View style={[pitchStyles.pitch, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
        <View style={[pitchStyles.halfway, { backgroundColor: prim.pitchLine }]} />
        <View style={[pitchStyles.circle, line]} />
        <View style={[pitchStyles.box, pitchStyles.boxTop, line]} />
        <View style={[pitchStyles.box, pitchStyles.boxBottom, line]} />
      </View>
      {children}
    </View>
  )
}

// ── Pitch ────────────────────────────────────────────────────────────────────
// P8-50: a formation looks the same on every screen. The draft, the formation
// preview, the match sheet's lineup (and the Deep Match's), the awards' teams,
// the verdict's lineup and every team of the matchday each drew their own
// pitch — a grey box here, a sunken panel there, the green one only on the
// formation screen. They all lay out the same rows (`getFormationRows`), so
// this is the one pitch they sit on: the floodlit surface with its markings,
// rows spaced the same way, attack at the top. What goes IN a slot (a hanger,
// a shirt, a name and a rating) stays each screen's own, until P8-71's slot.
export function Pitch({ rows, footer, tall, style, accessibilityLabel }: {
  /** Row by row, attack first; each row's items already keyed. */
  rows: React.ReactNode[][]
  /** Under the rows, inside the pitch (a count, the shape's name). */
  footer?: React.ReactNode
  /** Keep a pitch's proportions in a wide pane instead of a squat band. */
  tall?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}) {
  return (
    <PitchSurface style={[pitchStyles.formation, tall && pitchStyles.tall, style]}>
      <View style={pitchStyles.rows} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {rows.map((row, r) => <View key={r} style={pitchStyles.row}>{row}</View>)}
      </View>
      {footer}
    </PitchSurface>
  )
}

const pitchStyles = StyleSheet.create({
  formation: { paddingVertical: 20, paddingHorizontal: 4 },
  tall: { aspectRatio: 0.78, justifyContent: 'space-around', maxHeight: 640 },
  rows: { gap: 16, flexGrow: 1, justifyContent: 'space-around' },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  pitch: { backgroundColor: prim.pitch, borderWidth: border.thin, borderColor: prim.pitchLine, overflow: 'hidden' },
  halfway: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1 },
  // The centre circle is the one round shape here: it's a pitch marking, not a corner.
  circle: { position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 36, borderWidth: 1 },
  box: { position: 'absolute', left: '24%', right: '24%', height: '15%', borderWidth: 1 },
  boxTop: { top: -1 },
  boxBottom: { bottom: -1 },
})

// ── Tape ─────────────────────────────────────────────────────────────────────
// The woven colourway band: WHERE you are, never what happened. Several
// colours become equal bands (the World Cup tricolour). A colour that sits
// within 3:1 of its ground gets a stitched edge in the opposite ink so it still
// reads as a tape against the ground.
export function Tape({ colours, roles, vertical, thickness = border.tape, style }: {
  colours: string[]
  roles: Roles
  vertical?: boolean
  thickness?: number
  style?: StyleProp<ViewStyle>
}) {
  const weak = colours.some(c => ratio(c, roles.bg) < 3)
  return (
    <View
      style={[
        { flexDirection: vertical ? 'column' : 'row' },
        vertical ? { width: thickness } : { height: thickness },
        weak && { borderWidth: 1, borderStyle: 'dashed', borderColor: roles.line },
        style,
      ]}
      pointerEvents="none"
    >
      {colours.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
    </View>
  )
}

// ── Rivets ───────────────────────────────────────────────────────────────────
// Four 4px dots, 6px in from each corner. Primary plates, labels, the verdict.
export function Rivets({ color }: { color: string }) {
  const dot = { position: 'absolute' as const, width: 4, height: 4, borderRadius: 2, backgroundColor: color }
  return (
    <>
      <View pointerEvents="none" style={[dot, { top: 6, left: 6 }]} />
      <View pointerEvents="none" style={[dot, { top: 6, right: 6 }]} />
      <View pointerEvents="none" style={[dot, { bottom: 6, left: 6 }]} />
      <View pointerEvents="none" style={[dot, { bottom: 6, right: 6 }]} />
    </>
  )
}

// ── ZipTag ───────────────────────────────────────────────────────────────────
// The orange tag that marks what you're holding or who you are. One on screen
// at a time. Static here; the swing arrives with the draft (Phase 2).
export function ZipTag({ size = 20, style, colour: given }: { size?: number; style?: StyleProp<ViewStyle>; colour?: string }) {
  // P8-168: every pin is yours: the colour you chose, or the default orange.
  const mine = useCrestStore(st => st.pin?.hex)
  const colour = given ?? mine ?? prim.orange
  const h = size * 1.6
  // P8-168: a pin of your own colour. The hole takes whichever of ink and
  // cotton stands out on it, so a black or pitch-green pin still has one.
  const hole = ratio(colour, prim.ink) >= ratio(colour, prim.cotton) ? prim.ink : prim.cotton
  return (
    <View style={style} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={h} viewBox="0 0 20 32">
        <Path d="M10 9 L10 32" stroke={colour} strokeWidth={3} strokeLinecap="square" />
        <Circle cx={10} cy={6} r={6} fill={colour} />
        <Circle cx={10} cy={6} r={2} fill={hole} />
      </Svg>
    </View>
  )
}

// ── Icon ─────────────────────────────────────────────────────────────────────
// Semantic names over Ionicons' Sharp set. The plan named Material Symbols
// Sharp; Ionicons already ships a Sharp style with square ends and corners, so
// the look holds without a new SVG pipeline. Screens use these names only, so
// swapping the set later is a change to this table.
const ICONS = {
  play: 'play-sharp', runs: 'list-sharp', ranks: 'podium-sharp', you: 'person-sharp',
  forward: 'arrow-forward-sharp', chevron: 'chevron-forward-sharp', back: 'chevron-back-sharp',
  close: 'close-sharp', warning: 'warning-sharp', retry: 'refresh-sharp', offline: 'cloud-offline-sharp',
  check: 'checkmark-sharp', trophy: 'trophy-sharp', guide: 'book-sharp', about: 'information-circle-sharp',
  stats: 'stats-chart-sharp', achievements: 'ribbon-sharp', signOut: 'log-out-sharp', signIn: 'log-in-sharp',
  lock: 'lock-closed-sharp', show: 'eye-sharp', hide: 'eye-off-sharp', again: 'repeat-sharp',
  keep: 'person-add-sharp', pause: 'pause-sharp', skip: 'play-skip-forward-sharp', press: 'newspaper-sharp',
  privacy: 'shield-checkmark-sharp', terms: 'document-text-sharp', delete: 'trash-sharp',
  home: 'home-sharp', away: 'airplane-sharp',   // P8-09: where a fixture is played
  up: 'caret-up-sharp', down: 'caret-down-sharp',   // P8-22: places gained or lost
  sparkle: 'sparkles-sharp',   // P8-38: a call exactly right
  settings: 'settings-sharp',   // P8-45
  // P8-86: one mark per mode, the tournaments included (they had none). The
  // Finals and the Full path share a competition, so the icon is what tells
  // them apart: a star for the competition itself, a signpost for the road to it.
  modeAllTime: 'infinite-sharp', modeLeague: 'football-sharp', modeChaos: 'flash-sharp', modeCursed: 'skull-sharp',
  modeClFinals: 'star-sharp', modeClPath: 'trail-sign-sharp', modeWorldCup: 'globe-sharp', add: 'add-sharp', palette: 'color-palette-sharp', modeElFinals: 'medal-sharp', modeEclFinals: 'shield-half-sharp',
} as const
export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20, color, label }: {
  name: IconName
  size?: 16 | 20 | 24
  color: string
  label?: string   // required when the icon is the only content of a control
}) {
  return (
    <Ionicons
      name={ICONS[name]}
      size={size}
      color={color}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  )
}

// Grounds are exported with the primitives so screens import one place.
export { ROLES }

export const kitStyles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
})

// ── RatingSquare ─────────────────────────────────────────────────────────────
// A player's rating, drawn one way everywhere (the maintainer, 23 Sept): the
// square in its rating colour (PoM's own five bands, `ratingColor`, P8.5-33), the figure
// in the ink that reads on it. Ten screens each had their own copy with its
// own size and decimals; this is the one they share. `sm` is for pitches and
// tight rows, `decimals: 2` for a season average.
export function RatingSquare({ value, size = 'md', decimals = 1, style }: {
  value: number
  size?: 'sm' | 'md'
  decimals?: 1 | 2
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[size === 'sm' ? ratingStyles.sm : ratingStyles.md, { backgroundColor: ratingColor(value) }, style]}
      accessibilityLabel={`rating ${formatRating(value, decimals)}`}>
      <KitText t={size === 'sm' ? 'tag' : 'figure'} color={ratingInk(value)}>{formatRating(value, decimals)}</KitText>
    </View>
  )
}

const crestStyles = StyleSheet.create({
  letters: { alignItems: 'center', justifyContent: 'center' },
})

const ratingStyles = StyleSheet.create({
  md: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
  sm: { minWidth: 28, paddingHorizontal: 3, paddingVertical: 1, alignItems: 'center' },
})

// ── EventMark ────────────────────────────────────────────────────────────────
// P8-46: the match's events as marks, not text codes. GOAL, OG, YC, RC, SUB,
// INJ, POTM, IN/MISS, ▲/▼ were a stopgap for emoji; this is the one set every
// screen uses — the timeline, the player rows, the lineup pitch, the player
// page, the live feed, the shootout. Ionicons (MIT, no attribution needed, so
// it's clean for a public release and the maturita licensing notes) for the
// glyphs; the cards are drawn, because a card is a shape, not an icon. A count
// above one is written beside the mark (a hat-trick is the ball and a 3).
export type EventKind =
  | 'goal' | 'ownGoal' | 'assist' | 'yellow' | 'red' | 'subOn' | 'subOff'
  | 'injury' | 'penScored' | 'penMissed' | 'var' | 'motm'

const EVENT_GLYPH: Partial<Record<EventKind, { name: React.ComponentProps<typeof Ionicons>['name']; color: string }>> = {
  goal:      { name: 'football-sharp', color: prim.cotton },
  ownGoal:   { name: 'football-sharp', color: prim.misery },
  assist:    { name: 'arrow-redo-sharp', color: prim.cottonMuted },
  subOn:     { name: 'arrow-up-sharp', color: prim.volt },
  subOff:    { name: 'arrow-down-sharp', color: prim.misery },
  injury:    { name: 'medkit-sharp', color: prim.misery },
  penScored: { name: 'checkmark-circle-sharp', color: prim.volt },
  penMissed: { name: 'close-circle-sharp', color: prim.misery },
  var:       { name: 'tv-sharp', color: prim.cottonMuted },
  motm:      { name: 'star-sharp', color: prim.gold },
}
const EVENT_LABEL: Record<EventKind, string> = {
  goal: 'goal', ownGoal: 'own goal', assist: 'assist', yellow: 'yellow card', red: 'red card',
  subOn: 'came on', subOff: 'went off', injury: 'injured', penScored: 'penalty scored',
  penMissed: 'penalty missed', var: 'VAR', motm: 'player of the match',
}

export function EventMark({ kind, size = 14, count, color }: {
  kind: EventKind
  size?: number
  count?: number
  /** Override the mark's own colour (e.g. ink on a light ground). */
  color?: string
}) {
  const label = `${count && count > 1 ? `${count} ` : ''}${EVENT_LABEL[kind]}${count && count > 1 && kind !== 'motm' ? 's' : ''}`
  const glyph = EVENT_GLYPH[kind]
  const mark = glyph
    ? <Ionicons name={glyph.name} size={size} color={color ?? glyph.color} />
    : <View style={{ width: Math.round(size * 0.62), height: size, borderRadius: 1, backgroundColor: kind === 'yellow' ? prim.cardYellow : prim.misery }} />
  return (
    <View style={eventStyles.wrap} accessible accessibilityLabel={label}>
      {mark}
      {count && count > 1 ? <KitText t="tag" color={color ?? prim.cotton}>{String(count)}</KitText> : null}
    </View>
  )
}

const eventStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
})
