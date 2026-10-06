import { t } from '@/i18n'
import { Tabs } from 'expo-router'
import { Platform, useWindowDimensions } from 'react-native'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useNoticeStore } from '@/store/noticeStore'
import { useUserStore } from '@/store/userStore'
import * as NavigationBar from 'expo-navigation-bar'
import { KitTabBar, RAIL_MIN_WIDTH } from '@/components/kit'

// Five destinations — Play, Runs, Ranks, Clubs, You (docs/ui-overhaul/07a A1;
// Clubs joined from You in P8.5-07). Guide
// and About used to be tabs too, and Profile repeated them as menu rows; they
// now live inside You as ordinary routes (app/guide.tsx, app/about.tsx).
// The bar is drawn by KitTabBar: a bottom bar on phones, a left rail from
// 1024px. The order below is the order on screen.
export default function TabsLayout() {
  const { width } = useWindowDimensions()
  // P8-90: the You tab counts your unread notifications (friend requests).
  const unread = useNoticeStore(s => s.unread)
  const userId = useUserStore(s => s.user?.id)
  // The You tab carries your name once you're signed in (batch 16).
  const username = useUserStore(s => (s.isGuest ? null : s.profile?.username ?? null))
  useEffect(() => {
    useNoticeStore.getState().refresh()
    const sub = AppState.addEventListener('change', st => { if (st === 'active') useNoticeStore.getState().refresh() })
    return () => sub.remove()
  }, [userId])

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
      <Tabs.Screen name="clubs" />
      <Tabs.Screen name="profile" options={{ title: username ?? t('ranks.you_'), tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined }} />
    </Tabs>
  )
}
