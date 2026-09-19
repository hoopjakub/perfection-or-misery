// Kit Drop primitives — text, the hazard stripe, tape, rivets, the zip tag and
// icons. Everything else in the kit is built from these. Rules live in
// DESIGN.md; the short version: radius 0, orange means you, the stripe means
// out, and nothing is colour-only.
import React, { useId } from 'react'
import { Text, View, StyleSheet, type TextProps, type StyleProp, type ViewStyle, type TextStyle } from 'react-native'
import Svg, { Defs, Pattern, Rect, Circle, Path } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { type, prim, ROLES, type Roles, type TypeToken, border } from '@/theme'
import { ratio } from '@/lib/contrast'

// ── KitText ──────────────────────────────────────────────────────────────────
// All kit text goes through here so the type scale, the font-scaling cap on
// supers and Android's font padding are handled once.
const SUPERS: TypeToken[] = ['superXl', 'superL', 'superM', 'superS']

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
      style={[type[t], { color, includeFontPadding: false }, style]}
      {...rest}
    >
      {children}
    </Text>
  )
}

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
export function ZipTag({ size = 20, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const h = size * 1.6
  return (
    <View style={style} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={h} viewBox="0 0 20 32">
        <Path d="M10 9 L10 32" stroke={prim.orange} strokeWidth={3} strokeLinecap="square" />
        <Circle cx={10} cy={6} r={6} fill={prim.orange} />
        <Circle cx={10} cy={6} r={2} fill={prim.ink} />
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
