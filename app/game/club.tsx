import React, { useMemo, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ROLES, space, border, prim, ratingColor } from '@/theme'
import { KitScreen, KitText, Tag, SectionTag, BackControl, EmptyState, InlineError, Icon } from '@/components/kit'
import { SegmentSwitch, SeasonStrip, PositionGraph, type Mark } from '@/components/season/SeasonParts'
import { useRunData } from '@/lib/runData'
import { openPlayer, openRunMatch, openStory } from '@/lib/runNav'
import { lineOf } from '@/engine/awards'
import { storyText } from '@/engine/press'
import { clubCode } from '@/data/club-codes'
import type { RunMatch } from '@/engine/run-stats'

// D5 · The club page (docs/ui-overhaul/07d), one route instead of the squad
// and club-matches modals. The club as a tag with its finish and record, then
// three tabs: its matches, its squad by position, and its season as a record.
// Head to head with your XI always comes first.
const roles = ROLES.nylon
type Tab = 'matches' | 'squad' | 'record'

const LINE_NAME: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' }
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export default function ClubScreen() {
  const { id, runId } = useLocalSearchParams<{ id: string; runId?: string }>()
  const { data, loading, failed, retry } = useRunData(runId)
  const [tab, setTab] = useState<Tab>('matches')

  const row = data?.table.find(r => r.clubId === id) ?? null
  const team = data?.stats.teams.find(t => t.clubId === id) ?? null
  const name = row?.clubName ?? team?.clubName ?? data?.stats.players.find(p => p.clubId === id)?.clubName ?? ''
  const isYours = !!data?.playerClubId && data.playerClubId === id

  const matches = useMemo(() => (data?.matches ?? []).filter(m => m.homeClubId === id || m.awayClubId === id), [data, id])
  const vsYou = matches.filter(m => !isYours && (m.homeClubId === data?.playerClubId || m.awayClubId === data?.playerClubId))
  const squad = useMemo(() => (data?.stats.players ?? []).filter(p => p.clubId === id), [data, id])
  const marks: Mark[] = matches.map(m => resultFor(m, id!))
  const stories = (data?.press ?? []).filter(s => s.rows.some(r => r.clubId === id))

  if (loading) return <KitScreen ground="nylon"><BackControl roles={roles} /><KitText t="bodyL" color={roles.textMuted}>Reading the club's season.</KitText></KitScreen>
  if (failed || !data) return <KitScreen ground="nylon"><BackControl roles={roles} /><InlineError roles={roles} message="This run's numbers couldn't be read." onRetry={retry} /></KitScreen>
  if (!name) return <KitScreen ground="nylon"><BackControl roles={roles} /><EmptyState roles={roles} title="Not in this run" body="This club didn't play in the competition." /></KitScreen>

  return (
    <KitScreen ground="nylon">
      <BackControl roles={roles} />

      {/* The club as a tag: code, name, finish and record. */}
      <View style={styles.head}>
        <Tag roles={roles} variant="selected">{clubCode(name)}</Tag>
        <KitText t="superL" color={roles.text}>{name.toUpperCase()}</KitText>
        {row && (
          <KitText t="tag" color={roles.textMuted}>
            {`${row.group ? `Group ${row.group} · ` : ''}${ordinal(row.position)} · W ${row.won} D ${row.drawn} L ${row.lost} · ${row.gf}–${row.ga} · ${row.points} pts`}
          </KitText>
        )}
        {isYours && <Tag roles={roles} variant="you">YOUR XI</Tag>}
        {!isYours && data.replacedClubName === name && (
          <KitText t="body" color={roles.textMuted}>Your XI took this club's place in the competition.</KitText>
        )}
      </View>

      {vsYou.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>Against your XI</SectionTag>
          {vsYou.map((m, i) => <MatchRow key={`h${i}`} m={m} clubId={id!} onPress={() => openRunMatch(data, m)} />)}
        </View>
      )}

      <SegmentSwitch<Tab> roles={roles} value={tab} onChange={setTab} options={[
        { id: 'matches', label: 'Matches', count: matches.length || undefined },
        { id: 'squad', label: 'Squad', count: squad.length || undefined },
        { id: 'record', label: 'Record' },
      ]} />

      {tab === 'matches' && (
        data.missing.includes('match-by-match detail')
          ? <KitText t="body" color={roles.textMuted} style={styles.pad}>Saved runs don't keep every match. The record and the squad are complete.</KitText>
          : matches.length === 0
          ? <KitText t="body" color={roles.textMuted} style={styles.pad}>No matches.</KitText>
          : matches.map((m, i) => <MatchRow key={i} m={m} clubId={id!} onPress={() => openRunMatch(data, m)} />)
      )}

      {tab === 'squad' && (['GK', 'DEF', 'MID', 'FWD'] as const).map(l => {
        const group = squad.filter(p => lineOf(p.position) === l).sort((a, b) => (b.matchesRated ?? 0) - (a.matchesRated ?? 0) || b.goals - a.goals)
        if (!group.length) return null
        return (
          <View key={l} style={styles.section}>
            <SectionTag roles={roles}>{LINE_NAME[l]}</SectionTag>
            {group.map(p => (
              <Pressable key={p.playerId} onPress={() => openPlayer(p.playerId, runId)} accessibilityRole="button"
                style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
                <KitText t="tag" color={roles.textMuted} style={styles.pos}>{p.position}</KitText>
                <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{p.name}</KitText>
                <KitText t="figure" color={roles.textMuted} style={styles.num}>{`${p.matchesRated ?? 0} apps`}</KitText>
                <KitText t="figure" color={roles.textMuted} style={styles.num}>{`${p.goals}G ${p.assists}A`}</KitText>
                {p.avgRating != null
                  ? <View style={[styles.rating, { backgroundColor: ratingColor(p.avgRating) }]}><KitText t="figure" color={prim.ink}>{p.avgRating.toFixed(1)}</KitText></View>
                  : <View style={styles.rating} />}
                <Icon name="chevron" size={16} color={roles.textMuted} />
              </Pressable>
            ))}
          </View>
        )
      })}

      {tab === 'record' && (
        <View style={styles.section}>
          {marks.length > 0 && (
            <>
              <SectionTag roles={roles}>Form</SectionTag>
              <SeasonStrip roles={roles} marks={marks} total={marks.length} viewing={null} onPick={() => {}} />
            </>
          )}
          {team && (
            <View style={styles.bigRow}>
              <Big label="Scored" value={String(team.goalsFor)} />
              <Big label="Conceded" value={String(team.goalsAgainst)} />
              <Big label="Clean sheets" value={String(team.cleanSheets)} />
            </View>
          )}
          {data.positions?.get(id!) && (
            <>
              <SectionTag roles={roles}>Position, matchday by matchday</SectionTag>
              <PositionGraph roles={roles} values={data.positions.get(id!)!} clubs={data.table.length} />
            </>
          )}
          {stories.length > 0 && (
            <>
              <SectionTag roles={roles}>In the press</SectionTag>
              {stories.map(s => (
                <Pressable key={s.id} onPress={() => openStory(s.id)} accessibilityRole="link"
                  style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
                  <KitText t="tag" color={roles.textMuted} style={styles.pos}>{`MD ${s.matchday}`}</KitText>
                  <KitText t="body" color={roles.text} style={{ flex: 1 }}>{storyText(s).headline}</KitText>
                  <Icon name="chevron" size={16} color={roles.textMuted} />
                </Pressable>
              ))}
            </>
          )}
        </View>
      )}
    </KitScreen>
  )
}

function resultFor(m: RunMatch, clubId: string): Mark {
  const home = m.homeClubId === clubId
  const d = home ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals
  return d > 0 ? 'W' : d < 0 ? 'L' : 'D'
}

function MatchRow({ m, clubId, onPress }: { m: RunMatch; clubId: string; onPress: () => void }) {
  const home = m.homeClubId === clubId
  const res = resultFor(m, clubId)
  const us = home ? m.homeGoals : m.awayGoals, them = home ? m.awayGoals : m.homeGoals
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${m.label ?? ''}, ${home ? 'home to' : 'away at'} ${home ? m.awayClubName : m.homeClubName}, ${us}–${them}`}
      style={({ pressed }) => [styles.row, styles.tall, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
      <View style={{ flex: 1 }}>
        {m.label ? <KitText t="tag" color={roles.textMuted}>{m.label}</KitText> : null}
        <KitText t="body" color={roles.text} numberOfLines={1}>{`${home ? 'v' : 'at'} ${home ? m.awayClubName : m.homeClubName}`}</KitText>
      </View>
      <Tag roles={roles} variant={res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss'}>{`${res} ${us}–${them}`}</Tag>
      <Icon name="chevron" size={16} color={roles.textMuted} />
    </Pressable>
  )
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 80 }}>
      <KitText t="figureL" color={roles.text}>{value}</KitText>
      <KitText t="tag" color={roles.textMuted}>{label}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { gap: space[2], marginTop: space[2], alignItems: 'flex-start' },
  section: { gap: space[2], marginTop: space[4] },
  pad: { paddingVertical: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair },
  tall: { minHeight: 56 },
  pos: { width: 44 },
  num: { width: 64, textAlign: 'right' },
  rating: { minWidth: 36, paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center' },
  bigRow: { flexDirection: 'row', gap: space[5], marginVertical: space[3] },
})
