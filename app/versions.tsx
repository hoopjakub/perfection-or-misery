import { t } from '@/i18n'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { KitScreen, KitText, BackControl, Tag } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space, border } from '@/theme'
import { VERSION_HISTORY, localEntry } from '@/data/versionHistory'
import { APP_VERSION } from '@/components/VersionButton'
import { EVERYDAY } from '@/lib/appearance'

// The version history (P8-73), newest first, each version with where its date
// and its list come from (the GitHub commits, or the roadmap since the last one).
const roles = ROLES[EVERYDAY]

export default function VersionsScreen() {
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('screens.versions')} description={t('screens.versionsDesc')} path="/versions" />
      <BackControl roles={roles} title={t('screens.versionsCaps')} />
      <KitText t="body" color={roles.textMuted}>
        {t('screens.versionsNote')}
      </KitText>
      {VERSION_HISTORY.map(localEntry).map(v => (
        <View key={v.version} style={[styles.entry, { borderTopColor: roles.rule }]}>
          <View style={styles.head}>
            <KitText t="superS" color={roles.text}>{v.version}</KitText>
            {v.version === APP_VERSION && <Tag roles={roles} variant="you">{t('screens.thisVersion')}</Tag>}
          </View>
          <KitText t="title" color={roles.text}>{v.title}</KitText>
          <KitText t="tag" color={roles.textMuted}>{v.when.toUpperCase()}</KitText>
          <View style={styles.list}>
            {v.changes.map((c, i) => <KitText key={i} t="body" color={roles.text}>{`• ${c}`}</KitText>)}
          </View>
          <KitText t="tag" color={roles.textFaint}>{t('screens.from', { source: v.source })}</KitText>
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
