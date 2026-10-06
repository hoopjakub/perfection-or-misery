import React, { useCallback, useEffect, useState } from 'react'
import { useSettledOnce } from '@/lib/loading'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitText, SectionTag, Plate, StripedNotice, EmptyState, Tag, Field, Chips, ListRow, GhostRows } from '@/components/kit'
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
  const once = useSettledOnce()   // Phase 9: a first load arrives deliberately (src/lib/loading.ts)
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
      const [d, mine] = await trackWork(once(Promise.all([fetchClub(id), me ? fetchClubOf(me) : Promise.resolve(null)])))
      setData(d); setMyClub(mine?.id ?? null)
      setState(d ? 'ready' : 'missing')
      if (d) fetchClubScores([d.club.id]).then(m => setScore(m.get(d.club.id) ?? null)).catch(() => {})
    } catch (e) {
      log.warn('net', 'club: load failed', e)
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

  if (state === 'loading') return <GhostRows roles={roles} />
  if (state === 'unavailable') return <StripedNotice roles={roles}>{t('clubs.setUpShort')}</StripedNotice>
  if (state === 'failed') return <StripedNotice roles={roles} failed>{t('clubs.clubFailed')}</StripedNotice>
  if (state === 'missing' || !data) return <EmptyState roles={roles} title={t('clubs.noSuchClub')} body={t('clubs.noSuchClubBody')} />

  const { club, members } = data
  const isOwner = !!me && club.owner_id === me
  const isMember = myClub === club.id
  const full = club.member_limit != null && members.length >= club.member_limit
  const way: ClubAccess = club.access ?? 'open'
  const others = members.filter(m => m.user_id !== me)
  const heirId = heir ?? others[0]?.user_id ?? null
  const heirName = others.find(m => m.user_id === heirId)?.username ?? ''

  return (
    <>
      <View style={styles.top}><ClubHeader roles={roles} club={club} members={members.length} score={score} /></View>

      {isMember ? (
        <View style={styles.actions}>
          <Plate label={t('clubs.chat')} icon="press" roles={roles} onPress={() => router.push({ pathname: '/club/chat', params: { id: club.id } })} style={{ flex: 1 }} />
          <Plate label={t('clubs.leave')} variant="quiet" roles={roles} onPress={() => openConfirm({
            question: t('clubs.leaveQuestion', { club: club.name }),
            consequence: isOwner
              ? (members.length > 1 ? t('clubs.leaveOwnerHeir', { name: heirName }) : t('clubs.leaveOwnerLast'))
              : t('clubs.leaveMember'),
            confirmLabel: t('clubs.leaveConfirm'), stayLabel: t('clubs.stay'), onConfirm: () => run(() => leaveClub(isOwner ? heirId : null), onLeft),
          })} />
        </View>
      ) : me && !myClub ? (
        full ? <Tag roles={roles}>{t('clubs.clubFull')}</Tag>
          : way === 'invite' ? (
            <KitText t="body" color={roles.textMuted}>{t('clubs.inviteOnlyNote')}</KitText>
          ) : (
            <View style={styles.join}>
              {way === 'password' && (
                <Field roles={roles} label={t('clubs.clubPassword')} value={password} onChangeText={v => { setPassword(v); setError(null) }} secure autoCapitalize="none" autoCorrect={false} />
              )}
              <Plate label={t('clubs.joinTag', { tag: club.tag })} icon="add" roles={roles} loading={busy} disabled={way === 'password' && !password}
                onPress={() => run(() => joinClub(club.id, way === 'password' ? password : undefined))} />
            </View>
          )
      ) : me && myClub ? (
        // One club a player: say so wherever a second could be tried.
        <KitText t="body" color={roles.textMuted}>{t('clubs.otherClub')}</KitText>
      ) : null}
      {error && !editing ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}

      {isOwner && (
        <>
          <SectionTag roles={roles}>{t('clubs.yourClub')}</SectionTag>
          {editing ? (
            <>
              <ClubForm roles={roles} initial={club} submitLabel={t('clubs.saveClub')} error={error}
                onSubmit={async input => { await run(() => updateClub(input, club), () => setEditing(false)) }} />
              <Plate label={t('clubs.stopEditing')} variant="quiet" roles={roles} onPress={() => { setEditing(false); setError(null) }} />

              {way !== 'open' && (
                <>
                  <SectionTag roles={roles}>{t('clubs.invite')}</SectionTag>
                  <InviteField onInvite={name => run(() => inviteToClub(name))} onTyping={() => setError(null)} busy={busy} />
                </>
              )}

              {others.length > 0 && (
                <>
                  <SectionTag roles={roles}>{t('clubs.handOver')}</SectionTag>
                  <Chips<string> roles={roles} label={t('clubs.handTo')} value={heirId ?? ''} onChange={setHeir}
                    options={others.map(m => ({ id: m.user_id, label: m.username ?? t('clubs.player') }))} />
                  <Plate label={t('clubs.makeOwner', { name: heirName })} variant="secondary" roles={roles} onPress={() => openConfirm({
                    question: t('clubs.handQuestion', { club: club.name, name: heirName }), consequence: t('clubs.handConsequence'),
                    confirmLabel: t('clubs.handOver'), stayLabel: t('clubs.keepIt'), onConfirm: () => run(() => transferClub(heirId!), () => setEditing(false)),
                  })} />
                </>
              )}

              <SectionTag roles={roles}>{t('clubs.closeClub')}</SectionTag>
              <ListRow roles={roles} icon="delete" label={t('clubs.deleteClub')} danger onPress={() => openConfirm({
                question: t('clubs.deleteQuestion', { club: club.name }), consequence: t('clubs.deleteConsequence'),
                confirmLabel: t('clubs.deleteClub'), stayLabel: t('clubs.keepIt'), onConfirm: () => run(() => deleteClub(), onLeft ?? (() => router.replace('/clubs'))),
              })} />
            </>
          ) : (
            <Plate label={t('clubs.editClub')} icon="settings" variant="secondary" roles={roles} onPress={() => setEditing(true)} />
          )}
        </>
      )}

      <SectionTag roles={roles}>{club.member_limit ? t('clubs.membersSectionOf', { count: members.length, limit: club.member_limit }) : t('clubs.membersSection', { count: members.length })}</SectionTag>
      {members.map(m => (
        <View key={m.user_id} style={styles.member}>
          <PlayerName roles={roles} name={m.username ?? t('clubs.player')} avatarPath={m.avatar_path} style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/u/[id]', params: { id: m.user_id } })} />
          {m.role === 'owner' ? <Tag roles={roles} variant="selected">{t('clubs.owner')}</Tag> : null}
          {isOwner && m.user_id !== me ? (
            <Plate label={t('clubs.remove')} variant="quiet" roles={roles} onPress={() => openConfirm({
              question: m.username ? t('clubs.removeQuestion', { name: m.username }) : t('clubs.removeThisPlayer'), consequence: t('clubs.removeConsequence'),
              confirmLabel: t('clubs.remove'), stayLabel: t('clubs.keep'), onConfirm: () => run(() => removeFromClub(m.user_id)),
            })} />
          ) : null}
        </View>
      ))}

      {/* P8.5-44: any club but your own can be reported, quietly, at the foot. */}
      {!isMember && me && (
        <Plate label={t('moderation.reportClub')} variant="quiet" roles={roles} style={styles.report}
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
    const timer = setTimeout(() => {
      trackWork(searchPlayers(q)).then(r => { if (active) setFound(r.slice(0, 6)) }).catch(() => { if (active) setFound([]) })
    }, SUGGEST_MS)
    return () => { active = false; clearTimeout(timer) }
  }, [text])
  const invite = async (name: string) => { if (await onInvite(name)) { setSent(name); setText(''); setFound([]) } }
  return (
    <View style={styles.inviteWrap}>
      <View style={styles.invite}>
        <Field roles={roles} label={t('clubs.playerUsername')} value={text} autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }}
          onChangeText={v => { setText(v); setSent(null); onTyping() }} />
        <Plate label={t('clubs.invite')} variant="secondary" roles={roles} disabled={!text.trim()} loading={busy} onPress={() => invite(text.trim())} />
      </View>
      {found.map(p => (
        <Pressable key={p.id} onPress={() => invite(p.username)} accessibilityRole="button" accessibilityLabel={t('clubs.inviteA11y', { name: p.username })}
          style={({ pressed }) => [styles.suggestion, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="body" color={roles.text} style={{ flex: 1 }}>{p.username}</KitText>
          <KitText t="tag" color={roles.textMuted}>{t('clubs.inviteTag')}</KitText>
        </Pressable>
      ))}
      {sent ? <KitText t="body" color={roles.textMuted}>{t('clubs.invited', { name: sent })}</KitText> : null}
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
