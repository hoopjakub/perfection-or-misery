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
            Welcome to Perfection or Misery! You draft a squad, get placed into a competition, and watch
            it play out — sometimes match by match on a board, sometimes live on a real clock. Can you
            achieve perfection, or will you suffer misery?
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drafting Your Squad</Text>
          <Text style={styles.content}>
            1. Choose a formation — 11 shapes to pick from, everything from a classic 4-3-3 to a back
            five or a narrow diamond midfield{'\n'}
            2. Spin for clubs to pick players from{'\n'}
            3. Select players that fit your open positions (some accept a nearby position too, at a
            small rating penalty){'\n'}
            4. Complete your 11-player squad
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Formations</Text>
          <Text style={styles.content}>
            • <Text style={styles.bold}>4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2</Text> — the classics{'\n'}
            • <Text style={styles.bold}>3-4-3</Text> — wing-backs and a front three{'\n'}
            • <Text style={styles.bold}>4-1-4-1</Text> — lone striker, banked four, holding mid{'\n'}
            • <Text style={styles.bold}>4-3-1-2</Text> — two strikers fed by a playmaker in the hole{'\n'}
            • <Text style={styles.bold}>4-1-2-1-2</Text> — the narrow diamond midfield{'\n'}
            • <Text style={styles.bold}>5-4-1</Text> — maximum defensive solidity{'\n'}
            • <Text style={styles.bold}>3-4-2-1</Text> — back three, two roaming 10s behind a striker{'\n'}
            Your squad pitch always shows the real shape for whichever one you picked.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Substitutes</Text>
          <Text style={styles.content}>
            Once your 11 are set, spin for up to 5 subs — same spin-a-club-then-pick flow as the
            starting XI. Your bench shows up in "Your Squad" alongside the XI, and you can MOVE a sub
            into any compatible starting slot (and send that starter to the bench) right from the draft
            screen.{'\n\n'}
            Subs only come off the bench from the 60th minute onward, and even then score and assist at
            reduced odds compared to a player who started — a small orange <Text style={styles.bold}>SUB</Text> tag
            marks their goals and assists wherever they show up, for every team, not just yours.{'\n\n'}
            Don't want a bench this run? Skip it — you (and every AI opponent) will simply play with no
            substitutes at all, so nobody gets an unfair edge either way.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Placement</Text>
          <Text style={styles.content}>
            After drafting, a spinning globe reveals where you land — the country lights up as it
            settles. What happens next depends on the mode:{'\n\n'}
            • <Text style={styles.bold}>League / All-Time / Era / Chaos / Cursed:</Text> you replace an
            existing club in a real league and season{'\n'}
            • <Text style={styles.bold}>Champions League (classic):</Text> you take over any club already
            in that UCL edition — could be Real Madrid, could be a minnow{'\n'}
            • <Text style={styles.bold}>Champions League (custom path):</Text> you land in a real domestic
            league first — where you finish there decides your route into Europe{'\n'}
            • <Text style={styles.bold}>World Cup:</Text> you take over one of the 48 qualified nations
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Simulation & Live Matches</Text>
          <Text style={styles.content}>
            League-style rounds play out on a scoreboard — standings update live, and a matchday-results
            card lets you scrub ‹ › back through every round already played, or jump straight to LIVE.
            {'\n\n'}
            Your own matches in the World Cup group stage and any knockout tie play out differently —
            on a real ticking clock, goals revealed minute by minute, with the rest of the round held
            back until your match finishes so nothing spoils it early.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Knockouts & Two-Legged Ties</Text>
          <Text style={styles.content}>
            Before a knockout phase kicks off, you get a bracket preview — a real pinch-to-zoom bracket
            tree showing the full first-round draw (your tie highlighted) and the shape of the rounds
            ahead. Pinch to zoom in and read it, drag to pan around, double-tap to reset.{'\n\n'}
            Two-legged ties (Champions League) play leg 1, then leg 2 with home and away swapped — the
            aggregate score and leg 1's result stay visible while leg 2 plays. If it's still level after
            extra time, penalties are taken kick by kick by named players from your actual squad.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Summary</Text>
          <Text style={styles.content}>
            At the end of a run, see your final position, top scorers, and a full breakdown of how your
            team performed — plus, for the bigger competitions, the complete bracket, every league table
            involved, and your knockout run.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Modes</Text>
          <Text style={styles.content}>
            <Text style={styles.bold}>Normal:</Text>{'\n'}
            • <Text style={styles.bold}>All Time:</Text> any league, any era{'\n'}
            • <Text style={styles.bold}>League Mode:</Text> pick a specific league{'\n'}
            • <Text style={styles.bold}>Era Mode:</Text> pick a specific decade{'\n'}
            • <Text style={styles.bold}>Chaos Mode:</Text> ratings hidden, no rerolls{'\n'}
            • <Text style={styles.bold}>Cursed Mode:</Text> like Chaos, but positions are random{'\n\n'}
            <Text style={styles.bold}>Special:</Text>{'\n'}
            • <Text style={styles.bold}>Champions League (classic):</Text> jump straight into an existing
            UCL edition's league phase and knockouts{'\n'}
            • <Text style={styles.bold}>Champions League (custom path):</Text> play your domestic season
            first, then — depending how you finished — qualifying rounds, the 36-team league phase, and
            the knockouts, across all 53 UEFA leagues simulated fresh each run{'\n'}
            • <Text style={styles.bold}>World Cup:</Text> group stage (top 2 + best third-place teams
            qualify) into a Round-of-32 knockout bracket
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
