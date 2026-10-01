import React, { useCallback, useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, StripedNotice, EmptyState, Tag } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { PlayerName } from '@/components/profile/ProfileParts'
import {
  searchPlayers, sendFriendRequest, respondToRequest, getRequests, getFriends, getNotifications, markAllRead,
  type PlayerRef, type FriendRequest, type Friend, type Notice,
} from '@/lib/friends'
import { useNoticeStore } from '@/store/noticeStore'
import { useUserStore } from '@/store/userStore'
import { formatTier } from '@/data/tiers'
import { ordinal } from '@/lib/format'
import { ROLES, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-90: friends, with the screen they never had. Find a player by username,
// send a request, answer the ones sent to you, and see each friend's latest
// run and world rank. What's new since you last looked is at the top.
const roles = ROLES[EVERYDAY]

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}
const openProfile = (id: string) => router.push({ pathname: '/u/[id]', params: { id } })

export default function FriendsScreen() {
  const isGuest = useUserStore(s => s.isGuest)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<PlayerRef[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(async () => {
    try {
      const [req, fr, ns] = await Promise.all([getRequests(), getFriends(), getNotifications()])
      setIncoming(req.incoming); setOutgoing(req.outgoing); setFriends(fr); setNotices(ns)
      setState('ready')
      // Seen now: the badge on You clears.
      if (ns.some(n => !n.read)) { await markAllRead().catch(() => {}); useNoticeStore.getState().clear() }
    } catch (e) {
      console.warn('[friends] load failed:', e)
      setState('failed')
    }
  }, [])
  useFocusEffect(useCallback(() => { if (!isGuest) load() }, [isGuest, attempt, load]))

  // The search answers as you type (debounced so it isn't a query per key).
  useEffect(() => {
    if (isGuest) return
    let active = true
    const t = setTimeout(() => {
      searchPlayers(query).then(r => { if (active) setFound(r) }).catch(e => console.warn('[friends] search failed:', e))
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [query, isGuest])

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key); setNote(null)
    try { await fn(); setNote(done); await load() }
    catch (e: any) {
      console.warn('[friends] action failed:', e)
      setNote(/NOT_A_MEMBER/.test(e?.message ?? '') ? 'Make an account to add friends.'
        : /function .* does not exist|Could not find the function/i.test(e?.message ?? '') ? 'Friends need a database update first (supabase/friends.sql).'
        : "That didn't go through. Try again.")
    } finally { setBusy(null) }
  }

  if (isGuest) {
    return (
      <KitScreen ground={EVERYDAY}>
        <BackControl roles={roles} />
        <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>FRIENDS</KitText>
        <EmptyState roles={roles} icon="lock" title="Friends need an account" body="Make one from You, and your runs and friends are kept." />
      </KitScreen>
    )
  }

  const friendIds = new Set(friends.map(f => f.id))
  const sentIds = new Set(outgoing.map(r => r.player.id))
  const askedIds = new Map(incoming.map(r => [r.player.id, r.id]))

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Friends" path="/friends" />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>FRIENDS</KitText>
      {note ? <KitText t="body" color={roles.textMuted}>{note}</KitText> : null}
      {state === 'failed' && (
        <StripedNotice roles={roles} failed actionLabel="Retry" onAction={() => { setState('loading'); setAttempt(a => a + 1) }}>
          Your friends couldn't be loaded.
        </StripedNotice>
      )}

      {/* What's new: requests and accepted requests, newest first. */}
      {notices.length > 0 && (
        <>
          <SectionTag roles={roles}>News</SectionTag>
          {notices.slice(0, 5).map(n => (
            <View key={n.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              {!n.read && <Tag roles={roles} variant="you">NEW</Tag>}
              <KitText t="body" color={roles.text} style={{ flex: 1 }}>
                {n.type === 'friend_request' ? `${n.payload.fromUsername ?? 'Someone'} sent you a friend request`
                  : n.type === 'friend_accepted' ? `${n.payload.fromUsername ?? 'Someone'} accepted your request`
                  : 'Something happened'}
              </KitText>
              <KitText t="tag" color={roles.textMuted}>{ago(n.created_at).toUpperCase()}</KitText>
            </View>
          ))}
        </>
      )}

      {incoming.length > 0 && (
        <>
          <SectionTag roles={roles}>{`Asking to be friends · ${incoming.length}`}</SectionTag>
          {incoming.map(r => (
            <View key={r.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <PlayerName roles={roles} name={r.player.username} avatarPath={r.player.avatar_path} badgeTeamId={r.player.badge_team_id}
                badgeTeamName={r.player.badge_team_name} onPress={() => openProfile(r.player.id)} style={{ flex: 1 }} />
              <Plate label="Accept" roles={roles} onPress={() => act(r.id, () => respondToRequest(r.id, true), `You and ${r.player.username} are friends.`)} />
              <Plate label="Decline" variant="quiet" roles={roles} onPress={() => act(`${r.id}-no`, () => respondToRequest(r.id, false), 'Declined.')} />
            </View>
          ))}
        </>
      )}

      <SectionTag roles={roles}>Find a player</SectionTag>
      <Field roles={roles} label="Username" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      {found.map(p => {
        const status = friendIds.has(p.id) ? 'FRIENDS' : sentIds.has(p.id) ? 'SENT' : null
        const theirs = askedIds.get(p.id)
        return (
          <View key={p.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
            <PlayerName roles={roles} name={p.username} avatarPath={p.avatar_path} badgeTeamId={p.badge_team_id}
              badgeTeamName={p.badge_team_name} onPress={() => openProfile(p.id)} style={{ flex: 1 }} />
            {status ? <Tag roles={roles}>{status}</Tag>
              : theirs ? <Plate label="Accept" roles={roles} onPress={() => act(theirs, () => respondToRequest(theirs, true), `You and ${p.username} are friends.`)} />
              : <Plate label={busy === p.id ? 'Sending…' : 'Add'} variant="secondary" roles={roles}
                  onPress={() => { if (!busy) act(p.id, () => sendFriendRequest(p.id), `Request sent to ${p.username}.`) }} />}
          </View>
        )
      })}
      {query.trim().length >= 2 && found.length === 0 ? <KitText t="body" color={roles.textMuted}>Nobody by that name.</KitText> : null}

      <SectionTag roles={roles}>{`Your friends · ${friends.length}`}</SectionTag>
      {state === 'ready' && friends.length === 0 && (
        <KitText t="body" color={roles.textMuted}>No friends yet. Find someone above, or send your profile to a friend.</KitText>
      )}
      {friends.map(f => (
        <View key={f.id} style={[styles.friend, { borderBottomColor: roles.rule }]}>
          <PlayerName roles={roles} name={f.username} avatarPath={f.avatar_path} badgeTeamId={f.badge_team_id}
            badgeTeamName={f.badge_team_name} onPress={() => openProfile(f.id)} />
          <KitText t="tag" color={roles.textMuted}>
            {[
              f.worldRank ? `WORLD ${ordinal(f.worldRank)}` : null,
              f.latestRun ? `LATEST: ${formatTier(f.latestRun.tier).toUpperCase()} · ${ago(f.latestRun.created_at).toUpperCase()}` : 'NO RUNS YET',
            ].filter(Boolean).join(' · ')}
          </KitText>
        </View>
      ))}

      {outgoing.length > 0 && (
        <>
          <SectionTag roles={roles}>Waiting for an answer</SectionTag>
          {outgoing.map(r => (
            <View key={r.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <PlayerName roles={roles} name={r.player.username} avatarPath={r.player.avatar_path} onPress={() => openProfile(r.player.id)} style={{ flex: 1 }} />
              <KitText t="tag" color={roles.textMuted}>{`SENT ${ago(r.created_at).toUpperCase()}`}</KitText>
            </View>
          ))}
        </>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, borderBottomWidth: border.hair },
  friend: { gap: 2, paddingVertical: space[2], borderBottomWidth: border.hair },
})
