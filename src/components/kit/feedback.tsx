// Kit Drop feedback and the screen frame.
import { t } from '@/i18n'
import { log } from '@/diag/log'
import React, { useCallback, useContext, useEffect, useRef, useState, createContext } from 'react'
import { View, ScrollView, StyleSheet, Platform, Animated, AccessibilityInfo, Keyboard, KeyboardAvoidingView, TextInput, type StyleProp, type ViewStyle, type ScrollViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import { ROLES, type Ground, type Roles, space } from '@/theme'
import { COLUMN, MAX_CONTENT } from '@/hooks/useSizeClass'
import { KitText, Stripe, Icon } from './primitives'
import { Plate, Loader, BackControl } from './controls'
import { GroundContext } from '@/lib/appearance'

// How near the end of the page counts as "the end" for BoardList: about two
// screens of rows, so the next page is mounted before anyone reaches the last.
const NEAR_END_PX = 1200
type NearEnd = (fn: () => void) => () => void
/** Subscribe to "the screen has scrolled near its end" (KitScreen provides it). */
const NearEndContext = createContext<NearEnd | null>(null)

// ── KitScreen ────────────────────────────────────────────────────────────────
// A screen standing on one ground. Reads the top inset instead of a hardcoded
// 52/56/64, and sets the status bar to match the ground whenever the screen is
// focused (tabs stay mounted, so a mount-time setting would be overwritten by
// whichever tab mounted last).
//
// It also keeps a text field above the keyboard (Phase 9.75, P9.75-07, R3-02).
// That was KeyboardSafe's job, and only three screens of thirteen with a field
// wore it: the keyboard sat over the clubs' invite field on the phone. Now the
// screen does it, so a new field can't forget: the frame shrinks by the
// keyboard ('padding': since SDK 54 draws edge to edge, Android's window no
// longer resizes for it), and once the keyboard is up the focused field is
// scrolled into view if it ended under it. scripts/verify-diag rule 2e.
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
  // P9.75-11: the screen tells its long lists when it nears the end (BoardList).
  const listeners = useRef(new Set<() => void>())
  const nearEnd = useRef<NearEnd>(fn => { listeners.current.add(fn); return () => { listeners.current.delete(fn) } }).current
  const { onScroll, scrollEventThrottle } = scrollProps
  // The keyboard: this screen's scroll view and where it stands, and whether
  // it's the screen in front (tabs and the screens under a stack stay
  // mounted, and only the one in front should move).
  const own = useRef<ScrollView | null>(null)
  const offset = useRef(0)
  const focused = useRef(false)
  const setRef = useCallback((node: ScrollView | null) => {
    own.current = node
    if (typeof scrollRef === 'function') scrollRef(node)
    else if (scrollRef) (scrollRef as React.MutableRefObject<ScrollView | null>).current = node
  }, [scrollRef])
  useEffect(() => {
    if (Platform.OS === 'web' || !scroll) return
    const sub = Keyboard.addListener('keyboardDidShow', e => {
      const input = TextInput.State.currentlyFocusedInput()
      if (!focused.current || !input || !own.current) return
      input.measureInWindow((_x, y, _w, h) => {
        const under = y + h + space[4] - e.endCoordinates.screenY
        if (under > 0) own.current?.scrollTo({ y: offset.current + under, animated: true })
      })
    })
    return () => sub.remove()
  }, [scroll])
  useFocusEffect(useCallback(() => {
    focused.current = true
    setStatusBarStyle(ground === 'cotton' ? 'dark' : 'light')
    // Web: the Kit scrollbar's colours follow the ground (webChrome.ts, P8-29).
    if (Platform.OS === 'web') document.documentElement.dataset.ground = ground
    return () => { focused.current = false }
  }, [ground]))
  const cap = { maxWidth: width === 'wide' ? MAX_CONTENT : COLUMN, width: '100%' as const, alignSelf: 'center' as const }
  const pad = [{ paddingTop: underHeader ? space[3] : insets.top + space[5], paddingHorizontal: space[4] }, cap, contentStyle]
  // P8.5-25: everything inside reads this screen's ground (useScreenRoles), so a
  // shared component matches the page it's on instead of fixing its own.
  if (!scroll) return <GroundContext.Provider value={ground}>{lift(<View style={[styles.fill, { backgroundColor: roles.bg }, pad]}>{children}</View>, roles.bg)}</GroundContext.Provider>
  return (
    <GroundContext.Provider value={ground}>
    <NearEndContext.Provider value={nearEnd}>
    {lift(
    <View style={[styles.fill, { backgroundColor: roles.bg }]}>
      <ScrollView
        ref={setRef}
        style={styles.fill}
        // A tap on a button while the keyboard is up is a tap, not a dismissal.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[pad, { paddingBottom: space[7] }]}
        // Native keeps its indicator hidden. On web the page shows the Kit
        // scrollbar (P8-29): a mouse user expects a bar they can see and drag.
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        {...scrollProps}
        scrollEventThrottle={scrollEventThrottle ?? 100}
        onScroll={e => {
          onScroll?.(e)
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
          offset.current = contentOffset.y
          if (listeners.current.size && contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_END_PX) listeners.current.forEach(fn => fn())
        }}
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
    , roles.bg)}
    </NearEndContext.Provider>
    </GroundContext.Provider>
  )
}

// The frame shrinks by the keyboard on the phone; the web's page does that itself.
// P9.75-16: the frame wears the ground. Its padding is the keyboard's room,
// and with no colour of its own it showed the light page under a dark screen.
const lift = (node: React.ReactNode, bg: string) => (Platform.OS === 'web' ? node : <KeyboardAvoidingView style={[styles.fill, { backgroundColor: bg }]} behavior="padding">{node}</KeyboardAvoidingView>)

// ── LoadingScreen ────────────────────────────────────────────────────────────
// Phase 9.75 (R3-03): a whole screen waiting for its content, one way
// everywhere: the way back, the kit's loading bar, and a line saying what's
// coming. The run hub, a player's and a club's page each drew a bare
// "reading…" line, and the result screen its own bar. A list waiting for its
// rows draws GhostRows in the list's place instead; a button waits on its own
// plate. The settle floor (src/lib/loading.ts) is applied where the data is
// loaded (useRunData), not by each screen.
export function LoadingScreen({ ground, label, back = true }: { ground: Ground; label: string; back?: boolean }) {
  const roles = ROLES[ground]
  return (
    <KitScreen ground={ground}>
      {back && <BackControl roles={roles} />}
      <View style={{ marginTop: space[4], gap: space[3] }}>
        <Loader color={roles.text} wide label={label} />
      </View>
    </KitScreen>
  )
}

// ── BoardList ────────────────────────────────────────────────────────────────
// Phase 9.75 (P9.75-11, R3-08): a long list (a stats board, the press, every
// match) mounts a page of rows, and the next page as the screen nears its end.
// The run hub's Stats tab mounted every row at once, hundreds of them in a
// European run, and froze the phone for 4 to 5 seconds. Not a FlatList: the
// lists live inside KitScreen's ScrollView, and a FlatList nested in a
// ScrollView of the same direction mounts every row anyway (React Native warns
// about exactly that). Rows already mounted stay; a new list (another stat, a
// search) starts again from one page. Outside a scrolling KitScreen it draws
// everything, as before. scripts/verify-diag fails on a hub list mapped by hand.
export function BoardList<T>({ items, keyOf, renderRow, page = 40 }: {
  items: readonly T[]
  keyOf: (item: T, i: number) => string
  renderRow: (item: T, i: number) => React.ReactNode
  page?: number
}) {
  const nearEnd = useContext(NearEndContext)
  const [shown, setShown] = useState(page)
  useEffect(() => { setShown(page) }, [items, page])
  useEffect(() => {
    if (!nearEnd || shown >= items.length) return
    return nearEnd(() => setShown(n => Math.min(items.length, n + page)))
  }, [nearEnd, shown, items.length, page])
  const visible = nearEnd ? items.slice(0, shown) : items
  return <>{visible.map((item, i) => <React.Fragment key={keyOf(item, i)}>{renderRow(item, i)}</React.Fragment>)}</>
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
  return <StripedNotice roles={roles} failed actionLabel={t('common.retry')} onAction={onRetry}>{message}</StripedNotice>
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
  componentDidCatch(e: unknown) { log.error('ui', `${this.props.name}: failed to render`, e) }
  render() { return this.state.failed ? null : this.props.children }
}

// ── GhostRows ────────────────────────────────────────────────────────────────
// Phase 9 (the maintainer, 1 Oct: "loading you can see, YouTube's way"): while
// a list loads, the outlines of the rows that are coming, breathing slowly, so
// a load reads as progress and not a blank (the friends list showed nothing at
// all). The shape of a list row: a line and a shorter one under it. Still,
// not breathing, when the phone asks for less motion.
export function GhostRows({ roles, count = 4 }: { roles: Roles; count?: number }) {
  const reduced = useReducedMotionSafe()
  const fade = React.useRef(new Animated.Value(1)).current
  React.useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(fade, { toValue: 0.45, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [reduced])
  return (
    <Animated.View style={{ opacity: fade }} accessible accessibilityLabel={t('common.loading')} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[ghost.row, { borderBottomColor: roles.rule }]}>
          <View style={[ghost.line, { width: `${72 - (i % 3) * 14}%`, backgroundColor: roles.sunken }]} />
          <View style={[ghost.sub, { backgroundColor: roles.sunken }]} />
        </View>
      ))}
    </Animated.View>
  )
}
function useReducedMotionSafe() {
  const [on, setOn] = React.useState(false)
  React.useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setOn).catch(() => {}) }, [])
  return on
}
const ghost = StyleSheet.create({
  row: { minHeight: 56, justifyContent: 'center', gap: space[2], borderBottomWidth: 1 },
  line: { height: 12 },
  sub: { height: 9, width: '34%' },
})
