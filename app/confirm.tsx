import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, Plate, StripedNotice } from '@/components/kit'
import { takeConfirmRequest } from '@/lib/confirm'

// ConfirmScreen — see src/lib/confirm.ts for why this is a route.
export default function ConfirmScreen() {
  const [request] = useState(takeConfirmRequest)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  const roles = ROLES.cotton

  // Reloaded on web with nothing pending: there's no decision to make.
  if (!request) {
    return (
      <KitScreen ground="cotton" scroll={false}>
        <KitText t="superM" color={roles.text}>NOTHING TO CONFIRM</KitText>
        <Plate label="Back to Play" onPress={() => router.replace('/(tabs)')} roles={roles} style={styles.plate} />
      </KitScreen>
    )
  }

  async function confirm() {
    if (!request || working) return
    setWorking(true)
    setFailed(false)
    try {
      await request.onConfirm()
      if (request.thenRoute) {
        // Clear the stack first so the destination isn't stacked on top of
        // the screen that opened the confirmation (see src/lib/nav.ts).
        if (router.canDismiss()) router.dismissAll()
        router.replace(request.thenRoute as never)
      } else {
        router.back()
      }
    } catch (e) {
      console.warn('[confirm] action failed:', e)
      setFailed(true)
      setWorking(false)
    }
  }

  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.screen}>
      <View style={styles.top}>
        <KitText t="superL" color={roles.text} accessibilityRole="header">{request.question.toUpperCase()}</KitText>
        <KitText t="bodyL" color={roles.textMuted}>{request.consequence}</KitText>
        {failed && <StripedNotice roles={roles}>That didn't work. Check your connection and try again.</StripedNotice>}
      </View>
      <View style={styles.actions}>
        <Plate label={request.stayLabel} onPress={() => router.back()} roles={roles} variant="secondary" />
        <Plate label={request.confirmLabel} onPress={confirm} roles={roles} variant="destructive" loading={working} />
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between', paddingBottom: space[6] },
  top: { gap: space[3] },
  actions: { gap: space[3] },
  plate: { marginTop: space[5] },
})
