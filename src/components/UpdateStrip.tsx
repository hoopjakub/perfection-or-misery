import React from 'react'
import { t } from '@/i18n'
import { View, StyleSheet } from 'react-native'
import { ROLES, space, border, prim } from '@/theme'
import { KitText, Plate } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'
import { useAppUpdate, installAppUpdate } from '@/lib/appUpdate'

// P8.5-31: "a new version is out", quietly, on Home (src/lib/appUpdate.ts has
// the check). Below the build the server still allows (`minBuild`), it says
// so plainly. The download shows its progress; a failure says why and offers
// the tap again.
const roles = ROLES[EVERYDAY]

export function UpdateStrip() {
  const st = useAppUpdate(s => s.state)
  if (st.kind === 'none') return null
  const latest = st.latest
  const required = st.kind === 'available' && st.required
  // The release notes come from latest.json, in English (one line per release).
  const line = st.kind === 'downloading' ? t('common.updateDownloading', { version: latest.version, percent: Math.round(st.progress * 100) })
    : st.kind === 'failed' ? t('common.updateFailed', { why: st.why })
    : required ? t('common.updateRequired', { version: latest.version })
    : t('common.updateAvailable', { version: latest.version }) + (latest.notes ? ` ${latest.notes}` : '')
  return (
    <View style={[styles.strip, { backgroundColor: roles.surface, borderColor: required ? prim.misery : roles.line }]} accessibilityLiveRegion="polite">
      <KitText t="body" color={roles.text} style={{ flex: 1 }}>{line}</KitText>
      {st.kind !== 'downloading' && (
        <Plate label={st.kind === 'failed' ? t('common.tryAgain') : t('common.update')} icon="forward" variant={required ? 'primary' : 'secondary'} roles={roles}
          onPress={() => installAppUpdate(latest, required)} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: border.thin, padding: space[2], marginBottom: space[3] },
})
