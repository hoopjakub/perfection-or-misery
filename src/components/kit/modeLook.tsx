import React, { createContext, useContext, useEffect, useId, useState } from 'react'
import { View, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native'
import { KitText } from './primitives'
import type { TypeToken } from '@/theme'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { useReducedMotion } from '@/hooks/useReducedMotion'

// P8-169: Chaos and Cursed, a version of the kit each, beyond the draft. The
// season screens wore the default look in the modes' colours (batch 16's own
// "to come"); now a screen says which look it's in, once, and the kit's pieces
// that make a season screen — the section headings, the league table, the
// scoreline card — dress themselves for it:
//  - Chaos is knocked about: headings askew with a strip of ripped hazard tape,
//    the table and the scoreline card a degree off true, a hazard edge down the
//    table. Loud, but every figure stays level and readable.
//  - Cursed is a bad signal: faint purple scanlines over the table and the
//    card, and now and then a heading glitches — a purple ghost of it, offset,
//    for a blink. Rare and short (P8-145's rule for things that live), and
//    still under reduced motion.
export type ModeLook = 'plain' | 'chaos' | 'cursed'
export const CHAOS_RED = '#E0301E'       // the Chaos colourway's red
export const CURSED_PURPLE = '#7234F0'   // the Cursed colourway's purple
export const CURSED_LIGHT = '#B98CFF'

const Look = createContext<ModeLook>('plain')
export function ModeLookProvider({ look, children }: { look: ModeLook; children: React.ReactNode }) {
  return <Look.Provider value={look}>{children}</Look.Provider>
}
export const useModeLook = () => useContext(Look)
export const lookFor = (mode: string | null | undefined): ModeLook => (mode === 'chaos' ? 'chaos' : mode === 'cursed' ? 'cursed' : 'plain')

/** A small, steady tilt for a piece, from its text: the same piece always sits the same way. */
export function tiltOf(key: string, max = 2): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  const steps = [-1, 0.6, -0.4, 1]
  return steps[Math.abs(h) % steps.length] * max
}

/** Faint horizontal lines over a piece: the Cursed look's bad signal. */
export function Scanlines({ colour = CURSED_PURPLE, opacity = 0.14, style }: { colour?: string; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`scan${id}`} patternUnits="userSpaceOnUse" width={4} height={3}>
            <Rect x={0} y={0} width={4} height={1} fill={colour} opacity={opacity} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#scan${id})`} />
      </Svg>
    </View>
  )
}

/** Text that now and then (every four to eight seconds, staggered by `seed`)
 *  glitches: a purple ghost of it, offset, for a blink. Nothing runs between. */
export function GlitchText({ text, t, color, seed = 0, style }: { text: string; t: TypeToken; color: string; seed?: number; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion()
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (reduced) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const next = (first: boolean) => {
      timer = setTimeout(() => {
        if (!alive) return
        setOn(true)
        timer = setTimeout(() => { if (alive) { setOn(false); next(false) } }, 110)
      }, (first ? 900 : 4000) + ((seed * 977) % 4000))
    }
    next(true)
    return () => { alive = false; clearTimeout(timer) }
  }, [reduced, seed])
  return (
    <View>
      {on && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ghost]} importantForAccessibility="no-hide-descendants">
          <KitText t={t} color={CURSED_LIGHT} style={style}>{text}</KitText>
        </View>
      )}
      <KitText t={t} color={color} style={[style, on && styles.shake]}>{text}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  ghost: { transform: [{ translateX: 3 }, { translateY: -1 }], opacity: 0.7 },
  shake: { transform: [{ translateX: -1 }] },
})
