import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native'
import { AppModal } from '@/components/AppModal'
import { router, useLocalSearchParams } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useModeTheme } from '@/hooks/useModeTheme'
import { computeLeagueRunStats, computeCLRunStats, computeWCRunStats } from '@/engine/run-stats'
import { RulesModal } from '@/components/InfoBubble'
import { fetchRunById } from '@/db/queries/runs'
import { TeamLabel } from '@/components/TeamLabel'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { CompetitionStats, SeasonAwards, AwardCandidate, PlayerStatLine } from '@/types/stats'

type Tab = 'scorers' | 'assists' | 'clean'
const YOUR_TINT = 'rgba(255,255,255,0.06)'   // light white tint for your players

export default function StatsScreen() {
  const { simResult, draftedPlayers, benchPlayers, useSubstitutes, placedLeague, mode, clResult, wcResult, customUclQual } = useGameStore()
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const theme = useModeTheme()
  const params = useLocalSearchParams<{ runId?: string }>()

  const [loading, setLoading] = useState(true)
  const [stats, setStats]     = useState<CompetitionStats | null>(null)
  const [awards, setAwards]   = useState<SeasonAwards | null>(null)
  const [tab, setTab]         = useState<Tab>('scorers')
  const [query, setQuery]     = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [openTeamId, setOpenTeamId] = useState<string | null>(null)

  useEffect(() => {
    async function go() {
      try {
        // Opened from history/leaderboard — read the saved snapshot.
        if (params.runId) {
          const run = await fetchRunById(params.runId) as any
          if (run?.stats && run?.awards) { setStats(run.stats as CompetitionStats); setAwards(run.awards as SeasonAwards) }
          return
        }
        // Fresh run — compute from the live result in store.
        let res = null
        if (mode === 'champions_league_custom' && clResult) res = await computeCLRunStats(clResult, fullSquad, 2025, customUclQual?.ties, useSubstitutes)
        else if (mode === 'champions_league' && clResult)   res = await computeCLRunStats(clResult, fullSquad, undefined, undefined, useSubstitutes)
        else if (mode === 'world_cup' && wcResult)         res = await computeWCRunStats(wcResult, fullSquad, undefined, useSubstitutes)
        else if (simResult && placedLeague)                res = await computeLeagueRunStats(simResult, fullSquad, placedLeague, useSubstitutes)
        if (res) { setStats(res.stats); setAwards(res.awards) }
      } catch (e) {
        console.warn('[stats] compute failed:', e)
      } finally {
        setLoading(false)
      }
    }
    go()
  }, [])

  // Rank maps for the searcher (rank among players with a positive value).
  const ranks = useMemo(() => {
    const mk = (key: 'goals' | 'assists' | 'cleanSheets') => {
      const m = new Map<string, number>()
      ;(stats?.players ?? []).filter(p => (p as any)[key] > 0)
        .sort((a, b) => (b as any)[key] - (a as any)[key])
        .forEach((p, i) => m.set(p.playerId, i + 1))
      return m
    }
    const award = (list: AwardCandidate[]) => {
      const m = new Map<string, number>(); list.forEach((c, i) => m.set(c.playerId, i + 1)); return m
    }
    return {
      goals: mk('goals'), assists: mk('assists'), clean: mk('cleanSheets'),
      pots: award(awards?.playerOfTheSeason ?? []), u21: award(awards?.bestU21 ?? []),
    }
  }, [stats, awards])

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /><Text style={styles.muted}>Crunching the numbers…</Text></View>
  )
  if (!stats || !awards) return (
    <View style={styles.center}><Text style={{ fontSize: 40 }}>📊</Text><Text style={styles.muted}>No stats for this run.</Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}><Text style={{ color: theme.accent, fontWeight: '700' }}>← Back</Text></Pressable></View>
  )

  const players = stats.players
  const lb = tab === 'scorers' ? players.filter(p => p.goals > 0)
    : tab === 'assists' ? [...players].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists)
    : [...players].filter(p => p.cleanSheets > 0).sort((a, b) => b.cleanSheets - a.cleanSheets)
  const statOf = (p: PlayerStatLine) => tab === 'scorers' ? p.goals : tab === 'assists' ? p.assists : p.cleanSheets
  const yourPlayers = players.filter(p => p.isPlayerClub).sort((a, b) => b.goals - a.goals || b.assists - a.assists)

  const q = query.trim().toLowerCase()
  const searchResults = q ? players.filter(p => p.name.toLowerCase().includes(q)).slice(0, 25) : []

  const teams = stats.teams
  const mostGoals   = [...teams].sort((a, b) => b.goalsFor - a.goalsFor)[0]
  const fewestAgainst = [...teams].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0]
  const mostClean   = [...teams].sort((a, b) => b.cleanSheets - a.cleanSheets)[0]

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={[styles.headerTitle, { color: theme.accent }]}>Player Statistics</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={styles.card}>
          <TextInput
            value={query} onChangeText={setQuery} placeholder={`Search any of ${players.length} players…`}
            placeholderTextColor={colors.textMuted} style={styles.search}
          />
          {q.length > 0 && (searchResults.length === 0
            ? <Text style={styles.muted}>No player matches “{query}”.</Text>
            : searchResults.map(p => (
              <View key={p.playerId} style={[styles.searchRow, p.isPlayerClub && { backgroundColor: YOUR_TINT }]}>
                <View style={styles.nameCol}>
                  <Text style={[styles.name, p.isPlayerClub && { color: theme.accent }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.club}>{p.isPlayerClub ? 'Your XI' : p.clubName} · {p.seasonLabel} · {p.position}</Text>
                </View>
                <View style={styles.rankWrap}>
                  <RankChip label="G" val={p.goals} rank={ranks.goals.get(p.playerId)} />
                  <RankChip label="A" val={p.assists} rank={ranks.assists.get(p.playerId)} />
                  <RankChip label="CS" val={p.cleanSheets} rank={ranks.clean.get(p.playerId)} />
                  <RankChip label="POTS" rankOnly rank={ranks.pots.get(p.playerId)} />
                  <RankChip label="U21" rankOnly rank={ranks.u21.get(p.playerId)} />
                </View>
              </View>
            )))}
        </View>

        {/* Awards */}
        <AwardCard title="🏆 Player of the Season" list={awards.playerOfTheSeason} theme={theme} total={players.length} />
        <AwardCard title="🌟 Best U21" list={awards.bestU21} theme={theme} total={players.length} />

        {/* Leaderboards */}
        <View style={styles.card}>
          <View style={styles.tabs}>
            {(['scorers', 'assists', 'clean'] as Tab[]).map(t => (
              <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'scorers' ? 'Scorers' : t === 'assists' ? 'Assists' : 'Clean Sheets'}</Text>
              </Pressable>
            ))}
          </View>
          {lb.length === 0 ? <Text style={styles.muted}>Nobody yet.</Text> : (
            <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              {lb.map((p, i) => (
                <View key={p.playerId} style={[styles.row, p.isPlayerClub && { backgroundColor: YOUR_TINT, borderRadius: radius.sm }]}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={styles.nameCol}>
                    <TeamLabel clubId={p.clubId} name={p.name} textStyle={[styles.name, p.isPlayerClub && { color: theme.accent }]} size={15} />
                    <Text style={styles.club}>{p.isPlayerClub ? 'Your XI' : p.clubName} · {p.seasonLabel}</Text>
                  </View>
                  <Text style={[styles.statVal, { color: theme.accent }]}>{statOf(p)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <Text style={styles.listCount}>{lb.length} {tab === 'scorers' ? 'scorers' : tab === 'assists' ? 'assisters' : 'kept a clean sheet'} · {players.length} players total</Text>
        </View>

        {/* Team stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Team Stats</Text>
          <View style={styles.leaders}>
            <Leader label="Most goals" team={mostGoals?.clubName} val={mostGoals?.goalsFor} theme={theme} />
            <Leader label="Fewest conceded" team={fewestAgainst?.clubName} val={fewestAgainst?.goalsAgainst} theme={theme} />
            <Leader label="Most clean sheets" team={mostClean?.clubName} val={mostClean?.cleanSheets} theme={theme} />
          </View>
          <View style={styles.teamHead}>
            <Text style={[styles.teamCol, styles.teamName]}>Club</Text>
            <Text style={styles.teamCol}>For</Text><Text style={styles.teamCol}>Ag</Text><Text style={styles.teamCol}>CS</Text>
          </View>
          {/* Scrolls like the player leaderboards — the custom UCL fields 90+ clubs. */}
          <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            {[...teams].sort((a, b) => b.goalsFor - a.goalsFor).map(t => (
              <Pressable key={t.clubId} style={styles.row} onPress={() => setOpenTeamId(t.clubId)}>
                <TeamLabel clubId={t.clubId} name={t.clubName} textStyle={styles.name} containerStyle={styles.teamName} size={15} />
                <Text style={styles.teamCol}>{t.goalsFor}</Text><Text style={styles.teamCol}>{t.goalsAgainst}</Text><Text style={styles.teamCol}>{t.cleanSheets}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.listCount}>{teams.length} clubs · tap one to see its squad</Text>
        </View>

        {/* Your players */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Players</Text>
          <View style={styles.yourHead}>
            <Text style={[styles.teamCol, styles.teamName]}>Player</Text>
            <Text style={styles.yc}>G</Text><Text style={styles.yc}>A</Text><Text style={styles.yc}>CS</Text><Text style={styles.yc}>MP</Text>
          </View>
          {yourPlayers.map(p => (
            <View key={p.playerId} style={[styles.row, { backgroundColor: YOUR_TINT, borderRadius: radius.sm }]}>
              <View style={styles.teamName}>
                <Text style={[styles.name, { color: theme.accent }]} numberOfLines={1}>
                  {p.name}{p.isBench && <Text style={styles.subTag}> SUB</Text>}
                </Text>
                <Text style={styles.posTag}>{p.position} · {p.seasonLabel}</Text>
              </View>
              <Text style={styles.yc}>{p.goals}</Text><Text style={styles.yc}>{p.assists}</Text><Text style={styles.yc}>{p.cleanSheets}</Text><Text style={styles.yc}>{p.matchesPlayed ?? '—'}</Text>
            </View>
          ))}
        </View>

        {/* Full rulebook (custom UCL runs) */}
        {mode === 'champions_league_custom' && (
          <Pressable style={styles.rulesBtn} onPress={() => setRulesOpen(true)}>
            <Text style={styles.rulesBtnText}>📖 How this competition works — all rules</Text>
          </Pressable>
        )}
      </ScrollView>
      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} accent={theme.accent} />
      <TeamRosterModal
        team={teams.find(t => t.clubId === openTeamId) ?? null}
        players={openTeamId ? players.filter(p => p.clubId === openTeamId) : []}
        accent={theme.accent}
        onClose={() => setOpenTeamId(null)}
      />
    </View>
  )
}

// Opposing-team roster viewer — tap any team in Team Stats to see every one
// of their players and individual stats for this run, same data source as
// the leaderboards above (CompetitionStats.players), just filtered by club.
function TeamRosterModal({ team, players, accent, onClose }: {
  team: { clubId: string; clubName: string; goalsFor: number; goalsAgainst: number; cleanSheets: number } | null
  players: PlayerStatLine[]
  accent: string
  onClose: () => void
}) {
  const sorted = [...players].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name))
  return (
    <AppModal visible={team !== null} onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.card} onPress={() => {}}>
          {team && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <TeamLabel clubId={team.clubId} name={team.clubName} textStyle={modalStyles.title} size={20} />
              </View>
              <Text style={modalStyles.subtitle}>
                {team.goalsFor} scored · {team.goalsAgainst} conceded · {team.cleanSheets} clean sheets
              </Text>
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                <View style={modalStyles.head}>
                  <Text style={[modalStyles.col, modalStyles.nameCol]}>Player</Text>
                  <Text style={modalStyles.col}>G</Text><Text style={modalStyles.col}>A</Text><Text style={modalStyles.col}>CS</Text>
                </View>
                {sorted.map(p => (
                  <View key={p.playerId} style={[modalStyles.row, p.isPlayerClub && { backgroundColor: accent + '15' }]}>
                    <View style={modalStyles.nameCol}>
                      <Text style={[modalStyles.name, p.isPlayerClub && { color: accent }]} numberOfLines={1}>
                        {p.name}{p.isBench && <Text style={modalStyles.subTag}> SUB</Text>}
                      </Text>
                      <Text style={modalStyles.pos}>{p.position}</Text>
                    </View>
                    <Text style={modalStyles.col}>{p.goals}</Text>
                    <Text style={modalStyles.col}>{p.assists}</Text>
                    <Text style={modalStyles.col}>{p.cleanSheets}</Text>
                  </View>
                ))}
                {sorted.length === 0 && <Text style={modalStyles.empty}>No squad data for this club.</Text>}
              </ScrollView>
            </>
          )}
          <Pressable style={[modalStyles.closeBtn, { borderColor: accent }]} onPress={onClose}>
            <Text style={[modalStyles.closeText, { color: accent }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  card: { width: '100%', maxHeight: '80%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  subtitle: { fontSize: typography.xs, color: colors.textMuted, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  nameCol: { flex: 1 },
  col: { width: 28, fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center', fontWeight: typography.bold },
  name: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.medium },
  pos: { fontSize: 10, color: colors.textMuted },
  subTag: { fontSize: 9, fontWeight: typography.black, color: colors.warning },
  empty: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  closeBtn: { marginTop: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  closeText: { fontSize: typography.md, fontWeight: typography.bold },
})

function RankChip({ label, val, rank, rankOnly }: { label: string; val?: number; rank?: number; rankOnly?: boolean }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipVal}>{rankOnly ? (rank ? `#${rank}` : '–') : `${val}${rank ? ` (#${rank})` : ''}`}</Text>
    </View>
  )
}

function Leader({ label, team, val, theme }: { label: string; team?: string; val?: number; theme: { accent: string } }) {
  return (
    <View style={styles.leaderRow}>
      <Text style={styles.leaderLabel}>{label}</Text>
      <Text style={styles.leaderTeam} numberOfLines={1}>{team ?? '—'} <Text style={{ color: theme.accent, fontWeight: typography.bold }}>{val ?? ''}</Text></Text>
    </View>
  )
}

function AwardCard({ title, list, theme, total }: { title: string; list: AwardCandidate[]; theme: { accent: string }; total: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {list.length === 0 ? <Text style={styles.muted}>No candidates.</Text> : (
        <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
          {list.map((c, i) => (
            <View key={c.playerId} style={[styles.row,
              c.isPlayerClub && { backgroundColor: YOUR_TINT, borderRadius: radius.sm },
              i === 0 && { backgroundColor: theme.accent + '18', borderRadius: radius.sm, borderWidth: 1, borderColor: theme.accent }]}>
              <Text style={[styles.rank, i === 0 && { color: theme.accent }]}>{i + 1}</Text>
              <View style={styles.nameCol}>
                <TeamLabel clubId={c.clubId} name={c.name} textStyle={[styles.name, (i === 0 || c.isPlayerClub) && { color: theme.accent, fontWeight: typography.bold }]} size={15} />
                <Text style={styles.club}>{c.isPlayerClub ? 'Your XI' : c.clubName} · {c.seasonLabel}{c.age != null ? ` · ${c.age}y` : ''} · {c.position}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.statVal, { color: theme.accent }]}>{c.score}</Text>
                <Text style={styles.club}>{c.goals}g {c.assists}a {c.cleanSheets}cs</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <Text style={styles.listCount}>{list.length} eligible candidate{list.length !== 1 ? 's' : ''} of {total} players · the rest had no tournament stats</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted:     { color: colors.textMuted, fontSize: typography.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: typography.xl },
  headerTitle: { fontSize: typography.lg, fontWeight: typography.black },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs, ...shadows.sm },
  cardTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.xs },

  search: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: typography.sm, marginBottom: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.sm },
  rankWrap: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 200 },
  chip: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center', minWidth: 38 },
  chipLabel: { fontSize: 8, color: colors.textMuted, fontWeight: typography.bold },
  chipVal: { fontSize: 10, color: colors.textPrimary, fontWeight: typography.bold },

  tabs: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 22, textAlign: 'center', fontSize: typography.sm, fontWeight: typography.bold, color: colors.textMuted },
  nameCol: { flex: 1 },
  name: { fontSize: typography.sm, color: colors.textPrimary },
  club: { fontSize: 10, color: colors.textMuted },
  season: { fontSize: typography.xs, color: colors.textMuted },
  statVal: { fontSize: typography.md, fontWeight: typography.black, minWidth: 30, textAlign: 'right' },
  listScroll: { maxHeight: 360 },
  listCount: { fontSize: 10, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.xs },

  leaders: { gap: 4, marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  leaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaderLabel: { fontSize: typography.xs, color: colors.textMuted },
  leaderTeam: { fontSize: typography.sm, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },

  teamHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  teamName: { flex: 1 },
  teamCol: { width: 42, textAlign: 'center', fontSize: typography.sm, color: colors.textSecondary },
  yourHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  yc: { width: 30, textAlign: 'center', fontSize: typography.sm, color: colors.textSecondary },
  posTag: { fontSize: 10, color: colors.textMuted },
  subTag: { fontSize: 9, fontWeight: typography.black, color: colors.warning },
  rulesBtn: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  rulesBtnText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.bold },
})
