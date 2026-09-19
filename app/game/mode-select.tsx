import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getAvailableLeagues, type LeagueOption } from '@/db/queries/seasons'
import { ROLES, space, border, colourwayFor, prim } from '@/theme'
import { MODES, MODE_GROUPS, applyMode, type ModeInfo } from '@/data/modes'
import { flagForLeague } from '@/data/geo-iso'
import type { GameMode } from '@/types/game'
import {
  KitScreen, KitText, RunHeader, ChoiceLabel, SectionTag, RoundFlag, Icon, InlineError, StripedNotice,
} from '@/components/kit'

// Stage 1 · Where you play — docs/ui-overhaul/07b B1. A rack of mode labels
// grouped by where the football happens. Picking a mode is one tap and moves
// you on; League mode adds one step (which league) first. Difficulty moved to
// its own screen (app/game/difficulty.tsx), so a label only ever holds its own
// description. Competition marks are plain text (no emblems).
const roles = ROLES.cotton

export default function WhereYouPlayScreen() {
  const store = useGameStore()
  const lastMode = store.mode
  const [pickingLeague, setPickingLeague] = useState(false)
  const [leagues, setLeagues] = useState<LeagueOption[] | null>(null)
  const [leaguesFailed, setLeaguesFailed] = useState(false)

  useEffect(() => {
    if (!pickingLeague || leagues) return
    let active = true
    getAvailableLeagues()
      .then(d => { if (active) setLeagues(d) })
      .catch(e => { console.warn('[where] leagues failed:', e); if (active) setLeaguesFailed(true) })
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
      <KitScreen ground="cotton">
        <RunHeader roles={roles} stage={1} colourway={[prim.ink]} title="Which league" onBack={() => setPickingLeague(false)} />
        <KitText t="bodyL" color={roles.textMuted} style={styles.lead}>
          Every spin and your placement come from this league, across every season we have.
        </KitText>
        {leaguesFailed ? (
          <InlineError roles={roles} message="The leagues didn't load." onRetry={() => { setLeaguesFailed(false); setLeagues(null) }} />
        ) : !leagues ? (
          <KitText t="tag" color={roles.textMuted}>Loading leagues…</KitText>
        ) : leagues.length === 0 ? (
          <StripedNotice roles={roles}>No leagues are available in this build.</StripedNotice>
        ) : (
          <View style={styles.leagueGrid}>
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
                <RoundFlag roles={roles} emoji={flagForLeague(l.id)} code={l.id.slice(0, 3).toUpperCase()} size={24} />
                <KitText t="body" color={roles.text} style={{ flex: 1 }}>{l.name}</KitText>
                <Icon name="chevron" size={16} color={roles.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </KitScreen>
    )
  }

  return (
    <KitScreen ground="cotton">
      <RunHeader roles={roles} stage={1} colourway={[prim.ink]} title="Where you play" />
      {MODE_GROUPS.map(group => (
        <View key={group.id}>
          <SectionTag roles={roles}>{group.label}</SectionTag>
          <View style={styles.rack}>
            {MODES.filter(m => m.group === group.id).map(m => (
              <ChoiceLabel
                key={m.id}
                roles={roles}
                colourway={colourwayFor(m.id)}
                title={m.title}
                note={m.line}
                lines={m.rules}
                hazard={m.hazard}
                comingSoon={m.comingSoon}
                lastTime={!m.comingSoon && m.id === lastMode}
                onPress={m.comingSoon ? undefined : () => pick(m)}
              />
            ))}
          </View>
        </View>
      ))}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  lead: { marginBottom: space[4] },
  rack: { gap: space[3] },
  leagueGrid: { gap: space[2] },
  leagueTag: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    borderWidth: border.thin, minHeight: 56, paddingHorizontal: space[3],
  },
})
