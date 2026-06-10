import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { ensureGuestSession } from '@/lib/auth'
import { getDb } from '@/db/setup'
import { initAuthListener } from '@/store/userStore'
import { seedPremierLeague2025 } from '@/db/seed'
import { colors, typography, spacing } from '@/theme'
import { View } from 'react-native'

export default function RootLayout() {
  useEffect(() => {
    async function boot() {
      await getDb()
      await seedPremierLeague2025()
      initAuthListener()
      await ensureGuestSession()
    }
    boot().catch(console.error)
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: '#0A0E1A' },
          animation:    'fade',
        }}
      />
    </View>
  )
}