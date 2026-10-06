// P8.5-36: the achievement toast. The maintainer: "match it to Minecraft
// style, so it appears in the top of the screen, in the centre of the top
// side, almost like a notification". Minecraft's is a framed panel that
// slides down with the item's icon on the left, a coloured header
// ("Advancement Made!") and the name under it, and slides away again. Here: a
// Kit plate on the everyday ground (so it follows dark and light), the trophy
// in a gold block, the header, the achievement and one line on how it was
// earned. Its header is common.achievementGet (src/i18n, P8.5-28).
import { t } from '@/i18n'
import React, { useEffect } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, runOnJS, Easing } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KitText, Icon } from '@/components/kit'
import { ROLES, prim, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useAchievementToasts, announceNewAchievements } from '@/lib/achievementToast'
import { useUserStore } from '@/store/userStore'

const HEADER = t('common.achievementGet')

const roles = ROLES[EVERYDAY]
const IN_MS = 280, HOLD_MS = 3600, OUT_MS = 240

export function AchievementToast() {
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const item = useAchievementToasts(s => s.queue[0] ?? null)
  const shift = useAchievementToasts(s => s.shift)
  // Prime the record as soon as you're signed in, so the first run after
  // this update can already announce what it earns (the first look is silent).
  const userId = useUserStore(s => (s.isGuest ? null : s.user?.id ?? null))
  useEffect(() => { if (userId) announceNewAchievements(userId) }, [userId])
  const y = useSharedValue(-140)
  const o = useSharedValue(0)

  useEffect(() => {
    if (!item) return
    const done = () => shift()
    if (reduced) {
      // Less motion: it appears and goes, without the slide.
      y.value = 0
      o.value = withSequence(withTiming(1, { duration: 120 }), withDelay(HOLD_MS, withTiming(0, { duration: 120 }, f => { if (f) runOnJS(done)() })))
      return
    }
    y.value = -140; o.value = 1
    y.value = withSequence(
      withTiming(0, { duration: IN_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(HOLD_MS, withTiming(-140, { duration: OUT_MS, easing: Easing.in(Easing.cubic) }, f => { if (f) runOnJS(done)() })),
    )
  }, [item?.key])

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: o.value }))
  if (!item) return null
  return (
    <Animated.View pointerEvents="box-none" style={[styles.layer, { top: insets.top + space[2] }, style]}>
      <Pressable onPress={() => shift()} accessibilityRole="alert" accessibilityLiveRegion="polite"
        accessibilityLabel={`${HEADER} ${item.title}. ${item.line}`}
        style={[styles.toast, { backgroundColor: roles.surface, borderColor: roles.line }]}>
        <View style={[styles.icon, { backgroundColor: prim.gold, borderColor: roles.line }]}>
          <Icon name="trophy" size={20} color={prim.ink} />
        </View>
        <View style={styles.words}>
          <KitText t="tag" color={roles.textMuted}>{HEADER.toUpperCase()}</KitText>
          <KitText t="title" color={roles.text} numberOfLines={1}>{item.title}</KitText>
          <KitText t="tag" color={roles.textMuted} numberOfLines={2}>{item.line}</KitText>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], width: '92%', maxWidth: 380,
    borderWidth: border.plate, paddingVertical: space[2], paddingHorizontal: space[3],
  },
  icon: { width: 40, height: 40, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, gap: 1 },
})
