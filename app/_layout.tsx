import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { ensureGuestSession } from '@/lib/auth'
import { getDb } from '@/db/setup'
import { initAuthListener } from '@/store/userStore'
import { seedPremierLeague2025 } from '@/db/seed'

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="game" />
      <Stack.Screen name="auth" />
    </Stack>
  )
}