import React from 'react'
import { Pressable, View, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { colors } from '@/theme'

// ── PressCard ────────────────────────────────────────────────────────────────
// The one interaction primitive every tappable card/row should use: gentle
// scale + dim while pressed, and a background lift on web hover (react-native-web
// passes `hovered` to the style function; native only ever sees `pressed`).
// Purely presentational — accepts everything Pressable does.

type PressState = { pressed: boolean; hovered?: boolean }

export function PressCard({
  style, hoverStyle, pressedStyle, disabled, children, ...rest
}: PressableProps & {
  style?: StyleProp<ViewStyle>
  hoverStyle?: StyleProp<ViewStyle>     // web-only lift (defaults to subtle bg brighten)
  pressedStyle?: StyleProp<ViewStyle>   // extra style while pressed
}) {
  return (
    <Pressable
      disabled={disabled}
      style={(state) => {
        const { pressed, hovered } = state as PressState
        return [
          style,
          hovered && !disabled && (hoverStyle ?? defaultHover),
          pressed && !disabled && [defaultPressed, pressedStyle],
          disabled && { opacity: 0.45 },
        ]
      }}
      {...rest}
    >
      {children}
    </Pressable>
  )
}

// A touch brighter than bgCard (#111827) — reads as a lift, not a shadow.
const defaultHover: ViewStyle = { backgroundColor: '#18213A', borderColor: '#374151' }

// ── BackButton ───────────────────────────────────────────────────────────────
// The standard header back control — was hand-copied as a bare "←" glyph
// Pressable (no press feedback) across every single screen. One component now.
export function BackButton({ onPress, color = colors.textPrimary }: { onPress?: () => void; color?: string }) {
  return (
    <PressCard style={backStyles.back} onPress={onPress ?? (() => router.back())}>
      <Ionicons name="chevron-back" size={22} color={color} />
    </PressCard>
  )
}

const backStyles = StyleSheet.create({
  back: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
})
const defaultPressed: ViewStyle = { opacity: 0.85, transform: [{ scale: 0.985 }] }

// ── StepSlider ───────────────────────────────────────────────────────────────
// A discrete slider over integer steps [min..max]. Looks like a slider (filled
// track + thumb) but the interaction is a row of transparent tap segments plus
// −/+ steppers — deliberately Pressable-based rather than a PanResponder drag,
// because Pressable onPress fires reliably on BOTH web and native (a PanResponder
// gesture doesn't reliably plumb through react-native-web's responder system).
// Tap anywhere on the bar to jump straight to that value; nudge with the buttons.
export function StepSlider({
  min, max, value, onChange, accent = colors.accent, disabled,
}: {
  min: number; max: number; value: number
  onChange: (v: number) => void
  accent?: string
  disabled?: boolean
}) {
  const steps = []
  for (let v = min; v <= max; v++) steps.push(v)
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const set = (v: number) => { if (!disabled) onChange(Math.max(min, Math.min(max, v))) }

  return (
    <View style={[sliderStyles.row, disabled && { opacity: 0.4 }]}>
      <Pressable style={sliderStyles.stepBtn} onPress={() => set(value - 1)} hitSlop={6} disabled={disabled}>
        <Ionicons name="remove" size={16} color={colors.textPrimary} />
      </Pressable>

      <View style={sliderStyles.trackWrap}>
        {/* visual bar + fill + thumb (never intercepts touches) */}
        <View style={sliderStyles.bar} pointerEvents="none">
          <View style={[sliderStyles.fill, { width: `${pct}%`, backgroundColor: accent }]} />
        </View>
        <View style={[sliderStyles.thumb, { left: `${pct}%`, borderColor: accent }]} pointerEvents="none" />
        {/* tap layer — one segment per value, fills the track evenly */}
        <View style={sliderStyles.tapLayer}>
          {steps.map(v => (
            <Pressable key={v} style={sliderStyles.tapSeg} onPress={() => set(v)} disabled={disabled} />
          ))}
        </View>
      </View>

      <Pressable style={sliderStyles.stepBtn} onPress={() => set(value + 1)} hitSlop={6} disabled={disabled}>
        <Ionicons name="add" size={16} color={colors.textPrimary} />
      </Pressable>
    </View>
  )
}

const sliderStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
  },
  trackWrap: { flex: 1, height: 30, justifyContent: 'center' },
  bar:     { height: 5, borderRadius: 3, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  fill:    { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  thumb: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9,
    backgroundColor: colors.textPrimary, borderWidth: 3,
  },
  tapLayer: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapSeg: { flex: 1 },
})
