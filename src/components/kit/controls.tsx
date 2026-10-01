// Kit Drop controls. States built are the "states in use" from
// docs/ui-overhaul/08-COMPONENTS.md §2; anything else in that document waits
// for a screen that needs it.
import { pulseTap } from '@/lib/navGuard'
import React, { useEffect, useRef, useState } from 'react'
import { View, Pressable, TextInput, Animated, Easing, StyleSheet, type StyleProp, type ViewStyle, type TextInputProps } from 'react-native'
import { router } from 'expo-router'
import { type Roles, space, border, OFFSET, density, font, withAlpha } from '@/theme'
import { KitText, Rivets, Stripe, Icon, H2, type IconName } from './primitives'
import { useModeLook, tiltOf, GlitchText } from './modeLook'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { hexToHsv, hsvToHex, readHex, isHex, type HSV } from '@/lib/colour'

// ── Plate ────────────────────────────────────────────────────────────────────
// The one control that commits to an action. Primary = orange, one per screen.
// Pressing moves the plate into its 2px offset, like a label pressed onto cloth.
type PlateVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'

export function Plate({
  label, onPress, roles, variant = 'primary', icon, disabled, missingStep, loading, style, accessibilityHint,
}: {
  label: string
  onPress: () => void
  roles: Roles
  variant?: PlateVariant
  icon?: IconName
  disabled?: boolean
  missingStep?: string   // shown INSTEAD of the label while disabled: "ENTER A USERNAME"
  loading?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityHint?: string
}) {
  const inactive = disabled || loading
  const face = FACE[variant](roles, !!disabled)
  const hasOffset = variant === 'primary' && !disabled
  const shown = disabled && missingStep ? missingStep : label

  return (
    <View style={[variant === 'quiet' ? null : { paddingRight: OFFSET, paddingBottom: OFFSET }, style]}>
      {hasOffset && <View style={[styles.offset, { backgroundColor: roles.offset }]} />}
      <Pressable
        onPress={() => { pulseTap(); onPress() }}
        disabled={inactive}
        // Disabled plates stay focusable so a screen reader can read the missing step.
        focusable
        accessibilityRole="button"
        accessibilityLabel={shown}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        style={({ pressed }) => [
          styles.plate,
          variant === 'quiet' ? styles.quiet : null,
          { backgroundColor: face.bg, borderColor: face.border, borderWidth: face.borderWidth },
          pressed && !inactive && (hasOffset
            ? { transform: [{ translateX: OFFSET }, { translateY: OFFSET }] }
            : { backgroundColor: face.pressedBg }),
        ]}
      >
        {({ pressed }) => (
          <>
            {variant === 'primary' && !disabled && <Rivets color={roles.onFill} />}
            {/* P8-111: a destructive action is red, like the loss it can cause. */}
            {variant === 'destructive' && <View style={[styles.destructiveEdge, { backgroundColor: roles.loss }]} />}
            <View style={styles.plateRow}>
              <KitText
                t="button"
                color={face.text}
                style={[variant === 'quiet' && pressed && { textDecorationLine: 'underline' }]}
                numberOfLines={1}
              >
                {shown}
              </KitText>
              {icon && !disabled && <Icon name={icon} size={20} color={face.text} />}
            </View>
            {loading && <ProgressBar color={face.text} />}
          </>
        )}
      </Pressable>
    </View>
  )
}

const FACE: Record<PlateVariant, (r: Roles, disabled: boolean) => {
  bg: string; text: string; border: string; borderWidth: number; pressedBg: string
}> = {
  primary: (r, d) => d
    ? { bg: r.sunken, text: r.textMuted, border: r.rule, borderWidth: border.thin, pressedBg: r.sunken }
    : { bg: r.you, text: r.onFill, border: r.line, borderWidth: border.plate, pressedBg: r.you },
  secondary: (r, d) => ({
    bg: 'transparent', text: d ? r.textMuted : r.text, border: d ? r.rule : r.line,
    borderWidth: border.thin, pressedBg: r.sunken,
  }),
  quiet: (r, d) => ({ bg: 'transparent', text: d ? r.textFaint : r.text, border: 'transparent', borderWidth: 0, pressedBg: 'transparent' }),
  destructive: (r) => ({ bg: r.line, text: r.bg, border: r.line, borderWidth: border.plate, pressedBg: r.textMuted }),
}

// The "tag-shaped progress bar" from the spec: a short block sliding across
// the bottom edge of the plate while it works.
function ProgressBar({ color }: { color: string }) {
  const x = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, {
      toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
    }))
    loop.start()
    return () => loop.stop()
  }, [x])
  return (
    <View style={styles.progressTrack} pointerEvents="none">
      <Animated.View style={[styles.progressBlock, {
        backgroundColor: color,
        transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-60, 300] }) }],
      }]} />
    </View>
  )
}

// ── Loader ───────────────────────────────────────────────────────────────────
// P8-51: the kit's own "working on it", in place of the stock spinner (which
// read as a system control on every screen that waited). The plate's progress
// bar, on its own: a short block sliding along a faint track. `wide` for a
// screen that's waiting as a whole.
export function Loader({ color, wide, label, width }: { color: string; wide?: boolean; label?: string; width?: number }) {
  const x = useRef(new Animated.Value(0)).current
  // `width`: a bar across the whole screen (the tap feedback, P8-151).
  const w = width ?? (wide ? 160 : 72), block = width ? 96 : wide ? 48 : 24
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, {
      toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
    }))
    loop.start()
    return () => loop.stop()
  }, [x])
  return (
    <View style={styles.loaderWrap} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <View style={[styles.loaderTrack, { width: w, backgroundColor: withAlpha(color, 20) }]}>
        <Animated.View style={{ width: block, height: 3, backgroundColor: color,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-block, w] }) }] }} />
      </View>
      {label ? <KitText t="tag" color={color}>{label}</KitText> : null}
    </View>
  )
}

// ── BackControl ──────────────────────────────────────────────────────────────
export function BackControl({ roles, onPress }: { roles: Roles; onPress?: () => void }) {
  return (
    <Pressable
      // A page opened straight from a link or a reload has no history; back
      // then goes Home instead of doing nothing.
      onPress={() => { pulseTap(); (onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/'))))() }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [styles.back, pressed && { backgroundColor: roles.sunken }]}
    >
      <Icon name="back" size={24} color={roles.text} />
    </Pressable>
  )
}

// ── SectionTag ───────────────────────────────────────────────────────────────
export function SectionTag({ children, roles, style }: { children: string; roles: Roles; style?: StyleProp<ViewStyle> }) {
  // P8-169: in Chaos a heading sits askew over a strip of ripped hazard tape;
  // in Cursed it glitches now and then.
  const look = useModeLook()
  if (look === 'chaos') {
    return (
      <View style={[styles.sectionTag, style, { transform: [{ rotate: `${tiltOf(children)}deg` }] }]} accessibilityRole="header" {...H2}>
        <KitText t="tag" color={roles.text}>{children}</KitText>
        <Stripe roles={roles} band={4} style={styles.rip} />
      </View>
    )
  }
  return (
    <View style={[styles.sectionTag, style]} accessibilityRole="header" {...H2}>
      {look === 'cursed'
        ? <GlitchText text={children} t="tag" color={roles.textMuted} seed={children.length} />
        : <KitText t="tag" color={roles.textMuted}>{children}</KitText>}
    </View>
  )
}

// ── ListRow ──────────────────────────────────────────────────────────────────
// Rules between rows, not cards around them.
// ── Swatches ─────────────────────────────────────────────────────────────────
// The palette's colours as squares to tap (radius 0, like every mark in the
// kit): the crest's colours (P8-132) and your club's (P8-142).
export function Swatches({ roles, label, options, value, onChange }: {
  roles: Roles; label: string; options: { id: string; label: string; hex: string }[]; value: string; onChange: (id: string) => void
}) {
  return (
    <View style={styles.swatchRow} accessibilityRole="radiogroup" accessibilityLabel={`${label} colour`}>
      <KitText t="tag" color={roles.textMuted} style={styles.swatchLabel}>{label}</KitText>
      {options.map(c => (
        <Pressable key={c.id} onPress={() => onChange(c.id)} accessibilityRole="radio" accessibilityState={{ selected: value === c.id }} accessibilityLabel={c.label}
          style={[styles.swatch, { backgroundColor: c.hex, borderColor: roles.line, borderWidth: value === c.id ? border.tape : border.thin }]} />
      ))}
    </View>
  )
}

export function ListRow({ label, sub, roles, onPress, value, icon, tier = 't2', chevron = !!onPress, trailing, danger }: {
  label: string
  /** A line under the label, muted (P8-72: what a guide topic covers). */
  sub?: string
  roles: Roles
  onPress?: () => void
  value?: string
  icon?: IconName
  tier?: 't1' | 't2'
  chevron?: boolean
  trailing?: React.ReactNode
  danger?: boolean
}) {
  const body = (
    <>
      {icon && <Icon name={icon} size={20} color={danger ? roles.lossText : roles.text} />}
      {sub ? (
        <View style={{ flex: 1, paddingVertical: space[2] }}>
          <KitText t={tier === 't1' ? 'bodyL' : 'body'} color={danger ? roles.lossText : roles.text}>{label}</KitText>
          <KitText t="tag" color={roles.textMuted}>{sub}</KitText>
        </View>
      ) : <KitText t={tier === 't1' ? 'bodyL' : 'body'} color={danger ? roles.lossText : roles.text} style={{ flex: 1 }}>{label}</KitText>}
      {value ? <KitText t="tag" color={roles.textMuted}>{value}</KitText> : null}
      {trailing}
      {chevron && <Icon name="chevron" size={16} color={roles.textMuted} />}
    </>
  )
  const rowStyle = [
    styles.row,
    { minHeight: density[tier].row, borderBottomColor: roles.rule },
    danger && { paddingLeft: space[4] },
  ]
  return onPress ? (
    <Pressable
      onPress={() => { pulseTap(); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={[label, sub, value].filter(Boolean).join(', ')}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: roles.sunken }]}
    >
      {/* P8-87: a destructive row is misery red (edge, icon, label), not the
          hazard stripe, which means "out" rather than "this deletes things". */}
      {danger && <View style={[styles.rowStripe, { backgroundColor: roles.loss }]} />}
      {body}
    </Pressable>
  ) : (
    <View style={rowStyle} accessible accessibilityLabel={value ? `${label}, ${value}` : label}>{body}</View>
  )
}

// ── Toggle ───────────────────────────────────────────────────────────────────
// An ON/OFF plate rather than a rounded switch (radius 0).
export function Toggle({ value, onChange, roles, label }: {
  value: boolean; onChange: (v: boolean) => void; roles: Roles; label: string
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.toggle,
        { borderColor: roles.line, backgroundColor: value ? roles.line : 'transparent' },
        pressed && { opacity: 0.8 },
      ]}
    >
      <KitText t="tag" color={value ? roles.bg : roles.text}>{value ? 'ON' : 'OFF'}</KitText>
    </Pressable>
  )
}

// ── Field ────────────────────────────────────────────────────────────────────
// A text input that looks like a care label: tag-mono label above, square
// field on the sunken ground, striped edge + message on error.
// ── ColourField (P8-177) ─────────────────────────────────────────────────────
// Any colour, "like a normal human being" (the maintainer, 27 Sept): the
// palette's colours as quick picks, and a last swatch that opens a picker —
// a hue bar, a saturation-and-brightness square and a hex field — for any
// colour at all. The value is a palette id or a #rrggbb; `onChange` always
// gives the #rrggbb. Readability is the caller's: where a chosen colour becomes
// text or a line, it's lifted until it reads (the team colours, P8-49).
export function ColourField({ roles, label, value, onChange, quick }: {
  roles: Roles
  label: string
  /** A palette id or a #rrggbb. */
  value: string
  onChange: (hex: string) => void
  /** The quick picks: the palette's own colours. */
  quick: { id: string; label: string; hex: string }[]
}) {
  const hex = isHex(value) ? value.toLowerCase() : quick.find(q => q.id === value)?.hex.toLowerCase() ?? quick[0]?.hex ?? '#000000'
  const custom = !quick.some(q => q.hex.toLowerCase() === hex)
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.colourField}>
      <View style={styles.swatchRow} accessibilityRole="radiogroup" accessibilityLabel={`${label} colour`}>
        <KitText t="tag" color={roles.textMuted} style={styles.swatchLabel}>{label}</KitText>
        {quick.map(c => {
          const on = c.hex.toLowerCase() === hex
          return (
            <Pressable key={c.id} onPress={() => { onChange(c.hex.toLowerCase()); setOpen(false) }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={c.label}
              style={[styles.swatch, { backgroundColor: c.hex, borderColor: roles.line, borderWidth: on ? border.tape : border.thin }]} />
          )
        })}
        {/* Any colour: shows the chosen one when it isn't the palette's. */}
        <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open, selected: custom }}
          accessibilityLabel={custom ? `Your own colour, ${hex}. Change it` : 'Any colour'}
          style={[styles.swatch, styles.anySwatch, { backgroundColor: custom ? hex : roles.surface, borderColor: roles.line, borderWidth: custom ? border.tape : border.thin }]}>
          {!custom && <Icon name="add" size={16} color={roles.text} />}
        </Pressable>
      </View>
      {open && <ColourPicker roles={roles} hex={hex} onChange={onChange} />}
    </View>
  )
}

const HUES = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']

/** The picker: a saturation (across) and brightness (down) square in the chosen
 *  hue, a hue bar under it, and the hex. Dragging anywhere on either moves it. */
function ColourPicker({ roles, hex, onChange }: { roles: Roles; hex: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(hex))
  const [typed, setTyped] = useState(hex)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [bar, setBar] = useState(0)
  // Follow a colour chosen elsewhere (a quick pick) without losing the hue of a grey.
  useEffect(() => {
    if (hsvToHex(hsv) !== hex) { const next = hexToHsv(hex); setHsv(h => (next.s === 0 || next.v === 0 ? { ...next, h: h.h } : next)) }
    setTyped(hex)
  }, [hex])
  const set = (next: HSV) => { setHsv(next); const h = hsvToHex(next); setTyped(h); onChange(h) }
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  const onSquare = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (!box.w || !box.h) return
    set({ ...hsv, s: clamp(e.nativeEvent.locationX / box.w), v: 1 - clamp(e.nativeEvent.locationY / box.h) })
  }
  const onBar = (e: { nativeEvent: { locationX: number } }) => {
    if (!bar) return
    set({ ...hsv, h: clamp(e.nativeEvent.locationX / bar) * 359.9 })
  }
  const drag = (handler: (e: any) => void) => ({
    onStartShouldSetResponder: () => true, onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: handler, onResponderMove: handler,
  })
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 })
  return (
    <View style={[styles.picker, { borderColor: roles.line, backgroundColor: roles.surface }]}>
      <View style={styles.square} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel="Saturation and brightness" {...drag(onSquare)}>
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="pickWhite" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="pickBlack" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={pure} />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#pickWhite)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#pickBlack)" />
        </Svg>
        <View pointerEvents="none" style={[styles.thumb, { left: hsv.s * box.w - 9, top: (1 - hsv.v) * box.h - 9, borderColor: hsv.v > 0.5 ? '#000000' : '#ffffff', backgroundColor: hex }]} />
      </View>
      <View style={styles.hueBar} onLayout={e => setBar(e.nativeEvent.layout.width)} accessibilityLabel="Hue" {...drag(onBar)}>
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="pickHue" x1="0" y1="0" x2="1" y2="0">
              {HUES.map((c, i) => <Stop key={i} offset={String(i / (HUES.length - 1))} stopColor={c} />)}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#pickHue)" />
        </Svg>
        <View pointerEvents="none" style={[styles.hueThumb, { left: (hsv.h / 360) * bar - 4, borderColor: roles.line, backgroundColor: pure }]} />
      </View>
      <View style={styles.hexRow}>
        <View style={[styles.hexSwatch, { backgroundColor: hex, borderColor: roles.line }]} />
        <TextInput value={typed} onChangeText={t => { setTyped(t); const h = readHex(t); if (h) { setHsv(hexToHsv(h)); onChange(h) } }}
          autoCapitalize="none" autoCorrect={false} maxLength={7} accessibilityLabel="Hex colour"
          style={[styles.hexInput, { color: roles.text, borderColor: roles.line, fontFamily: font.tag }]} />
      </View>
    </View>
  )
}

export function Field({ label, roles, error, secure, style, ...input }: TextInputProps & {
  label: string
  roles: Roles
  error?: string | null
  secure?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)
  return (
    <View style={[styles.fieldWrap, style]}>
      <View style={styles.fieldLabelRow}>
        <KitText t="tag" color={roles.textMuted}>{label}</KitText>
        {secure && (
          <Pressable
            onPress={() => setShown(s => !s)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          >
            <KitText t="tag" color={roles.text}>{shown ? 'HIDE' : 'SHOW'}</KitText>
          </Pressable>
        )}
      </View>
      <View style={[
        styles.field,
        { backgroundColor: roles.sunken, borderColor: error ? roles.line : focused ? roles.line : roles.rule },
        focused && { borderWidth: border.plate },
      ]}>
        {/* P8-111: a field in error is red; the message beside it says what's wrong. */}
        {error ? <View style={[styles.fieldStripe, { backgroundColor: roles.loss }]} /> : null}
        <TextInput
          {...input}
          accessibilityLabel={label}
          secureTextEntry={secure && !shown}
          placeholderTextColor={roles.textFaint}
          onFocus={e => { setFocused(true); input.onFocus?.(e) }}
          onBlur={e => { setFocused(false); input.onBlur?.(e) }}
          style={[styles.input, { color: roles.text, fontFamily: font.body }]}
        />
      </View>
      {error ? <KitText t="body" color={roles.text} style={styles.fieldError} accessibilityLiveRegion="polite">{error}</KitText> : null}
    </View>
  )
}

// ── Checkbox ─────────────────────────────────────────────────────────────────
export function Checkbox({ checked, onChange, roles, children }: {
  checked: boolean; onChange: (v: boolean) => void; roles: Roles; children: string
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={children}
      style={styles.checkRow}
    >
      <View style={[styles.checkBox, { borderColor: roles.line, backgroundColor: checked ? roles.line : 'transparent' }]}>
        {checked && <Icon name="check" size={16} color={roles.bg} />}
      </View>
      <KitText t="tag" color={roles.text} style={{ flex: 1 }}>{children}</KitText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginBottom: space[2] },
  swatchLabel: { width: 56 },
  swatch: { width: 32, height: 32 },
  // Chaos's strip of hazard tape under a heading (P8-169).
  rip: { width: 44, height: 5, marginTop: 3 },
  anySwatch: { alignItems: 'center', justifyContent: 'center' },
  colourField: { gap: space[1] },
  picker: { borderWidth: border.thin, padding: space[2], gap: space[2], marginBottom: space[2] },
  square: { height: 150, overflow: 'hidden' },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  hueBar: { height: 24, overflow: 'hidden' },
  hueThumb: { position: 'absolute', top: 0, bottom: 0, width: 8, borderWidth: 2 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  hexSwatch: { width: 32, height: 32, borderWidth: border.thin },
  hexInput: { flex: 1, minHeight: 40, borderWidth: border.thin, paddingHorizontal: space[2], fontSize: 16 },
  offset: { position: 'absolute', left: OFFSET, top: OFFSET, right: 0, bottom: 0 },
  plate: {
    minHeight: 52, paddingHorizontal: space[5], justifyContent: 'center', overflow: 'hidden',
  },
  quiet: { minHeight: 48, paddingHorizontal: space[2] },
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  destructiveEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 10 },
  loaderWrap: { alignItems: 'center', gap: 8 },
  loaderTrack: { height: 3, overflow: 'hidden' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, overflow: 'hidden' },
  progressBlock: { width: 60, height: 3 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -space[3] },
  sectionTag: { marginTop: space[5], marginBottom: space[2] },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space[2],
  },
  rowStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  toggle: { minWidth: 56, height: 32, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  fieldWrap: { gap: space[1] },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: { borderWidth: border.thin, minHeight: 48, justifyContent: 'center', overflow: 'hidden' },
  fieldStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  input: { fontSize: 15, paddingHorizontal: space[4], paddingVertical: space[3] },
  fieldError: { marginTop: space[1] },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 },
  checkBox: { width: 24, height: 24, borderWidth: border.plate, alignItems: 'center', justifyContent: 'center' },
})
