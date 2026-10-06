import React, { useCallback, useEffect, useState } from 'react'
import { useSettledOnce } from '@/lib/loading'
import { log } from '@/diag/log'
import { t, num } from '@/i18n'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitScreen, KitText, SectionTag, Plate, Field, StripedNotice, EmptyState, Tag, Icon, GhostRows } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ClubTag, ClubForm } from '@/components/ClubParts'
import { fetchClubOf, searchClubs, createClub, joinClub, clubErrorText, ClubsUnavailable, fetchMyInvites, declineClubInvite, fetchClubScores, type Club } from '@/db/queries/clubs'
import { ClubView } from '@/components/ClubView'
import { trackWork } from '@/lib/navGuard'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { OfflineNotice } from '@/components/OfflineStrip'

// P8-181: clubs. In one: your club. In none: start one, or find one to join.
// The tag on your ID tag and beside your name is the club's; you have none
// until you join. P8.5-07: a tab of its own (it was a row on You), so no back
// control; its address is still /clubs. P8.5-45: in a club, the tab IS your
// club (the same ClubView as its page), not a card that opened another page;
// joining or starting one keeps you here. Every club in the search shows its
// score, and the loading bar runs while the tab waits.
const roles = ROLES[EVERYDAY]
const openClubPage = (id: string) => router.push({ pathname: '/club/[id]', params: { id } })

export default function ClubsScreen() {
  const once = useSettledOnce()   // Phase 9: a first load arrives deliberately (src/lib/loading.ts)
  const { user, isGuest } = useUserStore()
  const me = !isGuest ? user?.id ?? null : null
  const [mine, setMine] = useState<{ club: Club; members: number } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'failed'>('loading')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<(Club & { members: number })[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // P8.5-08: invites to invite-only clubs, waiting for you here.
  const [invites, setInvites] = useState<Club[]>([])
  const [scores, setScores] = useState<Map<string, { score: number; runs: number }>>(new Map())

  const load = useCallback(async () => {
    if (!me) return
    try {
      fetchMyInvites(me).then(setInvites).catch(() => setInvites([]))
      const club = await trackWork(once(fetchClubOf(me)))
      setMine(club ? { club, members: 0 } : null)
      setState('ready')
    } catch (e) {
      log.warn('net', 'clubs: load failed', e)
      setState(e instanceof ClubsUnavailable ? 'unavailable' : 'failed')
    }
  }, [me])
  useFocusEffect(useCallback(() => { load() }, [load]))

  // The search answers as you type, a beat after the last key.
  useEffect(() => {
    if (!me || mine || state !== 'ready') return
    let active = true
    const timer = setTimeout(() => {
      trackWork(searchClubs(query)).then(async r => {
        if (!active) return
        setFound(r)
        const sc = await fetchClubScores(r.map(c => c.id)).catch(() => new Map())
        if (active) setScores(sc)
      }).catch(e => log.warn('net', 'clubs: search failed', e))
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, me, mine, state])

  const refreshTag = () => useUserStore.getState().fetchProfile()

  async function join(id: string) {
    setBusy(id); setError(null)
    // A club with a password asks for it on its own page.
    const c = found.find(x => x.id === id)
    if (c?.access === 'password') { setBusy(null); openClubPage(id); return }
    try { await trackWork(joinClub(id)); refreshTag(); await load() }
    catch (e) { setError(clubErrorText(e)) }
    finally { setBusy(null) }
  }

  if (!me) {
    return (
      <KitScreen ground={EVERYDAY}>
        <EmptyState roles={roles} icon="lock" title={t('clubs.signInTitle')} body={t('clubs.signInBody')} />
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('clubs.pageTitle')} path="/clubs" />
      <OfflineNotice />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>{t('clubs.title')}</KitText>
      {state === 'loading' && <GhostRows roles={roles} count={3} />}
      {state === 'unavailable' && <StripedNotice roles={roles}>{t('clubs.setUp')}</StripedNotice>}
      {state === 'failed' && <StripedNotice roles={roles} failed>{t('clubs.loadFailed')}</StripedNotice>}

      {state === 'ready' && mine && <ClubView id={mine.club.id} onLeft={load} />}

      {state === 'ready' && !mine && invites.length > 0 && (
        <>
          <SectionTag roles={roles}>{t('clubs.invites', { count: invites.length })}</SectionTag>
          {invites.map(c => (
            <View key={c.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <ClubTag tag={c.tag} colour={c.colour} />
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{c.name}</KitText>
              <Plate label={t('clubs.join')} variant="secondary" roles={roles} loading={busy === c.id} onPress={() => join(c.id)} />
              <Plate label={t('clubs.noThanks')} variant="quiet" roles={roles}
                onPress={() => declineClubInvite(c.id).then(() => setInvites(v => v.filter(x => x.id !== c.id))).catch(e => setError(clubErrorText(e)))} />
            </View>
          ))}
        </>
      )}

      {state === 'ready' && !mine && (
        <>
          <KitText t="body" color={roles.textMuted}>{t('clubs.noClubYet')}</KitText>
          <SectionTag roles={roles}>{t('clubs.startAClub')}</SectionTag>
          {creating ? (
            <ClubForm roles={roles} submitLabel={t('clubs.startTheClub')} error={error} onSubmit={async input => {
              setError(null)
              try { await trackWork(createClub(input)); refreshTag(); setCreating(false); await load() }
              catch (e) { setError(clubErrorText(e)) }
            }} />
          ) : (
            <Plate label={t('clubs.startAClub')} icon="add" variant="secondary" roles={roles} onPress={() => setCreating(true)} />
          )}

          <SectionTag roles={roles}>{t('clubs.findAClub')}</SectionTag>
          <Field roles={roles} label={t('clubs.searchLabel')} value={query} onChangeText={setQuery} autoCorrect={false} />
          {!creating && error ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}
          {found.length === 0 ? (
            <KitText t="body" color={roles.textMuted}>{query.trim().length >= 2 ? t('clubs.noMatch') : t('clubs.noneYet')}</KitText>
          ) : found.map(c => {
            const full = c.member_limit != null && c.members >= c.member_limit
            // P8.5-08: a lock on a club you can't just walk into.
            const locked = c.access === 'password' || c.access === 'invite'
            return (
              <Pressable key={c.id} onPress={() => openClubPage(c.id)} accessibilityRole="button"
                accessibilityLabel={t('clubs.rowA11y', { name: c.name, tag: c.tag, count: c.members }) + (c.access === 'password' ? t('clubs.a11yPassword') : c.access === 'invite' ? t('clubs.a11yInviteOnly') : '')}
                style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
                <ClubTag tag={c.tag} colour={c.colour} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <KitText t="body" color={roles.text} numberOfLines={1}>{c.name}</KitText>
                  <KitText t="tag" color={roles.textMuted}>{(c.member_limit ? t('clubs.rowMembersOf', { count: c.members, limit: c.member_limit }) : t('clubs.rowMembers', { count: c.members }))
                    + (scores.get(c.id) ? t('clubs.rowPoints', { count: scores.get(c.id)!.score, points: num(scores.get(c.id)!.score) }) : '')
                    + (c.access === 'password' ? t('clubs.rowPassword') : c.access === 'invite' ? t('clubs.rowInviteOnly') : '')}</KitText>
                </View>
                {locked ? <Icon name="lock" size={16} color={roles.textMuted} label={c.access === 'password' ? t('clubs.password') : t('clubs.inviteOnly')} /> : null}
                {full ? <Tag roles={roles}>{t('clubs.full')}</Tag>
                  : c.access === 'invite' ? null
                  : <Plate label={t('clubs.join')} variant="quiet" roles={roles} loading={busy === c.id} onPress={() => join(c.id)} />}
              </Pressable>
            )
          })}
        </>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[3] },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, borderBottomWidth: border.hair },
})
