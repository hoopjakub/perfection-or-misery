import { t } from '@/i18n'
import { log } from '@/diag/log'
import React, { useEffect, useState } from 'react'
import { VersionButton } from '@/components/VersionButton'
import { useSettingsStore } from '@/store/settingsStore'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getAvailableLeagues, type LeagueOption } from '@/db/queries/seasons'
import { ROLES, space, border, colourwayFor, prim } from '@/theme'
import { MODES, MODE_GROUPS, applyMode, type ModeInfo } from '@/data/modes'
import { flagForLeague } from '@/data/geo-iso'
import type { GameMode } from '@/types/game'
import {
  KitScreen, KitText, RunHeader, ChoiceLabel, SectionTag, RoundFlag, Icon, InlineError, StripedNotice, Grid, Crest,
} from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'

// Stage 1 · Where you play — docs/ui-overhaul/07b B1. A rack of mode labels
// grouped by where the football happens. Picking a mode is one tap and moves
// you on; League mode adds one step (which league) first. Difficulty moved to
// its own screen (app/game/difficulty.tsx), so a label only ever holds its own
// description. Competition marks are plain text (no emblems).
const roles = ROLES[EVERYDAY]

export default function WhereYouPlayScreen() {
  const store = useGameStore()
  // LAST TIME is the last run you finished (settingsStore), the same one Home's
  // Again repeats — not whatever mode the store holds right now.
  const lastMode = useSettingsStore(s => s.lastRun?.mode)
  const [pickingLeague, setPickingLeague] = useState(false)
  const [leagues, setLeagues] = useState<LeagueOption[] | null>(null)
  const [leaguesFailed, setLeaguesFailed] = useState(false)

  useEffect(() => {
    if (!pickingLeague || leagues) return
    let active = true
    getAvailableLeagues()
      .then(d => { if (active) setLeagues(d) })
      .catch(e => { log.warn('db', 'where: leagues failed', e); if (active) setLeaguesFailed(true) })
    return () => { active = false }
  }, [pickingLeague, leagues])

  function pick(mode: ModeInfo) {
    if (mode.comingSoon) return
    if (mode.id === 'league') { setPickingLeague(true); return }
    applyMode(store, mode.id as GameMode)
    router.push(mode.hasDifficulty ? '/game/difficulty' : '/game/formation-select')
  }

  function pickLeague(leagueId: string) {
    applyMode(store, 'league', leagueId)
    router.push('/game/difficulty')
  }

  if (pickingLeague) {
    return (
      <KitScreen ground={EVERYDAY} width="wide">
        <RunHeader roles={roles} stage={1} colourway={[prim.ink]} title={t('setup.whichLeague')} onBack={() => setPickingLeague(false)} />
        <KitText t="bodyL" color={roles.textMuted} style={styles.lead}>
          {t('setup.leagueLead')}
        </KitText>
        {leaguesFailed ? (
          <InlineError roles={roles} message={t('setup.leaguesFailed')} onRetry={() => { setLeaguesFailed(false); setLeagues(null) }} />
        ) : !leagues ? (
          <KitText t="tag" color={roles.textMuted}>{t('setup.loadingLeagues')}</KitText>
        ) : leagues.length === 0 ? (
          <StripedNotice roles={roles}>{t('setup.noLeagues')}</StripedNotice>
        ) : (
          <Grid medium={2} expanded={3} gap={space[2]}>
            {leagues.map(l => (
              <Pressable
                key={l.id}
                onPress={() => pickLeague(l.id)}
                accessibilityRole="button"
                accessibilityLabel={l.name}
                style={({ pressed }) => [
                  styles.leagueTag,
                  { borderColor: roles.line, backgroundColor: pressed ? roles.sunken : roles.surface },
                  store.selectedLeague === l.id && { borderWidth: border.plate },
                ]}
              >
                <RoundFlag roles={roles} emoji={flagForLeague(l.id)} code={l.name} size={24} />
                <KitText t="body" color={roles.text} style={{ flex: 1 }}>{l.name}</KitText>
                <Icon name="chevron" size={16} color={roles.textMuted} />
              </Pressable>
            ))}
          </Grid>
        )}
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY} width="wide">
      <RunHeader roles={roles} stage={1} colourway={[prim.ink]} title={t('setup.whereYouPlay')} />
      {MODE_GROUPS.map(group => (
        <View key={group.id}>
          <SectionTag roles={roles}>{group.label}</SectionTag>
          {/* Two columns: groups hold four, two and two modes, so three columns left an orphan. */}
          <Grid medium={2} expanded={2} style={styles.rack}>
            {MODES.filter(m => m.group === group.id).map(m => (
              <ChoiceLabel
                key={m.id}
                roles={roles}
                colourway={colourwayFor(m.id)}
                title={m.title}
                mark={
                  // P8-86: every mode wears its icon; a tournament also wears
                  // its competition's own mark (P8-12) beside it.
                  <View style={styles.mark}>
                    <Icon name={m.icon} size={20} color={roles.text} />
                    {m.competitionId ? <Crest roles={roles} clubId={m.competitionId} name={m.title} size={20} competition /> : null}
                  </View>
                }
                note={m.line}
                lines={m.rules}
                hazard={m.hazard}
                comingSoon={m.comingSoon}
                lastTime={!m.comingSoon && m.id === lastMode}
                onPress={m.comingSoon ? undefined : () => pick(m)}
              />
            ))}
          </Grid>
        </View>
      ))}
      {/* P8-73: the version on every menu before a run starts. */}
      <VersionButton roles={roles} style={{ marginTop: space[4] }} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  lead: { marginBottom: space[4] },
  rack: { marginBottom: space[2] },
  mark: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  leagueTag: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    borderWidth: border.thin, minHeight: 56, paddingHorizontal: space[3],
  },
})
