import React from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { openSheet } from '@/lib/sheet'
import { TeamLabel } from './TeamLabel'
import { summariseScorers } from '@/engine/run-stats'
import { colors, spacing, typography, radius, MODE_THEMES, prim, font } from '@/theme'
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

export function WCGroupMatchdays({ matches, onOpenMatch }: {
  matches: WCGroupMatch[]
  onOpenMatch?: (m: WCGroupMatch) => void   // deep-stats match-detail entry point
}) {
  if (matches.length === 0) return null
  const matchdays = Array.from(new Set(matches.map(m => m.matchday))).sort((a, b) => a - b)
  return (
    <View style={styles.mdSection}>
      {onOpenMatch && <Text style={styles.mdHint}>Tap a match for full stats & ratings</Text>}
      {matchdays.map(md => (
        <View key={md} style={styles.mdBlock}>
          <Text style={styles.mdLabel}>Matchday {md}</Text>
          {matches.filter(m => m.matchday === md).map((m, i) => {
            const hs = summariseScorers(m.scorers?.home), as = summariseScorers(m.scorers?.away)
            return (
              <Pressable key={i} onPress={onOpenMatch ? () => onOpenMatch(m) : undefined} disabled={!onOpenMatch}>
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
                {!!(hs || as) && (
                  <View style={styles.mdScorers}>
                    <Text style={[styles.mdScorerHalf, { textAlign: 'right' }]} numberOfLines={2}>{hs ? `${hs}` : ''}</Text>
                    <Text style={styles.mdScorerHalf} numberOfLines={2}>{as ? `${as} ` : ''}</Text>
                  </View>
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

// A group, on its own page (Phase 5: was WCGroupModal). Shared by the live
// group stage and the result screen, so it goes through the in-memory sheet.
export function openWCGroup(group: { id: string; teams: WCTeam[] }, matches: WCGroupMatch[], onOpenMatch?: (m: WCGroupMatch) => void) {
  openSheet({
    title: `Group ${group.id}`,
    sub: 'Top two go through',
    render: () => <WCGroupView group={group} matches={matches} onOpenMatch={onOpenMatch} />,
  })
}

function WCGroupView({ group, matches, onOpenMatch }: {
  group: { id: string; teams: WCTeam[] }
  matches: WCGroupMatch[]
  onOpenMatch?: (m: WCGroupMatch) => void
}) {
  const teams = [...group.teams].sort(sortGroupTeams)
  return (
    <View>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableCol, styles.colPos]}>#</Text>
        <Text style={[styles.tableCol, styles.colName]}>Team</Text>
        <Text style={[styles.tableCol, styles.colStat]}>P</Text>
        <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
        <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>Pts</Text>
      </View>
      {teams.map((team, idx) => {
        const gd = team.stats.goalsFor - team.stats.goalsAgainst
        return (
          <View key={team.clubId} style={[styles.tableRow, team.isPlayer && styles.tableRowPlayer, idx < 2 && styles.tableRowQ]}>
            <Text style={[styles.tableColData, styles.colPos as any, team.isPlayer && styles.playerText]}>{idx + 1}</Text>
            <TeamLabel clubId={team.clubId} name={team.clubName} containerStyle={styles.colName} textStyle={[styles.tableColData, team.isPlayer && styles.playerText]} />
            <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
            <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
            <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
          </View>
        )
      })}
      <WCGroupMatchdays matches={matches} onOpenMatch={onOpenMatch} />
    </View>
  )
}

const styles = StyleSheet.create({
  tableHeaderRow: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  tableRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon, alignItems: 'center' },
  tableRowPlayer: { backgroundColor: WC.accent + '11', borderColor: WC.accent, borderWidth: 1, borderRadius: 0 },
  tableRowQ: { borderLeftWidth: 3, borderLeftColor: prim.volt },
  tableCol:     { fontSize: 11, fontFamily: font.bodyBold, color: prim.cottonMuted },
  tableColData: { fontSize: 13, color: prim.cottonMuted },
  playerText:   { color: WC.accent, fontFamily: font.bodyBold },
  colPos:  { width: 24, textAlign: 'center' as any },
  colName: { flex: 1,  paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts:  { width: 32, fontFamily: font.bodyBold },
  mdSection: { gap: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: prim.ruleNylon, paddingTop: spacing.sm },
  mdBlock: { gap: 4 },
  mdLabel: { fontSize: typography.xs, fontFamily: font.bodyBold, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 1 },
  mdHint: { fontSize: 9, color: prim.cottonMuted, },
  mdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  mdTeam:       { flex: 1 },
  mdTeamRight:  { justifyContent: 'flex-end' },
  mdTeamText:   { fontSize: 11, color: prim.cottonMuted },
  mdTeamPlayer: { color: WC.accent, fontFamily: font.bodyBold },
  mdScorers:    { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: 4 },
  mdScorerHalf: { flex: 1, fontSize: 9, color: prim.cottonMuted },
  mdScore: { fontSize: 12, fontFamily: font.bodyBlack, color: prim.cotton, minWidth: 42, textAlign: 'center' },
})
