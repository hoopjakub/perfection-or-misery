import React, { useState } from 'react'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { View, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, BackControl, Plate, Field, Chips, StripedNotice } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { report, REPORT_REASONS, isBanned, bannedText, type ReportReason } from '@/lib/moderation'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8.5-44 · Report a player or a club, from its page. It goes to the
// moderator's inbox (the website's, docs/website/02 §5a) with the reason; one report per
// player per thing, so reporting twice doesn't count twice.
const roles = ROLES[EVERYDAY]

export default function ReportScreen() {
  const { type, id, name } = useLocalSearchParams<{ type: 'player' | 'club'; id: string; name?: string }>()
  const isGuest = useUserStore(s => s.isGuest)
  const [reason, setReason] = useState<ReportReason>('name')
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setState('sending'); setError(null)
    try { await report(type, id, reason, details); setState('sent') }
    catch (e) {
      log.warn('net', 'report: failed', e)
      setState('idle')
      setError(isBanned(e) ? bannedText() : t('moderation.reportFailed'))
    }
  }

  const club = type === 'club'
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('moderation.reportPageTitle')} path="/report" />
      <BackControl roles={roles} title={t('moderation.reportTitle')} />
      <View style={styles.body}>
        <KitText t="bodyL" color={roles.text}>{name ? t('moderation.reportNamed', { name }) : club ? t('moderation.reportClub') : t('moderation.reportPlayer')}</KitText>
        {state === 'sent' ? (
          <>
            <KitText color={roles.textMuted}>{t('moderation.reportThanks')}</KitText>
            <Plate roles={roles} label={t('moderation.done')} onPress={() => router.back()} />
          </>
        ) : isGuest ? (
          <StripedNotice roles={roles}>{club ? t('moderation.reportGuestClub') : t('moderation.reportGuestPlayer')}</StripedNotice>
        ) : (
          <>
            <KitText color={roles.textMuted}>{club ? t('moderation.reportPrivateClub') : t('moderation.reportPrivatePlayer')}</KitText>
            <Chips roles={roles} label={t('moderation.whatsWrong')} options={REPORT_REASONS} value={reason} onChange={setReason} />
            <Field roles={roles} label={t('moderation.anythingToAdd')} value={details} onChangeText={setDetails} maxLength={300} multiline />
            {error ? <KitText color={roles.lossText}>{error}</KitText> : null}
            <Plate roles={roles} label={t('moderation.send')} onPress={send} loading={state === 'sending'} />
          </>
        )}
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({ body: { gap: space[4], paddingTop: space[4] } })
