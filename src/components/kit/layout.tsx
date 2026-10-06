// Kit Drop layout pieces for the three window classes (Phase 6,
// docs/ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md §2).
import React from 'react'
import { View, StyleSheet, KeyboardAvoidingView, type StyleProp, type ViewStyle } from 'react-native'
import { useSizeClass } from '@/hooks/useSizeClass'
import { space } from '@/theme'
import { useScreenRoles } from '@/lib/appearance'
import { SectionTag } from './controls'

/**
 * A screen whose field must stay above the keyboard (sign-in, new account, the
 * club chat). One wrapper, so a fix lands everywhere at once (centralisation
 * N-13, step 1). 'padding' on every platform: since SDK 54 draws edge to edge,
 * Android's window no longer resizes for the keyboard, so the old 'height'
 * behaviour lifted nothing and the keyboard covered the field (P8.5-06 found
 * it in the chat; sign-in and new account had the same setting).
 */
export function KeyboardSafe({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding">{children}</KeyboardAvoidingView>
}

/**
 * A rack of like things (mode labels, difficulty labels, leagues, shapes):
 * one column on a phone, `medium` columns from 600px, `expanded` from 1024px.
 * Children keep their order, reading left to right, then down.
 */
export function Grid({ children, medium = 1, expanded = 2, gap = space[3], style }: {
  children: React.ReactNode
  medium?: number
  expanded?: number
  gap?: number
  style?: StyleProp<ViewStyle>
}) {
  const size = useSizeClass()
  const cols = size === 'expanded' ? expanded : size === 'medium' ? medium : 1
  const items = React.Children.toArray(children).filter(Boolean)
  if (cols <= 1) return <View style={[{ gap }, style]}>{items}</View>
  return (
    <View style={[styles.wrap, { marginHorizontal: -gap / 2, rowGap: gap }, style]}>
      {items.map((c, i) => (
        <View key={i} style={{ width: `${100 / cols}%`, paddingHorizontal: gap / 2 }}>{c}</View>
      ))}
    </View>
  )
}

/**
 * Two panes side by side on an expanded window, stacked otherwise. `aside`
 * is the narrower one; `side` says which edge it sits on.
 */
export function Panes({ main, aside, side = 'right', asideWidth = 360, gap = space[6] }: {
  main: React.ReactNode
  aside: React.ReactNode
  side?: 'left' | 'right'
  asideWidth?: number
  gap?: number
}) {
  const wide = useSizeClass() === 'expanded'
  if (!wide) return <>{side === 'left' ? aside : main}{side === 'left' ? main : aside}</>
  const a = <View style={{ width: asideWidth }}>{aside}</View>
  const m = <View style={styles.main}>{main}</View>
  return <View style={[styles.row, { gap }]}>{side === 'left' ? <>{a}{m}</> : <>{m}{a}</>}</View>
}

/**
 * Sections of uneven height (a result page's table, results, lineup, medical
 * list) as newspaper columns on an expanded window: children are dealt into
 * `count` columns in order, so no row waits for its tallest neighbour. One
 * column everywhere else.
 */
export function Columns({ children, count = 2, gap = space[6] }: { children: React.ReactNode; count?: number; gap?: number }) {
  const wide = useSizeClass() === 'expanded'
  const items = React.Children.toArray(children).filter(Boolean)
  if (!wide || count <= 1) return <>{items}</>
  const cols: React.ReactNode[][] = Array.from({ length: count }, () => [])
  items.forEach((c, i) => cols[i % count].push(c))
  return (
    <View style={[styles.row, { gap }]}>
      {cols.map((c, i) => <View key={i} style={styles.main}>{c}</View>)}
    </View>
  )
}

/**
 * A screen's tabs as panes (the season, the Champions League and World Cup
 * live screens): on an expanded window the panes stand side by side, each
 * under its own heading; otherwise they render as they are, one at a time,
 * behind the screen's own switch.
 */
export function PaneRow({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  if (!wide) return <>{children}</>
  return <View style={[styles.row, { gap: space[5], marginTop: space[3] }]}>{children}</View>
}
export function Pane({ wide, title, flex = 1, children }: { wide: boolean; title: string; flex?: number; children: React.ReactNode }) {
  // P8.5-25: the pane's title takes the screen's ground (it fixed nylon before).
  const roles = useScreenRoles()
  if (!wide) return <>{children}</>
  return (
    <View style={{ flex, minWidth: 0, gap: space[1] }}>
      <SectionTag roles={roles}>{title}</SectionTag>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, minWidth: 0 },
})
