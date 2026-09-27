import React from 'react'
import { View, StyleSheet } from 'react-native'
import { KitScreen, KitText, BackControl, Tag } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space, border } from '@/theme'
import { VERSION_HISTORY } from '@/data/versionHistory'
import { APP_VERSION } from '@/components/VersionButton'

// The version history (P8-73), newest first, each version with where its date
// and its list come from (the GitHub commits, or the roadmap since the last one).
const roles = ROLES.cotton

export default function VersionsScreen() {
  return (
    <KitScreen ground="cotton">
      <PageMeta title="Versions" description="Every version of Perfection or Misery and what changed." path="/versions" />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>VERSIONS</KitText>
      <KitText t="body" color={roles.textMuted}>
        The app was 0.0.1 until September 2026, so the versions before 0.8 are numbered after the fact, one per milestone.
      </KitText>
      {VERSION_HISTORY.map(v => (
        <View key={v.version} style={[styles.entry, { borderTopColor: roles.rule }]}>
          <View style={styles.head}>
            <KitText t="superS" color={roles.text}>{v.version}</KitText>
            {v.version === APP_VERSION && <Tag roles={roles} variant="you">THIS VERSION</Tag>}
          </View>
          <KitText t="title" color={roles.text}>{v.title}</KitText>
          <KitText t="tag" color={roles.textMuted}>{v.when.toUpperCase()}</KitText>
          <View style={styles.list}>
            {v.changes.map((c, i) => <KitText key={i} t="body" color={roles.text}>{`• ${c}`}</KitText>)}
          </View>
          <KitText t="tag" color={roles.textFaint}>{`From ${v.source}`}</KitText>
        </View>
      ))}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[2] },
  entry: { gap: space[1], paddingVertical: space[4], marginTop: space[2], borderTopWidth: border.hair },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  list: { gap: 2, marginVertical: space[1] },
})
