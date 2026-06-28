import React from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native'
import { TeamLabel } from './TeamLabel'
import { summariseScorers } from '@/engine/run-stats'
import { colors, spacing, typography, radius, MODE_THEMES } from '@/theme'
import type { WCTeam, WCGroupMatch } from '@/engine/world-cup-sim'

const WC = MODE_THEMES.world_cup

// Shared World Cup group view (standings table + matchdays with scorers), used
// identically on the result screen and during the live group-stage review.
function sortGroupTeams(a: WCTeam, b: WCTeam): number {
  if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
  const gdA = a.stats.goalsFor - a.stats.goalsAgainst
  const gdB = b.stats.goalsFor - b.stats.goalsAgainst
  if (gdB !== gdA) return gdB - gdA
  return b.stats.goalsFor - a.stats.goalsFor
}

export function WCGroupMatchdays({ matches }: { matches: WCGroupMatch[] }) {
  if (matches.length === 0) return null
  const matchdays = Array.from(new Set(matches.map(m => m.matchday))).sort((a, b) => a - b)
  return (
    <View style={styles.mdSection}>
      {matchdays.map(md => (
        <View key={md} style={styles.mdBlock}>
          <Text style={styles.mdLabel}>Matchday {md}</Text>
          {matches.filter(m => m.matchday === md).map((m, i) => {
            const hs = summariseScorers(m.scorers?.home), as = summariseScorers(m.scorers?.away)
            return (
              <View key={i}>
                <View style={styles.mdRow}>
                  <TeamLabel
                    clubId={m.home.clubId} name={m.home.clubName} size={12}
                    containerStyle={[styles.mdTeam, styles.mdTeamRight]}
                    textStyle={[styles.mdTeamText, m.home.isPlayer && styles.mdTeamPlayer]}
                  />
                  <Text style={styles.mdScore}>{m.homeGoals} - {m.awayGoals}</Text>
                  <TeamLabel
                    clubId={m.away.clubId} name={m.away.clubName} size={12}
                    containerStyle={styles.mdTeam}
                    textStyle={[styles.mdTeamText, m.away.isPlayer && styles.mdTeamPlayer]}
                  />
                </View>
                {(hs || as) && (
                  <View style={styles.mdScorers}>
                    <Text style={[styles.mdScorerHalf, { textAlign: 'right' }]} numberOfLines={2}>{hs ? `⚽ ${hs}` : ''}</Text>
                    <Text style={styles.mdScorerHalf} numberOfLines={2}>{as ? `${as} ⚽` : ''}</Text>
                  </View>
                )}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export function WCGroupModal({ group, matches, onClose }: {
  group: { id: string; teams: WCTeam[] } | null
  matches: WCGroupMatch[]
  onClose: () => void
}) {
  const teams = group ? [...group.teams].sort(sortGroupTeams) : []
  return (
    <Modal visible={group !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {group && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Group {group.id}</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Team</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>Pts</Text>
              </View>
              {teams.map((team, idx) => {
                const gd = team.stats.goalsFor - team.stats.goalsAgainst
                const qualified = idx < 2
                return (
                  <View key={team.clubId} style={[styles.tableRow, team.isPlayer && styles.tableRowPlayer, qualified && styles.tableRowQ]}>
                    <Text style={[styles.tableColData, styles.colPos as any, team.isPlayer && styles.playerText]}>{idx + 1}</Text>
                    <TeamLabel
                      clubId={team.clubId}
                      name={team.clubName}
                      containerStyle={styles.colName}
                      textStyle={[styles.tableColData, team.isPlayer && styles.playerText]}
                    />
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                    <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
                  </View>
                )
              })}
              <WCGroupMatchdays matches={matches} />
            </ScrollView>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  tableHeaderRow: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableRowPlayer: { backgroundColor: WC.accent + '11', borderColor: WC.accent, borderWidth: 1, borderRadius: radius.sm },
  tableRowQ: { borderLeftWidth: 3, borderLeftColor: colors.success },
  tableCol:     { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  tableColData: { fontSize: 11, color: colors.textSecondary },
  playerText:   { color: WC.accent, fontWeight: typography.bold },
  colPos:  { width: 24, textAlign: 'center' as any },
  colName: { flex: 1,  paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts:  { width: 32, fontWeight: typography.bold },
  mdSection: { gap: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  mdBlock: { gap: 4 },
  mdLabel: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  mdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  mdTeam:       { flex: 1 },
  mdTeamRight:  { justifyContent: 'flex-end' },
  mdTeamText:   { fontSize: 11, color: colors.textSecondary },
  mdTeamPlayer: { color: WC.accent, fontWeight: typography.bold },
  mdScorers:    { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: 4 },
  mdScorerHalf: { flex: 1, fontSize: 9, color: colors.textMuted },
  mdScore: { fontSize: 12, fontWeight: typography.black, color: colors.textPrimary, minWidth: 42, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '80%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary, marginBottom: spacing.sm },
  modalClose: { marginTop: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCloseText: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
})
