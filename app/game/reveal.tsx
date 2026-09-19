import React, { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useReducedMotion } from 'react-native-reanimated'
import { useGameStore } from '@/store/gameStore'
import { getSlotsForFormation } from '@/engine/formations'
import { calcTeamOvr, effectiveOvr } from '@/engine/rating'
import { haptic } from '@/lib/haptics'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, Tag, ListRow } from '@/components/kit'

// The ratings reveal — docs/ui-overhaul/07b B6. Only for runs that drafted
// blind (Hard, Chaos, Cursed, Custom with ratings off). It used to leak: the
// placement header showed Team OVR the moment the draft finished. Now the
// numbers arrive here, on nylon, one position at a time, and can be skipped.
const roles = ROLES.nylon
const STEP_MS = 60

export default function RevealScreen() {
  const { mode, formation, draftedPlayers } = useGameStore()
  const reduced = useReducedMotion()
  const slots = useMemo(() => (formation ? getSlotsForFormation(formation) : []), [formation])
  const rows = useMemo(() => slots
    .map(s => {
      const p = draftedPlayers.find(d => d.slotIndex === s.slotIndex)
      return p ? { slot: s, player: p, eff: effectiveOvr(p, s) } : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null), [slots, draftedPlayers])
  const [shown, setShown] = useState(reduced ? rows.length : 0)
  const done = shown >= rows.length

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setShown(n => n + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [shown, done])

  useEffect(() => { if (done && rows.length) haptic('medium') }, [done])

  if (!formation || rows.length === 0) {
    return (
      <KitScreen ground="nylon" scroll={false} contentStyle={styles.center}>
        <KitText t="bodyL" color={roles.textMuted}>There's no squad to reveal.</KitText>
        <Plate label="Back to the draft" roles={roles} onPress={() => router.replace('/game/draft')} />
      </KitScreen>
    )
  }

  const team = calcTeamOvr(draftedPlayers, slots)
  const best = rows.reduce((a, b) => (b.eff > a.eff ? b : a))
  const worst = rows.reduce((a, b) => (b.eff < a.eff ? b : a))
  const surname = (n: string) => n.split(' ').slice(-1)[0].toUpperCase()

  return (
    <KitScreen ground="nylon">
      <RunHeader roles={roles} stage={4} colourway={colourwayFor(mode)} title="Your ratings"
        skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []} back={false} />

      {rows.map((r, i) => (
        <ListRow
          key={r.slot.slotIndex}
          roles={roles}
          label={`${r.slot.label}  ${r.player.name}`}
          value={i < shown ? String(r.eff) : '??'}
        />
      ))}

      {done ? (
        <View style={styles.verdict} accessibilityLiveRegion="polite">
          <KitText t="tag" color={roles.textMuted}>TEAM OVR</KitText>
          <KitText t="superXl" color={roles.text}>{String(team)}</KitText>
          <KitText t="bodyL" color={roles.text}>{`Blind, you built an ${team}.`}</KitText>
          <View style={styles.callouts}>
            <Tag roles={roles} variant="win">{`STEAL · ${surname(best.player.name)} ${best.eff} AT ${best.slot.label}`}</Tag>
            {worst !== best && (
              <Tag roles={roles} variant="loss">{`BLUNDER · ${worst.eff} AT ${worst.slot.label}`}</Tag>
            )}
          </View>
          <Plate label="To the draw" icon="forward" roles={roles} onPress={() => router.replace('/game/placement')} style={styles.plate} />
        </View>
      ) : (
        <Plate label="Show all" variant="quiet" roles={roles} onPress={() => setShown(rows.length)} style={styles.skip} />
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  verdict: { marginTop: space[5], gap: space[2] },
  callouts: { gap: space[2], marginTop: space[2] },
  plate: { marginTop: space[5] },
  skip: { alignSelf: 'flex-start', marginTop: space[3] },
})
