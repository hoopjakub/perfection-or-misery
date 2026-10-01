import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, cancelAnimation } from 'react-native-reanimated'
import Svg, { Path, Ellipse, Rect } from 'react-native-svg'
import { type Roles, space, border, POT_COLOURS, withAlpha, prim } from '@/theme'
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
  // Four pots, or six in the Conference League (P8-172).
  const potNums = useMemo(() => [...new Set(teams.map(t => t.pot))].sort((a, b) => a - b), [teams])

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
          <KitText t="figure" color={roles.textMuted}>{`${shown}/${eight.length}`}</KitText>
        </View>
        {/* P8-176: the bowl, and the name it just gave up, broadcast-style. */}
        <DrawStage roles={roles} shown={shown} total={eight.length} active={running && !paused} reduced={reduced}
          next={eight[shown]} last={shown > 0 ? eight[shown - 1] : undefined}
          lastName={shown > 0 ? nameAt(shown - 1, eight[shown - 1].opp.clubName) : ''} countryOf={countryOf} />
        <KitText t="body" color={roles.textMuted}>{`${potNums.length === 6 ? 'One from each pot, three at home and three away.' : 'Two from each pot, one at home and one away.'} ${rule}`}</KitText>

        <View style={styles.colHead}>
          <View style={styles.potCol} />
          <KitText t="tag" color={roles.textMuted} style={[styles.side, { textAlign: 'right' }]}>HOME</KitText>
          <View style={styles.dash} />
          <KitText t="tag" color={roles.textMuted} style={styles.side}>AWAY</KitText>
          <View style={styles.venue} />
        </View>
        <View accessibilityLiveRegion="polite">
          {potNums.map(pot => {
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

// ── The stage: the bowl and the drawn name (P8-176) ──────────────────────────
// The maintainer, 27 September: the first bowl (a 48 px half-bowl of dots in
// the header) was "really bad". Now it has a stage of its own, as the
// broadcast does: on the left a drawn glass bowl on its stem, its capsules
// tumbling, each banded in the colour of the pot being drawn; before each
// name one capsule rises out of the mouth and opens on the drawn club's
// crest. On the right the broadcast line: which ball, which pot, and the name
// as it spells itself out, with home or away. The tumble and the rise live on
// the UI thread and stop when the draw does; reduced motion keeps it still.
const BOWL_W = 88
const BOWL_H = 78
const CAPSULES = 9

function DrawStage({ roles, shown, total, active, reduced, next, last, lastName, countryOf }: {
  roles: Roles
  shown: number
  total: number
  active: boolean
  reduced: boolean
  next?: Slot
  last?: Slot
  lastName: string
  countryOf: (t: CLTeam) => string | undefined
}) {
  // The pot in the bowl: the next ball's, or the last one's once the draw is done.
  const pot = (next ?? last)?.opp.pot ?? 1
  const colour = POT_COLOURS[pot] ?? roles.text
  const lastColour = last ? POT_COLOURS[last.opp.pot] ?? roles.text : roles.text
  return (
    <View style={[styles.stage, { borderColor: roles.rule }]}>
      <View style={styles.bowl} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Tumble colour={colour} line={roles.line} active={active && !reduced} />
        <Svg width={BOWL_W} height={BOWL_H} style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* The glass: a round bowl, its rim, a highlight down one side, the stem and the foot. */}
          <Path d="M8 24 Q8 64 44 64 Q80 64 80 24" fill={withAlpha(roles.text, 5)} stroke={roles.line} strokeWidth={1.5} />
          <Ellipse cx={44} cy={24} rx={36} ry={6} fill="none" stroke={roles.line} strokeWidth={1.5} />
          <Path d="M16 30 Q15 50 30 58" fill="none" stroke={roles.textMuted} strokeOpacity={0.5} strokeWidth={2} strokeLinecap="round" />
          <Rect x={40} y={64} width={8} height={7} fill={roles.line} />
          <Ellipse cx={44} cy={73} rx={17} ry={3.5} fill={roles.line} />
        </Svg>
        {active && !reduced && last ? <Rising key={shown} colour={lastColour} last={last} roles={roles} /> : null}
      </View>
      <View style={styles.stageText}>
        <KitText t="tag" color={roles.textMuted}>
          {shown < total ? `BALL ${shown + 1} OF ${total} · FROM POT ${pot}` : `ALL ${total} DRAWN`}
        </KitText>
        {last ? (
          <View accessible accessibilityLabel={`Drawn: ${last.opp.clubName}, pot ${last.opp.pot}, ${last.home ? 'at home' : 'away'}`} style={{ gap: 4 }}>
            <View style={styles.stageName}>
              <TeamMark roles={roles} clubId={last.opp.clubId} name={last.opp.clubName} size={24} />
              <KitText t="title" color={lastColour} numberOfLines={1} style={{ flexShrink: 1 }}>{lastName}</KitText>
            </View>
            <View style={styles.stageName}>
              <Flag roles={roles} country={countryOf(last.opp)} />
              <Tag roles={roles}>{`POT ${last.opp.pot}`}</Tag>
              <VenueMark roles={roles} home={last.home} />
              <KitText t="tag" color={roles.textMuted}>{last.home ? 'AT HOME' : 'AWAY'}</KitText>
            </View>
          </View>
        ) : (
          <KitText t="body" color={roles.textMuted}>The first ball is coming.</KitText>
        )}
      </View>
    </View>
  )
}

// The capsules inside the bowl: a ring of them turning slowly, seen through
// the bowl's lower half (the clip is the bowl's own curve), so they tumble.
function Tumble({ colour, line, active }: { colour: string; line: string; active: boolean }) {
  const turn = useSharedValue(0)
  useEffect(() => {
    if (active) turn.value = withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1, false)
    else cancelAnimation(turn)
  }, [active])
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }))
  const counter = useAnimatedStyle(() => ({ transform: [{ rotate: `${-turn.value * 1.7}deg` }] }))
  return (
    <View style={styles.tumbleClip}>
      <Animated.View style={[styles.tumble, spin]}>
        {Array.from({ length: CAPSULES }, (_, i) => {
          const a = (i / CAPSULES) * Math.PI * 2
          const r = i % 2 ? 22 : 13
          return <Capsule key={i} colour={colour} line={line} x={32 + Math.cos(a) * r} y={32 + Math.sin(a) * r} />
        })}
        <Animated.View style={[styles.tumbleInner, counter]}>
          <Capsule colour={colour} line={line} x={8} y={2} />
          <Capsule colour={colour} line={line} x={2} y={12} />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

function Capsule({ colour, line, x, y }: { colour: string; line: string; x: number; y: number }) {
  return (
    <View style={[styles.capsule, { left: x - 6, top: y - 6, borderColor: line, backgroundColor: prim.cotton }]}>
      <View style={[styles.capsuleBand, { backgroundColor: colour }]} />
    </View>
  )
}

// One capsule out of the bowl: it rises from the mouth, opens (its top half
// tips back), shows the drawn club's crest, and goes.
function Rising({ colour, last, roles }: { colour: string; last: Slot; roles: Roles }) {
  const up = useSharedValue(0), open = useSharedValue(0), gone = useSharedValue(0)
  useEffect(() => {
    up.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })
    open.value = withDelay(320, withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }))
    gone.value = withDelay(900, withTiming(1, { duration: 200 }))
  }, [])
  const body = useAnimatedStyle(() => ({ opacity: 1 - gone.value, transform: [{ translateY: -30 * up.value }, { scale: 1 + 0.5 * up.value }] }))
  const lid = useAnimatedStyle(() => ({ opacity: 1 - open.value, transform: [{ translateY: -6 * open.value }, { rotate: `${-50 * open.value}deg` }] }))
  const mark = useAnimatedStyle(() => ({ opacity: open.value }))
  return (
    <Animated.View style={[styles.rising, body]} pointerEvents="none">
      <View style={[styles.risingBall, { borderColor: roles.line, backgroundColor: prim.cotton }]}>
        <Animated.View style={mark}><TeamMark roles={roles} clubId={last.opp.clubId} name={last.opp.clubName} size={16} /></Animated.View>
      </View>
      <Animated.View style={[styles.risingLid, { borderColor: roles.line, backgroundColor: colour }, lid]} />
    </Animated.View>
  )
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
      {[...new Set(teams.map(t => t.pot))].sort((a, b) => a - b).map(pot => (
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
  stage: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], borderTopWidth: border.hair, borderBottomWidth: border.hair },
  stageText: { flex: 1, minWidth: 0, gap: 4 },
  stageName: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  bowl: { width: BOWL_W, height: BOWL_H },
  // The bowl's lower half, where the capsules show: its own curve as the clip.
  tumbleClip: { position: 'absolute', left: 10, top: 24, width: 68, height: 39, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: 'hidden' },
  tumble: { position: 'absolute', left: 2, top: -22, width: 64, height: 64 },
  tumbleInner: { position: 'absolute', left: 26, top: 26, width: 14, height: 14 },
  capsule: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: border.thin, overflow: 'hidden', justifyContent: 'center' },
  capsuleBand: { height: 4 },
  rising: { position: 'absolute', left: 30, top: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  risingBall: { width: 26, height: 26, borderRadius: 13, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  risingLid: { position: 'absolute', top: 0, left: 1, width: 26, height: 13, borderTopLeftRadius: 13, borderTopRightRadius: 13, borderWidth: border.thin, borderBottomWidth: 0 },
  otherPot: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair, paddingHorizontal: space[1] },
  theirs: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, paddingLeft: space[5] },
})
