import React from 'react'
import { useKept } from '@/lib/kept'
import { t, num } from '@/i18n'
import { en } from '@/i18n/en'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
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
import { KitScreen, KitText, IdTag, ListRow, SectionTag, Plate, TeamMark, StripedNotice } from '@/components/kit'
import { ProfileCard } from '@/components/profile/ProfileParts'
import { VersionButton } from '@/components/VersionButton'
import { EVERYDAY } from '@/lib/appearance'

// You (was Profile) — docs/ui-overhaul/07a A4, redesigned in batch 16: it was
// a title, a name tag and a list of rows. Now it greets you by name (a
// different line each visit), wears your profile's look, shows your picture
// and team badge in the ID tag, and your record in a few numbers before the
// rows. Privacy, Terms and Delete account arrived with Phase 6; the
// preferences live on their own Settings screen (P8-45).
const roles = ROLES[EVERYDAY]

// Said when you open the tab, one at random, from you.greetings (src/i18n:
// each language its own lines). A guest gets one of the guest lines.
const GREETINGS = Object.keys(en.you.greetings) as (keyof typeof en.you.greetings)[]
const GUEST_GREETINGS = Object.keys(en.you.guestGreetings) as (keyof typeof en.you.guestGreetings)[]
const pick = <K,>(keys: K[]) => keys[Math.floor(Math.random() * keys.length)]
const pickGreeting = (name: string | null) =>
  name ? t(`you.greetings.${pick(GREETINGS)}`, { name }) : t(`you.guestGreetings.${pick(GUEST_GREETINGS)}`)

// P8.5-47: one greeting for the whole launch. It used to change each time the
// tab came back into view; now it's picked once and kept until the app closes
// (a new one only if the name it greets changes, e.g. on signing in).
let launch: { name: string | null; text: string } | null = null
const launchGreeting = (name: string | null) => {
  if (!launch || launch.name !== name) launch = { name, text: pickGreeting(name) }
  return launch.text
}

export default function YouScreen() {
  const { profile, isGuest, user } = useUserStore()
  // P9.75: your numbers and your card's look as you saw them last, at once,
  // refreshed each time the tab comes into view (src/lib/kept.ts). They were
  // zeros and the default banner for a second or two on every visit.
  const me = user && !isGuest ? user.id : null
  const stats = useKept<UserStats | null>(me && `stats:${me}`, () => fetchUserStats(me!), 'you: stats').data ?? null
  const place = useKept<number | null>(me && `place:${me}`, async () => (await fetchMyPlace(me!, {}))?.place ?? null, 'you: place').data ?? null
  const pub = useKept<PublicProfile | null>(me && `pub:${me}`, () => fetchPublicProfile(me!), 'you: profile').data ?? null
  const pin = useCrestStore(st => st.pin)
  // P8-181: your club's tag, in your pin's colour (the club's own colour is on its page).
  const clubTag = profile?.club_tag ? { text: profile.club_tag, colour: pin?.hex ?? '#ff5a00' } : null
  const name = isGuest ? t('you.guest') : profile?.username ?? '—'
  const greeting = launchGreeting(isGuest ? null : profile?.username ?? null)
  const unread = useNoticeStore(st => st.unread)

  function confirmSignOut() {
    openConfirm({
      question: t('you.signOutQuestion'),
      consequence: t('you.signOutConsequence'),
      confirmLabel: t('you.signOut'),
      stayLabel: t('you.staySignedIn'),
      onConfirm: signOut,
      thenRoute: '/(tabs)',
    })
  }

  function confirmDelete() {
    openConfirm({
      question: t('you.deleteQuestion'),
      consequence: t('you.deleteConsequence'),
      confirmLabel: t('you.deleteConfirm'),
      stayLabel: t('you.keepAccount'),
      onConfirm: deleteAccount,
      thenRoute: '/(tabs)',
    })
  }

  const runs = stats?.totalRuns ?? 0
  const facts: [string, string][] = isGuest ? [] : [
    [t('you.factRuns'), String(runs)],
    [t('you.factBest'), stats?.bestTier ? formatTier(stats.bestTier) : '—'],
    [t('you.factWorld'), place ? ordinal(place) : '—'],
    [t('you.factPoints'), num(stats?.totalPoints ?? 0)],
    ...(pub?.playtime_seconds ? [[t('you.factPlayed'), formatPlaytime(pub.playtime_seconds)] as [string, string]] : []),
  ]
  const badgeId = profile?.badge_team_id, badgeName = profile?.badge_team_name

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('you.pageTitle')} path="/profile" />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>{greeting.toUpperCase()}</KitText>

      {/* P8.5-02: your card is the one others see on your page (app/u/[id].tsx):
          the frame, the theme, the banner, the status, the about line and the
          badges you set in the editor. Only the look's colour band showed here
          before. A guest has no profile, so keeps the ID tag. */}
      {isGuest ? (
        <IdTag roles={roles} name={name} state="GUEST" detail={t('you.runsNotKept')} pin={pin ?? undefined} />
      ) : (
        <Pressable onPress={() => router.push('/profile-edit')} accessibilityRole="button" accessibilityHint={t('you.editHint')}>
          <ProfileCard roles={roles} name={name} avatarPath={profile?.avatar_path} look={readLook(pub)}
            badgeTeamId={badgeId} badgeTeamName={badgeName} tag={profile?.club_tag} />
        </Pressable>
      )}

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
            {t('you.guestPitch')}
          </KitText>
          <Plate label={t('you.keepMyRuns')} icon="keep" roles={roles} onPress={() => router.push('/auth/register')} />
          <Plate label={t('you.haveAccount')} variant="secondary" roles={roles} onPress={() => router.push('/auth/login')} />
        </View>
      )}

      {/* P8.5-44: the moderator took the name away (or banned the account). */}
      {!isGuest && profile?.banned_at ? (
        <StripedNotice roles={roles} failed>{t('moderation.bannedNotice')}</StripedNotice>
      ) : !isGuest && profile?.must_rename ? (
        <StripedNotice roles={roles} actionLabel={t('moderation.pickAName')} onAction={() => router.push('/rename')}>
          {t('moderation.renameNotice')}
        </StripedNotice>
      ) : null}

      {!isGuest && (
        <>
          <View style={styles.actions}>
            <Plate label={t('you.yourProfile')} icon="you" variant="secondary" roles={roles} style={styles.action}
              onPress={() => user && router.push({ pathname: '/u/[id]', params: { id: user.id } })} />
            <Plate label={t('you.edit')} icon="settings" variant="secondary" roles={roles} style={styles.action} onPress={() => router.push('/profile-edit')} />
          </View>
          <SectionTag roles={roles}>{t('you.people')}</SectionTag>
          <ListRow roles={roles} icon="keep" label={t('you.friends')} sub={t('you.friendsSub')}
            value={unread > 0 ? t('you.newCount', { count: unread }) : undefined} onPress={() => router.push('/friends')} />
          {/* P8.5-07: Clubs moved to the tab bar; it was a row here. */}
          <SectionTag roles={roles}>{t('you.yourRecord')}</SectionTag>
          <ListRow roles={roles} icon="achievements" label={t('you.achievements')} onPress={() => router.push('/game/achievements')} />
          <ListRow roles={roles} icon="stats" label={t('you.career')} onPress={() => router.push('/game/career')} />
        </>
      )}

      <SectionTag roles={roles}>{t('you.theGame')}</SectionTag>
      <ListRow roles={roles} icon="settings" label={t('you.settings')} onPress={() => router.push('/settings')} />
      <ListRow roles={roles} icon="guide" label={t('you.guide')} onPress={() => router.push('/guide')} />
      <ListRow roles={roles} icon="about" label={t('you.about')} onPress={() => router.push('/about')} />
      <ListRow roles={roles} icon="privacy" label={t('you.privacy')} onPress={() => router.push('/privacy')} />
      <ListRow roles={roles} icon="terms" label={t('you.terms')} onPress={() => router.push('/terms')} />
      <VersionButton roles={roles} style={styles.version} />

      {!isGuest && (
        <>
          <SectionTag roles={roles}>{t('you.account')}</SectionTag>
          <ListRow roles={roles} icon="signOut" label={t('you.signOut')} onPress={confirmSignOut} />
          <ListRow roles={roles} icon="delete" label={t('you.deleteAccount')} danger onPress={confirmDelete} />
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
