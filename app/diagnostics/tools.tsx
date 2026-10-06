// Phase 9, Diagnostics step 5 (docs/diagnostics/02-POM-ARCHITECTURE.md §7.1):
// the Quick Sim Tester, moved here from the bottom of About.
//
// It writes nothing (quickSim runs are never saved), but it's a developer tool,
// so it exists only in development (Metro, `npm run web`) or in a build that
// opts in with EXPO_PUBLIC_DEV_TOOLS=1 (the `development` and `preview` EAS
// profiles; `production` doesn't). expo-router makes every file a route, so in
// a public build this screen sends you straight back to Diagnostics: the
// tester can't be reached from a link either.
import { t } from '@/i18n'
import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Redirect, router } from 'expo-router'
import { KitScreen, KitText, BackControl, Plate, Loader } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { useGameStore } from '@/store/gameStore'
import { quickSimLeague, quickSimCL, quickSimWC, quickSimCustomUcl, autoDraftForTestFinal } from '@/engine/quick-sim'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { log, setLogContext } from '@/diag/log'

export const DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1'

const roles = ROLES[EVERYDAY]
type Family = 'league' | 'champions_league' | 'custom_ucl' | 'world_cup' | 'test_final'
const FAMILIES: [Family, string][] = [['league', t('about.famLeague')], ['champions_league', t('about.famUcl')], ['custom_ucl', t('about.famUclFull')], ['world_cup', t('about.famWc')]]

export default function DiagnosticsTools() {
  const [busy, setBusy] = useState(false)
  if (!DEV_TOOLS) return <Redirect href="/diagnostics" />

  async function run(family: Family) {
    setBusy(true)
    setLogContext('tester')
    try {
      if (family === 'league') {
        const r = await quickSimLeague()
        useGameStore.setState({ mode: 'all_time', difficulty: 'medium', formation: r.formation, draftedPlayers: r.draftedPlayers, placedLeague: r.placedLeague, simResult: r.simResult, accentColor: null, quickSim: true })
        router.push('/game/result')
      } else if (family === 'custom_ucl') {
        const r = await quickSimCustomUcl()
        useGameStore.setState({ mode: 'champions_league_custom', difficulty: 'medium', formation: r.formation, draftedPlayers: r.draftedPlayers, clTeams: r.clTeams, clResult: r.clResult, customUclQual: r.qual, customUclLeagues: r.tables, accentColor: null, quickSim: true })
        router.push('/game/result')
      } else if (family === 'champions_league') {
        const r = await quickSimCL()
        useGameStore.setState({ mode: 'champions_league', difficulty: 'medium', formation: r.formation, draftedPlayers: r.draftedPlayers, clTeams: r.clTeams, clResult: r.clResult, accentColor: null, quickSim: true })
        router.push('/game/result')
      } else if (family === 'test_final') {
        // Big Fixes §12: auto-drafts, then plays the REAL placement, groups and
        // knockouts; simulation.tsx forces your matches before the final to a
        // clean 1-0 (testForceWinUntilFinal), and the final plays for real.
        const r = await autoDraftForTestFinal()
        useGameStore.setState({
          mode: 'world_cup', difficulty: 'medium',
          formation: r.formation, draftedPlayers: r.draftedPlayers,
          benchPlayers: [], useSubstitutes: false,
          wcTeams: null, wcResult: null,
          accentColor: null, quickSim: true, testForceWinUntilFinal: true,
        })
        router.push('/game/placement')
      } else {
        const r = await quickSimWC()
        useGameStore.setState({ mode: 'world_cup', difficulty: 'medium', formation: r.formation, draftedPlayers: r.draftedPlayers, wcTeams: r.wcTeams, wcResult: r.wcResult, accentColor: null, quickSim: true })
        router.push('/game/result')
      }
    } catch (e) {
      log.error('sim', 'quick-sim: failed', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('about.tester')} path="/diagnostics/tools" />
      <BackControl roles={roles} title={t('about.tester')} />
      <View style={styles.body}>
        <KitText t="body" color={roles.text}>{t('about.testerA')}</KitText>
        <KitText t="body" color={roles.textMuted}>{t('about.testerB')}</KitText>
        {busy ? (
          <View style={styles.busy}>
            <Loader color={roles.text} />
            <KitText t="body" color={roles.textMuted}>{t('about.drafting')}</KitText>
          </View>
        ) : (
          <View style={styles.btns}>
            {FAMILIES.map(([f, label]) => (
              <Plate key={f} roles={roles} variant="secondary" label={label} onPress={() => run(f)} style={styles.btn} />
            ))}
            <Plate roles={roles} label={t('about.final')} onPress={() => run('test_final')} style={styles.btn} />
          </View>
        )}
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  body: { gap: space[3] },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  btn: { flexGrow: 1, minWidth: 96 },
})
