import React, { useCallback, useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitText, SectionTag, Plate, StripedNotice, EmptyState, Loader, Tag, Field, Chips, ListRow } from '@/components/kit'
import { PlayerName } from '@/components/profile/ProfileParts'
import { ClubHeader, ClubForm } from '@/components/ClubParts'
import {
  fetchClub, fetchClubOf, joinClub, leaveClub, removeFromClub, updateClub, clubErrorText, ClubsUnavailable,
  deleteClub, transferClub, inviteToClub, fetchClubScores, type Club, type ClubMember, type ClubAccess,
} from '@/db/queries/clubs'
import { searchPlayers } from '@/lib/friends'
import { trackWork } from '@/lib/navGuard'
import { openConfirm } from '@/lib/confirm'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-181: a club, as its page shows it: its header, its members, and for a
// member the chat; for its owner, editing the club and removing a member.
// P8.5-05/-08/-10 (supabase/clubs-2.sql) gave the owner the way in (open,
// invite-only or a password), the chat's clean language, handing the club over
// and closing it; a password club asks for its password to join.
//
// P8.5-45 (the Wave C playtest): one view for the club's own page and the
// Clubs tab, which IS your club when you're in one (it opened a second page
// before, which "looks weird"). Who can join, the chat and closing the club
// all live in Edit the club, and Delete is red. Invites suggest players after
// three letters, half a second after the last key. An error clears as soon as
// you change what caused it, and loading shows the bar at the top.
const roles = ROLES[EVERYDAY]
const SUGGEST_AFTER = 3, SUGGEST_MS = 500

export function ClubView({ id, onLeft }: {
  id: string
  /** You left or closed the club (the Clubs tab goes back to joining one). */
  onLeft?: () => void
}) {
  const me = useUserStore(s => (s.isGuest ? null : s.user?.id ?? null))
  const [data, setData] = useState<{ club: Club; members: ClubMember[] } | null>(null)
  const [score, setScore] = useState<{ score: number; runs: number } | null>(null)
  const [myClub, setMyClub] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unavailable' | 'failed'>('loading')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [heir, setHeir] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, mine] = await trackWork(Promise.all([fetchClub(id), me ? fetchClubOf(me) : Promise.resolve(null)]))
      setData(d); setMyClub(mine?.id ?? null)
      setState(d ? 'ready' : 'missing')
      if (d) fetchClubScores([d.club.id]).then(m => setScore(m.get(d.club.id) ?? null)).catch(() => {})
    } catch (e) {
      console.warn('[club] load failed:', e)
      setState(e instanceof ClubsUnavailable ? 'unavailable' : 'failed')
    }
  }, [id, me])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const refreshTag = () => useUserStore.getState().fetchProfile()
  // Whether it went through, so a field can say "Invited" only when it did.
  const run = async (fn: () => Promise<void>, after?: () => void): Promise<boolean> => {
    setBusy(true); setError(null)
    try { await trackWork(fn()); refreshTag(); after?.(); await load(); return true }
    catch (e) { setError(clubErrorText(e)); return false }
    finally { setBusy(false) }
  }

  if (state === 'loading') return <Loader color={roles.text} />
  if (state === 'unavailable') return <StripedNotice roles={roles}>Clubs need the database set up first: run supabase/clubs.sql.</StripedNotice>
  if (state === 'failed') return <StripedNotice roles={roles} failed>This club couldn't be loaded.</StripedNotice>
  if (state === 'missing' || !data) return <EmptyState roles={roles} title="No such club" body="It may have closed: a club closes when its last member leaves." />

  const { club, members } = data
  const isOwner = !!me && club.owner_id === me
  const isMember = myClub === club.id
  const full = club.member_limit != null && members.length >= club.member_limit
  const way: ClubAccess = club.access ?? 'open'
  const others = members.filter(m => m.user_id !== me)
  const heirId = heir ?? others[0]?.user_id ?? null
  const heirName = others.find(m => m.user_id === heirId)?.username ?? 'them'

  return (
    <>
      <View style={styles.top}><ClubHeader roles={roles} club={club} members={members.length} score={score} /></View>

      {isMember ? (
        <View style={styles.actions}>
          <Plate label="Chat" icon="press" roles={roles} onPress={() => router.push({ pathname: '/club/chat', params: { id: club.id } })} style={{ flex: 1 }} />
          <Plate label="Leave" variant="quiet" roles={roles} onPress={() => openConfirm({
            question: `Leave ${club.name}?`,
            consequence: isOwner
              ? (members.length > 1 ? `The club passes to ${heirName} (choose someone else in Edit the club, under Hand it over). Your tag goes with you.` : "You're its last member, so the club closes.")
              : 'Your ID tag loses the club\'s tag. You can join again, if there\'s room.',
            confirmLabel: 'Leave the club', stayLabel: 'Stay', onConfirm: () => run(() => leaveClub(isOwner ? heirId : null), onLeft),
          })} />
        </View>
      ) : me && !myClub ? (
        full ? <Tag roles={roles}>THE CLUB IS FULL</Tag>
          : way === 'invite' ? (
            <KitText t="body" color={roles.textMuted}>Invite-only: its owner has to invite you. An invite shows on your Clubs tab.</KitText>
          ) : (
            <View style={styles.join}>
              {way === 'password' && (
                <Field roles={roles} label="The club's password" value={password} onChangeText={v => { setPassword(v); setError(null) }} secure autoCapitalize="none" autoCorrect={false} />
              )}
              <Plate label={`Join ${club.tag}`} icon="add" roles={roles} loading={busy} disabled={way === 'password' && !password}
                onPress={() => run(() => joinClub(club.id, way === 'password' ? password : undefined))} />
            </View>
          )
      ) : me && myClub ? (
        // One club a player: say so wherever a second could be tried.
        <KitText t="body" color={roles.textMuted}>You're in another club, and a player has one club at a time. Leave yours to join this one.</KitText>
      ) : null}
      {error && !editing ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}

      {isOwner && (
        <>
          <SectionTag roles={roles}>Your club</SectionTag>
          {editing ? (
            <>
              <ClubForm roles={roles} initial={club} submitLabel="Save the club" error={error}
                onSubmit={async input => { await run(() => updateClub(input, club), () => setEditing(false)) }} />
              <Plate label="Stop editing" variant="quiet" roles={roles} onPress={() => { setEditing(false); setError(null) }} />

              {way !== 'open' && (
                <>
                  <SectionTag roles={roles}>Invite</SectionTag>
                  <InviteField onInvite={name => run(() => inviteToClub(name))} onTyping={() => setError(null)} busy={busy} />
                </>
              )}

              {others.length > 0 && (
                <>
                  <SectionTag roles={roles}>Hand it over</SectionTag>
                  <Chips<string> roles={roles} label="To" value={heirId ?? ''} onChange={setHeir}
                    options={others.map(m => ({ id: m.user_id, label: m.username ?? 'Player' }))} />
                  <Plate label={`Make ${heirName} the owner`} variant="secondary" roles={roles} onPress={() => openConfirm({
                    question: `Hand ${club.name} to ${heirName}?`, consequence: 'They own it from now on; you stay in it as a member.',
                    confirmLabel: 'Hand it over', stayLabel: 'Keep it', onConfirm: () => run(() => transferClub(heirId!), () => setEditing(false)),
                  })} />
                </>
              )}

              <SectionTag roles={roles}>Close the club</SectionTag>
              <ListRow roles={roles} icon="delete" label="Delete the club" danger onPress={() => openConfirm({
                question: `Delete ${club.name}?`, consequence: "Everyone leaves it and loses its tag, and its chat goes. This can't be undone.",
                confirmLabel: 'Delete the club', stayLabel: 'Keep it', onConfirm: () => run(() => deleteClub(), onLeft ?? (() => router.replace('/clubs'))),
              })} />
            </>
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

      {/* P8.5-44: any club but your own can be reported, quietly, at the foot. */}
      {!isMember && me && (
        <Plate label="Report this club" variant="quiet" roles={roles} style={styles.report}
          onPress={() => router.push({ pathname: '/report', params: { type: 'club', id: club.id, name: club.name } })} />
      )}
    </>
  )
}

// Invite by username, with suggestions after three letters, half a second
// after the last key (P8.5-45), from the same player search as Friends.
function InviteField({ onInvite, onTyping, busy }: { onInvite: (username: string) => Promise<boolean>; onTyping: () => void; busy: boolean }) {
  const [text, setText] = useState('')
  const [found, setFound] = useState<{ id: string; username: string }[]>([])
  const [sent, setSent] = useState<string | null>(null)
  useEffect(() => {
    const q = text.trim()
    if (q.length < SUGGEST_AFTER) { setFound([]); return }
    let active = true
    const t = setTimeout(() => {
      trackWork(searchPlayers(q)).then(r => { if (active) setFound(r.slice(0, 6)) }).catch(() => { if (active) setFound([]) })
    }, SUGGEST_MS)
    return () => { active = false; clearTimeout(t) }
  }, [text])
  const invite = async (name: string) => { if (await onInvite(name)) { setSent(name); setText(''); setFound([]) } }
  return (
    <View style={styles.inviteWrap}>
      <View style={styles.invite}>
        <Field roles={roles} label="A player's username" value={text} autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }}
          onChangeText={v => { setText(v); setSent(null); onTyping() }} />
        <Plate label="Invite" variant="secondary" roles={roles} disabled={!text.trim()} loading={busy} onPress={() => invite(text.trim())} />
      </View>
      {found.map(p => (
        <Pressable key={p.id} onPress={() => invite(p.username)} accessibilityRole="button" accessibilityLabel={`Invite ${p.username}`}
          style={({ pressed }) => [styles.suggestion, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="body" color={roles.text} style={{ flex: 1 }}>{p.username}</KitText>
          <KitText t="tag" color={roles.textMuted}>INVITE</KitText>
        </Pressable>
      ))}
      {sent ? <KitText t="body" color={roles.textMuted}>{`Invited ${sent}.`}</KitText> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  top: { marginTop: space[2], marginBottom: space[3] },
  report: { marginTop: space[6], alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: space[2], marginBottom: space[2] },
  join: { marginBottom: space[2], gap: space[2] },
  inviteWrap: { gap: space[1] },
  invite: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: space[1] },
  member: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
