import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function HowToPlayScreen() {
  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>How to Play</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Getting Started</Text>
          <Text style={styles.content}>
            Welcome to Perfection or Misery! This is a football management game where you draft a squad and see how they perform in a season.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drafting Your Squad</Text>
          <Text style={styles.content}>
            1. Select a formation (4-3-3, 4-4-2, 4-2-3-1, 3-5-2, or 5-3-2){'\n'}
            2. Spin for clubs to pick players from{'\n'}
            3. Select players that fit your open positions{'\n'}
            4. Complete your 11-player squad
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Placement</Text>
          <Text style={styles.content}>
            After drafting, spin to see which league and season your team will be placed in. Your team replaces an existing team in that league.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Simulation</Text>
          <Text style={styles.content}>
            Watch as your season plays out match by match. The simulation calculates results based on team ratings and form.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Summary</Text>
          <Text style={styles.content}>
            At the end of the season, see your final position, stats, and a breakdown of how your team performed throughout the season.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Modes</Text>
          <Text style={styles.content}>
            • <Text style={styles.bold}>All Time:</Text> Any league, any era{'\n'}
            • <Text style={styles.bold}>League Mode:</Text> Pick a specific league{'\n'}
            • <Text style={styles.bold}>Era Mode:</Text> Pick a specific decade{'\n'}
            • <Text style={styles.bold}>Chaos Mode:</Text> Ratings hidden, no rerolls{'\n'}
            • <Text style={styles.bold}>Cursed Mode:</Text> Like Chaos, but positions are random
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Difficulty Levels</Text>
          <Text style={styles.content}>
            • <Text style={styles.bold}>Easy:</Text> 3 rerolls, ratings shown{'\n'}
            • <Text style={styles.bold}>Medium:</Text> 1 reroll, ratings shown{'\n'}
            • <Text style={styles.bold}>Hard:</Text> No rerolls, ratings hidden
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scoring</Text>
          <Text style={styles.content}>
            Your score is based on your final position, team OVR, and bonus points for unbeaten or perfect seasons. Higher tiers give better scores.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
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
  bold: {
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
})
