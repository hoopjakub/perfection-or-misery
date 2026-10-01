import React, { useCallback, useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitScreen, KitText, SectionTag, Plate, Field, StripedNotice, EmptyState, Loader, Tag, Icon } from '@/components/kit'
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
      const club = await trackWork(fetchClubOf(me))
      setMine(club ? { club, members: 0 } : null)
      setState('ready')
    } catch (e) {
      console.warn('[clubs] load failed:', e)
      setState(e instanceof ClubsUnavailable ? 'unavailable' : 'failed')
    }
  }, [me])
  useFocusEffect(useCallback(() => { load() }, [load]))

  // The search answers as you type, a beat after the last key.
  useEffect(() => {
    if (!me || mine || state !== 'ready') return
    let active = true
    const t = setTimeout(() => {
      trackWork(searchClubs(query)).then(async r => {
        if (!active) return
        setFound(r)
        const sc = await fetchClubScores(r.map(c => c.id)).catch(() => new Map())
        if (active) setScores(sc)
      }).catch(e => console.warn('[clubs] search failed:', e))
    }, 250)
    return () => { active = false; clearTimeout(t) }
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
        <EmptyState roles={roles} icon="lock" title="Sign in for a club" body="A club is kept with your account, so a guest can't join one." />
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Clubs" path="/clubs" />
      <OfflineNotice />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>CLUBS</KitText>
      {state === 'loading' && <Loader color={roles.text} />}
      {state === 'unavailable' && <StripedNotice roles={roles}>Clubs need the database set up first: run supabase/clubs.sql in the Supabase SQL editor.</StripedNotice>}
      {state === 'failed' && <StripedNotice roles={roles} failed>Clubs couldn't be loaded.</StripedNotice>}

      {state === 'ready' && mine && <ClubView id={mine.club.id} onLeft={load} />}

      {state === 'ready' && !mine && invites.length > 0 && (
        <>
          <SectionTag roles={roles}>{`Invites · ${invites.length}`}</SectionTag>
          {invites.map(c => (
            <View key={c.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <ClubTag tag={c.tag} colour={c.colour} />
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{c.name}</KitText>
              <Plate label="Join" variant="secondary" roles={roles} loading={busy === c.id} onPress={() => join(c.id)} />
              <Plate label="No thanks" variant="quiet" roles={roles}
                onPress={() => declineClubInvite(c.id).then(() => setInvites(v => v.filter(x => x.id !== c.id))).catch(e => setError(clubErrorText(e)))} />
            </View>
          ))}
        </>
      )}

      {state === 'ready' && !mine && (
        <>
          <KitText t="body" color={roles.textMuted}>You're in no club yet, so your ID tag has no tag. Join one and you wear its tag; start one and it's yours.</KitText>
          <SectionTag roles={roles}>Start a club</SectionTag>
          {creating ? (
            <ClubForm roles={roles} submitLabel="Start the club" error={error} onSubmit={async input => {
              setError(null)
              try { await trackWork(createClub(input)); refreshTag(); setCreating(false); await load() }
              catch (e) { setError(clubErrorText(e)) }
            }} />
          ) : (
            <Plate label="Start a club" icon="add" variant="secondary" roles={roles} onPress={() => setCreating(true)} />
          )}

          <SectionTag roles={roles}>Find a club</SectionTag>
          <Field roles={roles} label="A club's name or tag" value={query} onChangeText={setQuery} autoCorrect={false} />
          {!creating && error ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}
          {found.length === 0 ? (
            <KitText t="body" color={roles.textMuted}>{query.trim().length >= 2 ? 'No club by that name or tag.' : 'No clubs yet. Start the first.'}</KitText>
          ) : found.map(c => {
            const full = c.member_limit != null && c.members >= c.member_limit
            // P8.5-08: a lock on a club you can't just walk into.
            const locked = c.access === 'password' || c.access === 'invite'
            return (
              <Pressable key={c.id} onPress={() => openClubPage(c.id)} accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${c.tag}, ${c.members} members${c.access === 'password' ? ', password' : c.access === 'invite' ? ', invite only' : ''}`}
                style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
                <ClubTag tag={c.tag} colour={c.colour} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <KitText t="body" color={roles.text} numberOfLines={1}>{c.name}</KitText>
                  <KitText t="tag" color={roles.textMuted}>{`${c.members}${c.member_limit ? ` / ${c.member_limit}` : ''} MEMBERS${scores.get(c.id) ? ` · ${scores.get(c.id)!.score.toLocaleString('en-US')} PTS` : ''}${c.access === 'password' ? ' · PASSWORD' : c.access === 'invite' ? ' · INVITE ONLY' : ''}`}</KitText>
                </View>
                {locked ? <Icon name="lock" size={16} color={roles.textMuted} label={c.access === 'password' ? 'Password' : 'Invite only'} /> : null}
                {full ? <Tag roles={roles}>FULL</Tag>
                  : c.access === 'invite' ? null
                  : <Plate label="Join" variant="quiet" roles={roles} loading={busy === c.id} onPress={() => join(c.id)} />}
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
