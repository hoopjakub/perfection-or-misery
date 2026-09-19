import React, { useCallback, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { signOut, deleteAccount } from '@/lib/auth'
import { openConfirm } from '@/lib/confirm'
import { fetchUserStats, type UserStats } from '@/db/queries/leaderboard'
import { ROLES, space } from '@/theme'
import { formatTier } from '@/data/tiers'
import { KitScreen, KitText, IdTag, ListRow, SectionTag, Plate } from '@/components/kit'

// You (was Profile) — docs/ui-overhaul/07a A4. An ID tag, then three groups.
// My Runs is gone from here: it's a destination in the bar now.
//
// Privacy, Terms and Delete account arrived with Phase 6. The reduced-motion
// and haptics settings still wait for the settings menu (P8-45).
const roles = ROLES.cotton

export default function YouScreen() {
  const { profile, isGuest, user } = useUserStore()
  const [stats, setStats] = useState<UserStats | null>(null)
  const name = isGuest ? 'Guest' : profile?.username ?? '—'

  useFocusEffect(useCallback(() => {
    let active = true
    if (user && !isGuest) {
      fetchUserStats(user.id)
        .then(s => { if (active) setStats(s) })
        .catch(e => console.warn('[you] stats failed:', e))
    }
    return () => { active = false }
  }, [user, isGuest]))

  const detail = isGuest
    ? 'Runs are not kept'
    : stats
      ? `${stats.totalRuns} RUNS${stats.bestTier ? ` · BEST "${formatTier(stats.bestTier).toUpperCase()}"` : ''}`
      : undefined

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

  return (
    <KitScreen ground="cotton">
      <PageMeta title="You" path="/profile" />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>"YOU"</KitText>
      <IdTag roles={roles} name={name} state={isGuest ? 'GUEST' : 'REG'} detail={detail} />

      {isGuest && (
        <View style={styles.guest}>
          <KitText t="body" color={roles.textMuted}>
            Make an account to keep your runs, climb the ranks and build a career.
          </KitText>
          <Plate label="Keep my runs" icon="keep" roles={roles} onPress={() => router.push('/auth/register')} />
          <Plate label="I have an account" variant="secondary" roles={roles} onPress={() => router.push('/auth/login')} />
        </View>
      )}

      {!isGuest && (
        <>
          <SectionTag roles={roles}>Your record</SectionTag>
          <ListRow roles={roles} icon="achievements" label="Achievements" onPress={() => router.push('/game/achievements')} />
          <ListRow roles={roles} icon="stats" label="Career" onPress={() => router.push('/game/career')} />
        </>
      )}

      <SectionTag roles={roles}>Help</SectionTag>
      <ListRow roles={roles} icon="guide" label="Guide" onPress={() => router.push('/guide')} />
      <ListRow roles={roles} icon="about" label="About" onPress={() => router.push('/about')} />
      <ListRow roles={roles} label="Privacy" onPress={() => router.push('/privacy')} />
      <ListRow roles={roles} label="Terms" onPress={() => router.push('/terms')} />

      {!isGuest && (
        <>
          <SectionTag roles={roles}>Account</SectionTag>
          <ListRow roles={roles} icon="signOut" label="Sign out" onPress={confirmSignOut} />
          <ListRow roles={roles} label="Delete account" danger onPress={confirmDelete} />
        </>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginBottom: space[4] },
  guest: { gap: space[3], marginTop: space[4] },
})
