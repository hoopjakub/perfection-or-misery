import React from 'react'
import { t } from '@/i18n'
import { View, StyleSheet, Pressable } from 'react-native'
import { ROLES, space } from '@/theme'
import { KitText, Stripe, Icon } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'
import { useOnline } from '@/lib/online'
import { useRunQueue } from '@/lib/runQueue'
import { router } from 'expo-router'

// Offline strip (Phase 6). The game itself runs offline from the bundled
// database; only saving a run, Ranks and accounts need the network, so the
// strip says exactly that instead of implying nothing works. P8.5-24: on the
// phone too now (expo-network, src/lib/online.ts), and a run finished offline
// isn't lost: it waits on the phone (src/lib/runQueue.ts) and goes up when the
// connection's back, which the strip counts.
const roles = ROLES[EVERYDAY]

export function OfflineStrip() {
  const online = useOnline()
  const waiting = useRunQueue(s => s.count)
  const refused = useRunQueue(s => s.refused)
  // P9.75-06: a run the server refused is kept, not deleted, and said here, in
  // misery red, until it's sent again from Diagnostics. Before, it vanished.
  if (refused > 0) {
    return (
      <Pressable onPress={() => router.push('/diagnostics')} accessibilityRole="link"
        style={[styles.strip, { backgroundColor: roles.surface, borderBottomColor: roles.line }]}>
        <View style={[styles.edge, { backgroundColor: roles.loss }]} />
        <Icon name="warning" size={16} color={roles.text} />
        <KitText t="tag" color={roles.text} style={{ flex: 1 }}>{t('common.notSaved', { count: refused })}</KitText>
      </Pressable>
    )
  }
  if (online) return null
  return (
    <View style={[styles.strip, { backgroundColor: roles.surface, borderBottomColor: roles.line }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Stripe roles={roles} band={4} style={styles.edge} />
      <Icon name="offline" size={16} color={roles.text} />
      <KitText t="tag" color={roles.text} style={{ flex: 1 }}>
        {waiting > 0 ? t('common.offlineQueued', { count: waiting }) : t('common.offlinePlay')}
      </KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingRight: space[3], minHeight: 36, borderBottomWidth: 1 },
  edge: { width: 10, alignSelf: 'stretch' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1, padding: space[2], marginBottom: space[3] },
})

/** P8.5-24: on a screen that needs the network (Ranks, Clubs, the chat,
 *  Friends, a profile): said plainly when offline, instead of a load error. */
export function OfflineNotice() {
  const online = useOnline()
  if (online) return null
  return (
    <View style={[styles.notice, { borderColor: roles.line, backgroundColor: roles.surface }]} accessibilityRole="alert">
      <Icon name="offline" size={16} color={roles.text} />
      <KitText t="body" color={roles.text} style={{ flex: 1 }}>{t('common.offlineNeeds')}</KitText>
    </View>
  )
}
