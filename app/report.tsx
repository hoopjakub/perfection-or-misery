import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, BackControl, Plate, Field, Chips, StripedNotice } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { report, REPORT_REASONS, isBanned, BANNED_TEXT, type ReportReason } from '@/lib/moderation'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8.5-44 · Report a player or a club, from its page. It goes to the
// moderator's inbox (app/moderation.tsx) with the reason; one report per
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
      console.warn('[report] failed:', e)
      setState('idle')
      setError(isBanned(e) ? BANNED_TEXT : "The report didn't go through. Try again.")
    }
  }

  const what = type === 'club' ? 'club' : 'player'
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Report" path="/report" />
      <BackControl roles={roles} title="REPORT" />
      <View style={styles.body}>
        <KitText t="bodyL" color={roles.text}>{name ? `Report ${name}` : `Report this ${what}`}</KitText>
        {state === 'sent' ? (
          <>
            <KitText color={roles.textMuted}>Thanks. It's with the moderator, who looks at every report.</KitText>
            <Plate roles={roles} label="Done" onPress={() => router.back()} />
          </>
        ) : isGuest ? (
          <StripedNotice roles={roles}>{`Make an account to report a ${what}. It keeps reports honest.`}</StripedNotice>
        ) : (
          <>
            <KitText color={roles.textMuted}>The moderator sees who reported it and why, never shown to the {what}.</KitText>
            <Chips roles={roles} label="What's wrong" options={REPORT_REASONS} value={reason} onChange={setReason} />
            <Field roles={roles} label="Anything to add (optional)" value={details} onChangeText={setDetails} maxLength={300} multiline />
            {error ? <KitText color={roles.lossText}>{error}</KitText> : null}
            <Plate roles={roles} label="Send the report" onPress={send} loading={state === 'sending'} />
          </>
        )}
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({ body: { gap: space[4], paddingTop: space[4] } })
