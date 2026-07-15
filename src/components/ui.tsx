import React from 'react'
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
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
