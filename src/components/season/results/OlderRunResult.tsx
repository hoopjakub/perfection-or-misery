// A cup run saved before its whole result was kept (F-21): the same one result
// screen, with what the saved row has, the verdict and its record. Its story
// and doors show what the run hub can still rebuild, and none it can't. It was
// two separate old-style screens (CLHistorySummary, WCHistorySummary).
import { t } from '@/i18n'
import React from 'react'
import { compOfMode, EUROPE } from '@/data/europe'
import { formatTier, verdictOf } from '@/data/tiers'
import { VerdictBlock } from '@/components/season/VerdictBlock'
import { ResultActions } from '@/components/season/ResultParts'
import { ResultShell } from '@/components/season/ResultShell'

export function OlderRunResult({ runId, run }: { runId: string; run: any }) {
  const round = String(run.tier ?? '')
  const title = formatTier(round).toUpperCase()
  const comp = run.mode === 'world_cup' ? t('comp.wc') : (compOfMode(run.mode) ?? EUROPE.ucl).fullName
  return (
    <ResultShell mode={run.mode} runId={runId}
      verdict={
        <VerdictBlock tone={verdictOf(round)} title={title}
          meta={`${comp} · ${t('result.olderMeta', { ovr: run.team_ovr, place: run.final_position, count: run.teams_in_league })}`}
          line={t('result.olderNote')}
          shareText={t('result.shareCup', { title, comp })}
          runId={runId} ownerId={run.user_id ?? null} scoreRow={run} />
      }
      figures={[[t('result.figW'), run.wins ?? 0], [t('result.figD'), run.draws ?? 0], [t('result.figL'), run.losses ?? 0], [t('result.figGoals'), `${run.goals_for ?? 0}–${run.goals_against ?? 0}`]]}
      actions={<ResultActions compact fromHistory submitting={false} onAgain={() => {}} onHome={() => {}} />}
    />
  )
}
