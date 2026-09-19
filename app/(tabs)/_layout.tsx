import { Tabs } from 'expo-router'
import { Platform, useWindowDimensions } from 'react-native'
import { useEffect } from 'react'
import * as NavigationBar from 'expo-navigation-bar'
import { KitTabBar, RAIL_MIN_WIDTH } from '@/components/kit'

// Four destinations — Play, Runs, Ranks, You (docs/ui-overhaul/07a A1). Guide
// and About used to be tabs too, and Profile repeated them as menu rows; they
// now live inside You as ordinary routes (app/guide.tsx, app/about.tsx).
// The bar is drawn by KitTabBar: a bottom bar on phones, a left rail from
// 1024px. The order below is the order on screen.
export default function TabsLayout() {
  const { width } = useWindowDimensions()

  useEffect(() => {
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('hidden')
  }, [])

  return (
    <Tabs
      tabBar={props => <KitTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: width >= RAIL_MIN_WIDTH ? 'left' : 'bottom',
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="runs" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
