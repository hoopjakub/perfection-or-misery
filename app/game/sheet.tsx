import { t } from '@/i18n'
import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, BackControl, EmptyState } from '@/components/kit'
import { takeSheet } from '@/lib/sheet'
import { EVERYDAY } from '@/lib/appearance'

// The page behind `openSheet` (src/lib/sheet.ts): a title and whatever view the
// caller handed over. Replaces the group, league-table and leagues-browser modals.
const roles = ROLES[EVERYDAY]

export default function SheetScreen() {
  const [sheet] = useState(takeSheet)
  return (
    <KitScreen ground={EVERYDAY}>
      <BackControl roles={roles} />
      {sheet ? (
        <>
          <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>{sheet.title.toUpperCase()}</KitText>
          {sheet.sub ? <KitText t="tag" color={roles.textMuted} style={styles.sub}>{sheet.sub}</KitText> : null}
          {sheet.render()}
        </>
      ) : (
        <EmptyState roles={roles} title={t('rules.nothing')} body={t('rules.nothingBody')} />
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[3] },
  sub: { marginTop: space[1], marginBottom: space[3] },
})
