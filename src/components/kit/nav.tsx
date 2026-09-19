// NavBar / NavRail: the four destinations. A bar under 1024px, a rail with
// the wordmark from 1024px. Active = orange tape (above the item in the bar,
// beside it in the rail) plus ink text — never colour alone.
import React from 'react'
import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { ROLES, space, border, prim } from '@/theme'
import { KitText, Icon, type IconName } from './primitives'
import { Wordmark } from './labels'

export const RAIL_MIN_WIDTH = 1024

const DEST: Record<string, { label: string; icon: IconName }> = {
  index:       { label: 'Play',  icon: 'play' },
  runs:        { label: 'Runs',  icon: 'runs' },
  leaderboard: { label: 'Ranks', icon: 'ranks' },
  profile:     { label: 'You',   icon: 'you' },
}

export function KitTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { width } = useWindowDimensions()
  const rail = width >= RAIL_MIN_WIDTH
  const roles = ROLES.cotton

  const items = state.routes
    .map((route, index) => ({ route, index, meta: DEST[route.name] }))
    .filter(i => i.meta)

  return (
    <View
      accessibilityRole="tablist"
      style={rail
        ? [styles.rail, { paddingTop: insets.top + space[5], backgroundColor: roles.bg, borderRightColor: roles.line }]
        : [styles.bar, { paddingBottom: Math.max(insets.bottom, space[1]), backgroundColor: roles.bg, borderTopColor: roles.line }]}
    >
      {rail && <View style={styles.railMark}><Wordmark roles={roles} size="superM" /></View>}
      {items.map(({ route, index, meta }) => {
        const focused = state.index === index
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params)
        }
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            style={({ pressed }) => [
              rail ? styles.railItem : styles.barItem,
              pressed && { backgroundColor: roles.sunken },
            ]}
          >
            <View style={[
              rail ? styles.railTape : styles.barTape,
              { backgroundColor: focused ? prim.orange : 'transparent' },
            ]} />
            <Icon name={meta.icon} size={20} color={focused ? roles.text : roles.textMuted} />
            <KitText t="tag" color={focused ? roles.text : roles.textMuted}>{meta.label}</KitText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: border.thin },
  barItem: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  barTape: { position: 'absolute', top: 0, left: '22%', right: '22%', height: border.tape },
  rail: { width: 220, borderRightWidth: border.thin, paddingHorizontal: space[3], gap: space[1] },
  railMark: { paddingHorizontal: space[2], paddingBottom: space[6] },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3] },
  railTape: { position: 'absolute', left: 0, top: 8, bottom: 8, width: border.tape },
})
