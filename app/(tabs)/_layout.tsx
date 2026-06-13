import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { colors, typography } from '@/theme'
import { useEffect } from 'react'
import * as NavigationBar from 'expo-navigation-bar'

export default function TabsLayout() {
  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden')
  }, [])

  return (
    <Tabs
      screenOptions={{
        headerShown:     false,
        tabBarStyle:     styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={[styles.icon, focused && styles.iconActive]}>⚽</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={[styles.icon, focused && styles.iconActive]}>🏆</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={[styles.icon, focused && styles.iconActive]}>👤</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="runs"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={[styles.icon, focused && styles.iconActive]}>🥇</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="how-to-play"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={[styles.icon, focused && styles.iconActive]}>🎮</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={[styles.icon, focused && styles.iconActive]}>📝</Text>
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgCard,
    borderTopColor:  colors.border,
    borderTopWidth:  1,
    height:          60,
    paddingTop:    10,
  },
  icon: {
    fontSize:  24,
    opacity:   0.5,
    width:     32,
    height:    32,
    textAlign: 'center',
    lineHeight: 32,
  },
  iconActive: {
    opacity: 1,
  },
})