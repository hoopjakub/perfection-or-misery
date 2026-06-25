import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { quickSimLeague, quickSimCL, quickSimWC } from '@/engine/quick-sim'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function AboutScreen() {
  const [taps, setTaps] = useState(0)
  const [showTester, setShowTester] = useState(false)
  const [busy, setBusy] = useState(false)

  function tapVersion() {
    const n = taps + 1
    setTaps(n)
    if (n >= 8) setShowTester(true)
  }

  async function runQuickSim(family: 'league' | 'champions_league' | 'world_cup') {
    setBusy(true)
    try {
      if (family === 'league') {
        const run = await quickSimLeague()
        useGameStore.setState({ mode: 'all_time', difficulty: 'medium', formation: run.formation, draftedPlayers: run.draftedPlayers, placedLeague: run.placedLeague, simResult: run.simResult, accentColor: null, quickSim: true })
        router.push('/game/result')
      } else if (family === 'champions_league') {
        const run = await quickSimCL()
        useGameStore.setState({ mode: 'champions_league', difficulty: 'medium', formation: run.formation, draftedPlayers: run.draftedPlayers, clTeams: run.clTeams, clResult: run.clResult, accentColor: null, quickSim: true })
        router.push('/game/cl-result')
      } else {
        const run = await quickSimWC()
        useGameStore.setState({ mode: 'world_cup', difficulty: 'medium', formation: run.formation, draftedPlayers: run.draftedPlayers, wcTeams: run.wcTeams, wcResult: run.wcResult, accentColor: null, quickSim: true })
        router.push('/game/wc-result')
      }
    } catch (e) {
      console.error('[quick-sim] failed:', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>About Me</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Perfection or Misery</Text>
          <Text style={styles.content}>
            A football management game where you draft a squad and see how they perform in a season. Can you achieve perfection, or will you suffer misery?
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <Text style={styles.content}>
            • Multiple game modes (All Time, League, Era, Chaos, Cursed){'\n'}
            • Difficulty levels (Easy, Medium, Hard){'\n'}
            • Real club and player data{'\n'}
            • Season simulation with match-by-match results{'\n'}
            • Leaderboard and run history tracking
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credits</Text>
          <Text style={styles.content}>
            Built with React Native, Expo, and Supabase.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Version</Text>
          <Pressable onPress={tapVersion}>
            <Text style={styles.content}>1.0.0</Text>
          </Pressable>
        </View>

        {/* Hidden tester — unlocked by tapping the version 8× */}
        {showTester && (
          <View style={[styles.section, styles.testerCard]}>
            <Text style={styles.sectionTitle}>⚡ Quick Sim Tester</Text>
            <Text style={styles.content}>
              Auto-drafts a random squad, simulates a full season with no UI, and drops you on the result screen (stats included). Not saved to your account.
            </Text>
            {busy ? (
              <View style={styles.testerBusy}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.content}>Drafting & simulating…</Text>
              </View>
            ) : (
              <View style={styles.testerBtns}>
                <Pressable style={styles.testerBtn} onPress={() => runQuickSim('league')}>
                  <Text style={styles.testerBtnText}>League</Text>
                </Pressable>
                <Pressable style={styles.testerBtn} onPress={() => runQuickSim('champions_league')}>
                  <Text style={styles.testerBtnText}>UCL</Text>
                </Pressable>
                <Pressable style={styles.testerBtn} onPress={() => runQuickSim('world_cup')}>
                  <Text style={styles.testerBtnText}>WC</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  testerCard: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, padding: spacing.md },
  testerBusy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  testerBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  testerBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  testerBtnDisabled: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  testerBtnText: { color: colors.textPrimary, fontWeight: typography.bold, fontSize: typography.sm },
  testerBtnTextDisabled: { color: colors.textMuted, fontWeight: typography.medium, fontSize: typography.xs },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.textPrimary,
    fontSize: typography.xl,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  content: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
})
