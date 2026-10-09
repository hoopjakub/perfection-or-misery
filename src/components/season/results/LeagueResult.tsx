// A league run's result (League, All Time, Chaos, Cursed): its verdict, its
// save and its awards, drawn through the one result screen (ResultShell).
// Wave F (centralisation step 6): this was app/game/result.tsx, 1,008 lines
// and thirteen blocks before Play again; the season's detail now lives in the
// run hub, behind the screen's doors.
import { t } from '@/i18n'
import { log } from '@/diag/log'
import React, { useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveRun } from '@/db/queries/runs'
import { mergeCareerFromRun } from '@/db/queries/career'
import { liveRunData } from '@/lib/runData'
import { useRunSave } from '@/hooks/useRunSave'
import { clubsForManagerAward } from '@/lib/awardsNight'
import { buildAwardsNight } from '@/engine/awards'
import { predictTable } from '@/engine/predictions'
import { cupReachOf, type DomesticCup } from '@/engine/domestic-cup'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { KitScreen, KitText, Plate, EmptyState, ModeLookProvider, lookFor } from '@/components/kit'
import { VerdictBlock } from '@/components/season/VerdictBlock'
import { ResultActions } from '@/components/season/ResultParts'
import { ResultShell } from '@/components/season/ResultShell'
import type { RunStats } from '@/lib/awardsNight'
import { TIER_LABEL, formatTier, verdictOf } from '@/data/tiers'

const roles = ROLES[EVERYDAY]

/** The verdict's title and line for each league tier. */
function tierMeta(tier: string): { title: string; desc: string } {
  const known = (TIER_LABEL as Record<string, string>)[tier]
  return known
    ? { title: known.toUpperCase(), desc: t(`result.desc.${tier}` as 'result.desc.perfection') }
    // A cup run's round ("winner", "sf") reaching this screen from an old save.
    : { title: formatTier(tier).toUpperCase(), desc: '' }
}

export function LeagueResult({ runId, run }: { runId?: string; run: any | null }) {
  const store = useGameStore()
  const { simResult, resetRun, mode, formation, placedLeague, draftedPlayers, benchPlayers, quickSim, difficulty, customDifficulty } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()

  // A fresh run: the live squad and its season are in the store. Its stats
  // come from the run's one cache (RunData, L-07), which Awards Night has
  // usually filled already; the save waits for them.
  const isFreshRun = !runId && !!(simResult?.matchdayHistory?.length && draftedPlayers.length > 0 && placedLeague)
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  const [statsDone, setStatsDone] = useState(!isFreshRun)
  useEffect(() => {
    if (!isFreshRun) return
    liveRunData()
      .then(d => d && setRunStats({ stats: d.stats, awards: d.awards, rounds: d.rounds ?? undefined }))
      .catch(e => log.warn('stats', 'result: stats failed', e))
      .finally(() => setStatsDone(true))
  }, [])
  const runSave = useRunSave({ applies: isFreshRun && !quickSim, history: !isFreshRun, signedIn: !!user && !isGuest, ready: statsDone })
  // A double tap (or both buttons) used to save twice; above the early returns.
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  if (!statsDone) {
    return <KitScreen ground={EVERYDAY}><KitText t="bodyL" color={roles.textMuted} style={{ marginTop: space[6] }}>{t('result.tallying')}</KitText></KitScreen>
  }

  // The season: from the store, or the saved row.
  const r = run ? {
    finalPosition: run.final_position, teamsInLeague: run.teams_in_league,
    wins: run.wins, draws: run.draws, losses: run.losses, goalsFor: run.goals_for, goalsAgainst: run.goals_against,
    tier: run.tier, playerTeam: { ovr: run.team_ovr, clubName: undefined as string | undefined },
    table: run.matchday_history?.length ? run.matchday_history[run.matchday_history.length - 1].standings : [],
  } : simResult
  if (!r) {
    return (
      <KitScreen ground={EVERYDAY}>
        <EmptyState roles={roles} title={t('result.noSeason')} body={t('result.noSeasonBody')} />
        <Plate label={t('result.backToModes')} roles={roles} variant="secondary" onPress={() => router.replace('/game/mode-select')} />
      </KitScreen>
    )
  }
  const { finalPosition, teamsInLeague, wins, draws, losses, goalsFor, goalsAgainst, tier, playerTeam, table } = r
  const meta = tierMeta(tier)
  const gd = goalsFor - goalsAgainst
  const youId = (table as any[])?.find((x: any) => x.isPlayer)?.clubId as string | undefined

  // Where you played: "Premier League 2024/25 · You took over Everton".
  const takeoverLine = (() => {
    const lg = placedLeague?.leagueName ?? run?.league_name
    const ys = placedLeague?.yearStart ?? run?.year_start
    const season = ys ? `${ys}/${String(ys + 1).slice(-2)}` : null
    const rawClub = (playerTeam as any)?.clubName
    // A league run always stores the club it replaced; the fallback only
    // meets an older save from another mode ("Brazil XI" is Brazil).
    const club = placedLeague?.replacedTeamName ?? run?.replaced_team_name ?? (rawClub && rawClub !== 'Your XI' ? rawClub.replace(/ XI$/, '') : null)
    if (!lg && !club) return null
    return `${[lg, season].filter(Boolean).join(' ')}${club ? t('result.tookOver', { club }) : ''}`
  })()

  // P8-96: the pundits' calls, from the live run's seed or as the saved run kept them.
  const livePrediction = !run && store.predictionSeed != null && placedLeague ? predictTable(placedLeague.teams, store.predictionSeed) : null
  const predicted = youId ? (livePrediction ? livePrediction.table.find(x => x.clubId === youId)?.predicted : run?.highlights?.pundits?.[youId]) : undefined
  const punditCheck = predicted != null ? { predicted, actual: finalPosition, field: teamsInLeague } : null

  // P8-173: the league's cup. Winning it and the league is the Double.
  const cup: DomesticCup | null = (run ? run.highlights?.cup : simResult?.cup) ?? null
  const cupReach = cup && youId ? cupReachOf(cup, youId) : null
  const double = cupReach === 'winner' && finalPosition === 1

  const awardsSrc = runStats ?? (run?.stats && run?.awards ? { stats: run.stats, awards: run.awards } : null)
  const night = awardsSrc ? buildAwardsNight({
    awards: awardsSrc.awards, stats: awardsSrc.stats, rounds: (awardsSrc as RunStats).rounds,
    clubs: clubsForManagerAward(placedLeague?.teams, simResult?.table, store.predictionSeed), playerClubId: youId,
    managerName: useUserStore.getState().profile?.username ?? undefined,
  }) : null

  // Handed to useRunSave, which runs it once and shows a failure rather than
  // pretending it worked.
  async function saveCurrentRun() {
    if (user && !isGuest && !quickSim && mode && formation && placedLeague && simResult) {
      await saveRun({
        userId: user.id, mode, formation, teamOvr: simResult.playerTeam.ovr,
        leagueId: placedLeague.leagueId, leagueName: placedLeague.leagueName, yearStart: placedLeague.yearStart,
        seasonResult: simResult, squad: fullSquad, matchdayHistory: simResult.matchdayHistory,
        difficulty, custom: customDifficulty, stats: runStats?.stats, awards: runStats?.awards,
        pundits: livePrediction ? Object.fromEntries(livePrediction.table.map(x => [x.clubId, x.predicted])) : null,
        punditPoints: livePrediction ? Object.fromEntries(livePrediction.table.map(x => [x.clubId, x.points])) : null,
        punditsOnYou: punditCheck ? { predicted: punditCheck.predicted, field: punditCheck.field } : null,
        extra: { gotAway: store.gotAway },
      })
    }
    if (user && !isGuest && !quickSim && runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      mergeCareerFromRun(user.id, {
        competition: 'league', yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub), goalsFor, goalsAgainst,
        potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined, u21WinnerId: u21?.isPlayerClub ? u21.playerId : undefined,
      }).catch(e => log.warn('save', 'career: merge failed', e))
    }
  }
  runSave.setTask(saveCurrentRun)

  const leave = (then: () => void) => async () => {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await runSave.flush()
    resetRun()
    then()
  }

  return (
    <ModeLookProvider look={lookFor(run?.mode ?? mode)}>
      <ResultShell mode={run?.mode ?? mode} runId={runId} night={night}
        verdict={
          <VerdictBlock
            tone={verdictOf(tier)}
            title={meta.title}
            line={meta.desc + t('result.finishedOf', { place: finalPosition, count: teamsInLeague }) + (double ? t('result.double', { cup: cup!.name }) : cupReach === 'winner' ? t('result.cupToo', { cup: cup!.name }) : '')}
            meta={takeoverLine ?? undefined}
            pundits={punditCheck ?? undefined}
            shareText={t('result.share', { title: meta.title, place: finalPosition, count: teamsInLeague, takeover: takeoverLine ? `, ${takeoverLine}` : '' })}
            runId={runId}
            ownerId={runId ? run?.user_id ?? null : undefined}
            scoreRow={runId ? run ?? null : undefined}
          />
        }
        figures={[[t('result.figPts'), wins * 3 + draws], [t('result.figW'), wins], [t('result.figD'), draws], [t('result.figL'), losses], [t('result.figGd'), gd > 0 ? `+${gd}` : gd], [t('result.figFor'), goalsFor], [t('result.figAg'), goalsAgainst]]}
        actions={<ResultActions compact fromHistory={!!runId} submitting={submitting} save={runSave} onAgain={leave(restartToModeSelect)} onHome={leave(exitToHome)} />}
      />
    </ModeLookProvider>
  )
}
