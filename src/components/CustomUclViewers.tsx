import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { openSheet } from '@/lib/sheet'
import { appendKnockoutRounds } from '@/engine/match-context'
import { colors, spacing, typography, radius, MODE_THEMES, prim, font } from '@/theme'
import { berthForPosition, type UclRound, type UclPath } from '@/data/uefa-coefficients'
import { QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, FORMAT_EXPLAINER, isSpecialFormat } from '@/data/league-formats'
import { flagForCountry } from '@/data/geo-iso'
import { InfoBubble } from '@/components/InfoBubble'
import { PenShootout } from '@/components/PenShootout'
import { summariseScorers, attachCLShootoutNames } from '@/engine/run-stats'
import { koLegDetailRequest } from '@/components/MatchStatsParts'
import { openMatchStats } from '@/lib/matchStats'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { CLKnockoutMatch } from '@/engine/cl-sim'
import type { DraftedPlayer } from '@/types/game'

const CL = MODE_THEMES.champions_league

// ── Berth badges (what each league position earns) ──────────────────────────

const BERTH_SHORT: Record<UclRound, string> = {
  league_phase: 'UCL', playoff: 'PO', q3: 'Q3', q2: 'Q2', q1: 'Q1',
}
const BERTH_COLOR: Record<UclRound, string> = {
  league_phase: prim.volt, playoff: '#F59E0B', q3: '#FB923C', q2: '#F87171', q1: '#F87171',
}

export function berthLabel(round: UclRound, path: UclPath): string {
  if (round === 'league_phase') return 'League Phase (direct)'
  return `${QUAL_ROUND_LABEL[round]} · ${PATH_LABEL[path]}`
}

export function BerthBadge({ rank, position }: { rank: number; position: number }) {
  const b = berthForPosition(rank, position)
  if (!b) return null
  const c = BERTH_COLOR[b.round]
  return (
    <View style={[styles.badge, { borderColor: c, backgroundColor: c + '22' }]}>
      <Text style={[styles.badgeText, { color: c }]}>{BERTH_SHORT[b.round]}</Text>
    </View>
  )
}

/** The "what each position gets" list for one association (placement + viewers). */
export function PositionStakes({ rank, compact = false }: { rank: number; compact?: boolean }) {
  const rows: { position: number; round: UclRound; path: UclPath }[] = []
  for (let pos = 1; pos <= 6; pos++) {
    const b = berthForPosition(rank, pos)
    if (b) rows.push({ position: pos, ...b })
  }
  if (rows.length === 0) return <Text style={styles.stakesNone}>No UEFA Champions League spots for this league — its clubs can only reach the UCL as title holders.</Text>
  return (
    <View style={{ gap: 4 }}>
      {rows.map(r => (
        <View key={r.position} style={styles.stakesRow}>
          <Text style={styles.stakesPos}>{ordinal(r.position)}</Text>
          <BerthBadge rank={rank} position={r.position} />
          <Text style={styles.stakesLabel} numberOfLines={1}>{berthLabel(r.round, r.path)}</Text>
        </View>
      ))}
      {!compact && <Text style={styles.stakesNote}>Finish anywhere below and there's no UEFA Champions League this season.</Text>}
    </View>
  )
}

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
}

// ── League table view (standings + berth badges + format note) ──────────────

export function LeagueTableView({ table, playerClubId }: { table: SimLeagueTable; playerClubId?: string | null }) {
  // Split-format leagues carry the at-the-split snapshot too — let the user
  // flip between the regular season and the final (post-playoff) table.
  const hasPhases = !!table.regularStandings && table.regularStandings.length > 0
  const [phase, setPhase] = useState<'regular' | 'final'>('final')
  const rows = hasPhases && phase === 'regular' ? table.regularStandings! : table.standings
  const showBadges = !hasPhases || phase === 'final'   // berths come from the FINAL order
  const flag = flagForCountry(table.country)

  return (
    <>
      <Text style={styles.phaseNote}>
        {flag ? `${flag}  ` : ''}Coefficient rank #{table.rank}
        {table.format ? ` · ${FORMAT_LABEL[table.format]}` : ''} · simulated this run
      </Text>
      {table.format && isSpecialFormat(table.format) && (
        <Text style={styles.formatNote}>ℹ️ {FORMAT_EXPLAINER[table.format]}</Text>
      )}
      {hasPhases && (
        <View style={styles.phaseTabs}>
          {(['regular', 'final'] as const).map(p => (
            <Pressable key={p} style={[styles.phaseTab, phase === p && styles.phaseTabActive]} onPress={() => setPhase(p)}>
              <Text style={[styles.phaseTabText, phase === p && styles.phaseTabTextActive]}>
                {p === 'regular' ? 'Regular Season' : table.format === 'belgium_playoff' ? 'After Play-off' : 'Final Table'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {hasPhases && phase === 'regular' && (
        <Text style={styles.phaseNote}>The table at the split — before {table.format === 'belgium_playoff' ? 'points were halved and the play-off' : 'the championship round'} decided the final order.</Text>
      )}
      <View style={styles.tableHead}>
        <Text style={[styles.tablePos, styles.tableHeadTxt]}>#</Text>
        <Text style={[styles.tableName, styles.tableHeadTxt]}>Club</Text>
        <Text style={[styles.tableWdl, styles.tableHeadTxt]}>W-D-L</Text>
        <Text style={[styles.tablePts, styles.tableHeadTxt]}>Pts</Text>
      </View>
      {rows.map((c, i) => {
        const isPlayer = !!playerClubId && c.clubId === playerClubId
        return (
          <View key={c.clubId} style={[styles.tableRow, isPlayer && styles.tableRowPlayer]}>
            <Text style={styles.tablePos}>{i + 1}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Not spreading styles.tableName here on purpose: it sets the
                  `flex: 1` shorthand, and mixing that with the flexGrow/
                  flexShrink/flexBasis longhands below trips react-native-web's
                  "don't mix shorthand and non-shorthand" warning. `flex: 0`
                  (the shorthand) sets flex-basis: 0%, not "no basis" — that
                  collapsed this Text to zero width on web, making every club
                  name invisible while the badge still rendered; flexBasis:
                  'auto' sizes to content instead, which is what "don't grow,
                  but do shrink if tight" actually needs. */}
              <Text
                style={[
                  { fontSize: typography.sm, color: prim.cotton, flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
                  isPlayer && styles.tablePlayerText,
                ]}
                numberOfLines={1}
              >{c.clubName}</Text>
              {showBadges && <BerthBadge rank={table.rank} position={i + 1} />}
            </View>
            <Text style={styles.tableWdl}>{c.won}-{c.drawn}-{c.lost}</Text>
            <Text style={styles.tablePts}>{c.points}</Text>
          </View>
        )
      })}
      {showBadges && (
        <View style={styles.legendRow}>
          <Text style={styles.legendItem}><Text style={{ color: prim.volt }}>UCL</Text> League Phase</Text>
          <Text style={styles.legendItem}><Text style={{ color: '#F59E0B' }}>PO</Text> Play-off</Text>
          <Text style={styles.legendItem}><Text style={{ color: '#FB923C' }}>Q3</Text>/<Text style={{ color: '#F87171' }}>Q2·Q1</Text> Qualifying</Text>
        </View>
      )}
    </>
  )
}

// One league's table, and every league, as pages (Phase 5: were modals). They
// come from a live draw as well as a finished run, so they use the sheet.
export function openLeagueTable(table: SimLeagueTable, playerClubId?: string | null) {
  const flag = flagForCountry(table.country)
  openSheet({
    title: table.name, sub: `${flag ? `${flag} ` : ''}${table.country} · #${table.rank} in Europe`,
    render: () => <LeagueTableView table={table} playerClubId={playerClubId} />,
  })
}

export function openLeaguesBrowser(tables: SimLeagueTable[], playerClubId?: string | null) {
  openSheet({
    title: 'All leagues', sub: `${tables.length} leagues simulated this run · tap one for its table`,
    render: () => (
      <View>
        {tables.map(t => (
          <Pressable key={t.rank} style={({ pressed }) => [styles.browserRow, pressed && { opacity: 0.6 }]} onPress={() => openLeagueTable(t, playerClubId)} accessibilityRole="link">
            <Text style={styles.browserRank}>#{t.rank}</Text>
            <Text style={styles.browserFlag}>{flagForCountry(t.country) || ''}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.browserName} numberOfLines={1}>{t.name}</Text>
              <Text style={styles.browserChamp} numberOfLines={1}>{t.standings[0]?.clubName ?? '—'}</Text>
            </View>
            <Text style={styles.browserCount}>{t.standings.length} ›</Text>
          </Pressable>
        ))}
      </View>
    ),
  })
}

// QualTie → the shape the KO detail modal renders (legs, ET, pens, scorers).
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
export function openKoTie(m: CLKnockoutMatch, opts: { label?: string; playerClubId?: string; drafted?: DraftedPlayer[]; yearStart?: number; accent?: string }) {
  const label = opts.label ?? m.round
  const req = koLegDetailRequest(m, 1, { label, yearStart: opts.yearStart ?? 2025, playerClubId: opts.playerClubId, drafted: opts.drafted })
  if (!req) return
  const context = appendKnockoutRounds([], [{ label, ties: [m] }])
  openMatchStats({ ...req, matchday: context[0]?.matchday, contextMatches: context }, opts.accent ?? CL.accent)
}

function KoLeg({ label, home, away, hg, ag, scorers, onStats }: { label: string; home: string; away: string; hg: number; ag: number; scorers?: import('@/types/stats').MatchScorers; onStats?: () => void }) {
  const hs = summariseScorers(scorers?.home), as = summariseScorers(scorers?.away)
  return (
    <View style={styles.koLegBlock}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.koLegLabel}>{label}</Text>
        {onStats && (
          <Pressable onPress={onStats} hitSlop={8}>
            <Text style={styles.koLegStats}>Match stats ›</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.koLegScore}>{home} {hg} – {ag} {away}</Text>
      {hs ? <Text style={styles.koLegScorer}>{home}: {hs}</Text> : null}
      {as ? <Text style={styles.koLegScorer}>{away}: {as}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 0, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { fontSize: 8, fontFamily: font.bodyBlack, letterSpacing: 0.5 },

  stakesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stakesPos: { width: 28, fontSize: 12, fontFamily: font.bodyBlack, color: prim.cotton },
  stakesLabel: { flex: 1, fontSize: 11, color: prim.cottonMuted },
  stakesNote: { fontSize: 10, color: prim.cottonMuted, marginTop: 2 },
  stakesNone: { fontSize: 11, color: prim.cottonMuted, },

  phaseNote: { fontSize: typography.xs, color: prim.cottonMuted, textAlign: 'center', marginVertical: spacing.xs },
  formatNote: { fontSize: 10, color: prim.cottonMuted, backgroundColor: prim.nylonSunken, borderRadius: 0, padding: spacing.sm, lineHeight: 15, marginBottom: spacing.xs },
  phaseTabs: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.xs },
  phaseTab: { borderWidth: 1, borderColor: prim.ruleNylon, borderRadius: 0, paddingHorizontal: spacing.md, paddingVertical: 4 },
  phaseTabActive: { borderColor: CL.accent, backgroundColor: CL.accent + '18' },
  phaseTabText: { fontSize: 10, fontFamily: font.bodyBold, color: prim.cottonMuted },
  phaseTabTextActive: { color: CL.accent },

  tableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  tableHeadTxt: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  tableRowPlayer: { backgroundColor: CL.accent + '15', borderRadius: 0 },
  tablePos: { width: 22, fontSize: 12, color: prim.cottonMuted, textAlign: 'center' },
  tableName: { flex: 1, fontSize: typography.sm, color: prim.cotton },
  tablePlayerText: { color: CL.accent, fontFamily: font.bodyBold },
  tableWdl: { width: 56, fontSize: 11, color: prim.cottonMuted, textAlign: 'center' },
  tablePts: { width: 30, fontSize: typography.sm, fontFamily: font.bodyBold, color: CL.accent, textAlign: 'right' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.sm },
  legendItem: { fontSize: 9, color: prim.cottonMuted },

  browserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  browserRank: { width: 32, fontSize: 12, fontFamily: font.bodyBlack, color: CL.accent },
  browserFlag: { fontSize: 16, width: 24, textAlign: 'center' },
  browserName: { fontSize: typography.sm, fontFamily: font.bodyBold, color: prim.cotton },
  browserChamp: { fontSize: typography.xs, color: prim.cottonMuted, marginTop: 1 },
  browserCount: { fontSize: 10, color: prim.cottonMuted },

  koAgg: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton, textAlign: 'center', marginVertical: spacing.xs },
  koNote: { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koPens: { fontSize: typography.sm, color: CL.accent, fontFamily: font.bodyBold, textAlign: 'center', marginBottom: spacing.sm },
  koLegBlock: { borderTopWidth: 1, borderTopColor: prim.ruleNylon, paddingTop: spacing.sm, marginTop: spacing.xs, gap: 2 },
  koLegLabel: { fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 1 },
  koLegStats: { fontSize: 10, color: CL.accent, fontFamily: font.bodyBold },
  koLegScore: { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold },
  koLegScorer: { fontSize: typography.xs, color: prim.cottonMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '85%', backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontFamily: font.bodyBlack, color: prim.cotton },
  modalClose: { marginTop: spacing.md, backgroundColor: prim.nylonSunken, borderRadius: 0, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: prim.ruleNylon },
  modalCloseText: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
})
