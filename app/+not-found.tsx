import React from 'react'
import { StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, Plate } from '@/components/kit'

// Any unknown path (a stale link, a mistyped URL on web). Replaces expo-router's
// default developer screen.
const roles = ROLES.cotton

export default function NotFoundScreen() {
  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.screen}>
      <KitText t="superXl" color={roles.text} accessibilityRole="header">"WRONG PITCH"</KitText>
      <KitText t="bodyL" color={roles.textMuted}>There's nothing at this address.</KitText>
      <Plate label="Back to Play" icon="forward" roles={roles} onPress={() => router.replace('/(tabs)')} style={styles.plate} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', gap: space[3] },
  plate: { marginTop: space[5] },
})
