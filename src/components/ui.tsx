import React from 'react'
import { Pressable, View, Text, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { colors, spacing, typography, radius, MODE_THEMES } from '@/theme'
import { screwLevelInfo } from '@/engine/difficulty'
import type { DifficultyFields } from '@/db/queries/leaderboard'
import type { RunSaveStatus } from '@/hooks/useRunSave'

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

// ── DifficultyBadge ──────────────────────────────────────────────────────────
// Every screen that lists a saved run (My Runs, Leaderboard, Achievements) needs
// to show "how hard was this run" — but that means something different per
// difficulty: easy/medium/hard is one word; Chaos/Cursed are their own fixed
// identity (own colour + icon, borrowed from MODE_THEMES so it matches every
// other chaos/cursed touchpoint in the app); custom is the richest case and
// needs to show its actual knobs (rerolls, ratings on/off, the named level) not
// just a number, or "Custom" tells you nothing about what you actually survived.
// One component so all three screens render this identically.
const DIFF_COLOR: Record<string, string> = { easy: colors.success, medium: colors.warning, hard: colors.danger }
const DIFF_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  easy: 'happy-outline', medium: 'walk-outline', hard: 'flame-outline',
}

export function DifficultyBadge({ run, compact }: { run: DifficultyFields; compact?: boolean }) {
  const { difficulty, difficulty_meta: meta } = run
  if (!difficulty) return null

  // Chaos/Cursed: fixed identity, not a chosen level — pull straight from the
  // same MODE_THEMES palette their result screens, headers and hero banners use.
  if (difficulty === 'chaos' || difficulty === 'cursed') {
    const theme = MODE_THEMES[difficulty]
    const icon: keyof typeof Ionicons.glyphMap = difficulty === 'chaos' ? 'skull' : 'flame'
    return (
      <View style={[diffStyles.pill, { backgroundColor: theme.accent + '22', borderColor: theme.accent }]}>
        <Ionicons name={icon} size={11} color={theme.accent} />
        <Text style={[diffStyles.pillText, { color: theme.accent }]}>{difficulty === 'chaos' ? 'Chaos' : 'Cursed'}</Text>
      </View>
    )
  }

  if (difficulty === 'custom') {
    const info = meta ? screwLevelInfo(meta.screwLevel) : null
    return (
      <View>
        <View style={[diffStyles.pill, { backgroundColor: colors.gold + '22', borderColor: colors.gold }]}>
          <Ionicons name="construct" size={11} color={colors.gold} />
          <Text style={[diffStyles.pillText, { color: colors.gold }]}>
            {info ? info.name : 'Custom'}{meta ? ` · ${meta.hardness.toFixed(1)}/11` : ''}
          </Text>
        </View>
        {/* the actual knobs — what made it that hard — only worth the extra
            line when the badge isn't crammed into a compact list row */}
        {!compact && meta && (
          <Text style={diffStyles.caption}>
            {meta.rerolls} reroll{meta.rerolls === 1 ? '' : 's'} · Ratings {meta.ratingsShown ? 'on' : 'hidden'}
            {/* CL (full) only — see Big Fixes §4. Weighted picks eases the
                draft (see hardnessOf), so it belongs alongside the other
                knobs that explain "why this hardness number". */}
            {meta.weightedPicks !== undefined ? ` · Weighted picks ${meta.weightedPicks ? 'on' : 'off'}` : ''}
          </Text>
        )}
      </View>
    )
  }

  // easy / medium / hard
  const color = DIFF_COLOR[difficulty] ?? colors.textSecondary
  return (
    <View>
      <View style={[diffStyles.pill, { backgroundColor: color + '22', borderColor: color }]}>
        <Ionicons name={DIFF_ICON[difficulty] ?? 'speedometer-outline'} size={11} color={color} />
        <Text style={[diffStyles.pillText, { color }]}>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</Text>
      </View>
      {/* CL (full) only — see Big Fixes §4 — easy/medium/hard have no other
          knobs to caption, so this is the only line that ever shows here. */}
      {!compact && meta?.weightedPicks !== undefined && (
        <Text style={diffStyles.caption}>Weighted picks {meta.weightedPicks ? 'on' : 'off'}</Text>
      )}
    </View>
  )
}

// ── LoadFailed ───────────────────────────────────────────────────────────────
// A list whose fetch failed used to fall through to its empty state ("No runs
// yet"), which told the player something false. This is the honest version.
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={loadStyles.wrap}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
      <Text style={loadStyles.text}>Couldn't load this.</Text>
      <PressCard style={loadStyles.retry} onPress={onRetry} accessibilityRole="button">
        <Text style={loadStyles.retryText}>Retry</Text>
      </PressCard>
    </View>
  )
}

const loadStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  text: { fontSize: typography.md, color: colors.textSecondary },
  retry: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard,
  },
  retryText: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
})

// ── SaveStatusLine ───────────────────────────────────────────────────────────
// The one visible trace of useRunSave on every result screen. Saving used to be
// invisible, so a failed save looked exactly like a saved one — and guests were
// never told their run wouldn't be kept. Renders nothing for history views and
// tester runs, where there's nothing to say.
const SAVE_LINE: Record<Exclude<RunSaveStatus, 'off'>, { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }> = {
  guest:   { icon: 'person-outline',        text: "Playing as a guest — this run won't be kept. Create an account to save your runs.", color: colors.textSecondary },
  waiting: { icon: 'time-outline',          text: 'Preparing to save…',               color: colors.textSecondary },
  saving:  { icon: 'cloud-upload-outline',  text: 'Saving your run…',                 color: colors.textSecondary },
  saved:   { icon: 'checkmark-circle',      text: 'Saved to your runs',               color: colors.success },
  failed:  { icon: 'alert-circle',          text: "Couldn't save this run.",          color: colors.warning },
}

export function SaveStatusLine({ status, onRetry }: { status: RunSaveStatus; onRetry: () => void }) {
  if (status === 'off') return null
  const line = SAVE_LINE[status]
  return (
    <View style={saveStyles.row} accessibilityLiveRegion="polite">
      <Ionicons name={line.icon} size={15} color={line.color} />
      <Text style={[saveStyles.text, { color: line.color }]}>{line.text}</Text>
      {status === 'failed' && (
        <PressCard style={saveStyles.retry} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry saving this run">
          <Text style={saveStyles.retryText}>Retry</Text>
        </PressCard>
      )}
    </View>
  )
}

const saveStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
    gap: spacing.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.sm,
  },
  text: { fontSize: typography.xs, fontWeight: typography.medium, textAlign: 'center', flexShrink: 1 },
  retry: {
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.warning,
  },
  retryText: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.warning },
})

const diffStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  pillText: { fontSize: 10, fontWeight: typography.bold },
  caption: { fontSize: 9, color: colors.textMuted, marginTop: 2 },
})
