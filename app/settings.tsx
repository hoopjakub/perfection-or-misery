import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { KitScreen, KitText, SectionTag, BackControl, ListRow, Toggle, Chips } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space } from '@/theme'
import { useSettingsStore, type AppearanceChoice, type LanguageChoice } from '@/store/settingsStore'
import { EVERYDAY, appearanceChangesGround, reloadForAppearance } from '@/lib/appearance'
import type { EuropeanTarget } from '@/store/settingsStore'
import { t, LANGUAGE_CHOOSABLE, SLOVAK_READY, languageChanges } from '@/i18n'

const TARGET_OPTIONS: { id: EuropeanTarget; label: string }[] = [
  { id: 'any', label: t('settings.targetAny') }, { id: 'ucl', label: t('settings.targetUcl') },
  { id: 'uel', label: t('settings.targetUel') }, { id: 'uecl', label: t('settings.targetUecl') },
]
const TARGET_NAME: Record<Exclude<EuropeanTarget, 'any'>, string> = { ucl: t('comp.uclShort'), uel: t('comp.uelShort'), uecl: t('comp.ueclShort') }

// P8-45 · Settings, a screen of its own instead of two switches on You. Every
// preference is in src/store/settingsStore.ts and kept on the device; every
// "you can turn it back on in Settings" line in the app points here. Reading
// happens on the everyday ground, like the You tab it opens from.
//
// Not here yet, on purpose: sound (the app has none). Light or dark is here
// since P8.5-25, the language since P8.5-28.
const roles = ROLES[EVERYDAY]

const APPEARANCE_OPTIONS: { id: AppearanceChoice; label: string }[] = [
  { id: 'system', label: t('settings.system') }, { id: 'dark', label: t('settings.dark') }, { id: 'light', label: t('settings.light') },
]
// A language is named in itself, whichever language the app is in.
const LANGUAGE_OPTIONS: { id: LanguageChoice; label: string }[] = [
  { id: 'system', label: t('settings.system') }, { id: 'en', label: 'English' }, { id: 'sk', label: 'Slovenčina' },
]

export default function SettingsScreen() {
  const s = useSettingsStore()
  // The ground and the language are decided at start-up (src/lib/appearance.ts,
  // src/i18n): a change reloads the app, and where it can't (a build without
  // expo-updates) the line under the chips says it waits for the next launch.
  const [pending, setPending] = useState(false)
  const [languagePending, setLanguagePending] = useState(false)
  const chooseAppearance = (a: AppearanceChoice) => {
    s.setAppearance(a)
    const changes = appearanceChangesGround(a)
    if (changes && reloadForAppearance()) return
    setPending(changes)
  }
  const chooseLanguage = (l: LanguageChoice) => {
    s.setLanguage(l)
    const changes = languageChanges(l)
    if (changes && reloadForAppearance()) return
    setLanguagePending(changes)
  }
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('settings.pageTitle')} path="/settings" />
      <BackControl roles={roles} title={t('settings.title')} />

      <SectionTag roles={roles}>{t('settings.appearance')}</SectionTag>
      <Chips roles={roles} label={t('settings.lightOrDark')} options={APPEARANCE_OPTIONS} value={s.appearance} onChange={chooseAppearance} />
      <KitText t="body" color={roles.textMuted} style={styles.note}>
        {pending ? t('settings.appearanceNext') : t('settings.appearanceNote')}
      </KitText>

      {/* P8.5-28 (S5): players see this once every line has its Slovak. */}
      {LANGUAGE_CHOOSABLE && (
        <>
          <SectionTag roles={roles}>{t('settings.language')}</SectionTag>
          <Chips roles={roles} label={t('settings.languageLabel')} options={LANGUAGE_OPTIONS} value={s.language} onChange={chooseLanguage} />
          <KitText t="body" color={roles.textMuted} style={styles.note}>
            {languagePending ? t('settings.languageNext') : SLOVAK_READY ? t('settings.languageNote') : t('settings.languageDraft')}
          </KitText>
        </>
      )}

      <SectionTag roles={roles}>{t('settings.questions')}</SectionTag>
      <ListRow roles={roles} label={t('settings.askSkip')}
        trailing={<Toggle roles={roles} label={t('settings.askSkip')} value={s.skipWarning} onChange={s.setSkipWarning} />} />
      <ListRow roles={roles} label={t('settings.askNoBench')}
        trailing={<Toggle roles={roles} label={t('settings.askNoBench')} value={s.noBenchWarning} onChange={s.setNoBenchWarning} />} />

      <SectionTag roles={roles}>{t('settings.motion')}</SectionTag>
      <ListRow roles={roles} label={t('settings.lessMotion')}
        trailing={<Toggle roles={roles} label={t('settings.lessMotion')} value={s.reduceMotion} onChange={s.setReduceMotion} />} />
      <KitText t="body" color={roles.textMuted} style={styles.note}>{t('settings.motionNote')}</KitText>

      {/* P8.5-27: a subcategory of its own; more hunting settings join it later. */}
      <SectionTag roles={roles}>{t('settings.hunting')}</SectionTag>
      <Chips roles={roles} label={t('settings.europeanTarget')} options={TARGET_OPTIONS} value={s.europeanTarget} onChange={s.setEuropeanTarget} />
      <KitText t="body" color={roles.textMuted} style={styles.note}>
        {s.europeanTarget === 'any' ? t('settings.targetAnyNote') : t('settings.targetNote', { competition: TARGET_NAME[s.europeanTarget] })}
      </KitText>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[4] },
  note: { marginTop: space[1], marginBottom: space[3] },
})
