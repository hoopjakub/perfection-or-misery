// The furniture every in-run screen wears: the thumb bar the next step sits
// in, the "back to live" tag, the abandon control, and the two decisions that
// interrupt a run. Shared so the league, Champions League, World Cup and full
// path all behave the same.
import { useSettingsStore } from '@/store/settingsStore'
import React from 'react'
import { COLUMN } from '@/hooks/useSizeClass'
import { View, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROLES, space, border } from '@/theme'
import { KitText, Icon, Plate } from '@/components/kit'
import { openConfirm } from '@/lib/confirm'
import { useGameStore } from '@/store/gameStore'
import { FLOODLIT } from '@/lib/appearance'

// P8.5-25: floodlit. Its colours are baked into the StyleSheet below, which a
// hook can't reach, and it's mostly the live simulation's bar.
const roles = ROLES[FLOODLIT]
export function ThumbBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  // The bar runs edge to edge; its plates keep the reading column's width, so
  // a desktop window doesn't get a 1500px-wide button.
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space[2] }]}>
      <View style={{ width: '100%', maxWidth: COLUMN, alignSelf: 'center', gap: space[2] }}>{children}</View>
    </View>
  )
}

export function CloseRun({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Abandon the run"
      style={({ pressed }) => [styles.close, pressed && { backgroundColor: roles.sunken }]}>
      <Icon name="close" size={24} color={roles.text} />
    </Pressable>
  )
}

export function BackToLive({ md, onPress, label }: { md: number; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.live, pressed && { backgroundColor: roles.sunken }]}>
      <KitText t="tag" color={roles.text}>{label ?? `Looking at MD ${md} · Back to live`}</KitText>
    </Pressable>
  )
}

export function askSkip(consequence: string, pause: () => void, run: () => void) {
  pause()
  // P8-21: the player can switch the question off (and back on in the You tab).
  if (!useSettingsStore.getState().skipWarning) { run(); return }
  openConfirm({
    question: 'Skip ahead?',
    consequence: `${consequence} You'll see every result, but not each one landing.`,
    confirmLabel: 'Skip ahead',
    stayLabel: 'Keep watching',
    onConfirm: run,
    optOut: {
      label: "Don't ask again. You can turn it back on in Settings.",
      apply: () => useSettingsStore.getState().setSkipWarning(false),
    },
  })
}

// P8-21: every "skip ahead" in a run is this one plate, and the question it
// asks is `askSkip`'s — whose "Don't ask again" box is the in-run switch, the
// same way "Play without a bench" works. (A second box under the plate itself
// was one switch too many: the maintainer wants the choice in the popup only.)
export function SkipPlate({ label, consequence, pause, run, disabled }: {
  label: string; consequence: string; pause: () => void; run: () => void; disabled?: boolean
}) {
  return (
    <Plate label={label} icon="skip" variant="secondary" roles={roles} disabled={disabled}
      onPress={() => askSkip(consequence, pause, run)} />
  )
}

export function askAbandon(pause: () => void) {
  pause()
  openConfirm({
    question: 'Abandon this run?',
    consequence: "Everything played so far is lost and the run isn't saved. You can't come back to it.",
    confirmLabel: 'Abandon the run',
    stayLabel: 'Keep playing',
    onConfirm: () => useGameStore.getState().resetRun(),
    thenRoute: '/(tabs)',
    backConfirms: true,
  })
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space[4], paddingTop: space[2], gap: space[2],
    borderTopWidth: border.hair, borderTopColor: roles.rule, backgroundColor: roles.bg,
  },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  live: {
    alignSelf: 'flex-start', borderWidth: border.thin, borderColor: roles.line, backgroundColor: roles.bg,
    paddingHorizontal: space[2], minHeight: 32, justifyContent: 'center',
  },
})
