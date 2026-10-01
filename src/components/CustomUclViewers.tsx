import React, { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { openSheet } from '@/lib/sheet'
import { appendKnockoutRounds } from '@/engine/match-context'
import { ROLES, MODE_THEMES, space, border, type Roles } from '@/theme'
import { europeBerthFor, type EuroComp, type UclPath, type UclRound } from '@/data/uefa-coefficients'
import { EUROPE } from '@/data/europe'
import { QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, FORMAT_EXPLAINER, isSpecialFormat } from '@/data/league-formats'
import { flagForCountry } from '@/data/geo-iso'
import { KitText, Tag, Chips, RoundFlag, TeamMark, Icon } from '@/components/kit'
import { LeagueTable, ZoneLegend, type TableZone } from '@/components/season/SeasonParts'
import { koLegDetailRequest } from '@/components/MatchStatsParts'
import { openMatchStats } from '@/lib/matchStats'
import { ordinal } from '@/lib/format'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { CLKnockoutMatch } from '@/engine/cl-sim'
import type { DraftedPlayer } from '@/types/game'
import { EVERYDAY, useScreenRoles } from '@/lib/appearance'

// The full path's Europe (P8-113): every league's table, the list of leagues,
// and what each domestic finish earns. These were the last pre-redesign
// viewers — the platform font, their own table, their own three-colour berth
// badges and a legend of their own. They're the kit's now: the same
// LeagueTable, zones and crests as every other table in the app.

const CL = MODE_THEMES.champions_league
// P8.5-25: the ground comes from the screen this sits on (useScreenRoles).
// A domestic place is worth a berth (or nothing), drawn as the table's zones.
const BERTH_ZONE: Record<UclRound, TableZone> = {
  league_phase: { code: 'UCL', label: 'League phase', tone: 'top' },
  playoff:      { code: 'PO',  label: 'Play-off round', tone: 'mid' },
  q3:           { code: 'Q3',  label: 'Third qualifying round', tone: 'low' },
  q2:           { code: 'Q2',  label: 'Second qualifying round', tone: 'low' },
  q1:           { code: 'Q1',  label: 'First qualifying round', tone: 'low' },
}

// P8-52: a finish can earn a Europa or Conference League place too. One code
// each (the round is in the stakes list), under the Champions League's.
const LOWER_ZONE: Record<Exclude<EuroComp, 'ucl'>, TableZone> = {
  uel:  { code: 'UEL',  label: 'Europa League', tone: 'mid' },
  uecl: { code: 'UECL', label: 'Conference League', tone: 'low' },
}
const zoneOf = (b: { comp: EuroComp; round: UclRound }) => (b.comp === 'ucl' ? BERTH_ZONE[b.round] : LOWER_ZONE[b.comp]) ?? null

export function berthZones(rank: number, places: number): (TableZone | null)[] {
  return Array.from({ length: places }, (_, i) => {
    const b = europeBerthFor(rank, i + 1)
    return b ? zoneOf(b) : null
  })
}

export function berthLabel(round: UclRound, path: UclPath, comp: EuroComp = 'ucl'): string {
  const name = comp === 'ucl' ? '' : `${EUROPE[comp].name}, `
  if (round === 'league_phase') return `${name}league phase, direct`.replace(/^l/, 'L')
  return `${name}${QUAL_ROUND_LABEL[round]} · ${PATH_LABEL[path]}`
}

/** What each finish earns in one association (the draw, and the viewers). */
export function PositionStakes({ roles, rank }: { roles: Roles; rank: number }) {
  const rows: { position: number; comp: EuroComp; round: UclRound; path: UclPath }[] = []
  for (let pos = 1; pos <= 7; pos++) {
    const b = europeBerthFor(rank, pos)
    if (b) rows.push({ position: pos, ...b })
  }
  if (rows.length === 0) {
    return <KitText t="body" color={roles.textMuted}>No European places for this league. Its clubs only get in as title holders.</KitText>
  }
  return (
    <View>
      {rows.map(r => (
        <View key={r.position} style={[styles.stakesRow, { borderBottomColor: roles.rule }]}>
          <KitText t="figure" color={roles.text} style={styles.stakesPos}>{ordinal(r.position)}</KitText>
          <Tag roles={roles} variant={r.comp === 'ucl' && r.round === 'league_phase' ? 'selected' : undefined}>{zoneOf(r)?.code ?? ''}</Tag>
          <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{berthLabel(r.round, r.path, r.comp)}</KitText>
        </View>
      ))}
      <KitText t="tag" color={roles.textMuted} style={styles.stakesNote}>ANY LOWER: NO EUROPE, UNLESS THE CUP · A CUP WINNER ALREADY IN PASSES HIS PLACE DOWN</KitText>
    </View>
  )
}

/** One league as a row: its flag, its place in Europe, and its champion with
 *  the champion's crest (P8-119: the list named its winners with no mark). */
export function LeagueRow({ roles, table, yours, onPress }: { roles: Roles; table: SimLeagueTable; yours?: boolean; onPress: () => void }) {
  const champ = table.standings[0]
  return (
    <Pressable onPress={onPress} accessibilityRole="link"
      accessibilityLabel={`${table.name}, number ${table.rank} in Europe, champions ${champ?.clubName ?? 'none'}`}
      style={({ pressed }) => [styles.leagueRow, { borderBottomColor: roles.rule }, yours && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
      <RoundFlag roles={roles} emoji={flagForCountry(table.country)} code={table.country ?? table.name} size={20} />
      <View style={{ flex: 1 }}>
        <KitText t="body" color={roles.text} numberOfLines={1}>{table.name}</KitText>
        {champ && (
          <View style={styles.champ}>
            <TeamMark roles={roles} clubId={champ.clubId} name={champ.clubName} size={16} />
            <KitText t="tag" color={roles.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>{champ.clubName.toUpperCase()}</KitText>
          </View>
        )}
      </View>
      <KitText t="tag" color={roles.textMuted}>{`#${table.rank}`}</KitText>
      <Icon name="chevron" size={16} color={roles.textMuted} />
    </Pressable>
  )
}

// ── One league's table ───────────────────────────────────────────────────────

export function LeagueTableView({ table, playerClubId }: { table: SimLeagueTable; playerClubId?: string | null }) {
  const nylon = useScreenRoles()
  const roles = nylon
  // A split league carries the table at the split too: flip between the two.
  const hasPhases = !!table.regularStandings && table.regularStandings.length > 0
  const [phase, setPhase] = useState<'regular' | 'final'>('final')
  const rows = hasPhases && phase === 'regular' ? table.regularStandings! : table.standings
  const berths = !hasPhases || phase === 'final'   // the berths go by the FINAL order
  const zones = berths ? berthZones(table.rank, rows.length) : rows.map(() => null)
  return (
    <View style={styles.table}>
      {table.format && isSpecialFormat(table.format) && (
        <KitText t="body" color={roles.textMuted}>{FORMAT_EXPLAINER[table.format]}</KitText>
      )}
      {hasPhases && (
        <Chips<'regular' | 'final'> roles={roles} value={phase} onChange={setPhase} options={[
          { id: 'regular', label: 'At the split' },
          { id: 'final', label: table.format === 'belgium_playoff' ? 'After the play-off' : 'Final table' },
        ]} />
      )}
      <LeagueTable roles={roles} zones={zones} rows={rows.map(c => ({
        clubId: c.clubId, clubName: c.clubName, isPlayer: !!playerClubId && c.clubId === playerClubId,
        played: c.played, gd: c.goalsFor - c.goalsAgainst, points: c.points,
      }))} />
      <ZoneLegend roles={roles} zones={zones} />
    </View>
  )
}

// One league's table, and every league, as pages (Phase 5: were modals). They
// come from a live draw as well as a finished run, so they use the sheet.
export function openLeagueTable(table: SimLeagueTable, playerClubId?: string | null) {
  openSheet({
    title: table.name,
    sub: [table.country?.toUpperCase(), `#${table.rank} IN EUROPE`, table.format ? FORMAT_LABEL[table.format].toUpperCase() : null].filter(Boolean).join(' · '),
    render: () => <LeagueTableView table={table} playerClubId={playerClubId} />,
  })
}

export function openLeaguesBrowser(tables: SimLeagueTable[], playerClubId?: string | null) {
  openSheet({
    title: 'Every league', sub: `${tables.length} LEAGUES, PLAYED THIS RUN`,
    render: () => (
      <View>
        {tables.map(t => (
          <LeagueRow key={t.rank} roles={ROLES[EVERYDAY]} table={t} yours={!!playerClubId && t.standings.some(s => s.clubId === playerClubId)}
            onPress={() => openLeagueTable(t, playerClubId)} />
        ))}
      </View>
    ),
  })
}

// QualTie → the shape the KO detail renders (legs, ET, pens, scorers).
// Shared by the live qualifying screen and the result page's ladder.
export function qualTieToKoMatch(t: import('@/engine/cl-qualifying').QualTie): CLKnockoutMatch | null {
  if (!t.teamB || !t.legs) return null
  const winner = t.winnerId === t.teamA.clubId ? t.teamA : t.teamB
  return {
    round: t.round,
    teamA: { ...t.teamA, pot: 4 }, teamB: { ...t.teamB, pot: 4 }, winner: { ...winner, pot: 4 },
    aGoals: t.legs.totalA, bGoals: t.legs.totalB,
    leg1: { aGoals: t.legs.leg1.homeGoals, bGoals: t.legs.leg1.awayGoals },
    leg2: { aGoals: t.legs.leg2.awayGoals, bGoals: t.legs.leg2.homeGoals },
    leg2ExtraTime: t.legs.leg2ExtraTime ? { aGoals: t.legs.leg2ExtraTime.awayGoals, bGoals: t.legs.leg2ExtraTime.homeGoals } : undefined,
    extraTime: t.legs.extraTime,
    aPens: t.legs.homePens ?? undefined, bPens: t.legs.awayPens ?? undefined,
    aPenKicks: t.legs.homePenKicks, bPenKicks: t.legs.awayPenKicks,
    leg1Scorers: t.leg1Scorers, leg2Scorers: t.leg2Scorers, leg2ExtraTimeScorers: t.leg2ExtraTimeScorers,
    leg1Seed: t.leg1Seed, leg2Seed: t.leg2Seed,
  }
}

// ── Knockout tie detail (aggregate, both legs, ET, shootout) ────────────────

// A knockout or qualifying tie opens on its first leg (Phase 5: was
// KoTieDetailModal). The match sheet shows the tie, both legs tappable, the
// aggregate and any shootout, so the modal in between said nothing new.
export function openKoTie(m: CLKnockoutMatch, opts: { label?: string; playerClubId?: string; drafted?: DraftedPlayer[]; yearStart?: number; accent?: string; playerFormation?: import('@/types/game').Formation }) {
  const label = opts.label ?? m.round
  const req = koLegDetailRequest(m, 1, { label, yearStart: opts.yearStart ?? 2025, playerClubId: opts.playerClubId, drafted: opts.drafted, playerFormation: opts.playerFormation })
  if (!req) return
  const context = appendKnockoutRounds([], [{ label, ties: [m] }])
  openMatchStats({ ...req, matchday: context[0]?.matchday, contextMatches: context }, opts.accent ?? CL.accent)
}

const styles = StyleSheet.create({
  stakesRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40, borderBottomWidth: border.hair },
  stakesPos: { width: 36 },
  stakesNote: { marginTop: space[2] },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2], borderBottomWidth: border.hair },
  champ: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: 2 },
  table: { gap: space[3] },
})
