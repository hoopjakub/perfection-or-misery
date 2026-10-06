import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ROLES, space, border, font } from '@/theme'
import { KitScreen, KitText, BackControl, H2 } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { EVERYDAY } from '@/lib/appearance'
import { legalDoc, UPDATED, updatedOn, CONTACT, type LegalPageId, type LegalLang } from '@/data/legal'
import { t, LANGUAGE } from '@/i18n'

// Privacy and Terms share one plain page (Phase 6). The words live in one file
// (src/data/legal.ts, P8.5-29), which the website uses too.
const roles = ROLES[EVERYDAY]
export { CONTACT, UPDATED }

export function LegalPage({ page, path, lang = LANGUAGE }: { page: LegalPageId; path: string; lang?: LegalLang }) {
  const { doc } = legalDoc(page, lang)
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={doc.title} description={doc.intro} path={path} />
      <BackControl roles={roles} title={doc.title} />
      <KitText t="tag" color={roles.textMuted}>{t('common.lastUpdated', { date: updatedOn(lang) })}</KitText>
      <KitText t="bodyL" color={roles.text} style={styles.intro}>{doc.intro}</KitText>
      {doc.sections.map(s => (
        <View key={s.heading} style={[styles.block, { borderTopColor: roles.rule }]}>
          <KitText t="bodyL" color={roles.text} style={styles.heading} accessibilityRole="header" {...H2}>{s.heading}</KitText>
          {s.body.map((p, i) => <KitText key={i} t="body" color={roles.textMuted}>{p}</KitText>)}
        </View>
      ))}
      <KitText t="body" color={roles.text} style={styles.intro}>{t('common.questions', { contact: CONTACT })}</KitText>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  intro: { marginTop: space[4], marginBottom: space[3], maxWidth: 560 },
  block: { borderTopWidth: border.hair, paddingVertical: space[4], gap: space[2], maxWidth: 560 },
  heading: { fontFamily: font.bodyBold },
})
