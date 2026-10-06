import React, { useState } from 'react'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { KitScreen, KitText, BackControl, Plate, Field } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { supabase } from '@/lib/supabase'
import { USERNAME_MAX } from '@/lib/auth'
import { checkName, isBadWord, refusalLine } from '@/lib/moderation'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8.5-44 · A new name after the moderator took the old one away
// (profiles.must_rename; the database lifts it once a name passes). Only the
// name others see changes: signing in still uses the name the account was
// made with, since that's what its sign-in address is built from
// (src/lib/auth.ts), and changing the address would ask for a confirmation
// this game's made-up addresses can't receive.
const roles = ROLES[EVERYDAY]

export default function RenameScreen() {
  const uid = useUserStore(s => s.user?.id ?? null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const next = name.trim()
    if (!uid || !next) return
    setSaving(true); setError(null)
    try {
      if ((await checkName(next)) === 'blocked') throw new Error('BAD_WORD')
      const db = supabase as any
      const { data: taken } = await db.from('profiles').select('id').ilike('username', next).neq('id', uid).maybeSingle()
      if (taken) { setError(t('auth.taken')); return }
      const { error: e } = await db.from('profiles').update({ username: next }).eq('id', uid)
      if (e) throw e
      await useUserStore.getState().fetchProfile()
      router.back()
    } catch (e) {
      log.warn('net', 'rename: failed', e)
      setError(isBadWord(e) ? refusalLine() : t('moderation.tryAgain'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('moderation.renamePageTitle')} path="/rename" />
      <BackControl roles={roles} title={t('moderation.renameTitle')} />
      <View style={styles.body}>
        <KitText color={roles.textMuted}>{t('moderation.renameLead')}</KitText>
        <Field roles={roles} label={t('auth.username')} value={name} onChangeText={v => { setName(v); setError(null) }} error={error ?? undefined}
          maxLength={USERNAME_MAX} autoCapitalize="none" autoCorrect={false} />
        <Plate roles={roles} label={t('moderation.saveName')} onPress={save} loading={saving} disabled={!name.trim()} missingStep={!name.trim() ? t('moderation.enterName') : undefined} />
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({ body: { gap: space[4], paddingTop: space[4] } })
