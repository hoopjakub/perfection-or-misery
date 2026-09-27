import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, ListRow, Plate } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space, border, font } from '@/theme'

// The guide (P8-72): it opens on a choice, "what do you want to learn about?",
// and each topic is its own short page, instead of one long scroll you had to
// read top to bottom to find the part you wanted. The topics are the old
// guide's sections (P8-65 already split it into blocks for this), with the
// words brought up to date where the app has moved on (the awards, the
// pundits, the press, the bracket).
const roles = ROLES.cotton

// A word in bold, inside a paragraph. The kit sets weight by font family,
// never fontWeight, so bold is Archivo 700 inheriting the paragraph's size.
function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontFamily: font.bodyBold, color: roles.text }}>{children}</Text>
}
function P({ children }: { children: React.ReactNode }) {
  return <KitText t="bodyL" color={roles.text}>{children}</KitText>
}

type Topic = { id: string; group: string; title: string; line: string; body: React.ReactNode }

const GROUPS = ['Before the run', 'During the run', 'After the run']

const TOPICS: Topic[] = [
  { id: 'idea', group: 'Before the run', title: 'The idea', line: 'What a run is, and how it ends', body: (
    <P>
      Perfection or Misery is a football-management roguelike. Every run: draft a squad from
      random real club-seasons, get dropped into a competition somewhere on the planet, and watch
      it play out. At the end you're graded on a tier ladder from <B>ABSOLUTE MISERY</B> to{' '}
      <B>PERFECTION</B>. No two runs are ever the same: the clubs you spin, the league you land
      in, and every simulated match are fresh each time.
    </P>
  ) },
  { id: 'modes', group: 'Before the run', title: 'Game modes', line: 'Leagues, the Champions League, the World Cup', body: (
    <P>
      <B>Leagues:</B>{'\n'}
      • <B>All Time:</B> any league, any era{'\n'}
      • <B>League:</B> pick a specific league{'\n'}
      • <B>Chaos:</B> ratings hidden, no rerolls, and you pick the player but chaos picks where he plays{'\n'}
      • <B>Cursed:</B> the position is spun for you, the names won't stay still, and now and then the curse makes the pick for you{'\n\n'}
      <B>Tournaments:</B>{'\n'}
      • <B>UEFA Champions League (finals):</B> jump straight into an existing edition's league
      phase and knockouts{'\n'}
      • <B>UEFA Champions League (full path):</B> play your domestic season first. Then,
      depending on how you finished, come the qualifying rounds, the 36-team league phase, and
      the knockouts, across all 53 UEFA leagues simulated fresh each run{'\n'}
      • <B>FIFA World Cup:</B> group stage (top 2 and the best third-placed teams qualify) into a
      Round-of-32 knockout bracket
    </P>
  ) },
  { id: 'difficulty', group: 'Before the run', title: 'Difficulty', line: 'What each level changes, and what it pays', body: (
    <P>
      Difficulty changes two things: the <B>draft</B> (rerolls and whether ratings are shown) and
      how hard <B>your own matches</B> are. Only games your club plays are affected; every other
      result in the table or bracket stays fair, so the competition around you is always honest.
      {'\n\n'}
      • <B>Easy:</B> 3 rerolls, ratings shown, and your matches tilt your way. A genuinely strong
      squad wins comfortably and can realistically go all the way{'\n'}
      • <B>Medium:</B> 1 reroll, ratings shown, matches played straight. It's realistic and
      demanding: even a great team has to earn a trophy{'\n'}
      • <B>Hard:</B> no rerolls, ratings hidden, and the AI leans against you. Even good-vs-good
      games skew the opponent's way, so beating a top side is a real achievement{'\n\n'}
      <B>Custom:</B> build your own difficulty from three dials: a rerolls slider (0–10), a
      ratings on/off toggle, and a 1–10 "screw-you-er" from Baby Mode to Absolute Misery
      (Easy/Medium/Hard sit at 2/4/6). Every dial matters: <B>tougher settings score more, easier
      ones score less</B>. A pile of rerolls or visible ratings is a real cut to your final points;
      a blind Absolute Misery run is worth far more. The same scaling applies to the base
      difficulties too.
    </P>
  ) },
  { id: 'formations', group: 'Before the run', title: 'Formations', line: 'The shapes you can pick', body: (
    <P>
      • <B>4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2</B>: the classics{'\n'}
      • <B>3-4-3</B>: wing-backs and a front three{'\n'}
      • <B>4-1-4-1</B>: lone striker, banked four, holding mid{'\n'}
      • <B>4-3-1-2</B>: two strikers fed by a playmaker in the hole{'\n'}
      • <B>4-1-2-1-2</B>: the narrow diamond midfield{'\n'}
      • <B>5-4-1</B>: five at the back, one striker{'\n'}
      • <B>3-4-2-1</B>: back three, two roaming 10s behind a striker{'\n'}
      Your squad pitch always shows the real shape for whichever one you picked.
    </P>
  ) },
  { id: 'draft', group: 'Before the run', title: 'Drafting your squad', line: 'Spins, picks and moves', body: (
    <P>
      1. <B>Pick a formation.</B> It decides which position slots you must fill.{'\n'}
      2. <B>Spin the wheel.</B> Each spin lands on a random real club season (e.g. 2011/12 Ajax)
      and shows you its squad.{'\n'}
      3. <B>Pick one player</B> who fits an open slot. Players can also fill nearby positions (a
      RW can play RM, a CB can play at full-back…) at a small OVR penalty, and the draft shows the
      adjusted rating before you commit.{'\n'}
      4. Repeat until all 11 slots are filled. Depending on difficulty you may have rerolls to
      skip a bad club spin.{'\n\n'}
      You can <B>MOVE</B> any drafted player later: to an open slot, or swapped with a teammate
      whose position is compatible both ways. When a move would displace someone, the picker shows
      exactly what you'd get: the incoming player's OVR in that slot and the outgoing player's OVR
      in the slot they'd move to (or a SUB tag if they'd drop to the bench).
    </P>
  ) },
  { id: 'bench', group: 'Before the run', title: 'Substitutes', line: 'The bench, and when it plays', body: (
    <P>
      Once your 11 are set, spin for up to 5 subs, with the same spin-a-club-then-pick flow as the
      starting XI. You can MOVE a sub into any compatible starting slot (and send that starter to
      the bench) right from the draft screen.{'\n\n'}
      Substitutions happen in the <B>second half only</B>. Nobody comes off the bench before the
      45th minute, and subs score and assist at reduced odds compared to a player who started. A{' '}
      <B>SUB</B> tag marks a goal scored by a substitute, for every team, not just yours. Open any
      finished match's page and you'll see the substitution minutes for both sides, an arrow on
      and an arrow off.{'\n\n'}
      Don't want a bench this run? Skip it, and you (and every AI opponent) will play with no
      substitutes at all, so nobody gets an unfair edge either way.
    </P>
  ) },
  { id: 'placement', group: 'Before the run', title: 'Placement', line: 'Where the globe sends you', body: (
    <P>
      After drafting, a spinning globe reveals where you land, and the country lights up as it
      settles. What happens next depends on the mode:{'\n\n'}
      • <B>League / All Time / Chaos / Cursed:</B> you replace an existing club in a real league
      and season{'\n'}
      • <B>UEFA Champions League (finals):</B> you take over any club already in that edition.
      It could be Real Madrid; it could be a minnow{'\n'}
      • <B>UEFA Champions League (full path):</B> you land in a real domestic league first, and
      where you finish there decides your route into Europe{'\n'}
      • <B>FIFA World Cup:</B> you take over one of the 48 qualified nations
    </P>
  ) },
  { id: 'pundits', group: 'Before the run', title: 'The pundits', line: 'Who they tip, and how the verdict checks them', body: (
    <P>
      Before a ball is kicked, a panel of <B>twelve pundits</B> gives its prediction: the table as
      they see it, the surprises and the disappointments, and where they have you. Tap any pundit
      to read their own preview: their table, their calls, and their picks for player of the
      season, top scorer and best under-21.{'\n\n'}
      At the end, the verdict checks them against what really happened. Beat their prediction and
      you've proved them wrong.
    </P>
  ) },
  { id: 'season', group: 'During the run', title: 'The season and live matches', line: 'The scoreboard, the ticking clock, looking back', body: (
    <P>
      League-style rounds play out on a scoreboard. Standings update as the results land, and you
      can look back at any matchday already played, then jump back to the live one. Under each
      round's results sits its <B>team of the matchday</B>. Skip ahead when you like: the rest
      of the rounds are played at once.{'\n\n'}
      Your own matches in the FIFA World Cup group stage and in any knockout tie play out
      differently: on a real ticking clock, goals revealed minute by minute, with the rest of the
      round held back until your match finishes so nothing spoils it early. Need a moment?{' '}
      <B>PAUSE</B> stops the clock (mid-match, between legs, even mid-shootout) until you resume.
    </P>
  ) },
  { id: 'press', group: 'During the run', title: 'The press', line: 'The stories a season writes', body: (
    <P>
      In a league season the press writes stories as the season goes: the results that matter,
      the table, the runs of form, and your own injuries and bans. Open a story to read it in full,
      and share it as a card.
    </P>
  ) },
  { id: 'match', group: 'During the run', title: 'Match pages and deep stats', line: 'Everything one match kept', body: (
    <P>
      Every finished match, anywhere in the game, is <B>tappable</B>: league matchdays, UEFA
      Champions League league-phase games, FIFA World Cup group games, knockout-tie legs, even
      qualifying rounds. Tapping opens a FotMob-style match page:{'\n\n'}
      • <B>Team stats:</B> possession, xG (split open play / set piece), shots (on target,
      inside/outside box, blocked, woodwork), big chances, full passing numbers (accuracy, long
      balls, crosses, throw-ins), duels, tackles, corners, cards, offsides and more, drawn as
      comparison bars.{'\n'}
      • <B>Timeline:</B> goals, cards and substitutions minute by minute.{'\n'}
      • <B>Both lineups:</B> starters, subs with the minutes they came on and off, unused bench,
      with each player carrying a colour-coded 0–10 match rating. Tap any player for their full
      individual stat sheet (keepers get saves, save %, claims, sweeper actions).{'\n'}
      • <B>Team ratings and Player of the Match:</B> each side's average rating, and the match's
      best player marked with a gold star.{'\n\n'}
      The numbers respect the result, but not blindly. A dominant team can lose 1-0 with 2.5 xG
      against a smash-and-grab, especially in upsets. Reopen the same match any time: the sheet is
      regenerated identically, down to the last touch.
    </P>
  ) },
  { id: 'knockouts', group: 'During the run', title: 'Knockouts and two-legged ties', line: 'The bracket, the legs, the penalties', body: (
    <P>
      Before a knockout phase kicks off, you get a bracket preview: a real pinch-to-zoom bracket
      tree showing the full first-round draw (your tie highlighted) and the shape of the rounds
      ahead. Pinch to zoom in and read it, drag to pan around, double-tap to reset. When the run is
      over, the same bracket shows every result, round by round.{'\n\n'}
      Two-legged ties (UEFA Champions League) play leg 1, then leg 2 with home and away swapped.
      The aggregate score and leg 1's result stay visible while leg 2 plays. If it's still level
      after extra time, penalties are taken kick by kick by named players from your actual squad.
    </P>
  ) },
  { id: 'awards', group: 'After the run', title: 'Awards and the stats hub', line: 'Awards Night, and every number the run kept', body: (
    <P>
      Every player in the competition builds an <B>average match rating</B> and a count of
      Player of the Match awards across the whole run. <B>Awards Night</B> hands out the season's
      prizes: player of the season and best under-21, the golden boot, the playmaker, the golden
      glove, one for every position (defender, full-back, midfielder, defensive and attacking
      midfielder, winger, forward), the best attack and defence, the team of the season, and in a
      league the manager of the season. Ratings count heavily, so a dominant defensive midfielder
      can beat a one-dimensional poacher to an award.{'\n\n'}
      The run's own page has a board for goals, assists, clean sheets, average rating and much
      more, for players and for clubs. Tap any player to open their <B>match-by-match game
      log</B>: every game they played, with rating, goals and assists (saves for keepers), sub
      minutes and cards, each opening their full stat sheet for that match.
    </P>
  ) },
  { id: 'summary', group: 'After the run', title: 'The verdict and your squad', line: 'How the run ended, and where it lives on', body: (
    <P>
      At the end of a run, see your final position, tier, and a full breakdown of how your team
      performed, plus, for the bigger competitions, the complete bracket, every league table
      involved, and your knockout run.{'\n\n'}
      The run's own page keeps all of it: the table, the bracket, your season, every stat board,
      the press and your squad. Signed-in runs are saved to your history and feed lifetime career
      stats for every player you've ever drafted.
    </P>
  ) },
  { id: 'scoring', group: 'After the run', title: 'Scoring and tiers', line: 'Where the points come from', body: (
    <P>
      Your score is based on your final position, team OVR (a weaker squad scores more), bonus
      points for unbeaten or perfect seasons, and the difficulty multiplier. Higher tiers give
      better scores. Win the league unbeaten for <B>ALMOST PERFECTION</B>, win every single match
      for <B>PERFECTION</B>; get relegated and it's <B>ABSOLUTE MISERY</B>. Cup modes grade you on
      how deep your run went, from group-stage exit to lifting the trophy.
    </P>
  ) },
  { id: 'achievements', group: 'After the run', title: 'Achievements', line: 'What you have won, on what', body: (
    <P>
      You → Achievements tracks, for every mode, which base difficulties you've{' '}
      <B>won a trophy on</B> (league title or cup), plus the hardest Custom run you've conquered
      on a 0–11 scale (0 = Baby Mode with ten rerolls and ratings on, 11 = Absolute Misery, no
      rerolls, drafting blind). It's computed live from your saved runs, so it fills in as you play
      and reflects your whole history.
    </P>
  ) },
]

export default function GuideScreen() {
  const { topic } = useLocalSearchParams<{ topic?: string }>()
  const i = TOPICS.findIndex(t => t.id === topic)
  const open = (id: string) => router.push({ pathname: '/guide', params: { topic: id } })

  // One topic, on its own page, with the next one a tap away.
  if (i >= 0) {
    const t = TOPICS[i]
    const next = TOPICS[i + 1]
    return (
      <KitScreen ground="cotton">
        <PageMeta title={`Guide: ${t.title}`} path={`/guide?topic=${t.id}`} />
        <BackControl roles={roles} />
        <KitText t="tag" color={roles.textMuted} style={styles.kicker}>{`GUIDE · ${t.group.toUpperCase()}`}</KitText>
        <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>{t.title.toUpperCase()}</KitText>
        <View style={styles.body}>{t.body}</View>
        {next && (
          <Plate label={`Next: ${next.title}`} icon="forward" variant="secondary" roles={roles}
            onPress={() => router.replace({ pathname: '/guide', params: { topic: next.id } })} style={styles.next} />
        )}
      </KitScreen>
    )
  }

  // The choice.
  return (
    <KitScreen ground="cotton">
      <PageMeta title="Guide" path="/guide" />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>GUIDE</KitText>
      <KitText t="bodyL" color={roles.textMuted}>What do you want to learn about?</KitText>
      {GROUPS.map(g => (
        <View key={g} style={styles.group}>
          <SectionTag roles={roles}>{g}</SectionTag>
          {TOPICS.filter(t => t.group === g).map(t => (
            <ListRow key={t.id} roles={roles} label={t.title} sub={t.line} onPress={() => open(t.id)} />
          ))}
        </View>
      ))}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  kicker: { marginTop: space[2] },
  title: { marginTop: space[2], marginBottom: space[3] },
  body: { paddingVertical: space[2], borderTopWidth: border.hair, borderTopColor: roles.rule, paddingTop: space[4] },
  group: { marginTop: space[4], gap: space[1] },
  next: { marginTop: space[5] },
})
