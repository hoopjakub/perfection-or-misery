import React from 'react'
import { View, StyleSheet, Pressable, ScrollView } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { openSheet } from '@/lib/sheet'
import { TeamLabel } from './TeamLabel'
import { summariseScorers } from '@/engine/run-stats'
import { spacing, typography, MODE_THEMES, ROLES, prim, font } from '@/theme'
import { LeagueTable, ZoneLegend, WC_GROUP_ZONES } from '@/components/season/SeasonParts'
import { getFlag } from '@/lib/flagMap'
import type { WCTeam, WCGroupMatch } from '@/engine/world-cup-sim'
import { EVERYDAY } from '@/lib/appearance'

// The page's ground (1 Oct: result screens follow light and dark too). These
// old styles named the dark ground's colours; they now take its roles.
const GR = ROLES[EVERYDAY]

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
    sub: 'Top two go through, the best eight thirds join them',
    render: () => <WCGroupView group={group} matches={matches} onOpenMatch={onOpenMatch} />,
  })
}

function WCGroupView({ group, matches, onOpenMatch }: {
  group: { id: string; teams: WCTeam[] }
  matches: WCGroupMatch[]
  onOpenMatch?: (m: WCGroupMatch) => void
}) {
  const teams = [...group.teams].sort(sortGroupTeams)
  // The same table and markers as the live group stage (P8-61): IN for the top
  // two, 3RD for the place that goes into the best-thirds race, OUT for last.
  return (
    <View>
      <LeagueTable roles={ROLES[EVERYDAY]} zones={WC_GROUP_ZONES.slice(0, teams.length)}
        rows={teams.map(t => ({
          clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer, flag: getFlag(t.clubId),
          played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
        }))} />
      <ZoneLegend roles={ROLES[EVERYDAY]} zones={WC_GROUP_ZONES} />
      <WCGroupMatchdays matches={matches} onOpenMatch={onOpenMatch} />
    </View>
  )
}

const styles = StyleSheet.create({
  mdSection: { gap: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: GR.rule, paddingTop: spacing.sm },
  mdBlock: { gap: 4 },
  mdLabel: { fontSize: typography.xs, fontFamily: font.bodyBold, color: GR.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  mdHint: { fontSize: 9, color: GR.textMuted, },
  mdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  mdTeam:       { flex: 1 },
  mdTeamRight:  { justifyContent: 'flex-end' },
  mdTeamText:   { fontSize: 11, color: GR.textMuted },
  mdTeamPlayer: { color: WC.accent, fontFamily: font.bodyBold },
  mdScorers:    { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: 4 },
  mdScorerHalf: { flex: 1, fontSize: 9, color: GR.textMuted },
  mdScore: { fontSize: 12, fontFamily: font.bodyBlack, color: GR.text, minWidth: 42, textAlign: 'center' },
})
