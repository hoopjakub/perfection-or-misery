// Kit Drop feedback and the screen frame.
import React, { useCallback } from 'react'
import { View, ScrollView, StyleSheet, Platform, type StyleProp, type ViewStyle, type ScrollViewProps } from 'react-native'
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
export function KitScreen({ ground, scroll = true, width = 'column', children, contentStyle, scrollRef, underHeader, ...scrollProps }: ScrollViewProps & {
  ground: Ground
  scroll?: boolean
  /** Phase 6: 'column' keeps a centred reading column on wide windows (the
   *  ground still runs edge to edge); 'wide' is for screens with real
   *  two- and three-pane layouts, capped at MAX_CONTENT. */
  width?: 'column' | 'wide'
  children: React.ReactNode
  contentStyle?: StyleProp<ViewStyle>
  /** Lets a screen scroll itself (the player page sliding down to a match, P8-66). */
  scrollRef?: React.Ref<ScrollView>
  /** The screen has its own header above this one (the full path's stage
   *  road), which already clears the status bar: no status-bar padding and no
   *  band. The band is drawn at this view's own top, so under a header it sat
   *  on the page's first lines and cut every title in half. */
  underHeader?: boolean
}) {
  const insets = useSafeAreaInsets()
  const roles = ROLES[ground]
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(ground === 'cotton' ? 'dark' : 'light')
    // Web: the Kit scrollbar's colours follow the ground (webChrome.ts, P8-29).
    if (Platform.OS === 'web') document.documentElement.dataset.ground = ground
  }, [ground]))
  const cap = { maxWidth: width === 'wide' ? MAX_CONTENT : COLUMN, width: '100%' as const, alignSelf: 'center' as const }
  const pad = [{ paddingTop: underHeader ? space[3] : insets.top + space[5], paddingHorizontal: space[4] }, cap, contentStyle]
  if (!scroll) return <View style={[styles.fill, { backgroundColor: roles.bg }, pad]}>{children}</View>
  return (
    <View style={[styles.fill, { backgroundColor: roles.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={[pad, { paddingBottom: space[7] }]}
        // Native keeps its indicator hidden. On web the page shows the Kit
        // scrollbar (P8-29): a mouse user expects a bar they can see and drag.
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        {...scrollProps}
      >
        {children}
      </ScrollView>
      {/* The status bar is see-through on Android, and the content only
          STARTED below it: scrolled, the page ran up under the clock (the
          maintainer's Awards Night screenshot, 24 Sept — a winner's name
          printed over the time). A band of the ground's own colour sits
          behind the status bar on every scrolling screen. */}
      {insets.top > 0 && !underHeader && <View pointerEvents="none" style={[styles.statusBand, { height: insets.top, backgroundColor: roles.bg }]} />}
    </View>
  )
}

// ── WebColumn ────────────────────────────────────────────────────────────────
// The same centred column for the few screens not built on KitScreen yet
// (the match sheet, the Deep Match, About, the guide), so nothing stretches
// full-bleed across a desktop window.
export function WebColumn({ children, background, maxWidth = COLUMN }: { children: React.ReactNode; background: string; maxWidth?: number }) {
  return (
    <View style={[styles.fill, { backgroundColor: background }]}>
      <View style={[styles.fill, { maxWidth, width: '100%', alignSelf: 'center' }]}>{children}</View>
    </View>
  )
}

// ── StripedNotice ────────────────────────────────────────────────────────────
// Something the player must know (no password recovery, a failed load). The
// stripe marks it; the words sit on a solid ground beside it, never on it.
export function StripedNotice({ roles, children, actionLabel, onAction, failed }: {
  roles: Roles
  children: string
  actionLabel?: string
  onAction?: () => void
  /** P8-111: something went wrong (red), rather than something to watch out
   *  for (the stripe). The stripe no longer means "bad" on its own. */
  failed?: boolean
}) {
  return (
    <View style={[styles.notice, { borderColor: roles.line, backgroundColor: roles.surface }]} accessibilityLiveRegion="polite">
      {failed
        ? <View style={[styles.noticeStripe, { backgroundColor: roles.loss }]} />
        : <Stripe roles={roles} band={6} style={styles.noticeStripe} />}
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
  return <StripedNotice roles={roles} failed actionLabel="Retry" onAction={onRetry}>{message}</StripedNotice>
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
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0 },
  fill: { flex: 1 },
  notice: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  noticeStripe: { width: 14 },
  noticeBody: { flex: 1, padding: space[3], gap: space[1] },
  noticeAction: { alignSelf: 'flex-start', marginLeft: -space[2] },
  empty: { gap: space[2], paddingVertical: space[5], alignItems: 'flex-start' },
})

// ── SafeSection ──────────────────────────────────────────────────────────────
// An extra on a screen — a team of the matchday under the results — must never
// take the screen with it. The maintainer hit a black, stuck season screen on
// the Results tab (23 Sept); whatever threw, a thrown render inside this
// boundary now costs only this section: it's logged and the section is left
// out, and the rest of the screen keeps working.
export class SafeSection extends React.Component<{ name: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn(`[${this.props.name}] failed to render:`, e) }
  render() { return this.state.failed ? null : this.props.children }
}
