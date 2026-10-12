import { useEffect } from 'react'
import { Platform } from 'react-native'
import { Stack, useNavigation } from 'expo-router'

export default function GameLayout() {
  // The PC sweep (12 Oct 2026): the browser's Back to the first game screen
  // entered from outside this stack (Home → mode select, Runs → a saved run,
  // the tester → a result) landed on the run hub with the old URL. expo-router
  // writes that history entry when the push happens, before this stack exists,
  // as "game, screen=result" with no state of its own, and never rewrites it;
  // Back restores it, and the stack starts again from its first route (`run`).
  // One no-op change of params once the stack is up makes expo-router record
  // the entry again, now with the stack's real state.
  const navigation = useNavigation()
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const id = setTimeout(() => navigation.setParams({} as never), 0)
    return () => clearTimeout(id)
  }, [navigation])
  return <Stack screenOptions={{ headerShown: false }} />
}
