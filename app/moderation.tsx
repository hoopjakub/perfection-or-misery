import React, { useCallback, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitScreen, KitText, BackControl, Plate, Tag, StripedNotice, EmptyState, Loader } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { fetchInbox, actOnFlag, REPORT_REASONS, type Flag, type FlagAction } from '@/lib/moderation'
import { openConfirm } from '@/lib/confirm'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8.5-44 · The moderator's inbox: names the filter wasn't sure about
// ("IslamHater2121") and everything players reported, most-reported first.
// Only a profile with is_admin sees the way in (the You tab), and the
// database refuses everyone else whatever they open (mod_inbox, mod_act).
const roles = ROLES[EVERYDAY]

const reasonLabel = (r: string) => REPORT_REASONS.find(x => x.id === r)?.label ?? (r === 'profile' ? 'Something on their profile' : r)
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// What each action does, said before it's done: all but Let it be are final.
const ACTIONS: Record<Flag['target_type'], { id: FlagAction; label: string; consequence: string }[]> = {
  player: [
    { id: 'rename', label: 'Take the name', consequence: 'Their name becomes a placeholder and they have to pick a new one.' },
    { id: 'ban', label: 'Ban', consequence: "They lose their name and club, and can't save runs, chat or report again." },
  ],
  club: [
    { id: 'rename', label: 'Take the name', consequence: 'The club gets a placeholder name and loses its description.' },
    { id: 'close', label: 'Close the club', consequence: 'Everyone leaves it and its chat goes.' },
  ],
  message: [],
}

export default function ModerationScreen() {
  const isAdmin = useUserStore(s => !!s.profile?.is_admin)
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetchInbox().then(setFlags).catch(e => { console.warn('[moderation] inbox failed:', e); setError("The inbox couldn't be loaded. Has supabase/moderation.sql run?") })
  }, [])
  useFocusEffect(load)

  const act = (f: Flag, a: FlagAction) =>
    actOnFlag(f.id, a).then(() => setFlags(v => v?.filter(x => x.id !== f.id) ?? null)).catch(e => { console.warn('[moderation] act failed:', e); setError("That didn't go through. Try again.") })

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Moderation" path="/moderation" />
      <BackControl roles={roles} title="INBOX" />
      {!isAdmin ? (
        <EmptyState roles={roles} title="Not for this account" body="Only the moderator's account sees the inbox." />
      ) : error ? (
        <StripedNotice roles={roles} failed>{error}</StripedNotice>
      ) : !flags ? (
        <Loader color={roles.text} />
      ) : flags.length === 0 ? (
        <EmptyState roles={roles} title="Nothing waiting" body="Every name and report has been looked at." />
      ) : (
        <View style={styles.list}>
          {flags.map(f => (
            <View key={f.id} style={[styles.card, { borderColor: roles.rule }]}>
              <View style={styles.tags}>
                <Tag roles={roles}>{f.target_type.toUpperCase()}</Tag>
                <Tag roles={roles} variant={f.source === 'report' ? 'selected' : 'data'}>{f.source === 'report' ? `${f.reports} REPORT${f.reports === 1 ? '' : 'S'}` : 'FILTER UNSURE'}</Tag>
                <KitText t="tag" color={roles.textMuted}>{when(f.created_at)}</KitText>
              </View>
              <KitText t="bodyL" color={roles.text}>{f.text ?? '(no text)'}</KitText>
              <KitText color={roles.textMuted}>{reasonLabel(f.reason)}</KitText>
              {f.details.map((d, i) => <KitText key={i} color={roles.textMuted}>{`· ${d}`}</KitText>)}
              <View style={styles.actions}>
                {f.target_type !== 'message' && (
                  <Plate label="Open" variant="quiet" roles={roles}
                    onPress={() => router.push(f.target_type === 'player' ? { pathname: '/u/[id]', params: { id: f.target_id } } : { pathname: '/club/[id]', params: { id: f.target_id } })} />
                )}
                <Plate label="Let it be" variant="secondary" roles={roles} onPress={() => act(f, 'dismiss')} />
                {ACTIONS[f.target_type].map(a => (
                  <Plate key={a.id} label={a.label} variant={a.id === 'ban' || a.id === 'close' ? 'destructive' : 'secondary'} roles={roles}
                    onPress={() => openConfirm({ question: `${a.label}: ${f.text ?? 'this'}?`, consequence: a.consequence, confirmLabel: a.label, stayLabel: 'Back', onConfirm: () => act(f, a.id) })} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  list: { gap: space[3], paddingTop: space[3] },
  card: { borderWidth: border.hair, padding: space[3], gap: space[2] },
  tags: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
})
