import { t, dec } from '@/i18n'
import { useKept } from '@/lib/kept'
import { settingsStorage } from '@/lib/mmkv'
import React, { useMemo } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { useUserStore } from '@/store/userStore'
import { fetchAchievementRuns, isRunWon, type AchievementRun } from '@/db/queries/leaderboard'
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
  // P9.75: your runs as last seen, at once, refreshed on each visit
  // (src/lib/kept.ts). Before this screen's own first load, the copy the
  // achievement toasts keep (src/lib/achievementJudge.ts) stands in: the same
  // runs from the same query, so the counts are right from the first frame.
  const me = user && !isGuest ? user.id : null
  const kept = useKept<AchievementRun[]>(me && `ach:${me}`, () => fetchAchievementRuns(me!), 'achievements')
  const runs = useMemo(() => {
    if (kept.data || !me) return kept.data
    try { const raw = settingsStorage.readNow(`pom-ach-runs-${me}`); return raw ? JSON.parse(raw) as AchievementRun[] : undefined } catch { return undefined }
  }, [kept.data, me])
  const loading = !isGuest && runs === undefined && !kept.failed
  const { ach, totalWins, hardestWon, feats } = useMemo(() => {
    const rs = runs ?? []
    const wins = rs.filter(isRunWon)
    const hardest = wins.reduce<number | null>((max, r) => {
      const h = r.difficulty_meta?.hardness
      return typeof h === 'number' ? Math.max(max ?? -1, h) : max
    }, null)
    return { ach: computeAchievements(rs) as Record<string, ModeAch>, totalWins: wins.length, hardestWon: hardest, feats: featCounts(rs) }
  }, [runs])

  const cleared = MODE_META.filter(m => ach[m.mode]?.conquered).length
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('ach.pageTitle')} path="/game/achievements" />
      <BackControl roles={roles} title={t('ach.heading')} />
      {isGuest ? (
        <EmptyState roles={roles} icon="lock" title={t('ach.signIn')} body={t('ach.guestBody')} />
      ) : loading ? (
        <KitText t="bodyL" color={roles.textMuted}>{t('ach.counting')}</KitText>
      ) : (
        <>
          <View style={styles.bigRow}>
            <Big label={t('ach.trophies')} value={String(totalWins)} />
            <Big label={t('ach.hardestWon')} value={hardestWon != null ? dec(hardestWon, 1) : '—'} />
            <Big label={t('ach.modesCleared')} value={`${cleared}/${MODE_META.length}`} />
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
                    {a.conquered && <Tag roles={roles} variant="win">{t('ach.wonTag')}</Tag>}
                  </View>
                  {meta.byTrophy ? TROPHIES.flatMap(c => [false, true].map(aimed => (
                    <View key={`${c}${aimed}`} style={styles.trophyLine}>
                      <KitText t="tag" color={roles.textMuted}>{EUROPE[c].name.toUpperCase() + (aimed ? t('ach.aimedCaps') : '')}</KitText>
                      <DifficultyTags a={ach[trophyKey(c, aimed)] ?? emptyAch()} />
                    </View>
                  ))) : meta.hasDifficulty ? <DifficultyTags a={a} /> : (
                    <View style={styles.tags}>
                      <Tag roles={roles} variant={a.conquered ? 'win' : 'data'}>{a.conquered ? t('ach.conqueredCaps') : t('ach.notYet')}</Tag>
                    </View>
                  )}
                  {a.legacyWins > 0 && (
                    <KitText t="tag" color={roles.textMuted}>{t('ach.legacy', { count: a.legacyWins })}</KitText>
                  )}
                </View>
              </View>
            )
          })}
          {/* P8-126: feats, about a way of playing rather than a mode. Checked
              from every saved run, past ones included. */}
          <SectionTag roles={roles} style={styles.featsHead}>{t('ach.feats', { n: FEATS.filter(f => (feats.get(f.id) ?? 0) > 0).length, m: FEATS.length })}</SectionTag>
          {FEATS.map(f => {
            const n = feats.get(f.id) ?? 0
            return (
              <View key={f.id} style={[styles.feat, { borderBottomColor: roles.rule }]} accessible
                accessibilityLabel={[f.title + '.', f.how, n > 0 ? t('ach.earned', { count: n }) : t('ach.notYetA11y')].join(' ')}>
                <View style={{ flex: 1 }}>
                  <KitText t="bodyL" color={roles.text} style={styles.modeTitle}>{f.title}</KitText>
                  <KitText t="body" color={roles.textMuted}>{f.how}</KitText>
                </View>
                <Tag roles={roles} variant={n > 0 ? 'win' : 'data'}>{n > 1 ? t('ach.wonTimes', { n }) : n === 1 ? t('ach.wonTag') : t('ach.notYet')}</Tag>
              </View>
            )
          })}
          <KitText t="body" color={roles.textMuted} style={styles.foot}>
            {t('ach.foot')}
          </KitText>
        </>
      )}
    </KitScreen>
  )
}

function DifficultyTags({ a }: { a: ModeAch }) {
  return (
    <View style={styles.tags}>
      <Tag roles={roles} variant={a.wonEasy ? 'win' : 'data'}>{t('ach.easyCaps')}</Tag>
      <Tag roles={roles} variant={a.wonMedium ? 'win' : 'data'}>{t('ach.mediumCaps')}</Tag>
      <Tag roles={roles} variant={a.wonHard ? 'win' : 'data'}>{t('ach.hardCaps')}</Tag>
      <Tag roles={roles} variant={a.customBestHardness != null ? 'win' : 'data'}>
        {a.customBestHardness != null ? t('ach.customValue', { n: dec(a.customBestHardness, 1) }) : t('ach.customCaps')}
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
