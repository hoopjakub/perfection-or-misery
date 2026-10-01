import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, BackControl, Plate, StripedNotice, Loader } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { Avatar } from '@/components/profile/ProfileParts'
import { ClubTag } from '@/components/ClubParts'
import {
  fetchClub, fetchMessages, sendMessage, deleteMessage, subscribeMessages, clubErrorText, ClubsUnavailable, CLUB_LIMITS,
  type Club, type ClubMember, type ClubMessage,
} from '@/db/queries/clubs'
import { openConfirm } from '@/lib/confirm'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border, font } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-181: the club's chat. The latest fifty messages, then each new one as
// it's written (Realtime, members only by the database's own rule). Yours on
// the right in orange; everyone else's on the left under their name. Hold one
// of yours to delete it; the owner can delete any.
const roles = ROLES[EVERYDAY]
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()

export default function ClubChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useUserStore(s => (s.isGuest ? null : s.user?.id ?? null))
  const [club, setClub] = useState<Club | null>(null)
  const [members, setMembers] = useState<Map<string, ClubMember>>(new Map())
  const [messages, setMessages] = useState<ClubMessage[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'failed' | 'outside'>('loading')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const list = useRef<FlatList<ClubMessage>>(null)

  const load = useCallback(async () => {
    try {
      const d = await fetchClub(id)
      if (!d) { setState('failed'); return }
      setClub(d.club)
      setMembers(new Map(d.members.map(m => [m.user_id, m])))
      if (!me || !d.members.some(m => m.user_id === me)) { setState('outside'); return }
      setMessages(await fetchMessages(id))
      setState('ready')
    } catch (e) {
      console.warn('[chat] load failed:', e)
      setState(e instanceof ClubsUnavailable ? 'unavailable' : 'failed')
    }
  }, [id, me])
  useEffect(() => { load() }, [load])

  // New messages as they're written; a deleted one goes.
  useEffect(() => {
    if (state !== 'ready') return
    return subscribeMessages(id,
      m => setMessages(ms => (ms.some(x => x.id === m.id) ? ms : [...ms, m])),
      gone => setMessages(ms => ms.filter(x => x.id !== gone)))
  }, [id, state])

  // Down to the newest whenever one arrives.
  useEffect(() => { if (messages.length) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50) }, [messages.length])

  async function send() {
    if (!me || !draft.trim()) return
    const body = draft
    setDraft(''); setError(null)
    try { await sendMessage(id, me, body) } catch (e) { setDraft(body); setError(clubErrorText(e)) }
  }

  const isOwner = !!me && club?.owner_id === me
  return (
    <KitScreen ground={EVERYDAY} scroll={false} contentStyle={styles.screen}>
      <PageMeta title={club ? `${club.name} · chat` : 'Club chat'} path={`/club/chat`} />
      <BackControl roles={roles} />
      {club && (
        <View style={[styles.head, { borderBottomColor: roles.line }]}>
          <ClubTag tag={club.tag} colour={club.colour} />
          <KitText t="title" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{club.name}</KitText>
          <KitText t="tag" color={roles.textMuted}>{`${members.size} IN`}</KitText>
        </View>
      )}
      {state === 'loading' && <Loader color={roles.text} />}
      {state === 'unavailable' && <StripedNotice roles={roles}>Clubs need the database set up first: run supabase/clubs.sql.</StripedNotice>}
      {state === 'failed' && <StripedNotice roles={roles} failed>The chat couldn't be loaded.</StripedNotice>}
      {state === 'outside' && <StripedNotice roles={roles}>The chat is for the club's members. Join the club to read it.</StripedNotice>}
      {state === 'ready' && (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={list}
            style={styles.fill}
            data={messages}
            keyExtractor={m => String(m.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<KitText t="body" color={roles.textMuted}>Nothing said yet. Say the first thing.</KitText>}
            renderItem={({ item, index }) => {
              const mine = item.user_id === me
              const who = members.get(item.user_id)
              const prev = messages[index - 1]
              const newDay = !prev || day(prev.created_at) !== day(item.created_at)
              const sameRun = !!prev && !newDay && prev.user_id === item.user_id
              return (
                <View>
                  {newDay && <KitText t="tag" color={roles.textMuted} style={styles.day}>{day(item.created_at)}</KitText>}
                  <Pressable
                    onLongPress={mine || isOwner ? () => openConfirm({
                      question: 'Delete this message?', consequence: 'It goes for everyone in the club.',
                      confirmLabel: 'Delete', stayLabel: 'Keep', onConfirm: () => deleteMessage(item.id).catch(e => setError(clubErrorText(e))),
                    }) : undefined}
                    accessibilityLabel={`${mine ? 'You' : who?.username ?? 'A member'} at ${hhmm(item.created_at)}: ${item.body}`}
                    style={[styles.msgRow, mine && styles.msgRowMine]}>
                    {!mine && !sameRun ? <Avatar roles={roles} path={who?.avatar_path} name={who?.username ?? '?'} size={24} /> : !mine ? <View style={{ width: 24 }} /> : null}
                    <View style={[styles.bubble, { borderColor: mine ? roles.you : roles.line, backgroundColor: mine ? roles.yours : roles.surface }]}>
                      {!mine && !sameRun ? <KitText t="tag" color={roles.textMuted}>{(who?.username ?? 'A member').toUpperCase()}</KitText> : null}
                      <KitText t="body" color={roles.text}>{item.body}</KitText>
                      <KitText t="tag" color={roles.textMuted} style={styles.time}>{hhmm(item.created_at)}</KitText>
                    </View>
                  </Pressable>
                </View>
              )
            }}
          />
          {error ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}
          <View style={[styles.bar, { borderTopColor: roles.line }]}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Say something to the club" placeholderTextColor={roles.textFaint}
              maxLength={CLUB_LIMITS.message} multiline accessibilityLabel="Your message"
              style={[styles.input, { color: roles.text, borderColor: roles.line, fontFamily: font.body }]} />
            <Plate label="Send" icon="forward" roles={roles} disabled={!draft.trim()} onPress={send} />
          </View>
        </KeyboardAvoidingView>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], borderBottomWidth: border.thin },
  list: { gap: space[1], paddingVertical: space[3] },
  day: { alignSelf: 'center', marginVertical: space[2] },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[1], maxWidth: '100%' },
  msgRowMine: { justifyContent: 'flex-end' },
  bubble: { borderWidth: border.thin, paddingHorizontal: space[2], paddingVertical: 4, maxWidth: '80%', gap: 1 },
  time: { alignSelf: 'flex-end' },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingTop: space[2], borderTopWidth: border.thin },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: border.thin, paddingHorizontal: space[2], paddingVertical: space[1], fontSize: 16 },
})
