// The classic Champions, Europa and Conference League results, the World
// Cup's and the full European path's, drawn through the one result screen
// (ResultShell). Wave F (centralisation step 6): these were cl-result.tsx,
// wc-result.tsx and custom-ucl-result.tsx, 14 to 20 blocks each; the tournament's detail
// (the league phase, the groups, the bracket, the grounds, the pundits'
// tournament) now lives in the run hub, behind the screen's doors.
import { t } from '@/i18n'
import { log } from '@/diag/log'
import React, { useEffect, useRef, useState } from 'react'
import { ordinal } from '@/lib/format'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveCLRun, saveWCRun, saveCustomUclRun } from '@/db/queries/runs'
import { label } from '@/i18n/labels'
import { fullPathTier, huntMet } from '@/engine/europe-path'
import { QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import type { EuroComp } from '@/data/uefa-coefficients'
import type { QualifyingResult } from '@/engine/cl-qualifying'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import { mergeCareerFromRun } from '@/db/queries/career'
import { liveRunData } from '@/lib/runData'
import { useRunSave } from '@/hooks/useRunSave'
import { buildAwardsNight } from '@/engine/awards'
import { koTieLegRecord } from '@/engine/run-stats'
import { predictTable, predictChampionsLeagueRound, predictWorldCupRound, punditsOnYouFor } from '@/engine/predictions'
import { compOfMode, EUROPE } from '@/data/europe'
import { formatTier, verdictOf } from '@/data/tiers'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { KitScreen, KitText } from '@/components/kit'
import { VerdictBlock } from '@/components/season/VerdictBlock'
import { ResultActions } from '@/components/season/ResultParts'
import { ResultShell } from '@/components/season/ResultShell'
import type { CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import { managerClubsFor, type RunStats } from '@/lib/awardsNight'

const roles = ROLES[EVERYDAY]

/**
 * What a cup family shares: the run's stats from the one cache (L-07), the
 * save once they're in, and leaving through the save. A saved run reads its row.
 */
function useCupRun(fresh: boolean) {
  const { quickSim } = useGameStore()
  const { user, isGuest } = useUserStore()
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  const [statsDone, setStatsDone] = useState(!fresh)
  useEffect(() => {
    if (!fresh) return
    liveRunData()
      .then(d => d && setRunStats({ stats: d.stats, awards: d.awards, rounds: d.rounds ?? undefined }))
      .catch(e => log.warn('stats', 'result: stats failed', e))
      .finally(() => setStatsDone(true))
  }, [])
  const runSave = useRunSave({ applies: fresh && !quickSim, signedIn: !!user && !isGuest, ready: statsDone })
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const leave = (then: () => void) => async () => {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await runSave.flush()
    useGameStore.getState().resetRun()
    then()
  }
  return { runStats, statsDone, runSave, submitting, leave, user: user && !isGuest && !quickSim ? user : null }
}

const Tallying = () => (
  <KitScreen ground={EVERYDAY}><KitText t="bodyL" color={roles.textMuted} style={{ marginTop: space[6] }}>{t('result.tallying')}</KitText></KitScreen>
)

// ── The Champions, Europa or Conference League (classic) ────────────────────
export function ClassicCupResult({ runId, run, result }: { runId?: string; run: any | null; result: CLSeasonResult }) {
  const store = useGameStore()
  const fresh = !runId && store.draftedPlayers.length > 0
  const { runStats, statsDone, runSave, submitting, leave, user } = useCupRun(fresh)
  if (!statsDone) return <Tallying />
  // P8-172: which of the three; a saved run says.
  const comp = compOfMode(run?.mode ?? store.mode) ?? EUROPE.ucl
  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, playerTeam, playerFinalRound, playerPot } = result
  const title = formatTier(playerFinalRound)
  const pos = leaguePhaseStandings.findIndex(x => x.isPlayer) + 1
  // The pundits' pre-season call, rebuilt from the live run's seed.
  const punditsText = (() => {
    if (run || store.predictionSeed == null || !store.clTeams) return undefined
    const p = predictTable(store.clTeams.map(x => ({ clubId: x.clubId, clubName: x.clubName, ovr: x.ovr, isPlayer: x.isPlayer })), store.predictionSeed).player
    return p ? t('result.theySaidCup', { said: formatTier(predictChampionsLeagueRound(p.predicted).key).toLowerCase(), tier: title.toLowerCase() }) : undefined
  })()
  // Your knockout record leg by leg (a tie's legs can be won and lost).
  const yourTies = [...playoffRound, ...r16, ...qf, ...sf, ...(final ? [final] : [])].filter(m => m.teamA.isPlayer || m.teamB.isPlayer)
  let w = 0, d = 0, l = 0
  for (const m of yourTies) { const x = koTieLegRecord(m, m.teamA.isPlayer); w += x.w; d += x.d; l += x.l }

  async function persistRun() {
    if (!user || !fresh) return
    if (store.formation) {
      await saveCLRun({
        userId: user.id, formation: store.formation, teamOvr: playerTeam.ovr, result, mode: comp.mode,
        squad: [...store.draftedPlayers, ...store.benchPlayers], difficulty: store.difficulty, custom: store.customDifficulty,
        stats: runStats?.stats, awards: runStats?.awards,
        punditsOnYou: punditsOnYouFor(store.clTeams, store.predictionSeed),
        extra: { gotAway: store.gotAway, punditSeed: store.predictionSeed },
      })
    }
    if (runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      await mergeCareerFromRun(user.id, {
        competition: comp.mode, yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub),
        goalsFor: playerTeam.stats.goalsFor, goalsAgainst: playerTeam.stats.goalsAgainst,
        potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined, u21WinnerId: u21?.isPlayerClub ? u21.playerId : undefined,
      }).catch(e => log.warn('save', 'career: merge failed', e))
    }
  }
  runSave.setTask(persistRun)

  const src = runStats ?? (run?.stats && run?.awards ? { stats: run.stats, awards: run.awards } : null)
  const night = src ? buildAwardsNight({ awards: src.awards, stats: src.stats, rounds: (src as RunStats).rounds, clubs: run ? [] : managerClubsFor(store), playerClubId: playerTeam.clubId, mode: comp.mode }) : null
  return (
    <ResultShell mode={run?.mode ?? store.mode} runId={runId} night={night}
      verdict={
        <VerdictBlock tone={verdictOf(playerFinalRound)} title={title}
          meta={`${comp.fullName} · ${playerTeam.clubName} · ` + t('result.inLeaguePhase', { place: ordinal(pos) })}
          punditsText={punditsText}
          shareText={t('result.shareCup', { title, comp: comp.fullName })}
          runId={runId} ownerId={runId ? run?.user_id ?? null : undefined} scoreRow={runId ? run ?? null : undefined} />
      }
      figures={[
        [t('result.figLeaguePhase'), ordinal(pos)], [t('result.figPts'), playerTeam.stats.points],
        [t('result.figW'), playerTeam.stats.won], [t('result.figD'), playerTeam.stats.drawn], [t('result.figL'), playerTeam.stats.lost],
        [t('result.figGoals'), `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`],
        ...(yourTies.length > 0 ? [[t('result.figKo'), d > 0 ? `${w}-${d}-${l}` : `${w}-${l}`] as [string, string]] : []),
        [t('result.figPot'), playerPot],
      ]}
      actions={<ResultActions compact fromHistory={!!runId} submitting={submitting} save={runSave} onAgain={leave(restartToModeSelect)} onHome={leave(exitToHome)} />}
    />
  )
}

// ── The World Cup ────────────────────────────────────────────────────────────
export function WorldCupResult({ runId, run, result }: { runId?: string; run: any | null; result: WCSeasonResult }) {
  const store = useGameStore()
  const fresh = !runId && store.draftedPlayers.length > 0
  const { runStats, statsDone, runSave, submitting, leave, user } = useCupRun(fresh)
  if (!statsDone) return <Tallying />
  const { knockoutRounds, playerTeam, playerFinalRound, playerGroup, playerGroupPos } = result
  const title = formatTier(playerFinalRound)
  const punditsText = (() => {
    if (run || store.predictionSeed == null || !store.wcTeams) return undefined
    const p = predictTable(store.wcTeams.map(x => ({ clubId: x.clubId, clubName: x.clubName, ovr: x.ovr, isPlayer: x.isPlayer })), store.predictionSeed).player
    return p ? t('result.theySaidCup', { said: formatTier(predictWorldCupRound(p.predicted).key).toLowerCase(), tier: title.toLowerCase() }) : undefined
  })()
  const yourKo = knockoutRounds.flatMap(r => r.matches).filter(m => m.teamA.isPlayer || m.teamB.isPlayer)
  const koW = yourKo.filter(m => m.winner.isPlayer).length

  async function persistRun() {
    if (!user || !fresh) return
    if (store.formation) {
      await saveWCRun({
        userId: user.id, formation: store.formation, teamOvr: playerTeam.ovr, result,
        squad: [...store.draftedPlayers, ...store.benchPlayers], difficulty: store.difficulty, custom: store.customDifficulty,
        stats: runStats?.stats, awards: runStats?.awards,
        punditsOnYou: punditsOnYouFor(store.wcTeams, store.predictionSeed),
        extra: { gotAway: store.gotAway, punditSeed: store.predictionSeed },
      })
    }
    if (runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      await mergeCareerFromRun(user.id, {
        competition: 'world_cup', yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub),
        goalsFor: playerTeam.stats.goalsFor, goalsAgainst: playerTeam.stats.goalsAgainst,
        potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined, u21WinnerId: u21?.isPlayerClub ? u21.playerId : undefined,
      }).catch(e => log.warn('save', 'career: merge failed', e))
    }
  }
  runSave.setTask(persistRun)

  const src = runStats ?? (run?.stats && run?.awards ? { stats: run.stats, awards: run.awards } : null)
  const night = src ? buildAwardsNight({ awards: src.awards, stats: src.stats, rounds: (src as RunStats).rounds, clubs: run ? [] : managerClubsFor(store), playerClubId: playerTeam.clubId, mode: 'world_cup' }) : null
  return (
    <ResultShell mode="world_cup" runId={runId} night={night}
      verdict={
        <VerdictBlock tone={verdictOf(playerFinalRound)} title={title}
          meta={t('result.wcMeta', { team: playerTeam.clubName, group: playerGroup, place: ordinal(playerGroupPos) })}
          punditsText={punditsText}
          shareText={t('result.wcShare', { title })}
          runId={runId} ownerId={runId ? run?.user_id ?? null : undefined} scoreRow={runId ? run ?? null : undefined} />
      }
      figures={[
        [t('result.figGroup'), ordinal(playerGroupPos)], [t('result.games'), playerTeam.stats.played],
        [t('result.figW'), playerTeam.stats.won], [t('result.figD'), playerTeam.stats.drawn], [t('result.figL'), playerTeam.stats.lost],
        [t('result.figGoals'), `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`],
        ...(yourKo.length > 0 ? [[t('result.figKo'), `${koW}-${yourKo.length - koW}`] as [string, string]] : []),
      ]}
      actions={<ResultActions compact fromHistory={!!runId} submitting={submitting} save={runSave} onAgain={leave(restartToModeSelect)} onHome={leave(exitToHome)} />}
    />
  )
}

// ── The full European path (Champions, Europa or Conference League) ─────────
// Was app/game/custom-ucl-result.tsx: 20 blocks, the qualifying ladder, 53
// league tables, the bracket and the other two competitions inline. The verdict
// keeps how you got in (or didn't) and your domestic season; the rest is the
// hub's Season, Bracket, Europe and Pundits tabs.
export function FullPathResult({ runId, run, result }: { runId?: string; run: any | null; result: CLSeasonResult }) {
  const store = useGameStore()
  const fresh = !runId && store.draftedPlayers.length > 0
  const { runStats, statsDone, runSave, submitting, leave, user } = useCupRun(fresh)
  if (!statsDone) return <Tallying />
  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, playerTeam, playerFinalRound, playerPot } = result
  // P8-52: the competition the season went on in, and the tier it earned there.
  const comp = EUROPE[result.competition ?? 'ucl']
  const tier = fullPathTier(result)
  const title = formatTier(tier)
  // The ladder and the 53 tables are nested in cl_result when saved
  // (saveCustomUclRun), with the old top-level columns as a fallback.
  const qual = (run ? run.cl_result?._customUclQual ?? run.custom_ucl_qual : store.customUclQual) as QualifyingResult | undefined
  const leagues = (run ? run.cl_result?._customUclTables ?? run.custom_ucl_tables : store.customUclLeagues) as SimLeagueTable[] | undefined
  // P8.5-39: a hunt counts as one only if it reached its target; a saved run
  // carries its target only then.
  const huntReached = store.europeanTarget !== 'any' && huntMet(store.europeanTarget, qual)
  const target = run ? (run.difficulty_meta as { target?: string } | null)?.target : (huntReached ? store.europeanTarget : null)
  const huntedComp = target && target !== 'any' ? EUROPE[target as EuroComp]?.name ?? null : null
  const huntMissed = !run && store.europeanTarget !== 'any' && !huntReached ? EUROPE[store.europeanTarget as EuroComp].name : null

  const pos = leaguePhaseStandings.findIndex(x => x.isPlayer) + 1
  const league = leagues?.find(lg => lg.standings.some(s => s.clubId === playerTeam.clubId)) ?? null
  const domRow = league?.standings.find(s => s.clubId === playerTeam.clubId) ?? null
  const domPos = league ? league.standings.findIndex(s => s.clubId === playerTeam.clubId) + 1 : 0
  const qualExit = QUAL_EXIT_ROUND[playerFinalRound]
  const notQualified = playerFinalRound === 'not_qualified'
  const path = qual?.playerPath ?? []
  const entry = qual?.leaguePhaseField.find(x => x.clubId === playerTeam.clubId)
  const entryRound = entry?.entryRound ?? path[0]?.round ?? 'league_phase'
  const entryPath = entry?.entryPath ?? path[0]?.path ?? 'none'
  const entryText = notQualified
    ? t('result.notQualifiedLine', { place: ordinal(domPos), league: league?.name ?? t('result.league') })
    : qualExit
    ? t('result.eliminatedIn', { comp: comp.name, round: label(QUAL_ROUND_LABEL[qualExit]), path: label(PATH_LABEL[path[path.length - 1]?.path ?? entryPath]) })
    : entryRound === 'league_phase'
    ? t('result.enteredDirectly', { comp: comp.name })
    : t('result.reachedVia', { comp: comp.name, path: label(PATH_LABEL[entryPath]), round: label(QUAL_ROUND_LABEL[entryRound]) })
  const reachedLeaguePhase = !qualExit && !notQualified
  const domesticLine = league && domRow && !notQualified
    ? t('result.domesticLine', { place: ordinal(domPos), league: league.name, w: domRow.won, d: domRow.drawn, l: domRow.lost })
    : undefined
  const punditsText = (() => {
    if (run || store.predictionSeed == null || !store.clTeams) return undefined
    const p = predictTable(store.clTeams.map(x => ({ clubId: x.clubId, clubName: x.clubName, ovr: x.ovr, isPlayer: x.isPlayer })), store.predictionSeed).player
    return p ? t('result.theySaidCup', { said: formatTier(predictChampionsLeagueRound(p.predicted).key).toLowerCase(), tier: title.toLowerCase() }) : undefined
  })()
  const yourTies = [...playoffRound, ...r16, ...qf, ...sf, ...(final ? [final] : [])].filter(m => m.teamA.isPlayer || m.teamB.isPlayer)
  let w = 0, d = 0, l = 0
  for (const m of yourTies) { const x = koTieLegRecord(m, m.teamA.isPlayer); w += x.w; d += x.d; l += x.l }

  async function persistRun() {
    if (!user || !fresh) return
    if (store.formation) {
      await saveCustomUclRun({
        userId: user.id, formation: store.formation, teamOvr: playerTeam.ovr, result,
        squad: [...store.draftedPlayers, ...store.benchPlayers],
        difficulty: store.difficulty, custom: store.customDifficulty, weightedPicksOverride: store.weightedPicksOverride,
        target: huntReached ? store.europeanTarget : null,
        // For "The Double, Europe" (P8.5-21): your league and its cup, both won.
        domestic: league ? {
          champion: domPos === 1,
          cupWon: !!qual?.europe?.cups.some(c => c.rank === league.rank && c.clubId === playerTeam.clubId),
        } : null,
        stats: runStats?.stats, awards: runStats?.awards,
        punditsOnYou: punditsOnYouFor(store.clTeams, store.predictionSeed),
        qual, leagueTables: leagues,
        extra: { gotAway: store.gotAway, punditSeed: store.predictionSeed },
      })
    }
    if (runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      await mergeCareerFromRun(user.id, {
        competition: 'champions_league_custom', yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub),
        goalsFor: playerTeam.stats.goalsFor, goalsAgainst: playerTeam.stats.goalsAgainst,
        potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined, u21WinnerId: u21?.isPlayerClub ? u21.playerId : undefined,
      }).catch(e => log.warn('save', 'career: merge failed', e))
    }
  }
  runSave.setTask(persistRun)

  const src = runStats ?? (run?.stats && run?.awards ? { stats: run.stats, awards: run.awards } : null)
  const night = src ? buildAwardsNight({ awards: src.awards, stats: src.stats, rounds: (src as RunStats).rounds, clubs: [], playerClubId: playerTeam.clubId, mode: 'champions_league_custom' }) : null
  return (
    <ResultShell mode="champions_league_custom" runId={runId} night={night}
      verdict={
        <VerdictBlock tone={verdictOf(tier)} title={title}
          // P8.5-21: a hunting run says so (its target is on the saved run too).
          meta={t('result.fullPath', { comp: comp.fullName }) + (huntedComp ? t('result.hunted', { comp: huntedComp }) : huntMissed ? t('result.huntMissed', { comp: huntMissed }) : '') + `${playerTeam.clubName} · ${entryText}`}
          line={domesticLine}
          punditsText={punditsText}
          shareText={t('result.pathShare', { title, comp: comp.fullName })}
          runId={runId} ownerId={runId ? run?.user_id ?? null : undefined} scoreRow={runId ? run ?? null : undefined} />
      }
      figures={reachedLeaguePhase ? [
        [t('result.figLeaguePhase'), ordinal(pos)], [t('result.figPts'), playerTeam.stats.points],
        [t('result.figW'), playerTeam.stats.won], [t('result.figD'), playerTeam.stats.drawn], [t('result.figL'), playerTeam.stats.lost],
        [t('result.figGoals'), `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`],
        ...(yourTies.length > 0 ? [[t('result.figKo'), d > 0 ? `${w}-${d}-${l}` : `${w}-${l}`] as [string, string]] : []),
        [t('result.figPot'), playerPot],
      ] : [
        // Never reached the league phase: the record that matters is the domestic season.
        ...(domRow ? [[t('result.figDomestic'), ordinal(domPos)], [t('result.figW'), domRow.won], [t('result.figD'), domRow.drawn], [t('result.figL'), domRow.lost], [t('result.figGoals'), `${domRow.goalsFor}–${domRow.goalsAgainst}`]] as [string, string | number][] : []),
        ...(!notQualified ? [[t('result.figQualGoals'), `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`]] as [string, string][] : []),
      ]}
      actions={<ResultActions compact fromHistory={!!runId} submitting={submitting} save={runSave} onAgain={leave(restartToModeSelect)} onHome={leave(exitToHome)} />}
    />
  )
}
