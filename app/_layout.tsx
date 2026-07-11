import { useEffect } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { initBundledDb, getDb } from '@/db/setup'
import { initAuthListener } from '@/store/userStore'
import { ensureGuestSession } from '@/lib/auth'

export default function RootLayout() {
  useEffect(() => {
    async function boot() {
      await initBundledDb()
      await getDb()
      initAuthListener()
      await ensureGuestSession()
    }
    boot().catch(console.error)
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
        <Stack screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: '#0A0E1A' },
          animation:    'fade',
        }} />
      </View>
    </GestureHandlerRootView>
  )
}