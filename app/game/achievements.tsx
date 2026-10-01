import React, { useEffect, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { useUserStore } from '@/store/userStore'
import { fetchAchievementRuns, isRunWon } from '@/db/queries/leaderboard'
import { MODE_META, computeAchievements, emptyAch, TROPHIES, trophyKey, type ModeAch } from '@/lib/achievements'
import { FEATS, featCounts } from '@/lib/feats'
import { EUROPE } from '@/data/europe'
import { ROLES, space, border, font, colourwayFor } from '@/theme'
import { KitScreen, KitText, BackControl, Tag, Tape, EmptyState, SectionTag } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'

// D10 · Achievements (docs/ui-overhaul/07d). Each mode is a strip in its own
// colourway (the same tape its run labels wear); a difficulty won is a WIN
// tag, one still to win is a plain one. The old per-mode hex accents and
// Ionicons are gone: the colourway is the mode's identity everywhere now.
const roles = ROLES[EVERYDAY]

export default function AchievementsScreen() {
  const { user, isGuest } = useUserStore()
  const [loading, setLoading] = useState(true)
  const [ach, setAch] = useState<Record<string, ModeAch>>({})
  const [totalWins, setTotalWins] = useState(0)
  const [hardestWon, setHardestWon] = useState<number | null>(null)
  const [feats, setFeats] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let active = true
    async function load() {
      if (!user || isGuest) { setLoading(false); return }
      try {
        const runs = await fetchAchievementRuns(user.id)
        if (!active) return
        const computed = computeAchievements(runs)
        setAch(computed)
        const wins = runs.filter(isRunWon)
        setTotalWins(wins.length)
        const hardest = wins.reduce<number | null>((max, r) => {
          const h = r.difficulty_meta?.hardness
          return typeof h === 'number' ? Math.max(max ?? -1, h) : max
        }, null)
        setHardestWon(hardest)
        setFeats(featCounts(runs))
      } catch (e) {
        console.warn('[achievements] load failed:', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user, isGuest])

  const cleared = MODE_META.filter(m => ach[m.mode]?.conquered).length
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title="Achievements" path="/game/achievements" />
      <BackControl roles={roles} title="ACHIEVEMENTS" />
      {isGuest ? (
        <EmptyState roles={roles} icon="lock" title="Sign in to keep trophies" body="Guest runs aren't saved, so they can't count here." />
      ) : loading ? (
        <KitText t="bodyL" color={roles.textMuted}>Counting the trophies.</KitText>
      ) : (
        <>
          <View style={styles.bigRow}>
            <Big label="Trophies" value={String(totalWins)} />
            <Big label="Hardest won /11" value={hardestWon != null ? hardestWon.toFixed(1) : '—'} />
            <Big label="Modes cleared" value={`${cleared}/${MODE_META.length}`} />
          </View>
          {MODE_META.map(meta => {
            const a = ach[meta.mode] ?? emptyAch()
            return (
              <View key={meta.mode} style={[styles.mode, { borderColor: a.conquered ? roles.line : roles.rule, backgroundColor: roles.surface }]}>
                <Tape colours={colourwayFor(meta.mode)} roles={roles} vertical style={styles.tape} />
                <View style={styles.modeBody}>
                  <View style={styles.modeHead}>
                    <View style={{ flex: 1 }}>
                      <KitText t="bodyL" color={roles.text} style={styles.modeTitle}>{meta.title}</KitText>
                      <KitText t="tag" color={roles.textMuted}>{meta.trophy}</KitText>
                    </View>
                    {a.conquered && <Tag roles={roles} variant="win">WON</Tag>}
                  </View>
                  {meta.byTrophy ? TROPHIES.flatMap(c => [false, true].map(aimed => (
                    <View key={`${c}${aimed}`} style={styles.trophyLine}>
                      <KitText t="tag" color={roles.textMuted}>{`${EUROPE[c].name.toUpperCase()}${aimed ? ', AIMED' : ''}`}</KitText>
                      <DifficultyTags a={ach[trophyKey(c, aimed)] ?? emptyAch()} />
                    </View>
                  ))) : meta.hasDifficulty ? <DifficultyTags a={a} /> : (
                    <View style={styles.tags}>
                      <Tag roles={roles} variant={a.conquered ? 'win' : 'data'}>{a.conquered ? 'CONQUERED' : 'NOT YET'}</Tag>
                    </View>
                  )}
                  {a.legacyWins > 0 && (
                    <KitText t="tag" color={roles.textMuted}>{`+${a.legacyWins} older win${a.legacyWins > 1 ? 's' : ''} from before difficulty was tracked`}</KitText>
                  )}
                </View>
              </View>
            )
          })}
          {/* P8-126: feats, about a way of playing rather than a mode. Checked
              from every saved run, past ones included. */}
          <SectionTag roles={roles} style={styles.featsHead}>{`Feats · ${FEATS.filter(f => (feats.get(f.id) ?? 0) > 0).length}/${FEATS.length}`}</SectionTag>
          {FEATS.map(f => {
            const n = feats.get(f.id) ?? 0
            return (
              <View key={f.id} style={[styles.feat, { borderBottomColor: roles.rule }]} accessible
                accessibilityLabel={`${f.title}. ${f.how} ${n > 0 ? `Earned ${n} time${n === 1 ? '' : 's'}` : 'Not yet'}`}>
                <View style={{ flex: 1 }}>
                  <KitText t="bodyL" color={roles.text} style={styles.modeTitle}>{f.title}</KitText>
                  <KitText t="body" color={roles.textMuted}>{f.how}</KitText>
                </View>
                <Tag roles={roles} variant={n > 0 ? 'win' : 'data'}>{n > 1 ? `WON ×${n}` : n === 1 ? 'WON' : 'NOT YET'}</Tag>
              </View>
            )
          })}
          <KitText t="body" color={roles.textMuted} style={styles.foot}>
            Win a mode on a difficulty and its tag stays. Custom shows the hardest custom run you've won, on a 0–11 scale.
          </KitText>
        </>
      )}
    </KitScreen>
  )
}

function DifficultyTags({ a }: { a: ModeAch }) {
  return (
    <View style={styles.tags}>
      <Tag roles={roles} variant={a.wonEasy ? 'win' : 'data'}>EASY</Tag>
      <Tag roles={roles} variant={a.wonMedium ? 'win' : 'data'}>MEDIUM</Tag>
      <Tag roles={roles} variant={a.wonHard ? 'win' : 'data'}>HARD</Tag>
      <Tag roles={roles} variant={a.customBestHardness != null ? 'win' : 'data'}>
        {a.customBestHardness != null ? `CUSTOM ${a.customBestHardness.toFixed(1)}/11` : 'CUSTOM'}
      </Tag>
    </View>
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
  featsHead: { marginTop: space[5] },
  feat: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2], borderBottomWidth: border.hair },
  title: { marginTop: space[3] },
  bigRow: { flexDirection: 'row', gap: space[3], marginVertical: space[4] },
  mode: { flexDirection: 'row', borderWidth: border.thin, marginBottom: space[3] },
  tape: { alignSelf: 'stretch' },
  modeBody: { flex: 1, padding: space[3], gap: space[2] },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  modeTitle: { fontFamily: font.bodyBold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  trophyLine: { gap: space[1] },
  foot: { marginTop: space[2], marginBottom: space[5] },
})
