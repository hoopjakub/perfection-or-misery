import React, { useCallback, useEffect, useState } from 'react'
import { arrive, readKept } from '@/lib/kept'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, StripedNotice, EmptyState, Tag, GhostRows } from '@/components/kit'
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
import { OfflineNotice } from '@/components/OfflineStrip'

// P8-90: friends, with the screen they never had. Find a player by username,
// send a request, answer the ones sent to you, and see each friend's latest
// run and world rank. What's new since you last looked is at the top.
const roles = ROLES[EVERYDAY]

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000)
  return d <= 0 ? t('friends.today') : d === 1 ? t('friends.yesterday') : t('friends.daysAgo', { count: d })
}
const openProfile = (id: string) => router.push({ pathname: '/u/[id]', params: { id } })

export default function FriendsScreen() {
  const isGuest = useUserStore(s => s.isGuest)
  const uid = useUserStore(s => s.user?.id ?? null)
  // P9.75: the lists as you saw them last, at once, while they refresh
  // (src/lib/kept.ts). Notices are left out: they're marked read on arrival.
  const keyFor = `friends:${uid ?? ''}`
  const [seed] = useState(() => (uid ? readKept<{ req: { incoming: FriendRequest[]; outgoing: FriendRequest[] }; fr: Friend[] }>(keyFor) : undefined))
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<PlayerRef[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>(seed?.req.incoming ?? [])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>(seed?.req.outgoing ?? [])
  const [friends, setFriends] = useState<Friend[]>(seed?.fr ?? [])
  const [notices, setNotices] = useState<Notice[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(seed ? 'ready' : 'loading')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(async () => {
    try {
      const [{ req, fr }, ns] = await Promise.all([
        arrive(keyFor, Promise.all([getRequests(), getFriends()]).then(([req, fr]) => ({ req, fr }))),
        getNotifications(),
      ])
      setIncoming(req.incoming); setOutgoing(req.outgoing); setFriends(fr); setNotices(ns)
      setState('ready')
      // Seen now: the badge on You clears.
      if (ns.some(n => !n.read)) { await markAllRead().catch(() => {}); useNoticeStore.getState().clear() }
    } catch (e) {
      log.warn('net', 'friends: load failed', e)
      setState('failed')
    }
  }, [keyFor])
  useFocusEffect(useCallback(() => { if (!isGuest) load() }, [isGuest, attempt, load]))

  // The search answers as you type (debounced so it isn't a query per key).
  useEffect(() => {
    if (isGuest) return
    let active = true
    const timer = setTimeout(() => {
      searchPlayers(query).then(r => { if (active) setFound(r) }).catch(e => log.warn('net', 'friends: search failed', e))
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, isGuest])

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key); setNote(null)
    try { await fn(); setNote(done); await load() }
    catch (e: any) {
      log.warn('net', 'friends: action failed', e)
      setNote(/NOT_A_MEMBER/.test(e?.message ?? '') ? t('friends.errNeedAccount')
        : /function .* does not exist|Could not find the function/i.test(e?.message ?? '') ? t('friends.errSetUp')
        : t('friends.errGeneric'))
    } finally { setBusy(null) }
  }

  if (isGuest) {
    return (
      <KitScreen ground={EVERYDAY}>
        <BackControl roles={roles} title={t('friends.title')} />
        <EmptyState roles={roles} icon="lock" title={t('friends.guestTitle')} body={t('friends.guestBody')} />
      </KitScreen>
    )
  }

  const friendIds = new Set(friends.map(f => f.id))
  const sentIds = new Set(outgoing.map(r => r.player.id))
  const askedIds = new Map(incoming.map(r => [r.player.id, r.id]))

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('friends.pageTitle')} path="/friends" />
      <OfflineNotice />
      <BackControl roles={roles} title={t('friends.title')} />
      {note ? <KitText t="body" color={roles.textMuted}>{note}</KitText> : null}
      {state === 'failed' && (
        <StripedNotice roles={roles} failed actionLabel={t('friends.retry')} onAction={() => { setState('loading'); setAttempt(a => a + 1) }}>
          {t('friends.loadFailed')}
        </StripedNotice>
      )}
      {/* Phase 9: the rows that are coming, not a blank (the maintainer, 25 Sept). */}
      {state === 'loading' && <GhostRows roles={roles} />}

      {/* What's new: requests and accepted requests, newest first. */}
      {notices.length > 0 && (
        <>
          <SectionTag roles={roles}>{t('friends.news')}</SectionTag>
          {notices.slice(0, 5).map(n => (
            <View key={n.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              {!n.read && <Tag roles={roles} variant="you">{t('friends.new')}</Tag>}
              <KitText t="body" color={roles.text} style={{ flex: 1 }}>
                {n.type === 'friend_request' ? t('friends.sentYouRequest', { name: n.payload.fromUsername ?? t('friends.someone') })
                  : n.type === 'friend_accepted' ? t('friends.acceptedYours', { name: n.payload.fromUsername ?? t('friends.someone') })
                  : t('friends.somethingHappened')}
              </KitText>
              <KitText t="tag" color={roles.textMuted}>{ago(n.created_at).toUpperCase()}</KitText>
            </View>
          ))}
        </>
      )}

      {incoming.length > 0 && (
        <>
          <SectionTag roles={roles}>{t('friends.asking', { count: incoming.length })}</SectionTag>
          {incoming.map(r => (
            <View key={r.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <PlayerName roles={roles} name={r.player.username} avatarPath={r.player.avatar_path} badgeTeamId={r.player.badge_team_id}
                badgeTeamName={r.player.badge_team_name} onPress={() => openProfile(r.player.id)} style={{ flex: 1 }} />
              <Plate label={t('friends.accept')} roles={roles} onPress={() => act(r.id, () => respondToRequest(r.id, true), t('friends.nowFriends', { name: r.player.username }))} />
              <Plate label={t('friends.decline')} variant="quiet" roles={roles} onPress={() => act(`${r.id}-no`, () => respondToRequest(r.id, false), t('friends.declined'))} />
            </View>
          ))}
        </>
      )}

      <SectionTag roles={roles}>{t('friends.findPlayer')}</SectionTag>
      <Field roles={roles} label={t('auth.username')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      {found.map(p => {
        const status = friendIds.has(p.id) ? t('friends.statusFriends') : sentIds.has(p.id) ? t('friends.statusSent') : null
        const theirs = askedIds.get(p.id)
        return (
          <View key={p.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
            <PlayerName roles={roles} name={p.username} avatarPath={p.avatar_path} badgeTeamId={p.badge_team_id}
              badgeTeamName={p.badge_team_name} onPress={() => openProfile(p.id)} style={{ flex: 1 }} />
            {status ? <Tag roles={roles}>{status}</Tag>
              : theirs ? <Plate label={t('friends.accept')} roles={roles} onPress={() => act(theirs, () => respondToRequest(theirs, true), t('friends.nowFriends', { name: p.username }))} />
              : <Plate label={busy === p.id ? t('friends.sending') : t('friends.add')} variant="secondary" roles={roles}
                  onPress={() => { if (!busy) act(p.id, () => sendFriendRequest(p.id), t('friends.requestSentTo', { name: p.username })) }} />}
          </View>
        )
      })}
      {query.trim().length >= 2 && found.length === 0 ? <KitText t="body" color={roles.textMuted}>{t('friends.nobody')}</KitText> : null}

      <SectionTag roles={roles}>{t('friends.yourFriends', { count: friends.length })}</SectionTag>
      {state === 'ready' && friends.length === 0 && (
        <KitText t="body" color={roles.textMuted}>{t('friends.none')}</KitText>
      )}
      {friends.map(f => (
        <View key={f.id} style={[styles.friend, { borderBottomColor: roles.rule }]}>
          <PlayerName roles={roles} name={f.username} avatarPath={f.avatar_path} badgeTeamId={f.badge_team_id}
            badgeTeamName={f.badge_team_name} onPress={() => openProfile(f.id)} />
          <KitText t="tag" color={roles.textMuted}>
            {[
              f.worldRank ? t('friends.worldRank', { rank: ordinal(f.worldRank) }) : null,
              f.latestRun ? t('friends.latest', { tier: formatTier(f.latestRun.tier).toUpperCase(), ago: ago(f.latestRun.created_at).toUpperCase() }) : t('friends.noRuns'),
            ].filter(Boolean).join(' · ')}
          </KitText>
        </View>
      ))}

      {outgoing.length > 0 && (
        <>
          <SectionTag roles={roles}>{t('friends.waiting')}</SectionTag>
          {outgoing.map(r => (
            <View key={r.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <PlayerName roles={roles} name={r.player.username} avatarPath={r.player.avatar_path} onPress={() => openProfile(r.player.id)} style={{ flex: 1 }} />
              <KitText t="tag" color={roles.textMuted}>{t('friends.sentAgo', { ago: ago(r.created_at).toUpperCase() })}</KitText>
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
