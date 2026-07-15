import { Tabs } from 'expo-router'
import { Platform, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/theme'
import { useEffect } from 'react'
import * as NavigationBar from 'expo-navigation-bar'

// Proper vector icons + labels + accent-colored active state (the old bar was
// six emoji at 50% opacity with no labels — unreadable at a glance and the
// focus state was nearly invisible).
const TAB_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  'index':       { icon: 'football',           label: 'Play' },
  'leaderboard': { icon: 'podium',             label: 'Ranks' },
  'profile':     { icon: 'person-circle',      label: 'Profile' },
  'runs':        { icon: 'medal',              label: 'Runs' },
  'how-to-play': { icon: 'book',               label: 'Guide' },
  'about':       { icon: 'information-circle', label: 'About' },
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('hidden')
  }, [])

  return (
    <Tabs
      screenOptions={({ route }) => {
        const meta = TAB_ICON[route.name] ?? { icon: 'ellipse' as const, label: route.name }
        return {
          headerShown:          false,
          tabBarStyle:          [styles.tabBar, { height: 62 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8) }],
          tabBarActiveTintColor:   colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabel:          meta.label,
          tabBarLabelStyle:     styles.label,
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? meta.icon : (`${meta.icon}-outline` as keyof typeof Ionicons.glyphMap)}
              size={22}
              color={color}
            />
          ),
        }
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="runs" />
      <Tabs.Screen name="how-to-play" />
      <Tabs.Screen name="about" />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgCard,
    borderTopColor:  colors.border,
    borderTopWidth:  1,
    paddingTop:      8,
  },
  label: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },
})
