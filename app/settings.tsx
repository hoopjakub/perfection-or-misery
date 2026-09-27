import React from 'react'
import { StyleSheet } from 'react-native'
import { KitScreen, KitText, SectionTag, BackControl, ListRow, Toggle } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space } from '@/theme'
import { useSettingsStore } from '@/store/settingsStore'

// P8-45 · Settings, a screen of its own instead of two switches on You. Every
// preference is in src/store/settingsStore.ts and kept on the device; every
// "you can turn it back on in Settings" line in the app points here. Reading
// happens on cotton, like the You tab it opens from.
//
// Not here yet, on purpose: sound (the app has none) and light or dark
// (P8-65's question isn't decided). Each gets a row when it exists.
const roles = ROLES.cotton

export default function SettingsScreen() {
  const s = useSettingsStore()
  return (
    <KitScreen ground="cotton">
      <PageMeta title="Settings" path="/settings" />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>SETTINGS</KitText>

      <SectionTag roles={roles}>Questions before you act</SectionTag>
      <ListRow roles={roles} label="Ask before skipping ahead"
        trailing={<Toggle roles={roles} label="Ask before skipping ahead" value={s.skipWarning} onChange={s.setSkipWarning} />} />
      <ListRow roles={roles} label="Ask before playing without a bench"
        trailing={<Toggle roles={roles} label="Ask before playing without a bench" value={s.noBenchWarning} onChange={s.setNoBenchWarning} />} />

      <SectionTag roles={roles}>Motion and feel</SectionTag>
      <ListRow roles={roles} label="Less motion"
        trailing={<Toggle roles={roles} label="Less motion" value={s.reduceMotion} onChange={s.setReduceMotion} />} />
      <KitText t="body" color={roles.textMuted} style={styles.note}>
        The spins, stamps and swings play still. If your phone asks for less motion, the app always follows it.
      </KitText>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[4] },
  note: { marginTop: space[1], marginBottom: space[3] },
})
