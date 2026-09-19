import React, { useEffect, useState } from 'react'
import { Platform, View, StyleSheet } from 'react-native'
import { ROLES, space } from '@/theme'
import { KitText, Stripe, Icon } from '@/components/kit'

// Offline strip (Phase 6). The game itself runs offline from the bundled
// database; only saving a run, Ranks and accounts need the network, so the
// strip says exactly that instead of implying nothing works.
// ponytail: web only, from the browser's own online/offline events. Native
// would need expo-network (a new native build); until then the run's save
// line already says when a save fails and offers a retry.
const roles = ROLES.nylon

export function OfflineStrip() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const sync = () => setOffline(!navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync) }
  }, [])
  if (!offline) return null
  return (
    <View style={[styles.strip, { backgroundColor: roles.surface, borderBottomColor: roles.line }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Stripe roles={roles} band={4} style={styles.edge} />
      <Icon name="offline" size={16} color={roles.text} />
      <KitText t="tag" color={roles.text} style={{ flex: 1 }}>Offline. You can still play; saving runs and Ranks need a connection.</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingRight: space[3], minHeight: 36, borderBottomWidth: 1 },
  edge: { width: 10, alignSelf: 'stretch' },
})
