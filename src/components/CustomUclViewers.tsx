import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native'
import { colors, spacing, typography, radius, MODE_THEMES } from '@/theme'
import { berthForPosition, type UclRound, type UclPath } from '@/data/uefa-coefficients'
import { QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, FORMAT_EXPLAINER, isSpecialFormat } from '@/data/league-formats'
import { flagForCountry } from '@/data/geo-iso'
import { InfoBubble } from '@/components/InfoBubble'
import { PenShootout } from '@/components/PenShootout'
import { summariseScorers, attachCLShootoutNames } from '@/engine/run-stats'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { CLKnockoutMatch } from '@/engine/cl-sim'
import type { DraftedPlayer } from '@/types/game'

const CL = MODE_THEMES.champions_league

// ── Berth badges (what each league position earns) ──────────────────────────

const BERTH_SHORT: Record<UclRound, string> = {
  league_phase: 'UCL', playoff: 'PO', q3: 'Q3', q2: 'Q2', q1: 'Q1',
}
const BERTH_COLOR: Record<UclRound, string> = {
  league_phase: colors.success, playoff: '#F59E0B', q3: '#FB923C', q2: '#F87171', q1: '#F87171',
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
  if (rows.length === 0) return <Text style={styles.stakesNone}>No Champions League spots for this league — its clubs can only reach the UCL as title holders.</Text>
  return (
    <View style={{ gap: 4 }}>
      {rows.map(r => (
        <View key={r.position} style={styles.stakesRow}>
          <Text style={styles.stakesPos}>{ordinal(r.position)}</Text>
          <BerthBadge rank={rank} position={r.position} />
          <Text style={styles.stakesLabel} numberOfLines={1}>{berthLabel(r.round, r.path)}</Text>
        </View>
      ))}
      {!compact && <Text style={styles.stakesNote}>Finish anywhere below and there's no Champions League this season.</Text>}
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
              <Text style={[styles.tableName, { flex: 0, flexShrink: 1 }, isPlayer && styles.tablePlayerText]} numberOfLines={1}>{c.clubName}</Text>
              {showBadges && <BerthBadge rank={table.rank} position={i + 1} />}
            </View>
            <Text style={styles.tableWdl}>{c.won}-{c.drawn}-{c.lost}</Text>
            <Text style={styles.tablePts}>{c.points}</Text>
          </View>
        )
      })}
      {showBadges && (
        <View style={styles.legendRow}>
          <Text style={styles.legendItem}><Text style={{ color: colors.success }}>UCL</Text> League Phase</Text>
          <Text style={styles.legendItem}><Text style={{ color: '#F59E0B' }}>PO</Text> Play-off</Text>
          <Text style={styles.legendItem}><Text style={{ color: '#FB923C' }}>Q3</Text>/<Text style={{ color: '#F87171' }}>Q2·Q1</Text> Qualifying</Text>
        </View>
      )}
    </>
  )
}

/** Modal wrapper for one league table. */
export function LeagueTableModal({ table, playerClubId, onClose }: { table: SimLeagueTable | null; playerClubId?: string | null; onClose: () => void }) {
  return (
    <Modal visible={table !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {table && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{flagForCountry(table.country) ? `${flagForCountry(table.country)} ` : ''}{table.name}</Text>
              <LeagueTableView key={table.rank} table={table} playerClubId={playerClubId} />
            </ScrollView>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/** Browse every simulated league → drill into any table. */
export function LeaguesBrowserModal({ visible, tables, playerClubId, onClose }: {
  visible: boolean
  tables: SimLeagueTable[]
  playerClubId?: string | null
  onClose: () => void
}) {
  const [open, setOpen] = useState<SimLeagueTable | null>(null)
  return (
    <>
      <Modal visible={visible && !open} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>All Leagues</Text>
            <Text style={styles.phaseNote}>{tables.length} leagues simulated this run · tap one for its table</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {tables.map(t => (
                <Pressable key={t.rank} style={styles.browserRow} onPress={() => setOpen(t)}>
                  <Text style={styles.browserRank}>#{t.rank}</Text>
                  <Text style={styles.browserFlag}>{flagForCountry(t.country) || '🏳️'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.browserName} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.browserChamp} numberOfLines={1}>🏆 {t.standings[0]?.clubName ?? '—'}</Text>
                  </View>
                  <Text style={styles.browserCount}>{t.standings.length} ›</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <LeagueTableModal table={open} playerClubId={playerClubId} onClose={() => setOpen(null)} />
    </>
  )
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
  }
}

// ── Knockout tie detail (aggregate, both legs, ET, shootout) ────────────────

export function KoTieDetailModal({ match: m, roundLabel, onClose, playerClubId, draftedPlayers }: {
  match: CLKnockoutMatch | null; roundLabel?: string; onClose: () => void
  playerClubId?: string; draftedPlayers?: DraftedPlayer[]
}) {
  // Penalty takers: matches carry the raw make/miss sequence; the NAMED kick
  // list is only pre-built for ties the reveal animated. Expand lazily here
  // (same shared helper the live sim uses) so EVERY shootout — qualifying
  // ties, no-player runs, history — shows its real takers. Your own club's
  // takers come from YOUR drafted squad, not the DB's historical roster.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!m || m.penKicksA || !m.aPenKicks || !m.bPenKicks) return
    let active = true
    attachCLShootoutNames([m], playerClubId, draftedPlayers).then(() => { if (active) forceTick(x => x + 1) }).catch(() => { /* fall back to no list */ })
    return () => { active = false }
  }, [m])
  const kicksA = m?.penKicksA
  const kicksB = m?.penKicksB

  return (
    <Modal visible={m !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {m && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={styles.modalTitle}>{roundLabel ?? m.round}</Text>
                {m.leg1 && <InfoBubble topic="two_legged_tie" size={16} />}
              </View>
              <Text style={styles.koAgg}>{m.teamA.clubName} {m.aGoals} – {m.bGoals} {m.teamB.clubName} {m.leg1 ? '(agg.)' : ''}</Text>
              {m.extraTime && <Text style={styles.koNote}>Decided after extra time</Text>}
              {m.aPens !== undefined && <Text style={styles.koPens}>Penalties: {m.aPens} – {m.bPens} · {m.winner.clubName} advance</Text>}
              {kicksA && kicksB && <PenShootout teamA={m.teamA.clubName} teamB={m.teamB.clubName} kicksA={kicksA} kicksB={kicksB} />}
              {m.leg1 ? (
                <>
                  <KoLeg label="Leg 1" home={m.teamA.clubName} away={m.teamB.clubName} hg={m.leg1.aGoals} ag={m.leg1.bGoals} scorers={m.leg1Scorers} />
                  {m.leg2 && <KoLeg label="Leg 2" home={m.teamB.clubName} away={m.teamA.clubName} hg={m.leg2.bGoals} ag={m.leg2.aGoals} scorers={m.leg2Scorers} />}
                  {m.leg2ExtraTime && (m.leg2ExtraTime.aGoals > 0 || m.leg2ExtraTime.bGoals > 0) &&
                    <KoLeg label="Extra Time (leg 2)" home={m.teamB.clubName} away={m.teamA.clubName} hg={m.leg2ExtraTime.bGoals} ag={m.leg2ExtraTime.aGoals} scorers={m.leg2ExtraTimeScorers} />}
                </>
              ) : (
                <KoLeg label="Final" home={m.teamA.clubName} away={m.teamB.clubName} hg={m.aGoals} ag={m.bGoals} scorers={m.leg1Scorers} />
              )}
            </ScrollView>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function KoLeg({ label, home, away, hg, ag, scorers }: { label: string; home: string; away: string; hg: number; ag: number; scorers?: import('@/types/stats').MatchScorers }) {
  const hs = summariseScorers(scorers?.home), as = summariseScorers(scorers?.away)
  return (
    <View style={styles.koLegBlock}>
      <Text style={styles.koLegLabel}>{label}</Text>
      <Text style={styles.koLegScore}>{home} {hg} – {ag} {away}</Text>
      {hs ? <Text style={styles.koLegScorer}>⚽ {home}: {hs}</Text> : null}
      {as ? <Text style={styles.koLegScorer}>⚽ {away}: {as}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { fontSize: 8, fontWeight: typography.black, letterSpacing: 0.5 },

  stakesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stakesPos: { width: 28, fontSize: 12, fontWeight: typography.black, color: colors.textPrimary },
  stakesLabel: { flex: 1, fontSize: 11, color: colors.textSecondary },
  stakesNote: { fontSize: 10, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  stakesNone: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },

  phaseNote: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', marginVertical: spacing.xs },
  formatNote: { fontSize: 10, color: colors.textSecondary, backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: spacing.sm, lineHeight: 15, marginBottom: spacing.xs },
  phaseTabs: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.xs },
  phaseTab: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  phaseTabActive: { borderColor: CL.accent, backgroundColor: CL.accent + '18' },
  phaseTabText: { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  phaseTabTextActive: { color: CL.accent },

  tableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeadTxt: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRowPlayer: { backgroundColor: CL.accent + '15', borderRadius: radius.sm },
  tablePos: { width: 22, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  tableName: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  tablePlayerText: { color: CL.accent, fontWeight: typography.bold },
  tableWdl: { width: 56, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  tablePts: { width: 30, fontSize: typography.sm, fontWeight: typography.bold, color: CL.accent, textAlign: 'right' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.sm },
  legendItem: { fontSize: 9, color: colors.textMuted },

  browserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  browserRank: { width: 32, fontSize: 12, fontWeight: typography.black, color: CL.accent },
  browserFlag: { fontSize: 16, width: 24, textAlign: 'center' },
  browserName: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
  browserChamp: { fontSize: typography.xs, color: colors.textSecondary, marginTop: 1 },
  browserCount: { fontSize: 10, color: colors.textMuted },

  koAgg: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, textAlign: 'center', marginVertical: spacing.xs },
  koNote: { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koPens: { fontSize: typography.sm, color: CL.accent, fontWeight: typography.bold, textAlign: 'center', marginBottom: spacing.sm },
  koLegBlock: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs, gap: 2 },
  koLegLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  koLegScore: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.bold },
  koLegScorer: { fontSize: typography.xs, color: colors.textSecondary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '85%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  modalClose: { marginTop: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCloseText: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
})
