import React, { useCallback, useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, StripedNotice, EmptyState, Loader, Tag } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ClubHeader, ClubTag, ClubForm } from '@/components/ClubParts'
import { fetchClubOf, fetchClub, searchClubs, createClub, joinClub, clubErrorText, ClubsUnavailable, type Club } from '@/db/queries/clubs'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-181: clubs. In one: your club, and the way into its page and chat. In
// none: start one, or find one to join. The tag on your ID tag and beside your
// name is the club's; you have none until you join.
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

  const load = useCallback(async () => {
    if (!me) return
    try {
      const club = await fetchClubOf(me)
      if (club) {
        const full = await fetchClub(club.id)
        setMine(full ? { club: full.club, members: full.members.length } : null)
      } else setMine(null)
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
      searchClubs(query).then(r => { if (active) setFound(r) }).catch(e => console.warn('[clubs] search failed:', e))
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [query, me, mine, state])

  const refreshTag = () => useUserStore.getState().fetchProfile()

  async function join(id: string) {
    setBusy(id); setError(null)
    try { await joinClub(id); refreshTag(); await load(); openClubPage(id) }
    catch (e) { setError(clubErrorText(e)) }
    finally { setBusy(null) }
  }

  if (!me) {
    return (
      <KitScreen ground={EVERYDAY}>
        <BackControl roles={roles} />
        <EmptyState roles={roles} icon="lock" title="Sign in for a club" body="A club is kept with your account, so a guest can't join one." />
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Clubs" path="/clubs" />
      <BackControl roles={roles} />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>CLUBS</KitText>
      {state === 'loading' && <Loader color={roles.text} />}
      {state === 'unavailable' && <StripedNotice roles={roles}>Clubs need the database set up first: run supabase/clubs.sql in the Supabase SQL editor.</StripedNotice>}
      {state === 'failed' && <StripedNotice roles={roles} failed>Clubs couldn't be loaded.</StripedNotice>}

      {state === 'ready' && mine && (
        <>
          <SectionTag roles={roles}>Your club</SectionTag>
          <ClubHeader roles={roles} club={mine.club} members={mine.members} />
          <View style={styles.actions}>
            <Plate label="Open your club" icon="forward" roles={roles} onPress={() => openClubPage(mine.club.id)} style={{ flex: 1 }} />
            <Plate label="Chat" icon="press" variant="secondary" roles={roles} onPress={() => router.push({ pathname: '/club/chat', params: { id: mine.club.id } })} style={{ flex: 1 }} />
          </View>
          <KitText t="body" color={roles.textMuted}>{`You wear ${mine.club.tag} on your ID tag and beside your name.`}</KitText>
        </>
      )}

      {state === 'ready' && !mine && (
        <>
          <KitText t="body" color={roles.textMuted}>You're in no club yet, so your ID tag has no tag. Join one and you wear its tag; start one and it's yours.</KitText>
          <SectionTag roles={roles}>Start a club</SectionTag>
          {creating ? (
            <ClubForm roles={roles} submitLabel="Start the club" error={error} onSubmit={async input => {
              setError(null)
              try { const id = await createClub(input); refreshTag(); await load(); openClubPage(id) }
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
            return (
              <Pressable key={c.id} onPress={() => openClubPage(c.id)} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.tag}, ${c.members} members`}
                style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
                <ClubTag tag={c.tag} colour={c.colour} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <KitText t="body" color={roles.text} numberOfLines={1}>{c.name}</KitText>
                  <KitText t="tag" color={roles.textMuted}>{`${c.members}${c.member_limit ? ` / ${c.member_limit}` : ''} MEMBERS`}</KitText>
                </View>
                {full ? <Tag roles={roles}>FULL</Tag>
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
