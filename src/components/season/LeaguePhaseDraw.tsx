import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay, Easing } from 'react-native-reanimated'
import { type Roles, space, border, POT_COLOURS, withAlpha } from '@/theme'
import { KitText, Tag, Plate, SectionTag, TeamMark, RoundFlag, VenueMark, Icon } from '@/components/kit'
import { flagForCountry } from '@/data/geo-iso'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { CLTeam, CLLeaguePhase } from '@/engine/cl-sim'

// P8-114: the league-phase draw, as UEFA broadcasts it (both Champions League
// modes). Rebuilt after The Dugout's draw (src/ui/components/DrawReveal.svelte
// there), which got there by getting five things wrong first; the maintainer
// found the first version here "really stale" beside it (26 Sept). What it
// keeps from The Dugout, and why:
//
// - ONE club's card. The ceremony doesn't read out 144 fixtures: it puts one
//   club's name up, in full, and fills in its eight. You watch a season being
//   put together, for you.
// - Grouped by the opponent's POT, each pot a block with its own coloured
//   spine, and HOME and AWAY as columns: your club stands in the column it
//   plays in, so the row's shape tells you the venue before you read a name.
// - An undrawn opponent SCRAMBLES: random capitals, re-rolling, that settle
//   left to right when its ball comes out. A blur (or a dim name) gives away
//   the name's length, which rules out most of a pot on its own.
// - A small bowl that lifts a ball before each name: the pause before the
//   ball is the broadcast's whole rhythm.
// - It can be left: pause holds it where it is, skip fills the card.
// - Everyone else's eight, folded away by pot until you ask.
//
// It reveals, it never decides: the draw is already made (cl-draw.ts).

const OPENING_MS = 900   // your club's name lands alone first
const GAP_MS = 1100      // between balls: a name has time to spell itself out
const TICK_MS = 50       // the noise re-rolls
const SETTLE_TICKS = 2   // one more letter locks every 100 ms
const NOISE = 9          // the noise's width before a name starts to settle
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Deterministic noise: one shared clock for the whole card, so eight scrambling
// names cost one re-render per tick, not eight timers.
function noise(len: number, tick: number, row: number): string {
  let out = ''
  for (let k = 0; k < len; k++) {
    let h = (tick * 73856093) ^ (row * 19349663) ^ (k * 83492791)
    h = (h ^ (h >>> 13)) >>> 0
    out += POOL[h % POOL.length]
  }
  return out
}

type Slot = { opp: CLTeam; home: boolean }

export function LeaguePhaseDraw({ roles, teams, draw, countryOf, after }: {
  roles: Roles
  teams: CLTeam[]
  draw: CLLeaguePhase
  countryOf: (t: CLTeam) => string | undefined
  /** Shown once all eight are out (the eight by matchday, the start plate). */
  after?: React.ReactNode
}) {
  const reduced = useReducedMotion()
  const you = teams.find(t => t.isPlayer)
  // Everyone's eight, read off the drawn fixtures.
  const eights = useMemo(() => {
    const out = new Map<string, Slot[]>()
    for (const t of teams) out.set(t.clubId, [])
    for (const f of draw.fixtures) {
      out.get(f.home.clubId)?.push({ opp: f.away, home: true })
      out.get(f.away.clubId)?.push({ opp: f.home, home: false })
    }
    // The broadcast's order: pot by pot, the home tie first.
    for (const list of out.values()) list.sort((a, b) => a.opp.pot - b.opp.pot || Number(b.home) - Number(a.home))
    return out
  }, [draw, teams])
  const eight = you ? eights.get(you.clubId) ?? [] : []

  const [shown, setShown] = useState(reduced ? eight.length : 0)
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)
  const outAt = useRef<number[]>([])   // the tick each ball came out on
  const tickRef = useRef(0)             // the clock now, for a timer that outlives a render
  const running = shown < eight.length

  // The balls.
  useEffect(() => {
    if (!running || paused) return
    const t = setTimeout(() => {
      outAt.current[shown] = tickRef.current
      setShown(n => n + 1)
    }, shown === 0 ? OPENING_MS : GAP_MS)
    return () => clearTimeout(t)
  }, [shown, running, paused])
  // The clock the noise runs on; it stops once the last name has settled, so a
  // finished card doesn't sit on a timer.
  const lastOut = outAt.current[eight.length - 1]
  const settled = !running && (reduced || (lastOut != null && tick - lastOut >= SETTLE_TICKS * (eight[eight.length - 1]?.opp.clubName.length ?? 0)))
  useEffect(() => {
    if (reduced || settled) return
    const t = setInterval(() => setTick(n => (tickRef.current = n + 1)), TICK_MS)
    return () => clearInterval(t)
  }, [reduced, settled])

  if (!you || eight.length === 0) return <>{after}</>

  const nameAt = (i: number, name: string): string => {
    const upper = name.toUpperCase()
    if (reduced) return upper
    if (i >= shown) return noise(NOISE, tick, i)
    const locked = Math.floor((tick - (outAt.current[i] ?? tick)) / SETTLE_TICKS)
    return locked >= upper.length ? upper : upper.slice(0, locked) + noise(upper.length - locked, tick, i)
  }
  const skip = () => {
    // Every ball out, every name already settled.
    for (let i = 0; i < eight.length; i++) outAt.current[i] = -1e6
    setShown(eight.length); setPaused(false)
  }
  const home = countryOf(you)
  const rule = draw.relaxed === 'none'
    ? `No club from ${home ?? 'your own country'}, and at most two from any one country.`
    : draw.relaxed === 'cap'
      ? `No club from ${home ?? 'your own country'}. This field has too many clubs from its biggest countries for "at most two", so the cap rose as far as it had to.`
      : draw.relaxed === 'country'
        ? 'This field could not be drawn with the country rule, so clubs from the same country can meet.'
        : 'This field could not be drawn into pots of equal size, so the pairings are fixed.'

  return (
    <View style={styles.wrap}>
      <SectionTag roles={roles}>The draw</SectionTag>
      <View style={[styles.card, { borderColor: roles.line, backgroundColor: roles.surface }]}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <KitText t="tag" color={roles.textMuted}>DRAWING FOR</KitText>
            {/* Your club, in full: the one name on the card that must never break. */}
            <View style={styles.who}>
              <TeamMark roles={roles} clubId={you.clubId} name={you.clubName} size={24} />
              <KitText t="superS" color={roles.text} style={{ flexShrink: 1 }}>{you.clubName.toUpperCase()}</KitText>
            </View>
          </View>
          <Bowl roles={roles} ball={shown} active={running && !paused && !reduced} />
          <KitText t="figure" color={roles.textMuted}>{`${shown}/${eight.length}`}</KitText>
        </View>
        <KitText t="body" color={roles.textMuted}>{`Two from each pot, one at home and one away. ${rule}`}</KitText>

        <View style={styles.colHead}>
          <View style={styles.potCol} />
          <KitText t="tag" color={roles.textMuted} style={[styles.side, { textAlign: 'right' }]}>HOME</KitText>
          <View style={styles.dash} />
          <KitText t="tag" color={roles.textMuted} style={styles.side}>AWAY</KitText>
          <View style={styles.venue} />
        </View>
        <View accessibilityLiveRegion="polite">
          {[1, 2, 3, 4].map(pot => {
            const colour = POT_COLOURS[pot] ?? roles.text
            const rows = eight.map((s, i) => ({ s, i })).filter(x => x.s.opp.pot === pot)
            if (rows.length === 0) return null
            return (
              <View key={pot} style={styles.potGroup}>
                <View style={[styles.spine, { backgroundColor: colour }]} />
                <KitText t="tag" color={colour} style={styles.potCol}>{`POT ${pot}`}</KitText>
                <View style={{ flex: 1, gap: 2 }}>
                  {rows.map(({ s, i }) => {
                    const out = i < shown
                    const text = nameAt(i, s.opp.clubName)
                    const them = (
                      <View style={[styles.side, styles.them, s.home ? null : styles.right]}
                        accessible accessibilityLabel={out ? s.opp.clubName : 'Not drawn yet'}>
                        {out && !s.home && <Flag roles={roles} country={countryOf(s.opp)} />}
                        {out && s.home && <TeamMark roles={roles} clubId={s.opp.clubId} name={s.opp.clubName} size={16} />}
                        <KitText t="tag" color={out ? colour : roles.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>{text}</KitText>
                        {out && s.home && <Flag roles={roles} country={countryOf(s.opp)} />}
                        {out && !s.home && <TeamMark roles={roles} clubId={s.opp.clubId} name={s.opp.clubName} size={16} />}
                      </View>
                    )
                    const me = (
                      <KitText t="tag" color={roles.text} numberOfLines={1} style={[styles.side, styles.me, s.home ? { textAlign: 'right' } : null]}>
                        {you.clubName.toUpperCase()}
                      </KitText>
                    )
                    return (
                      <View key={s.opp.clubId} style={[styles.tie, out && { backgroundColor: withAlpha(colour, 12) },
                        i === shown - 1 && running && { borderColor: colour }]}>
                        {s.home ? me : them}
                        <KitText t="tag" color={roles.textMuted} style={styles.dash}>–</KitText>
                        {s.home ? them : me}
                        <View style={styles.venue}>{out ? <VenueMark roles={roles} home={s.home} /> : null}</View>
                      </View>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>

        {running ? (
          <View style={styles.controls}>
            <Plate label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} variant="quiet" roles={roles} onPress={() => setPaused(p => !p)} />
            <Plate label="Skip" icon="skip" variant="quiet" roles={roles} onPress={skip} />
          </View>
        ) : (
          <KitText t="tag" color={roles.textMuted}>THE DRAW IS COMPLETE</KitText>
        )}
      </View>

      {!running && after}
      {!running && <Others roles={roles} teams={teams} eights={eights} countryOf={countryOf} />}
    </View>
  )
}

function Flag({ roles, country }: { roles: Roles; country?: string }) {
  const f = country ? flagForCountry(country) : ''
  return f ? <RoundFlag roles={roles} emoji={f} code={country} size={16} /> : null
}

// ── The bowl ─────────────────────────────────────────────────────────────────
// The Dugout's DrawBowl: a shallow bowl of discs that jostle, and a ball that
// rises out of it before each name. Short on purpose: the draw's own gap paces
// the reveal, this is only the beat before it. Still when the draw is.
function Bowl({ roles, ball, active }: { roles: Roles; ball: number; active: boolean }) {
  return (
    <View style={styles.bowl} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bowlPot, { borderColor: roles.textMuted, backgroundColor: withAlpha(roles.textMuted, 10) }]}>
        {[0, 1, 2, 3, 4, 5].map(i => <Disc key={i} i={i} active={active} colour={POT_COLOURS[(i % 4) + 1]} />)}
      </View>
      {active && <Ball key={ball} colour={roles.text} />}
    </View>
  )
}

function Disc({ i, active, colour }: { i: number; active: boolean; colour: string }) {
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = active
      ? withDelay(i * 90, withRepeat(withSequence(withTiming(-3, { duration: 180 }), withTiming(0, { duration: 180 })), -1))
      : withTiming(0, { duration: 120 })
  }, [active])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[styles.disc, { left: 4 + (i % 3) * 14, bottom: 2 + Math.floor(i / 3) * 7, backgroundColor: colour }, style]} />
}

function Ball({ colour }: { colour: string }) {
  const t = useSharedValue(0)
  useEffect(() => { t.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }) }, [])
  const style = useAnimatedStyle(() => ({ opacity: 1 - t.value * 0.6, transform: [{ translateY: -16 * t.value }] }))
  return <Animated.View style={[styles.ball, { backgroundColor: colour }, style]} />
}

// ── Everyone else's eight ────────────────────────────────────────────────────
// Folded away by pot, a name each, until you open one: which pot every club is
// in, and who they drew, without 288 names on the page at once.
function Others({ roles, teams, eights, countryOf }: {
  roles: Roles; teams: CLTeam[]; eights: Map<string, Slot[]>; countryOf: (t: CLTeam) => string | undefined
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <View style={{ gap: space[1] }}>
      <SectionTag roles={roles}>Every club's eight</SectionTag>
      {[1, 2, 3, 4].map(pot => (
        <View key={pot} style={styles.otherPot}>
          <View style={[styles.spine, { backgroundColor: POT_COLOURS[pot] }]} />
          <View style={{ flex: 1 }}>
            <KitText t="tag" color={POT_COLOURS[pot] ?? roles.text}>{`POT ${pot}`}</KitText>
            {teams.filter(t => t.pot === pot).sort((a, b) => b.ovr - a.ovr).map(t => {
              const isOpen = open === t.clubId
              return (
                <View key={t.clubId}>
                  <Pressable onPress={() => setOpen(isOpen ? null : t.clubId)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${t.clubName}${t.isPlayer ? ', you' : ''}, ${isOpen ? 'hide' : 'show'} their eight`}
                    style={({ pressed }) => [styles.otherRow, { borderBottomColor: roles.rule }, t.isPlayer && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
                    <TeamMark roles={roles} clubId={t.clubId} name={t.clubName} size={16} />
                    <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{t.clubName}</KitText>
                    <Flag roles={roles} country={countryOf(t)} />
                    <Icon name={isOpen ? 'up' : 'down'} size={16} color={roles.textMuted} />
                  </Pressable>
                  {isOpen && (eights.get(t.clubId) ?? []).map(s => (
                    <View key={s.opp.clubId} style={styles.theirs}>
                      <Tag roles={roles}>{`POT ${s.opp.pot}`}</Tag>
                      <TeamMark roles={roles} clubId={s.opp.clubId} name={s.opp.clubName} size={16} />
                      <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{s.opp.clubName}</KitText>
                      <VenueMark roles={roles} home={s.home} />
                    </View>
                  ))}
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  card: { borderWidth: border.plate, padding: space[3], gap: space[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 2 },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[1] },
  potGroup: { flexDirection: 'row', alignItems: 'stretch', gap: space[2], marginBottom: space[2] },
  spine: { width: 3 },
  potCol: { width: 44, alignSelf: 'center' },
  tie: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 36, paddingHorizontal: space[1], borderWidth: border.thin, borderColor: 'transparent' },
  side: { flex: 1, minWidth: 0 },
  them: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  right: { justifyContent: 'flex-end' },
  me: {},
  dash: { width: 12, textAlign: 'center' },
  venue: { width: 28, alignItems: 'flex-end' },
  controls: { flexDirection: 'row', gap: space[2] },
  bowl: { width: 48, height: 34 },
  bowlPot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 22, borderWidth: border.thin, borderTopWidth: 0, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  disc: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  ball: { position: 'absolute', left: 19, bottom: 14, width: 10, height: 10, borderRadius: 5 },
  otherPot: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair, paddingHorizontal: space[1] },
  theirs: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, paddingLeft: space[5] },
})
