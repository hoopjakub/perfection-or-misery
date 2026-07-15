import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import { BackButton } from '@/components/ui'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function HowToPlayScreen() {
  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>How to Play</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Idea</Text>
          <Text style={styles.content}>
            Perfection or Misery is a football-management roguelike. Every run: draft a squad from
            random real club-seasons, get dropped into a competition somewhere on the planet, and watch
            it play out — match by match on a scoreboard, or live on a ticking clock. At the end you're
            graded on a tier ladder from <Text style={styles.bold}>ABSOLUTE MISERY</Text> to{' '}
            <Text style={styles.bold}>ULTIMATE PERFECTION</Text>. No two runs are ever the same: the
            clubs you spin, the league you land in, and every simulated match are fresh each time.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drafting Your Squad</Text>
          <Text style={styles.content}>
            1. <Text style={styles.bold}>Pick a formation</Text> — 11 real shapes (see below). This
            decides which position slots you must fill.{'\n'}
            2. <Text style={styles.bold}>Spin the wheel</Text> — each spin lands on a random real club
            season (e.g. 2011/12 Ajax) and shows you its squad.{'\n'}
            3. <Text style={styles.bold}>Pick one player</Text> who fits an open slot. Players can also
            fill nearby positions (a RW can play RM, a CB can play at full-back…) at a small OVR
            penalty — the draft shows the adjusted rating before you commit.{'\n'}
            4. Repeat until all 11 slots are filled. Depending on difficulty you may have rerolls to
            skip a bad club spin.{'\n\n'}
            You can <Text style={styles.bold}>MOVE</Text> any drafted player later: to an open slot, or
            swapped with a teammate whose position is compatible both ways. When a move would displace
            someone, the picker shows exactly what you'd get — the incoming player's OVR in that slot
            and the outgoing player's OVR in the slot they'd move to (or a SUB tag if they'd drop to
            the bench).
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
            Substitutions happen in the <Text style={styles.bold}>second half only</Text> — nobody
            comes off the bench before the 45th minute, and subs score and assist at reduced odds
            compared to a player who started. A small orange <Text style={styles.bold}>SUB</Text> tag
            marks their goals and assists wherever they show up, for every team, not just yours. Open
            any finished match's detail page and you'll see the actual substitution minutes (green ▲
            on, red ▼ off) for both sides.{'\n\n'}
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
            back until your match finishes so nothing spoils it early. Need a moment?{' '}
            <Text style={styles.bold}>⏸ PAUSE</Text> in the top bar of any live match stops the clock
            (mid-match, between legs, even mid-shootout) until you resume.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Match Detail Pages — Deep Stats</Text>
          <Text style={styles.content}>
            Every finished match, anywhere in the game, is <Text style={styles.bold}>tappable</Text> —
            league matchdays, Champions League league-phase games, World Cup group games, knockout-tie
            legs, even qualifying rounds. Tapping opens a FotMob-style match page:{'\n\n'}
            • <Text style={styles.bold}>Team stats</Text> — possession, xG (split open play / set piece),
            shots (on target, inside/outside box, blocked, woodwork), big chances, full passing numbers
            (accuracy, long balls, crosses, throw-ins), duels, tackles, corners, cards, offsides and
            more, drawn as comparison bars.{'\n'}
            • <Text style={styles.bold}>Timeline</Text> — goals, cards and substitutions minute by minute.{'\n'}
            • <Text style={styles.bold}>Both lineups</Text> — starters, subs with ▲/▼ minutes, unused
            bench — each player carrying a colour-coded 0–10 match rating. Tap any player for their full
            individual stat sheet (keepers get saves, save %, claims, sweeper actions).{'\n'}
            • <Text style={styles.bold}>Team ratings + Player of the Match</Text> — each side's average
            rating, and a gold banner for the match's best player.{'\n\n'}
            The numbers respect the result but not blindly — a dominant team can lose 1-0 with 2.5 xG
            against a smash-and-grab, especially in upsets. Reopen the same match any time: the sheet is
            regenerated identically, down to the last touch.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ratings, POTM & the Stats Hub</Text>
          <Text style={styles.content}>
            Every player in the competition accumulates an <Text style={styles.bold}>average match
            rating</Text> and <Text style={styles.bold}>★ Player of the Match</Text> count across the
            whole run. The Player Statistics screen has leaderboards for goals, assists, clean sheets,
            average rating and POTM — and you can tap any player to open their{' '}
            <Text style={styles.bold}>match-by-match game log</Text>: every game they played, with
            rating, goals/assists (saves for keepers), sub minutes and cards, each expandable into
            their full stat sheet for that match.{'\n\n'}
            Ratings matter for silverware too: <Text style={styles.bold}>Player of the Season</Text> and{' '}
            <Text style={styles.bold}>Best U21</Text> now weigh average rating and POTM awards heavily
            alongside goals, assists and clean sheets — a dominant defensive midfielder can beat a
            one-dimensional poacher to the award.
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
          <Text style={styles.sectionTitle}>Season Summary & Your Squad</Text>
          <Text style={styles.content}>
            At the end of a run, see your final position, tier, and a full breakdown of how your team
            performed — plus, for the bigger competitions, the complete bracket, every league table
            involved, and your knockout run.{'\n\n'}
            The <Text style={styles.bold}>Your Squad</Text> card shows each of your players' goals,
            assists and clean sheets alongside their colour-coded average rating chip and ★ POTM count,
            with top-3 league ranks flagged. "Full stats →" jumps into the stats hub above. Signed-in
            runs are saved to your history and feed lifetime career stats for every player you've ever
            drafted.
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
          <Text style={styles.sectionTitle}>Scoring & Tiers</Text>
          <Text style={styles.content}>
            Your score is based on your final position, team OVR, and bonus points for unbeaten or
            perfect seasons. Higher tiers give better scores — win the league unbeaten for{' '}
            <Text style={styles.bold}>ALMOST PERFECTION</Text>, win every single match for{' '}
            <Text style={styles.bold}>ULTIMATE PERFECTION</Text>; get relegated and it's{' '}
            <Text style={styles.bold}>ABSOLUTE MISERY</Text>. Cup modes grade you on how deep your run
            went, from group-stage exit to lifting the trophy.
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
