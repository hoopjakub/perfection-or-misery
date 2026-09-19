import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ROLES, space, border, font } from '@/theme'
import { KitScreen, KitText, BackControl } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'

// Privacy and Terms share one plain page (Phase 6). Written from what the code
// actually does (src/lib/auth.ts, src/db/queries, supabase/functions), so a
// change there means a change here.
const roles = ROLES.cotton
// Set EXPO_PUBLIC_CONTACT_EMAIL to show a contact line; until then there isn't one.
export const CONTACT = process.env.EXPO_PUBLIC_CONTACT_EMAIL
export const UPDATED = '19 September 2026'

export function LegalPage({ title, path, intro, sections }: {
  title: string; path: string; intro: string
  sections: { heading: string; body: string[] }[]
}) {
  return (
    <KitScreen ground="cotton">
      <PageMeta title={title} description={intro} path={path} />
      <BackControl roles={roles} />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>{title.toUpperCase()}</KitText>
      <KitText t="tag" color={roles.textMuted}>{`Last updated ${UPDATED}`}</KitText>
      <KitText t="bodyL" color={roles.text} style={styles.intro}>{intro}</KitText>
      {sections.map(s => (
        <View key={s.heading} style={[styles.block, { borderTopColor: roles.rule }]}>
          <KitText t="bodyL" color={roles.text} style={styles.heading} accessibilityRole="header">{s.heading}</KitText>
          {s.body.map((p, i) => <KitText key={i} t="body" color={roles.textMuted}>{p}</KitText>)}
        </View>
      ))}
      {CONTACT ? <KitText t="body" color={roles.text} style={styles.intro}>{`Questions: ${CONTACT}`}</KitText> : null}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[3] },
  intro: { marginTop: space[4], marginBottom: space[3], maxWidth: 560 },
  block: { borderTopWidth: border.hair, paddingVertical: space[4], gap: space[2], maxWidth: 560 },
  heading: { fontFamily: font.bodyBold },
})
