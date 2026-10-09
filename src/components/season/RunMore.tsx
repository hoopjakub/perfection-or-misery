// The run hub's tabs for what left the result screen (Wave F, centralisation
// step 6; docs/audit-2026-10/08-RESULT-PAGES.md §3 and §10): the pundits, the
// league's cup, the full path's Europe, and the World Cup's grounds. The result
// screen is the verdict, the story and doors; this is where the doors lead.
// Everything here reads RunData, so a live run and a saved one draw the same.
import { t } from '@/i18n'
import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { KitText, ListRow, SectionTag, EmptyState } from '@/components/kit'
import { LeagueTable, ZoneLegend, SegmentSwitch, CL_PHASE_ZONES, tieVM, type MiniGroup } from './SeasonParts'
import { PunditsTable, PunditsPlayedOut } from './VerdictBlock'
import { CupPane } from './CupParts'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { openLeagueTable, openLeaguesBrowser, qualTieToKoMatch, LeagueRow } from '@/components/CustomUclViewers'
import { BracketTree, koRoundsToColumns, type KoRoundVM } from '@/components/BracketTree'
import { VenueMap } from '@/components/VenueMap'
import { venueFor } from '@/data/venues'
import { getFlag } from '@/lib/flagMap'
import { compareStandings } from '@/engine/standings'
import { ordinal } from '@/lib/format'
import { predictTable } from '@/engine/predictions'
import { championsLeaguePunditTournament, worldCupPunditTournament } from '@/engine/cup-calls'
import { clTie, wcTie, tieRequest, cupTieRequest, type MatchCtx } from '@/engine/stages'
import { runQualTies } from '@/engine/europe-path'
import { EUROPE, compOfMode } from '@/data/europe'
import type { EuroComp } from '@/data/uefa-coefficients'
import { QUAL_ROUND_LABEL } from '@/data/cl-qual-labels'
import { openMatchStats } from '@/lib/matchStats'
import { europeCompetitions, type CLSeasonResult, type OtherCompetition } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { RunData } from '@/lib/runData'

const roles = ROLES[EVERYDAY]

/** Whose run a sheet opened from the hub belongs to, linked to its pages. */
const ctxOf = (data: RunData): MatchCtx => ({
  yearStart: data.yearStart ?? 2025, playerClubId: data.playerClubId ?? undefined,
  drafted: data.drafted, playerFormation: data.formation ?? undefined, linkPages: true,
})

// ── Rounds of a cup result, as the result screens drew them ─────────────────
const CL_ROUNDS = [['playoff', 'Knockout play-off'], ['r16', 'Round of 16'], ['qf', 'Quarter-finals'], ['sf', 'Semi-finals'], ['final', 'Final']] as const
function clRounds(r: Pick<CLSeasonResult, 'playoffRound' | 'r16' | 'qf' | 'sf' | 'final' | 'leaguePhaseStandings'>, onTie?: (m: CLSeasonResult['r16'][number], label: string) => void): KoRoundVM[] {
  const direct = new Set(r.leaguePhaseStandings.slice(0, 8).map(x => x.clubId))
  const by = { playoff: r.playoffRound, r16: r.r16, qf: r.qf, sf: r.sf, final: r.final ? [r.final] : [] }
  return CL_ROUNDS.filter(([k]) => by[k].length).map(([k, label]) => ({
    key: k, label, ties: by[k].map(m => tieVM(clTie(m), { direct: k === 'r16' ? direct : undefined, onPress: onTie ? () => onTie(m, label) : undefined })),
  }))
}
const WC_ROUND_NAMES: Record<string, string> = { r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-Finals', sf: 'Semi-Finals', third: 'Third-Place Playoff', final: 'Final' }
function wcRounds(wc: WCSeasonResult): KoRoundVM[] {
  return wc.knockoutRounds.map(r => ({ key: r.round, label: WC_ROUND_NAMES[r.round] ?? r.round, ties: r.matches.map(m => tieVM(wcTie(m))) }))
}
function wcWall(wc: WCSeasonResult): MiniGroup[] {
  return wc.groups.map(g => ({
    id: g.id, you: g.teams.some(x => x.isPlayer),
    rows: [...g.teams].sort(compareStandings).map(x => ({ clubId: x.clubId, clubName: x.clubName, flag: getFlag(x.clubId), points: x.stats.points, isPlayer: !!x.isPlayer })),
  }))
}

// ── PUNDITS ──────────────────────────────────────────────────────────────────
/** Whether the run kept anything of the pundits to show. */
export const hasPundits = (data: RunData) => !!data.more.pundits || !!data.more.punditPlaces

/** The pundits' calls against what happened: a league's whole table (P8-24),
 *  a cup's tournament played out (P8-165). */
export function PunditsTab({ data }: { data: RunData }) {
  const { pundits, punditPlaces, punditPoints, cl, wc } = data.more
  if (wc && pundits) {
    return <PunditsPlayedOut field={pundits.field} seed={pundits.seed} playerClubId={data.playerClubId} flagOf={getFlag}
      build={(rating, seed) => worldCupPunditTournament(pundits.field, rating, seed, wc)}
      actual={{ groups: wcWall(wc), bracket: koRoundsToColumns(wcRounds(wc)) }} />
  }
  if (cl && pundits) {
    const comp = compOfMode(data.mode) ?? EUROPE.ucl
    return <PunditsPlayedOut field={pundits.field} seed={pundits.seed} playerClubId={data.playerClubId}
      build={(rating, seed) => championsLeaguePunditTournament(pundits.field, rating, seed, cl, comp)}
      actual={{
        table: cl.leaguePhaseStandings.map(x => ({ clubId: x.clubId, clubName: x.clubName, isPlayer: !!x.isPlayer, played: x.stats.played, gd: x.stats.goalsFor - x.stats.goalsAgainst, points: x.stats.points })),
        bracket: koRoundsToColumns(clRounds(cl)),
      }} />
  }
  // A league: the pundits' places, from the seed (a live run) or as the run saved them.
  const live = pundits ? predictTable(pundits.field, pundits.seed) : null
  const place = live ? new Map(live.table.map((r, i) => [r.clubId, i + 1])) : punditPlaces ? new Map(Object.entries(punditPlaces)) : null
  const points = live ? new Map(live.table.map(r => [r.clubId, r.points])) : punditPoints ? new Map(Object.entries(punditPoints)) : null
  if (!place || !data.table.length) return <EmptyState roles={roles} title={t('hub.noPundits')} body={t('hub.noPunditsBody')} />
  return (
    <PunditsTable rows={data.table.map(r => ({
      clubId: r.clubId, clubName: r.clubName, finalPosition: r.position, predicted: place.get(r.clubId) ?? r.position,
      isPlayer: r.isPlayer, points: r.points, predictedPoints: points?.get(r.clubId),
    }))} />
  )
}

/** The door's line: where they had you, and where you finished. */
export function punditsLine(data: RunData): string | null {
  const you = data.table.find(r => r.isPlayer)
  if (!you || !hasPundits(data)) return null
  const { pundits, punditPlaces } = data.more
  const said = pundits && !data.more.cl && !data.more.wc
    ? predictTable(pundits.field, pundits.seed).player?.predicted
    : punditPlaces?.[you.clubId]
  return said ? t('res.punditsLeague', { said: ordinal(said), place: ordinal(you.position) }) : t('res.doorPunditsCup')
}

// ── CUP (a league run's) ─────────────────────────────────────────────────────
export function CupTab({ data }: { data: RunData }) {
  const cup = data.more.cup
  if (!cup) return null
  return <CupPane roles={roles} cup={cup} playerClubId={data.playerClubId}
    onTie={(tie, label) => openMatchStats(cupTieRequest(tie, `${cup.name} · ${label}`, ctxOf(data)))} />
}

// ── EUROPE (the full path's) ─────────────────────────────────────────────────
export const hasEurope = (data: RunData) => !!(data.more.qual || data.more.cl?.others?.length || data.more.domesticTables?.length)

/** The door's line: who won the Champions League. */
export function europeLine(data: RunData): string | null {
  const ucl = data.more.cl?.competition === 'ucl' || !data.more.cl?.competition ? data.more.cl?.winner : data.more.cl?.others?.find(o => o.comp === 'ucl')?.winner
  return ucl ? t('res.europeV', { ucl: ucl.clubName }) : null
}

/** The rest of Europe, qualifying and the 53 leagues the full path started from. */
export function EuropeTab({ data }: { data: RunData }) {
  const { qual, domesticTables, cl } = data.more
  const you = data.playerClubId
  const ties = qual ? runQualTies(qual, you) : []
  return (
    <View style={styles.section}>
      {cl?.others?.length ? <Europe comps={europeCompetitions(cl)} playerClubId={you} /> : null}
      {ties.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('result.qualifying')}</SectionTag>
          <QualifyingLadder ties={ties} onTiePress={tie => {
            const m = qualTieToKoMatch(tie)
            if (m) openMatchStats(tieRequest(m, `${EUROPE[tie.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[m.round] ?? m.round}`, ctxOf(data)))
          }} />
        </View>
      )}
      {domesticTables?.length ? (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('result.domesticLeagues')}</SectionTag>
          <KitText t="body" color={roles.textMuted}>{t('result.everyLeagueNote')}</KitText>
          {domesticTables.slice(0, 6).map(a => (
            <LeagueRow key={a.rank} roles={roles} table={a} yours={a.standings.some(s => s.clubId === you)} onPress={() => openLeagueTable(a, you)} />
          ))}
          <ListRow roles={roles} tier="t1" label={t('result.allLeagues', { count: domesticTables.length })} onPress={() => openLeaguesBrowser(domesticTables, you)} />
        </View>
      ) : null}
    </View>
  )
}

// Europe's three competitions, yours first and marked (P9.75-05). The two you
// weren't in were played out headless (P8.5-16): their matches have no sheets
// (nobody attributed their scorers), so the ties don't open. Yours open from
// the Bracket tab.
function Europe({ comps, playerClubId }: { comps: (OtherCompetition & { yours: boolean })[]; playerClubId?: string | null }) {
  const [shown, setShown] = useState<EuroComp>(comps[0].comp)
  const o = comps.find(x => x.comp === shown) ?? comps[0]
  const zones = o.leaguePhaseStandings.map((_, i) => CL_PHASE_ZONES[Math.min(i, CL_PHASE_ZONES.length - 1)])
  return (
    <View style={styles.section}>
      <SectionTag roles={roles}>{t('result.allEurope')}</SectionTag>
      <SegmentSwitch<EuroComp> roles={roles} value={shown} onChange={setShown}
        options={comps.map(x => ({ id: x.comp, label: x.yours ? `${EUROPE[x.comp].short} · ${t('parts.you')}` : EUROPE[x.comp].short }))} />
      <KitText t="body" color={roles.textMuted}>{t('result.wonBy', { comp: EUROPE[o.comp].name, club: o.winner.clubName })}</KitText>
      <BracketTree {...koRoundsToColumns(clRounds(o))} playerClubId={playerClubId} />
      <LeagueTable roles={roles} zones={zones}
        rows={o.leaguePhaseStandings.map(x => ({ clubId: x.clubId, clubName: x.clubName, isPlayer: x.clubId === playerClubId, played: x.stats.played, gd: x.stats.goalsFor - x.stats.goalsAgainst, points: x.stats.points }))} />
      <ZoneLegend roles={roles} zones={zones} />
    </View>
  )
}

// ── The World Cup's grounds (P8-93), under the hub's bracket ─────────────────
export function Grounds({ data }: { data: RunData }) {
  const wc = data.more.wc
  if (!wc) return null
  const played = [
    ...(wc.groupMatchdays ?? []).filter(m => m.home.isPlayer || m.away.isPlayer)
      .map(m => venueFor({ label: `Group ${m.groupId} · MD ${m.matchday}`, yearStart: 2026, homeName: m.home.clubName, homeClubId: m.home.clubId, awayClubId: m.away.clubId })?.id),
    ...wc.knockoutRounds.flatMap(r => r.matches.filter(k => k.teamA.isPlayer || k.teamB.isPlayer)
      .map(k => venueFor({ label: WC_ROUND_NAMES[r.round] ?? r.round, yearStart: 2026, homeName: k.teamA.clubName, homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId })?.id)),
  ].filter((x): x is string => !!x)
  return (
    <View style={styles.section}>
      <SectionTag roles={roles}>{t('result.theGrounds')}</SectionTag>
      <VenueMap roles={roles} played={played} />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space[2], marginTop: space[4] },
})
