// The furniture every in-run screen wears: the thumb bar the next step sits
// in, the "back to live" tag, the abandon control, and the two decisions that
// interrupt a run. Shared so the league, Champions League, World Cup and full
// path all behave the same.
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROLES, space, border } from '@/theme'
import { KitText, Icon } from '@/components/kit'
import { openConfirm } from '@/lib/confirm'
import { useGameStore } from '@/store/gameStore'

const roles = ROLES.nylon

export function ThumbBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  return <View style={[styles.bar, { paddingBottom: insets.bottom + space[2] }]}>{children}</View>
}

export function CloseRun({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Abandon the run"
      style={({ pressed }) => [styles.close, pressed && { backgroundColor: roles.sunken }]}>
      <Icon name="close" size={24} color={roles.text} />
    </Pressable>
  )
}

export function BackToLive({ md, onPress }: { md: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.live, pressed && { backgroundColor: roles.sunken }]}>
      <KitText t="tag" color={roles.text}>{`Looking at MD ${md} · Back to live`}</KitText>
    </Pressable>
  )
}

export function askSkip(consequence: string, pause: () => void, run: () => void) {
  pause()
  openConfirm({
    question: 'Skip ahead?',
    consequence: `${consequence} You'll see every result, but not each one landing.`,
    confirmLabel: 'Skip ahead',
    stayLabel: 'Keep watching',
    onConfirm: run,
  })
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
  })
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space[4], paddingTop: space[2], gap: space[2],
    borderTopWidth: border.hair, borderTopColor: roles.rule, backgroundColor: roles.bg,
  },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  live: {
    alignSelf: 'flex-start', borderWidth: border.thin, borderColor: roles.line,
    paddingHorizontal: space[2], minHeight: 32, justifyContent: 'center',
  },
})
