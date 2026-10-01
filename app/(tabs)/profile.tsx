import React, { useCallback, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { useNoticeStore } from '@/store/noticeStore'
import { signOut, deleteAccount } from '@/lib/auth'
import { openConfirm } from '@/lib/confirm'
import { fetchUserStats, fetchMyPlace, type UserStats } from '@/db/queries/leaderboard'
import { fetchPublicProfile, formatPlaytime, readLook, type PublicProfile } from '@/db/queries/profile'
import { useCrestStore } from '@/store/crestStore'
import { ordinal } from '@/lib/format'
import { ROLES, space, border } from '@/theme'
import { formatTier } from '@/data/tiers'
import { KitScreen, KitText, IdTag, ListRow, SectionTag, Plate, TeamMark } from '@/components/kit'
import { Avatar, LookBand } from '@/components/profile/ProfileParts'
import { VersionButton } from '@/components/VersionButton'

// You (was Profile) — docs/ui-overhaul/07a A4, redesigned in batch 16: it was
// a title, a name tag and a list of rows. Now it greets you by name (a
// different line each visit), wears your profile's look, shows your picture
// and team badge in the ID tag, and your record in a few numbers before the
// rows. Privacy, Terms and Delete account arrived with Phase 6; the
// preferences live on their own Settings screen (P8-45).
const roles = ROLES.cotton

// Said when you open the tab, one at random. {name} is your username.
const GREETINGS = [
  'Welcome back, {name}.',
  'The gaffer is back: {name}.',
  '{name}, the dressing room is waiting.',
  'Back for more, {name}?',
  '{name} is in the building.',
  'The kit is washed, {name}. Ready?',
  'Another season, {name}?',
  '{name}: perfection or misery today?',
  'The draw is open, {name}.',
  'Good to see you, {name}.',
  'They are singing your name, {name}.',
  'Boots on, {name}.',
  '{name}, the pundits have their doubts.',
  'Here we go again, {name}.',
  'The tunnel is yours, {name}.',
  '{name}, one more run?',
  'Floodlights on for {name}.',
  '{name} returns to the dugout.',
  'Clipboard ready, {name}?',
  'The whistle is about to go, {name}.',
  '{name}, the press want a word.',
  'Chase perfection, {name}.',
  'Misery can wait, {name}.',
  'The board still believes in you, {name}.',
]
const GUEST_GREETINGS = ['Welcome, guest.', 'Pull up a seat, guest.', 'First time in the dugout?']
const pickGreeting = (name: string | null) => {
  const pool = name ? GREETINGS : GUEST_GREETINGS
  return pool[Math.floor(Math.random() * pool.length)].replace('{name}', name ?? '')
}

export default function YouScreen() {
  const { profile, isGuest, user } = useUserStore()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [place, setPlace] = useState<number | null>(null)
  const [pub, setPub] = useState<PublicProfile | null>(null)
  const pin = useCrestStore(st => st.pin)
  // P8-181: your club's tag, in your pin's colour (the club's own colour is on its page).
  const clubTag = profile?.club_tag ? { text: profile.club_tag, colour: pin?.hex ?? '#ff5a00' } : null
  const name = isGuest ? 'Guest' : profile?.username ?? '—'
  const [greeting, setGreeting] = useState(() => pickGreeting(isGuest ? null : profile?.username ?? null))
  const unread = useNoticeStore(st => st.unread)

  useFocusEffect(useCallback(() => {
    setGreeting(pickGreeting(isGuest ? null : profile?.username ?? null))
    let active = true
    if (user && !isGuest) {
      fetchUserStats(user.id).then(s => { if (active) setStats(s) }).catch(e => console.warn('[you] stats failed:', e))
      fetchMyPlace(user.id, {}).then(p => { if (active) setPlace(p?.place ?? null) }).catch(() => {})
      fetchPublicProfile(user.id).then(p => { if (active) setPub(p) }).catch(() => {})
    }
    return () => { active = false }
  }, [user, isGuest, profile?.username]))

  function confirmSignOut() {
    openConfirm({
      question: 'Sign out?',
      consequence: "There's no password recovery. If you've forgotten your password, you won't get this account back.",
      confirmLabel: 'Sign out',
      stayLabel: 'Stay signed in',
      onConfirm: signOut,
      thenRoute: '/(tabs)',
    })
  }

  function confirmDelete() {
    openConfirm({
      question: 'Delete your account?',
      consequence: 'Your account, every run, your career and your place in the ranks are deleted for good. This cannot be undone.',
      confirmLabel: 'Delete my account',
      stayLabel: 'Keep my account',
      onConfirm: deleteAccount,
      thenRoute: '/(tabs)',
    })
  }

  const runs = stats?.totalRuns ?? 0
  const facts: [string, string][] = isGuest ? [] : [
    ['Runs', String(runs)],
    ['Best', stats?.bestTier ? formatTier(stats.bestTier) : '—'],
    ['World', place ? ordinal(place) : '—'],
    ...(pub?.playtime_seconds ? [['Played', formatPlaytime(pub.playtime_seconds)] as [string, string]] : []),
  ]
  const badgeId = profile?.badge_team_id, badgeName = profile?.badge_team_name

  return (
    <KitScreen ground="cotton">
      <PageMeta title="You" path="/profile" />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>{greeting.toUpperCase()}</KitText>

      {/* Your card: your look as its backdrop, the ID tag with your picture over it. */}
      {!isGuest && <LookBand roles={roles} colour={pub?.colour} effect={pub?.effect} banner={readLook(pub).banner} height={56} />}
      <View style={!isGuest ? styles.cardUnder : undefined}>
        <IdTag roles={roles} name={name} state={isGuest ? 'GUEST' : 'REG'}
          detail={isGuest ? 'Runs are not kept' : `${runs} ${runs === 1 ? 'RUN' : 'RUNS'}`}
          mark={isGuest ? undefined : <Avatar roles={roles} path={profile?.avatar_path} name={name} size={48} />}
          badge={badgeId && badgeName ? <TeamMark roles={roles} clubId={badgeId} name={badgeName} size={16} /> : undefined}
          pin={pin ?? undefined} tag={clubTag} />
      </View>

      {facts.length > 0 && (
        <View style={[styles.facts, { borderColor: roles.rule }]}>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <KitText t="tag" color={roles.textMuted}>{label.toUpperCase()}</KitText>
              <KitText t="title" color={roles.text} numberOfLines={1}>{value}</KitText>
            </View>
          ))}
        </View>
      )}

      {isGuest && (
        <View style={styles.guest}>
          <KitText t="body" color={roles.textMuted}>
            Make an account to keep your runs, climb the ranks, make friends and build a career.
          </KitText>
          <Plate label="Keep my runs" icon="keep" roles={roles} onPress={() => router.push('/auth/register')} />
          <Plate label="I have an account" variant="secondary" roles={roles} onPress={() => router.push('/auth/login')} />
        </View>
      )}

      {!isGuest && (
        <>
          <View style={styles.actions}>
            <Plate label="Your profile" icon="you" variant="secondary" roles={roles} style={styles.action}
              onPress={() => user && router.push({ pathname: '/u/[id]', params: { id: user.id } })} />
            <Plate label="Edit" icon="settings" variant="secondary" roles={roles} style={styles.action} onPress={() => router.push('/profile-edit')} />
          </View>
          <SectionTag roles={roles}>People</SectionTag>
          <ListRow roles={roles} icon="keep" label="Friends" sub="Requests, your friends, finding players"
            value={unread > 0 ? `${unread} NEW` : undefined} onPress={() => router.push('/friends')} />
          {/* P8-181: the tag on your ID tag is your club's. */}
          <ListRow roles={roles} icon="ranks" label="Clubs" sub={profile?.club_tag ? `Your club · ${profile.club_tag}` : 'Join a club, or start one'}
            onPress={() => router.push('/clubs')} />
          <SectionTag roles={roles}>Your record</SectionTag>
          <ListRow roles={roles} icon="achievements" label="Achievements" onPress={() => router.push('/game/achievements')} />
          <ListRow roles={roles} icon="stats" label="Career" onPress={() => router.push('/game/career')} />
        </>
      )}

      <SectionTag roles={roles}>The game</SectionTag>
      <ListRow roles={roles} icon="settings" label="Settings" onPress={() => router.push('/settings')} />
      <ListRow roles={roles} icon="guide" label="Guide" onPress={() => router.push('/guide')} />
      <ListRow roles={roles} icon="about" label="About" onPress={() => router.push('/about')} />
      <ListRow roles={roles} icon="privacy" label="Privacy" onPress={() => router.push('/privacy')} />
      <ListRow roles={roles} icon="terms" label="Terms" onPress={() => router.push('/terms')} />
      <VersionButton roles={roles} style={styles.version} />

      {!isGuest && (
        <>
          <SectionTag roles={roles}>Account</SectionTag>
          <ListRow roles={roles} icon="signOut" label="Sign out" onPress={confirmSignOut} />
          <ListRow roles={roles} icon="delete" label="Delete account" danger onPress={confirmDelete} />
        </>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginBottom: space[4] },
  cardUnder: { marginTop: -space[3], marginHorizontal: space[3] },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4], marginTop: space[4], paddingVertical: space[3], borderTopWidth: border.hair, borderBottomWidth: border.hair },
  fact: { gap: 2, minWidth: 64 },
  guest: { gap: space[3], marginTop: space[4] },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
  action: { flex: 1 },
  version: { marginTop: space[3] },
})
