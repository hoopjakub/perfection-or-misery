import React, { useCallback, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, StripedNotice, EmptyState, Loader, Tag, Field, Chips, ListRow, Toggle } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { PlayerName } from '@/components/profile/ProfileParts'
import { ClubHeader, ClubForm } from '@/components/ClubParts'
import {
  fetchClub, fetchClubOf, joinClub, leaveClub, removeFromClub, updateClub, clubErrorText, ClubsUnavailable,
  deleteClub, transferClub, setClubAccess, inviteToClub, setCleanChat, type Club, type ClubMember, type ClubAccess,
} from '@/db/queries/clubs'
import { openConfirm } from '@/lib/confirm'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-181: a club's page — its header, its members, and for a member the
// chat; for its owner, editing the club and removing a member. P8.5-05/-08/-10
// (supabase/clubs-2.sql): the owner also sets the way in (open, invite-only or
// a password) and invites by username, turns the swear filter on or off,
// hands the club over (staying, or leaving and choosing who takes it), and can
// close it; a password club asks for its password to join. Anyone can see
// a club (they're public, like a profile); only members read its chat.
const roles = ROLES[EVERYDAY]

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useUserStore(s => (s.isGuest ? null : s.user?.id ?? null))
  const [data, setData] = useState<{ club: Club; members: ClubMember[] } | null>(null)
  const [myClub, setMyClub] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unavailable' | 'failed'>('loading')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [access, setAccess] = useState<ClubAccess | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [invitee, setInvitee] = useState('')
  const [heir, setHeir] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, mine] = await Promise.all([fetchClub(id), me ? fetchClubOf(me) : Promise.resolve(null)])
      setData(d); setMyClub(mine?.id ?? null)
      setState(d ? 'ready' : 'missing')
    } catch (e) {
      console.warn('[club] load failed:', e)
      setState(e instanceof ClubsUnavailable ? 'unavailable' : 'failed')
    }
  }, [id, me])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const refreshTag = () => useUserStore.getState().fetchProfile()
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn(); refreshTag(); await load() } catch (e) { setError(clubErrorText(e)) } finally { setBusy(false) }
  }

  if (state === 'loading') return <KitScreen ground={EVERYDAY}><BackControl roles={roles} /><Loader color={roles.text} /></KitScreen>
  if (state === 'unavailable') return <KitScreen ground={EVERYDAY}><BackControl roles={roles} /><StripedNotice roles={roles}>Clubs need the database set up first: run supabase/clubs.sql.</StripedNotice></KitScreen>
  if (state === 'failed') return <KitScreen ground={EVERYDAY}><BackControl roles={roles} /><StripedNotice roles={roles} failed>This club couldn't be loaded.</StripedNotice></KitScreen>
  if (state === 'missing' || !data) return <KitScreen ground={EVERYDAY}><BackControl roles={roles} /><EmptyState roles={roles} title="No such club" body="It may have closed: a club closes when its last member leaves." /></KitScreen>

  const { club, members } = data
  const isOwner = !!me && club.owner_id === me
  const isMember = myClub === club.id
  const full = club.member_limit != null && members.length >= club.member_limit
  const way: ClubAccess = club.access ?? 'open'
  const others = members.filter(m => m.user_id !== me)
  const heirId = heir ?? others[0]?.user_id ?? null
  const heirName = others.find(m => m.user_id === heirId)?.username ?? 'them'

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={club.name} path={`/club/${club.id}`} />
      <BackControl roles={roles} />
      <View style={styles.top}><ClubHeader roles={roles} club={club} members={members.length} /></View>

      {isMember ? (
        <View style={styles.actions}>
          <Plate label="Chat" icon="press" roles={roles} onPress={() => router.push({ pathname: '/club/chat', params: { id: club.id } })} style={{ flex: 1 }} />
          <Plate label="Leave" variant="quiet" roles={roles} onPress={() => openConfirm({
            question: `Leave ${club.name}?`,
            consequence: isOwner
              ? (members.length > 1 ? `The club passes to ${heirName} (choose someone else under "Hand it over"). Your tag goes with you.` : "You're its last member, so the club closes.")
              : 'Your ID tag loses the club\'s tag. You can join again, if there\'s room.',
            confirmLabel: 'Leave the club', stayLabel: 'Stay', onConfirm: () => run(() => leaveClub(isOwner ? heirId : null)),
          })} />
        </View>
      ) : me && !myClub ? (
        full ? <Tag roles={roles}>THE CLUB IS FULL</Tag>
          : way === 'invite' ? (
            <KitText t="body" color={roles.textMuted}>Invite-only: its owner has to invite you. An invite shows on your Clubs tab.</KitText>
          ) : (
            <View style={styles.join}>
              {way === 'password' && (
                <Field roles={roles} label="The club's password" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoCorrect={false} />
              )}
              <Plate label={`Join ${club.tag}`} icon="add" roles={roles} loading={busy} disabled={way === 'password' && !password}
                onPress={() => run(() => joinClub(club.id, way === 'password' ? password : undefined))} />
            </View>
          )
      ) : me && myClub ? (
        <KitText t="body" color={roles.textMuted}>You're in another club. Leave it to join this one.</KitText>
      ) : null}
      {error ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}

      {isOwner && (
        <>
          <SectionTag roles={roles}>Your club</SectionTag>
          {editing ? (
            <ClubForm roles={roles} initial={club} submitLabel="Save the club" error={error}
              onSubmit={async input => { await run(() => updateClub(input)); setEditing(false) }} />
          ) : (
            <Plate label="Edit the club" icon="settings" variant="secondary" roles={roles} onPress={() => setEditing(true)} />
          )}

          <SectionTag roles={roles}>Who can join</SectionTag>
          <Chips<ClubAccess> roles={roles} value={access ?? way} onChange={setAccess}
            options={[{ id: 'open', label: 'Anyone' }, { id: 'invite', label: 'Invite only' }, { id: 'password', label: 'Password' }]} />
          {(access ?? way) === 'password' && (
            <Field roles={roles} label={way === 'password' ? 'A new password (4 to 64)' : 'Password (4 to 64)'} value={newPassword} onChangeText={setNewPassword} secure autoCapitalize="none" autoCorrect={false} />
          )}
          {access && (access !== way || access === 'password') && (
            <Plate label="Save who can join" icon="check" variant="secondary" roles={roles} loading={busy}
              disabled={access === 'password' && newPassword.length < 4}
              onPress={() => run(async () => { await setClubAccess(access, access === 'password' ? newPassword : undefined); setNewPassword(''); setAccess(null) })} />
          )}
          {way !== 'open' && (
            <View style={styles.invite}>
              <Field roles={roles} label="Invite a player by username" value={invitee} onChangeText={setInvitee} autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} />
              <Plate label="Invite" variant="secondary" roles={roles} disabled={!invitee.trim()} loading={busy}
                onPress={() => run(async () => { await inviteToClub(invitee.trim()); setNote(`Invited ${invitee.trim()}.`); setInvitee('') })} />
            </View>
          )}
          {note ? <KitText t="body" color={roles.textMuted}>{note}</KitText> : null}

          <SectionTag roles={roles}>The chat</SectionTag>
          <ListRow roles={roles} label="Clean language" sub="Swearing is swapped for something politer. Turn it off for close friends."
            trailing={<Toggle roles={roles} label="Clean language" value={club.clean_chat ?? true} onChange={v => run(() => setCleanChat(v))} />} />

          {others.length > 0 && (
            <>
              <SectionTag roles={roles}>Hand it over</SectionTag>
              <Chips<string> roles={roles} label="To" value={heirId ?? ''} onChange={setHeir}
                options={others.map(m => ({ id: m.user_id, label: m.username ?? 'Player' }))} />
              <Plate label={`Make ${heirName} the owner`} variant="secondary" roles={roles} onPress={() => openConfirm({
                question: `Hand ${club.name} to ${heirName}?`, consequence: 'They own it from now on; you stay in it as a member.',
                confirmLabel: 'Hand it over', stayLabel: 'Keep it', onConfirm: () => run(() => transferClub(heirId!)),
              })} />
            </>
          )}

          <SectionTag roles={roles}>Close the club</SectionTag>
          <Plate label="Delete the club" icon="delete" variant="quiet" roles={roles} onPress={() => openConfirm({
            question: `Delete ${club.name}?`, consequence: "Everyone leaves it and loses its tag, and its chat goes. This can't be undone.",
            confirmLabel: 'Delete the club', stayLabel: 'Keep it', onConfirm: () => run(async () => { await deleteClub(); router.replace('/clubs') }),
          })} />
        </>
      )}

      <SectionTag roles={roles}>{`Members · ${members.length}${club.member_limit ? ` of ${club.member_limit}` : ''}`}</SectionTag>
      {members.map(m => (
        <View key={m.user_id} style={styles.member}>
          <PlayerName roles={roles} name={m.username ?? 'Player'} avatarPath={m.avatar_path} style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/u/[id]', params: { id: m.user_id } })} />
          {m.role === 'owner' ? <Tag roles={roles} variant="selected">OWNER</Tag> : null}
          {isOwner && m.user_id !== me ? (
            <Plate label="Remove" variant="quiet" roles={roles} onPress={() => openConfirm({
              question: `Remove ${m.username ?? 'this player'}?`, consequence: 'They lose the club\'s tag and its chat. They can join again, if there\'s room.',
              confirmLabel: 'Remove', stayLabel: 'Keep', onConfirm: () => run(() => removeFromClub(m.user_id)),
            })} />
          ) : null}
        </View>
      ))}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  top: { marginTop: space[2], marginBottom: space[3] },
  actions: { flexDirection: 'row', gap: space[2], marginBottom: space[2] },
  join: { marginBottom: space[2], gap: space[2] },
  invite: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  member: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
