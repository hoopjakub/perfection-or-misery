// Kit Drop controls. States built are the "states in use" from
// docs/ui-overhaul/08-COMPONENTS.md §2; anything else in that document waits
// for a screen that needs it.
import React, { useEffect, useRef, useState } from 'react'
import { View, Pressable, TextInput, Animated, Easing, StyleSheet, type StyleProp, type ViewStyle, type TextInputProps } from 'react-native'
import { router } from 'expo-router'
import { type Roles, space, border, OFFSET, density, font } from '@/theme'
import { KitText, Rivets, Stripe, Icon, type IconName } from './primitives'

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
        onPress={onPress}
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
            {variant === 'destructive' && <Stripe roles={roles} band={4} style={styles.destructiveEdge} />}
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

// ── BackControl ──────────────────────────────────────────────────────────────
export function BackControl({ roles, onPress }: { roles: Roles; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
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
  return (
    <View style={[styles.sectionTag, style]} accessibilityRole="header">
      <KitText t="tag" color={roles.textMuted}>{children}</KitText>
    </View>
  )
}

// ── ListRow ──────────────────────────────────────────────────────────────────
// Rules between rows, not cards around them.
export function ListRow({ label, roles, onPress, value, icon, tier = 't2', chevron = !!onPress, trailing, danger }: {
  label: string
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
      {icon && <Icon name={icon} size={20} color={roles.text} />}
      <KitText t={tier === 't1' ? 'bodyL' : 'body'} color={roles.text} style={{ flex: 1 }}>{label}</KitText>
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: roles.sunken }]}
    >
      {danger && <Stripe roles={roles} band={4} style={styles.rowStripe} />}
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
        {error ? <Stripe roles={roles} band={4} style={styles.fieldStripe} /> : null}
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
  offset: { position: 'absolute', left: OFFSET, top: OFFSET, right: 0, bottom: 0 },
  plate: {
    minHeight: 52, paddingHorizontal: space[5], justifyContent: 'center', overflow: 'hidden',
  },
  quiet: { minHeight: 48, paddingHorizontal: space[2] },
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  destructiveEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 10 },
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
