// Kit Drop feedback and the screen frame.
import React, { useCallback } from 'react'
import { View, ScrollView, StyleSheet, type StyleProp, type ViewStyle, type ScrollViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import { ROLES, type Ground, type Roles, space } from '@/theme'
import { COLUMN, MAX_CONTENT } from '@/hooks/useSizeClass'
import { KitText, Stripe, Icon } from './primitives'
import { Plate } from './controls'

// ── KitScreen ────────────────────────────────────────────────────────────────
// A screen standing on one ground. Reads the top inset instead of a hardcoded
// 52/56/64, and sets the status bar to match the ground whenever the screen is
// focused (tabs stay mounted, so a mount-time setting would be overwritten by
// whichever tab mounted last).
export function KitScreen({ ground, scroll = true, width = 'column', children, contentStyle, ...scrollProps }: ScrollViewProps & {
  ground: Ground
  scroll?: boolean
  /** Phase 6: 'column' keeps a centred reading column on wide windows (the
   *  ground still runs edge to edge); 'wide' is for screens with real
   *  two- and three-pane layouts, capped at MAX_CONTENT. */
  width?: 'column' | 'wide'
  children: React.ReactNode
  contentStyle?: StyleProp<ViewStyle>
}) {
  const insets = useSafeAreaInsets()
  const roles = ROLES[ground]
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(ground === 'cotton' ? 'dark' : 'light')
  }, [ground]))
  const cap = { maxWidth: width === 'wide' ? MAX_CONTENT : COLUMN, width: '100%' as const, alignSelf: 'center' as const }
  const pad = [{ paddingTop: insets.top + space[5], paddingHorizontal: space[4] }, cap, contentStyle]
  if (!scroll) return <View style={[styles.fill, { backgroundColor: roles.bg }, pad]}>{children}</View>
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: roles.bg }]}
      contentContainerStyle={[pad, { paddingBottom: space[7] }]}
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  )
}

// ── WebColumn ────────────────────────────────────────────────────────────────
// The same centred column for the few screens not built on KitScreen yet
// (the match sheet, the Deep Match, About, the guide), so nothing stretches
// full-bleed across a desktop window.
export function WebColumn({ children, background }: { children: React.ReactNode; background: string }) {
  return (
    <View style={[styles.fill, { backgroundColor: background }]}>
      <View style={[styles.fill, { maxWidth: COLUMN, width: '100%', alignSelf: 'center' }]}>{children}</View>
    </View>
  )
}

// ── StripedNotice ────────────────────────────────────────────────────────────
// Something the player must know (no password recovery, a failed load). The
// stripe marks it; the words sit on a solid ground beside it, never on it.
export function StripedNotice({ roles, children, actionLabel, onAction }: {
  roles: Roles
  children: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={[styles.notice, { borderColor: roles.line, backgroundColor: roles.surface }]} accessibilityLiveRegion="polite">
      <Stripe roles={roles} band={6} style={styles.noticeStripe} />
      <View style={styles.noticeBody}>
        <KitText t="body" color={roles.text}>{children}</KitText>
        {actionLabel && onAction ? (
          <Plate label={actionLabel} onPress={onAction} roles={roles} variant="quiet" style={styles.noticeAction} />
        ) : null}
      </View>
    </View>
  )
}

// ── InlineError ──────────────────────────────────────────────────────────────
// A fetch that failed. Never falls through to the empty state, which would
// tell the player something false ("No runs yet").
export function InlineError({ roles, message, onRetry }: { roles: Roles; message: string; onRetry: () => void }) {
  return <StripedNotice roles={roles} actionLabel="Retry" onAction={onRetry}>{message}</StripedNotice>
}

// ── EmptyState ───────────────────────────────────────────────────────────────
// Says what's true and what to do next. No mascot, no emoji.
export function EmptyState({ roles, title, body, icon }: {
  roles: Roles
  title: string
  body?: string
  icon?: 'runs' | 'ranks' | 'lock' | 'trophy'
}) {
  return (
    <View style={styles.empty}>
      {icon && <Icon name={icon} size={24} color={roles.textMuted} />}
      <KitText t="title" color={roles.text}>{title}</KitText>
      {body ? <KitText t="body" color={roles.textMuted}>{body}</KitText> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  noticeStripe: { width: 14 },
  noticeBody: { flex: 1, padding: space[3], gap: space[1] },
  noticeAction: { alignSelf: 'flex-start', marginLeft: -space[2] },
  empty: { gap: space[2], paddingVertical: space[5], alignItems: 'flex-start' },
})
