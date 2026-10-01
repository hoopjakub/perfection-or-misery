import React, { useCallback, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, StripedNotice, EmptyState, Loader, Tag } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { PlayerName } from '@/components/profile/ProfileParts'
import { ClubHeader, ClubForm } from '@/components/ClubParts'
import { fetchClub, fetchClubOf, joinClub, leaveClub, removeFromClub, updateClub, clubErrorText, ClubsUnavailable, type Club, type ClubMember } from '@/db/queries/clubs'
import { openConfirm } from '@/lib/confirm'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'

// P8-181: a club's page — its header, its members, and for a member the
// chat; for its owner, editing the club and removing a member. Anyone can see
// a club (they're public, like a profile); only members read its chat.
const roles = ROLES.cotton

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useUserStore(s => (s.isGuest ? null : s.user?.id ?? null))
  const [data, setData] = useState<{ club: Club; members: ClubMember[] } | null>(null)
  const [myClub, setMyClub] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unavailable' | 'failed'>('loading')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  if (state === 'loading') return <KitScreen ground="cotton"><BackControl roles={roles} /><Loader color={roles.text} /></KitScreen>
  if (state === 'unavailable') return <KitScreen ground="cotton"><BackControl roles={roles} /><StripedNotice roles={roles}>Clubs need the database set up first: run supabase/clubs.sql.</StripedNotice></KitScreen>
  if (state === 'failed') return <KitScreen ground="cotton"><BackControl roles={roles} /><StripedNotice roles={roles} failed>This club couldn't be loaded.</StripedNotice></KitScreen>
  if (state === 'missing' || !data) return <KitScreen ground="cotton"><BackControl roles={roles} /><EmptyState roles={roles} title="No such club" body="It may have closed: a club closes when its last member leaves." /></KitScreen>

  const { club, members } = data
  const isOwner = !!me && club.owner_id === me
  const isMember = myClub === club.id
  const full = club.member_limit != null && members.length >= club.member_limit

  return (
    <KitScreen ground="cotton">
      <PageMeta title={club.name} path={`/club/${club.id}`} />
      <BackControl roles={roles} />
      <View style={styles.top}><ClubHeader roles={roles} club={club} members={members.length} /></View>

      {isMember ? (
        <View style={styles.actions}>
          <Plate label="Chat" icon="press" roles={roles} onPress={() => router.push({ pathname: '/club/chat', params: { id: club.id } })} style={{ flex: 1 }} />
          <Plate label="Leave" variant="quiet" roles={roles} onPress={() => openConfirm({
            question: `Leave ${club.name}?`,
            consequence: isOwner
              ? (members.length > 1 ? 'The club passes to the member who has been in it longest. Your tag goes with you.' : "You're its last member, so the club closes.")
              : 'Your ID tag loses the club\'s tag. You can join again, if there\'s room.',
            confirmLabel: 'Leave the club', stayLabel: 'Stay', onConfirm: () => run(leaveClub),
          })} />
        </View>
      ) : me && !myClub ? (
        full ? <Tag roles={roles}>THE CLUB IS FULL</Tag>
          : <Plate label={`Join ${club.tag}`} icon="add" roles={roles} loading={busy} onPress={() => run(() => joinClub(club.id))} style={styles.join} />
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
  join: { marginBottom: space[2] },
  member: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
