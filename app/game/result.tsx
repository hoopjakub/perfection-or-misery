// Every mode's result (Wave F, centralisation step 6): one route that picks
// the family by mode and hands it the run. Four routes used to do this
// (result, cl-result, wc-result, custom-ucl-result), each loading the saved
// run, adopting its crest and drawing its own 13-to-20-block page.
import { t } from '@/i18n'
import { runEnded } from '@/diag/log'
import { log } from '@/diag/log'
import React, { useEffect, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { adoptRunCrest } from '@/store/crestStore'
import { fetchRunById } from '@/db/queries/runs'
import { isClassicEurope } from '@/data/europe'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { KitScreen, KitText, Loader, Plate, EmptyState } from '@/components/kit'
import { LeagueResult } from '@/components/season/results/LeagueResult'
import { ClassicCupResult, WorldCupResult, FullPathResult } from '@/components/season/results/CupResults'
import { OlderRunResult } from '@/components/season/results/OlderRunResult'
import type { CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'

const roles = ROLES[EVERYDAY]

export default function ResultScreen() {
  const { runId } = useLocalSearchParams<{ runId?: string }>()
  const store = useGameStore()
  const [run, setRun] = useState<any>(null)
  const [loading, setLoading] = useState(!!runId)
  useEffect(() => {
    if (!runId) return
    let active = true
    fetchRunById(runId)
      .then(r => { adoptRunCrest((r as any)?.highlights); if (active) setRun(r) })   // P8-132: the crest it was played with
      .catch(e => log.error('net', 'result: failed to load run', e))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [runId])
  // Phase 9: a fresh run reaching its result is RUN ENDED in the log (once: it clears the run).
  useEffect(() => { if (!runId) runEnded('finished') }, [runId])

  if (loading) {
    return (
      <KitScreen ground={EVERYDAY}>
        <Loader color={roles.text} wide />
        <KitText t="bodyL" color={roles.textMuted} style={{ marginTop: space[4] }}>{t('result.loadingRunDots')}</KitText>
      </KitScreen>
    )
  }

  // A saved run says what it was; a fresh one is in the store.
  const mode = runId ? run?.mode : store.mode
  if (mode === 'world_cup' || mode === 'champions_league_custom' || isClassicEurope(mode)) {
    const result = mode === 'world_cup'
      ? (runId ? run?.wc_result : store.wcResult) as WCSeasonResult | null
      : (runId ? run?.cl_result : store.clResult) as CLSeasonResult | null
    // F-21: a cup run saved before its whole result was kept.
    if (!result && run) return <OlderRunResult runId={runId!} run={run} />
    if (!result) {
      return (
        <KitScreen ground={EVERYDAY}>
          <EmptyState roles={roles} title={t('result.noSeason')} body={t('result.noSeasonBody')} />
          <Plate label={t('result.backToModes')} roles={roles} variant="secondary" onPress={() => router.replace('/game/mode-select')} />
        </KitScreen>
      )
    }
    if (mode === 'world_cup') return <WorldCupResult runId={runId} run={run} result={result as WCSeasonResult} />
    if (mode === 'champions_league_custom') return <FullPathResult runId={runId} run={run} result={result as CLSeasonResult} />
    return <ClassicCupResult runId={runId} run={run} result={result as CLSeasonResult} />
  }
  return <LeagueResult runId={runId} run={run} />
}
