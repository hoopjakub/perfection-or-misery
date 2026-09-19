import React, { useEffect, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { useUserStore } from '@/store/userStore'
import { fetchCareer } from '@/db/queries/career'
import { ROLES, space, border } from '@/theme'
import { KitScreen, KitText, BackControl, Chips, SectionTag, Tag, EmptyState, InlineError } from '@/components/kit'
import type { CareerStats } from '@/types/stats'

// D10 · Career (docs/ui-overhaul/07d). Every player you've fielded, across
// every run: the totals, the awards they won for you, and a board per stat.
// Filters are the kit's chips; honours are tags, not emoji.
const roles = ROLES.cotton

type Tab = 'goals' | 'assists' | 'cleanSheets' | 'matchesPlayed'
type Comp = 'all' | 'league' | 'champions_league' | 'champions_league_custom' | 'world_cup'

const COMP_LABEL: Record<string, string> = { league: 'League', champions_league: 'UCL', champions_league_custom: 'UCL Full Path', world_cup: 'World Cup' }
const COMPS: { id: Comp; label: string }[] = [{ id: 'all', label: 'All' }, ...(['league', 'champions_league', 'champions_league_custom', 'world_cup'] as const).map(c => ({ id: c, label: COMP_LABEL[c] }))]
const TABS: { id: Tab; label: string }[] = [{ id: 'goals', label: 'Goals' }, { id: 'assists', label: 'Assists' }, { id: 'cleanSheets', label: 'Clean sheets' }, { id: 'matchesPlayed', label: 'Apps' }]

export default function CareerScreen() {
  const { user, isGuest } = useUserStore()
  const [career, setCareer] = useState<CareerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<Tab>('goals')
  const [comp, setComp] = useState<Comp>('all')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!user || isGuest) { setLoading(false); return }
      try { const c = await fetchCareer(user.id); if (alive) { setCareer(c); setFailed(false) } }
      catch (e) { console.warn('[career] load failed:', e); if (alive) setFailed(true) }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [user, isGuest, attempt])

  const shell = (children: React.ReactNode) => (
    <KitScreen ground="cotton">
      <PageMeta title="Career" path="/game/career" />
      <BackControl roles={roles} />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>CAREER</KitText>
      {children}
    </KitScreen>
  )
  if (loading) return shell(<KitText t="bodyL" color={roles.textMuted}>Reading your career.</KitText>)
  if (isGuest || !user) return shell(<EmptyState roles={roles} icon="lock" title="Sign in to build a career" body="Guest runs aren't saved, so there's nothing to add up." />)
  if (failed) return shell(<InlineError roles={roles} message="Your career couldn't be loaded." onRetry={() => { setLoading(true); setAttempt(a => a + 1) }} />)
  if (!career || career.players.length === 0) return shell(<EmptyState roles={roles} title="No career yet" body="Finish some runs and your players add up here." />)

  const pool = comp === 'all' ? career.players : career.players.filter(p => p.competition === comp)
  const list = pool.filter(p => p[tab] > 0).sort((a, b) => b[tab] - a[tab])
  const decorated = pool.filter(p => p.potsWins > 0 || p.u21Wins > 0).sort((a, b) => (b.potsWins + b.u21Wins) - (a.potsWins + a.u21Wins))
  const key = (p: typeof pool[number]) => `${p.playerId}|${p.seasonLabel}|${p.competition}`

  return shell(
    <>
      <View style={styles.bigRow}>
        <Big label="Players fielded" value={String(new Set(career.players.map(p => p.playerId)).size)} />
        <Big label="Goals for" value={String(career.goalsFor)} />
        <Big label="Goals against" value={String(career.goalsAgainst)} />
      </View>
      <Chips roles={roles} label="Competition" options={COMPS} value={comp} onChange={setComp} />

      {decorated.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>Awards cabinet</SectionTag>
          {decorated.map(p => (
            <View key={key(p)} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <View style={{ flex: 1 }}>
                <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
                <KitText t="tag" color={roles.textMuted}>{`${p.seasonLabel} · ${COMP_LABEL[p.competition] ?? p.competition}`}</KitText>
              </View>
              {p.potsWins > 0 && <Tag roles={roles} variant="win">{`PLAYER OF THE SEASON ×${p.potsWins}`}</Tag>}
              {p.u21Wins > 0 && <Tag roles={roles} variant="win">{`BEST U21 ×${p.u21Wins}`}</Tag>}
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Chips roles={roles} label="Board" options={TABS} value={tab} onChange={setTab} />
        {list.length === 0 ? <KitText t="body" color={roles.textMuted}>Nothing here yet.</KitText> : list.map((p, i) => (
          <View key={key(p)} style={[styles.row, { borderBottomColor: roles.rule }]}>
            <KitText t="figure" color={roles.textMuted} style={styles.rank}>{String(i + 1)}</KitText>
            <View style={{ flex: 1 }}>
              <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
              <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`${p.seasonLabel} · ${COMP_LABEL[p.competition] ?? p.competition} · ${p.runs} run${p.runs !== 1 ? 's' : ''} · ${p.matchesPlayed} apps`}</KitText>
            </View>
            <KitText t="figure" color={roles.text} style={styles.val}>{String(p[tab])}</KitText>
          </View>
        ))}
      </View>
    </>
  )
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <KitText t="figureL" color={roles.text}>{value}</KitText>
      <KitText t="tag" color={roles.textMuted}>{label}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[3] },
  bigRow: { flexDirection: 'row', gap: space[3], marginVertical: space[4] },
  section: { gap: space[2], marginTop: space[5] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, borderBottomWidth: border.hair, flexWrap: 'wrap' },
  rank: { width: 28, textAlign: 'right' },
  val: { minWidth: 36, textAlign: 'right' },
})
