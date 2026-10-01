import React from 'react'
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
  const line = st.kind === 'downloading' ? `Downloading ${latest.version}… ${Math.round(st.progress * 100)}%`
    : st.kind === 'failed' ? `The update didn't go through: ${st.why}`
    : required ? `This version is too old to keep saving runs. ${latest.version} is out.`
    : `A new version is out: ${latest.version}.${latest.notes ? ` ${latest.notes}` : ''}`
  return (
    <View style={[styles.strip, { backgroundColor: roles.surface, borderColor: required ? prim.misery : roles.line }]} accessibilityLiveRegion="polite">
      <KitText t="body" color={roles.text} style={{ flex: 1 }}>{line}</KitText>
      {st.kind !== 'downloading' && (
        <Plate label={st.kind === 'failed' ? 'Try again' : 'Update'} icon="forward" variant={required ? 'primary' : 'secondary'} roles={roles}
          onPress={() => installAppUpdate(latest, required)} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: border.thin, padding: space[2], marginBottom: space[3] },
})
