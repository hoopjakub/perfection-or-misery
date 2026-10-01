import React, { useState } from 'react'
import { Loader } from '@/components/kit'
import { KitScreen, KitText, SectionTag, BackControl, Plate, RoundFlag } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native'
import { router } from 'expo-router'
import { VersionButton } from '@/components/VersionButton'
import { useGameStore } from '@/store/gameStore'
import { quickSimLeague, quickSimCL, quickSimWC, quickSimCustomUcl, autoDraftForTestFinal } from '@/engine/quick-sim'
import { SpinningGlobe } from '@/components/GlobeReveal'
import { ROLES, space, border, font } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// About on the kit (P8-65: it and the guide were the last full screens still on
// the old dark cards). Reading happens on cotton, like the You tab it opens from.
const roles = ROLES[EVERYDAY]

// The Quick Sim Tester writes nothing (quickSim runs are never saved), but it
// is a developer tool and shipped in public builds behind eight taps. It now
// only unlocks in development (Metro, `npm run web`) or in a build that opts in
// with EXPO_PUBLIC_DEV_TOOLS=1 — the `development` and `preview` EAS profiles
// set it, `production` doesn't.
const DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1'


type Family = 'league' | 'champions_league' | 'custom_ucl' | 'world_cup' | 'test_final'
const TESTER_FAMILIES: [Family, string][] = [['league', 'League'], ['champions_league', 'UCL'], ['custom_ucl', 'UCL full'], ['world_cup', 'WC']]

export default function AboutScreen() {
  const [taps, setTaps] = useState(0)
  const [showTester, setShowTester] = useState(false)
  const [busy, setBusy] = useState(false)

  // P8-73: the tester is behind "Made in Slovakia" now; the version is a real
  // button (it opens the version history), so it can't be the secret door too.
  function tapMadeIn() {
    const n = taps + 1
    setTaps(n)
    if (n >= 8 && DEV_TOOLS) setShowTester(true)
  }

  async function runQuickSim(family: Family) {
    setBusy(true)
    try {
      if (family === 'league') {
        const run = await quickSimLeague()
        useGameStore.setState({ mode: 'all_time', difficulty: 'medium', formation: run.formation, draftedPlayers: run.draftedPlayers, placedLeague: run.placedLeague, simResult: run.simResult, accentColor: null, quickSim: true })
        router.push('/game/result')
      } else if (family === 'custom_ucl') {
        const run = await quickSimCustomUcl()
        useGameStore.setState({ mode: 'champions_league', difficulty: 'medium', formation: run.formation, draftedPlayers: run.draftedPlayers, clTeams: run.clTeams, clResult: run.clResult, customUclQual: run.qual, customUclLeagues: run.tables, accentColor: null, quickSim: true })
        router.push('/game/custom-ucl-result')
      } else if (family === 'champions_league') {
        const run = await quickSimCL()
        useGameStore.setState({ mode: 'champions_league', difficulty: 'medium', formation: run.formation, draftedPlayers: run.draftedPlayers, clTeams: run.clTeams, clResult: run.clResult, accentColor: null, quickSim: true })
        router.push('/game/cl-result')
      } else if (family === 'test_final') {
        // Big Fixes §12 — auto-drafts, then goes through the REAL placement →
        // group stage → knockout flow like any other World Cup run (nothing
        // is skipped to a result screen). simulation.tsx's WC path checks the
        // testForceWinUntilFinal flag and forces the player's own matches —
        // every round except the final — to a clean 1-0 win, so you always
        // reach the final; the final itself always simulates for real.
        const run = await autoDraftForTestFinal()
        useGameStore.setState({
          mode: 'world_cup', difficulty: 'medium',
          formation: run.formation, draftedPlayers: run.draftedPlayers,
          benchPlayers: [], useSubstitutes: false,
          wcTeams: null, wcResult: null,
          accentColor: null, quickSim: true, testForceWinUntilFinal: true,
        })
        router.push('/game/placement')
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
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="About" path="/about" />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>ABOUT</KitText>

      {/* The globe is always spinning, Slovakia always lit up. */}
      <View style={styles.hero}>
        <SpinningGlobe accent={roles.text} size={180} />
        {/* Eight taps here open the Quick Sim Tester, in dev builds only. */}
        <Pressable onPress={tapMadeIn} style={styles.madeIn} accessibilityRole="text">
          <KitText t="title" color={roles.text}>Made in Slovakia</KitText>
          {/* P8-58: the real flag, not the emoji. */}
          <RoundFlag emoji="🇸🇰" code="SVK" size={24} roles={roles} />
        </Pressable>
        <KitText t="tag" color={roles.textMuted} style={styles.centre}>Solo dev · high school student · football obsessive</KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>Who's behind this</SectionTag>
        <KitText t="bodyL" color={roles.text}>
          I'm a high school student, born and raised in Slovakia. Perfection or Misery is a solo
          project I build in whatever spare time school leaves me. Every mode, every screen, every
          line of the simulation engine is mine. No studio, no team: when a knockout bracket needed
          pinch-to-zoom or the globe needed to spin, I sat down and figured out how to build it.
        </KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>Why this exists</SectionTag>
        <KitText t="bodyL" color={roles.text}>
          I was heavily inspired by{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL('https://38-0.app/')}>38-0.app ↗</Text>
          {'. '}I loved the core idea, but kept noticing things I wanted to do differently. So I
          decided to build my own take on it: deeper simulation, real competitions, and a lot more
          drama along the way. What started as "38-0 but mine" has grown into a full football
          universe: a custom UEFA Champions League journey across all 53 UEFA leagues, a 48-team
          FIFA World Cup, live matches on a ticking clock, and now a full match sheet with player ratings
          for every single simulated match.
        </KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>Under the hood</SectionTag>
        <KitText t="bodyL" color={roles.text}>
          • React Native + Expo Router, state managed with Zustand{'\n'}
          • Real club and player data across 50+ leagues, built from Wikipedia and Wikidata and
          bundled into a local SQLite database, with ratings the game works out for itself. The
          whole game runs offline; you only need a connection to save runs{'\n'}
          • Every match is decided by a custom simulation engine from team OVR, form and controlled
          randomness, goal by goal{'\n'}
          • On top of the result engine sits a deterministic deep-stats generator: possession, xG,
          shot counts, pass numbers, duels, individual 0–10 ratings and a Player of the Match for
          every fixture. That's thousands of matches per run, each rebuilt from a single stored seed,
          so reopening a match always shows the same numbers{'\n'}
          • UEFA Champions League and FIFA World Cup knockouts run through a full two-legged / extra-time /
          penalty-shootout engine, with named takers pulled from your actual squad{'\n'}
          • The country-reveal globe (in the draw, and the one spinning above)
          is a from-scratch orthographic map projection in SVG. No map library, just spherical
          trigonometry{'\n'}
          • Live matches tick on a real clock (pausable mid-match), and the knockout bracket is a
          pinch-to-zoom tree you pan around like a map
        </KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>Built with</SectionTag>
        <KitText t="bodyL" color={roles.text}>React Native, Expo, Zustand, SQLite, and Supabase.</KitText>
      </View>

      {/* P8.5-32: the attribution the data's licences ask for (Wikipedia's text is
          CC BY-SA 4.0; Wikidata is CC0 and asks nothing, but it's credited too). */}
      <View style={styles.section}>
        <SectionTag roles={roles}>Data</SectionTag>
        <KitText t="bodyL" color={roles.text}>
          Contains data from{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL('https://en.wikipedia.org/')}>Wikipedia ↗</Text>
          {' '}(CC BY-SA 4.0) and{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL('https://www.wikidata.org/')}>Wikidata ↗</Text>
          {' '}(CC0): squads, appearances, goals, league tables, grounds and club colours. Player
          ratings are the game's own, worked out from those facts; they aren't any official or
          commercial rating.
        </KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>Version</SectionTag>
        <VersionButton roles={roles} />
      </View>

      {/* Hidden tester — unlocked by tapping "Made in Slovakia" 8×, at the bottom of About */}
      {showTester && (
        <View style={[styles.section, styles.tester, { borderColor: roles.line }]}>
          <SectionTag roles={roles}>Quick Sim Tester</SectionTag>
          <KitText t="body" color={roles.text}>
            Auto-drafts a random squad, simulates a full season with no UI, and drops you on the result screen (stats included). Not saved to your account.
          </KitText>
          <KitText t="body" color={roles.textMuted}>
            Final only auto-drafts, then plays through the real World Cup flow (placement → groups → knockouts). Every match your team plays is forced to a clean 1-0 win except the final, which is always simulated for real.
          </KitText>
          {busy ? (
            <View style={styles.testerBusy}>
              <Loader color={roles.text} />
              <KitText t="body" color={roles.textMuted}>Drafting and simulating…</KitText>
            </View>
          ) : (
            <View style={styles.testerBtns}>
              {TESTER_FAMILIES.map(([f, label]) => (
                <Plate key={f} roles={roles} variant="secondary" label={label} onPress={() => runQuickSim(f)} style={styles.testerBtn} />
              ))}
              <Plate roles={roles} label="Final" onPress={() => runQuickSim('test_final')} style={styles.testerBtn} />
            </View>
          )}
        </View>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  // A 44pt target: it's tapped eight times in a row.
  madeIn: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  title: { marginTop: space[2], marginBottom: space[3] },
  hero: { alignItems: 'center', paddingVertical: space[4], gap: space[2] },
  centre: { textAlign: 'center' },
  section: { gap: space[2], paddingVertical: space[4], borderTopWidth: border.hair, borderTopColor: roles.rule },
  link: { fontFamily: font.bodyBold, color: roles.text, textDecorationLine: 'underline' },
  tester: { borderWidth: border.thin, paddingHorizontal: space[3] },
  testerBusy: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  testerBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  testerBtn: { flexGrow: 1, minWidth: 96 },
})
