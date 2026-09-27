import React from 'react'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { type Roles, space, border } from '@/theme'
import { KitText, Icon } from '@/components/kit'

// The app's version as a real button (P8-73): on Home, on You, and on every
// menu before a run starts, and it opens the version history. Read from
// app.json, never typed in (About once said 1.0.0 while the app was 0.0.1).
export const APP_VERSION = Constants.expoConfig?.version ?? '—'

export function VersionButton({ roles, style }: { roles: Roles; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={() => router.push('/versions')} accessibilityRole="button"
      accessibilityLabel={`Version ${APP_VERSION}. What's new`}
      style={({ pressed }) => [styles.button, { borderColor: roles.rule }, pressed && { backgroundColor: roles.sunken }, style]}>
      <KitText t="tag" color={roles.textMuted}>{`V${APP_VERSION}`}</KitText>
      <Icon name="chevron" size={16} color={roles.textMuted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // A 44pt target, small on the page: it's a door, not a headline.
  button: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space[2], borderWidth: border.hair },
})
