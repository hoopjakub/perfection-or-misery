import { Stack } from 'expo-router'

export default function GameLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="mode-select" />
      <Stack.Screen name="formation-select" />
      <Stack.Screen name="draft"       options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="placement"   options={{ animation: 'fade' }} />
      <Stack.Screen name="simulation"  options={{ animation: 'none' }} />
      <Stack.Screen name="result"      options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  )
}