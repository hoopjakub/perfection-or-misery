import React from 'react'
import { View, StyleSheet } from 'react-native'
import { type Roles, space, border, prim, COLOURWAYS } from '@/theme'
import { KitText, Tape, Stripe, Scanlines, GlitchText, lookFor, CHAOS_RED, CURSED_PURPLE, CURSED_LIGHT } from '@/components/kit'

// P8-169: the mode's own banner at the top of its screens (the placement, the
// season, the result), so Chaos and Cursed announce themselves the way their
// drafts already do. Chaos: its word on a red block knocked off true, torn
// tape above it and hazard stripes under. Cursed: its word glitching in pale
// purple on black, under scanlines. The rule line sits under each on the page
// (on Chaos red neither ink nor cotton reads as small text: 4.3:1 and 4.1:1).
const LINES: Record<'chaos' | 'cursed', string> = {
  chaos: 'You picked the players. Chaos picked where they play.',
  cursed: 'Some of this XI the curse chose for you.',
}

export function ModeBanner({ roles, mode }: { roles: Roles; mode: string | null | undefined }) {
  const look = lookFor(mode)
  if (look === 'plain') return null
  if (look === 'chaos') {
    return (
      <View style={styles.wrap} accessible accessibilityRole="header" accessibilityLabel={`Chaos. ${LINES.chaos}`}>
        <View style={styles.chaos}>
          <Tape colours={COLOURWAYS.chaos} roles={roles} style={styles.tape} />
          <View style={[styles.block, { backgroundColor: CHAOS_RED, borderColor: prim.ink }]}>
            <KitText t="superM" color={prim.ink}>CHAOS</KitText>
          </View>
          <Stripe roles={roles} band={6} style={styles.stripe} />
        </View>
        <KitText t="tag" color={roles.textMuted}>{LINES.chaos.toUpperCase()}</KitText>
      </View>
    )
  }
  return (
    <View style={styles.wrap} accessible accessibilityRole="header" accessibilityLabel={`Cursed. ${LINES.cursed}`}>
      <View style={[styles.cursed, { borderColor: CURSED_PURPLE, backgroundColor: prim.nylonSunken }]}>
        <Scanlines colour={CURSED_LIGHT} opacity={0.12} />
        <GlitchText text="CURSED" t="superM" color={CURSED_LIGHT} seed={7} />
      </View>
      <KitText t="tag" color={roles.textMuted}>{LINES.cursed.toUpperCase()}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[1], marginVertical: space[2] },
  chaos: { transform: [{ rotate: '-2deg' }], alignSelf: 'flex-start', minWidth: 200 },
  tape: { marginBottom: -2, marginRight: 24 },
  block: { borderWidth: border.plate, paddingHorizontal: space[3], paddingVertical: space[1] },
  stripe: { height: 8, marginLeft: 16 },
  cursed: { borderWidth: border.plate, paddingHorizontal: space[3], paddingVertical: space[1], alignSelf: 'flex-start', minWidth: 200, overflow: 'hidden' },
})
