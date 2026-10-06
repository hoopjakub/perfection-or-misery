// The furniture every in-run screen wears: the thumb bar the next step sits
// in, the "back to live" tag, the abandon control, and the two decisions that
// interrupt a run. Shared so the league, Champions League, World Cup and full
// path all behave the same.
import { t } from '@/i18n'
import { runEnded } from '@/diag/log'
import { useSettingsStore } from '@/store/settingsStore'
import React from 'react'
import { COLUMN } from '@/hooks/useSizeClass'
import { View, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROLES, space, border } from '@/theme'
import { KitText, Icon, Plate, Chips } from '@/components/kit'
import type { Speed } from '@/data/speed'
import { openConfirm } from '@/lib/confirm'
import { useGameStore } from '@/store/gameStore'
import { EVERYDAY, useScreenRoles } from '@/lib/appearance'

// P8.5-25: floodlit. Its colours are baked into the StyleSheet below, which a
// hook can't reach, and it's mostly the live simulation's bar.
const roles = ROLES[EVERYDAY]
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

/** The run's abandon control. Every live stage wears it in its header and
 *  calls `askAbandon` with its own pause (L-12, F-10: the league had its own
 *  copy with other words, and the full path had none). */
export function CloseRun({ onPress }: { onPress: () => void }) {
  const r = useScreenRoles()
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('season.abandon')}
      style={({ pressed }) => [styles.close, pressed && { backgroundColor: r.sunken }]}>
      <Icon name="close" size={24} color={r.text} />
    </Pressable>
  )
}

export function BackToLive({ md, onPress, label }: { md: number; onPress: () => void; label?: string }) {
  const r = useScreenRoles()
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.live, { borderColor: r.line, backgroundColor: r.bg }, pressed && { backgroundColor: r.sunken }]}>
      <KitText t="tag" color={r.text}>{label ?? t('season.lookingAt', { md })}</KitText>
    </Pressable>
  )
}

export function askSkip(consequence: string, pause: () => void, run: () => void) {
  pause()
  // P8-21: the player can switch the question off (and back on in the You tab).
  if (!useSettingsStore.getState().skipWarning) { run(); return }
  openConfirm({
    question: t('season.skipQuestion'),
    consequence: consequence + t('season.skipTail'),
    confirmLabel: t('season.skipAhead'),
    stayLabel: t('season.keepWatching'),
    onConfirm: run,
    optOut: {
      label: t('season.dontAskAgain'),
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

/**
 * The control row every live table or group stage wears (C-13): the speed, one
 * setting for the whole app (F-05, D7), and the stage's own skip with its own
 * consequence. Three screens laid this out by hand and two had no speed at all.
 */
export function StageControls({ roles: r, skip }: {
  roles: import('@/theme').Roles
  skip?: { label: string; consequence: string; pause: () => void; run: () => void; disabled?: boolean }
}) {
  const speed = useSettingsStore(st => st.speed)
  const setSpeed = useSettingsStore(st => st.setSpeed)
  return (
    <View style={styles.controls}>
      <Chips<Speed> roles={r} label={t('season.speed')} value={speed} onChange={setSpeed}
        options={[{ id: 'slow', label: t('season.slow') }, { id: 'normal', label: t('season.normal') }, { id: 'fast', label: t('season.fast') }]} />
      <View style={{ flex: 1 }} />
      {skip ? <SkipPlate {...skip} /> : null}
    </View>
  )
}

export function askAbandon(pause: () => void) {
  pause()
  openConfirm({
    question: t('season.abandonQuestion'),
    consequence: t('season.abandonConsequence'),
    confirmLabel: t('season.abandon'),
    stayLabel: t('season.keepPlaying'),
    onConfirm: () => { runEnded('abandoned'); useGameStore.getState().resetRun() },
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
  controls: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  live: {
    alignSelf: 'flex-start', borderWidth: border.thin, borderColor: roles.line, backgroundColor: roles.bg,
    paddingHorizontal: space[2], minHeight: 32, justifyContent: 'center',
  },
})
