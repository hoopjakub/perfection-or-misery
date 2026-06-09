import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login"    options={{ presentation: 'modal' }} />
      <Stack.Screen name="register" options={{ presentation: 'modal' }} />
    </Stack>
  )
}