import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { KitScreen, KitText, SectionTag, BackControl, ListRow, Toggle, Chips } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space } from '@/theme'
import { useSettingsStore, type AppearanceChoice } from '@/store/settingsStore'
import { EVERYDAY, appearanceChangesGround, reloadForAppearance } from '@/lib/appearance'
import type { EuropeanTarget } from '@/store/settingsStore'

const TARGET_OPTIONS: { id: EuropeanTarget; label: string }[] = [
  { id: 'any', label: 'Wherever it leads' }, { id: 'ucl', label: 'Champions' }, { id: 'uel', label: 'Europa' }, { id: 'uecl', label: 'Conference' },
]
const TARGET_NAME: Record<Exclude<EuropeanTarget, 'any'>, string> = { ucl: 'Champions League', uel: 'Europa League', uecl: 'Conference League' }

// P8-45 · Settings, a screen of its own instead of two switches on You. Every
// preference is in src/store/settingsStore.ts and kept on the device; every
// "you can turn it back on in Settings" line in the app points here. Reading
// happens on the everyday ground, like the You tab it opens from.
//
// Not here yet, on purpose: sound (the app has none). Light or dark is here
// since P8.5-25.
const roles = ROLES[EVERYDAY]

const APPEARANCE_OPTIONS: { id: AppearanceChoice; label: string }[] = [
  { id: 'system', label: 'System' }, { id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' },
]

export default function SettingsScreen() {
  const s = useSettingsStore()
  // The ground is decided at start-up (src/lib/appearance.ts): on the phone a
  // new choice shows from the next launch, and the line under the chips says so.
  const [pending, setPending] = useState(false)
  const chooseAppearance = (a: AppearanceChoice) => {
    s.setAppearance(a)
    const changes = appearanceChangesGround(a)
    if (changes && reloadForAppearance()) return
    setPending(changes)
  }
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Settings" path="/settings" />
      <BackControl roles={roles} title="SETTINGS" />

      <SectionTag roles={roles}>Appearance</SectionTag>
      <Chips roles={roles} label="Light or dark" options={APPEARANCE_OPTIONS} value={s.appearance} onChange={chooseAppearance} />
      <KitText t="body" color={roles.textMuted} style={styles.note}>
        {pending
          ? 'Changes the next time you open the app.'
          : 'System follows your phone. The match pitch stays under the floodlights either way.'}
      </KitText>

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

      {/* P8.5-27: a subcategory of its own; more hunting settings join it later. */}
      <SectionTag roles={roles}>Achievement hunting</SectionTag>
      <Chips roles={roles} label="European target" options={TARGET_OPTIONS} value={s.europeanTarget} onChange={s.setEuropeanTarget} />
      <KitText t="body" color={roles.textMuted} style={styles.note}>
        {s.europeanTarget === 'any'
          ? 'European Full Path: your season decides which competition you play in, as always.'
          : `European Full Path: the draw favours the leagues where a season most often ends in the ${TARGET_NAME[s.europeanTarget]}, and the season plays as normal. End it there and the run counts as a hunt (a little fewer points, its own board); miss it and it's a normal run. Starts with your next run.`}
      </KitText>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[4] },
  note: { marginTop: space[1], marginBottom: space[3] },
})
