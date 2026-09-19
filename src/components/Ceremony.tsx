// Deep Match ceremony (Big Fixes §7 R5) — the payoff on the final whistle.
//
// The asymmetry IS the feature: this game is called Perfection or Misery, so
// winning gets gold, a trophy and confetti, and losing gets a silver medal on a
// desaturated grey-blue screen with nothing moving. Both paths are **completely
// silent** — no audio on either, by design (it carries the contrast purely
// through motion and colour, and sidesteps device-mute and autoplay entirely).
//
// Trophies are drawn as SVG rather than shipped as images. The spec's asset
// checklist asked for photographs of the real trophies; those are trademarked
// silhouettes belonging to UEFA and FIFA, so the shapes here are original
// stand-ins in the same family (a two-handled cup for the club competitions, a
// globe-on-a-plinth for the World Cup). If real artwork is ever licensed, it
// drops in by swapping the two components below — nothing else knows.
//
// Motion is RN `Animated` with the native driver rather than Reanimated: the
// confetti only ever animates transform + opacity on views that never re-layout,
// which is exactly what the native driver handles, and it's the same primitive
// the rest of the app's screens already use. Reduced-motion is honoured by
// dropping the confetti and still delivering the outcome (R5's accessibility
// note) — the trophy, the colour and the words carry it on their own.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Easing, AccessibilityInfo, useWindowDimensions } from 'react-native'
import Svg, { Path, Circle, Rect, Ellipse, G, Defs, LinearGradient, Stop } from 'react-native-svg'
import { ROLES, prim, space, border } from '@/theme'
import { KitText, Plate, Stripe, Rivets } from '@/components/kit'

// C6 move 5 (docs/ui-overhaul/07c) — the verdict is STITCHED ON. A win is a
// one-frame cotton flash, then a volt label with the title on it; a loss is a
// silver medal on the same black nylon with the hazard stripe pulled across
// the label. The trophies stay original drawings (no licensed silhouettes).
const roles = ROLES.nylon

const GOLD = '#F5C518'
const GOLD_DEEP = '#B98900'
const SILVER = '#B8C0CC'
const SILVER_DEEP = '#7C8798'
// The loss screen's backdrop: a cold, desaturated blue-grey. Deliberately close
// to the app's own dark background so the ceremony reads as the colour draining
// out of the win screen rather than as a different design.
const MOODY_BG = '#0C1119'
const MOODY_TINT = '#1B2534'

export type CeremonyKind = 'cup' | 'globe'

// ── Trophies ────────────────────────────────────────────────────────────────

function CupTrophy({ tone, size = 168 }: { tone: 'gold' | 'silver'; size?: number }) {
  const light = tone === 'gold' ? GOLD : SILVER
  const dark = tone === 'gold' ? GOLD_DEEP : SILVER_DEEP
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="cupFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
      </Defs>
      {/* The two big handles that make a cup read as a cup at a glance. */}
      <Path d="M30 32 C10 34 10 62 30 66" stroke="url(#cupFill)" strokeWidth={7} fill="none" strokeLinecap="round" />
      <Path d="M90 32 C110 34 110 62 90 66" stroke="url(#cupFill)" strokeWidth={7} fill="none" strokeLinecap="round" />
      {/* Bowl, stem, base. */}
      <Path d="M30 24 H90 V54 C90 74 76 86 60 86 C44 86 30 74 30 54 Z" fill="url(#cupFill)" />
      <Rect x={55} y={86} width={10} height={12} fill={dark} />
      <Path d="M38 98 H82 L86 110 H34 Z" fill="url(#cupFill)" />
      <Ellipse cx={60} cy={24} rx={30} ry={6} fill={light} opacity={0.85} />
    </Svg>
  )
}

function GlobeTrophy({ tone, size = 168 }: { tone: 'gold' | 'silver'; size?: number }) {
  const light = tone === 'gold' ? GOLD : SILVER
  const dark = tone === 'gold' ? GOLD_DEEP : SILVER_DEEP
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="globeFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
      </Defs>
      {/* Two rising arms cradling a world — the World Cup's silhouette idea
          without copying the sculpture itself. */}
      <Path d="M40 104 C30 76 34 44 52 26" stroke="url(#globeFill)" strokeWidth={9} fill="none" strokeLinecap="round" />
      <Path d="M80 104 C90 76 86 44 68 26" stroke="url(#globeFill)" strokeWidth={9} fill="none" strokeLinecap="round" />
      <Circle cx={60} cy={34} r={20} fill="url(#globeFill)" />
      <G stroke={dark} strokeWidth={1.5} fill="none" opacity={0.8}>
        <Ellipse cx={60} cy={34} rx={20} ry={8} />
        <Ellipse cx={60} cy={34} rx={8} ry={20} />
      </G>
      <Path d="M34 104 H86 L90 116 H30 Z" fill="url(#globeFill)" />
    </Svg>
  )
}

function SilverMedal({ size = 150 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="medalFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={SILVER} />
          <Stop offset="1" stopColor={SILVER_DEEP} />
        </LinearGradient>
      </Defs>
      {/* Ribbon first, so the disc sits on top of it. */}
      <Path d="M42 6 L60 56 L42 56 L28 20 Z" fill={MOODY_TINT} />
      <Path d="M78 6 L92 20 L78 56 L60 56 Z" fill="#243046" />
      <Circle cx={60} cy={80} r={30} fill="url(#medalFill)" />
      <Circle cx={60} cy={80} r={22} fill="none" stroke={MOODY_BG} strokeWidth={2} opacity={0.5} />
      <Path d="M60 66 L64 76 H75 L66 83 L69 94 L60 87 L51 94 L54 83 L45 76 H56 Z" fill={MOODY_BG} opacity={0.45} />
    </Svg>
  )
}

// ── Confetti ────────────────────────────────────────────────────────────────

// Kit Drop's own colours: volt for the win, orange for you, cotton and gold.
const CONFETTI_COLORS = [prim.volt, prim.orange, prim.cotton, GOLD]
const CONFETTI_COUNT = 44

function ConfettiPiece({ index, width, height }: { index: number; width: number; height: number }) {
  const fall = useRef(new Animated.Value(0)).current
  // Deterministic per index rather than Math.random(): the ceremony is a replay
  // like everything else in §7, so two viewings of the same final shouldn't
  // differ, and it keeps the piece stable across re-renders.
  const rand = (salt: number) => {
    const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  const startX = rand(1) * width
  const drift = (rand(2) - 0.5) * 120
  const size = 6 + rand(3) * 7
  const colour = CONFETTI_COLORS[Math.floor(rand(4) * CONFETTI_COLORS.length)]
  const delay = rand(5) * 2600
  const duration = 3200 + rand(6) * 2600

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(fall, {
        toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true,
      }),
    )
    anim.start()
    return () => anim.stop()
  }, [])

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] })
  const translateX = fall.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] })
  const rotate = fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${720 + Math.floor(rand(7) * 720)}deg`] })
  // Fades out over the last fifth of the fall so pieces don't pile up at the
  // bottom edge and vanish abruptly.
  const opacity = fall.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] })

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: startX,
        width: size, height: size * 0.6, backgroundColor: colour,
        transform: [{ translateY }, { translateX }, { rotate }],
        opacity,
      }}
    />
  )
}

function Confetti() {
  const { width, height } = useWindowDimensions()
  const pieces = useMemo(() => Array.from({ length: CONFETTI_COUNT }, (_, i) => i), [])
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map(i => <ConfettiPiece key={i} index={i} width={width} height={height} />)}
    </View>
  )
}

// ── The ceremony ────────────────────────────────────────────────────────────

export function Ceremony({ won, kind, title, subtitle, accent, onContinue }: {
  won: boolean
  kind: CeremonyKind
  title: string          // 'CHAMPIONS OF EUROPE' / 'WORLD CHAMPIONS' / 'RUNNERS-UP'
  subtitle: string       // the scoreline, spelled out
  accent: string
  onContinue: () => void
}) {
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduceMotion(v) })
      .catch(() => {})   // unsupported platform — motion stays on, which is the default anyway
    return () => { alive = false }
  }, [])

  // One shared entrance: the trophy rises and fades in. Even with reduced
  // motion the content still ARRIVES, it just arrives instantly.
  const enter = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1, duration: reduceMotion ? 0 : 900, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start()
  }, [reduceMotion])

  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] })

  // The cut: one flash of cotton on a win, gone in a fifth of a second.
  const flash = useRef(new Animated.Value(won && !reduceMotion ? 1 : 0)).current
  useEffect(() => {
    if (!won || reduceMotion) return
    Animated.timing(flash, { toValue: 0, duration: 180, useNativeDriver: true }).start()
  }, [won, reduceMotion])

  // The stripe pulled across the runners-up label, left to right.
  const pull = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  useEffect(() => {
    if (won) return
    Animated.timing(pull, { toValue: 1, duration: reduceMotion ? 0 : 500, delay: reduceMotion ? 0 : 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
  }, [won, reduceMotion])
  const pullWidth = pull.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  const Trophy = kind === 'globe' ? GlobeTrophy : CupTrophy

  return (
    <View style={[styles.container, { backgroundColor: roles.bg }]}>
      {won && !reduceMotion && <Confetti />}

      <Animated.View style={[styles.body, { opacity: enter, transform: [{ translateY: rise }] }]}>
        {won ? <Trophy tone="gold" /> : <SilverMedal />}

        <View style={[styles.label, { backgroundColor: won ? roles.perfection : roles.surface, borderColor: roles.line }]}
          accessible accessibilityRole="header" accessibilityLabel={`${title}. ${subtitle}`}>
          <Rivets color={won ? roles.onFill : roles.line} />
          <KitText t="superL" color={won ? roles.onFill : roles.text} style={styles.title}>{`"${title.toUpperCase()}"`}</KitText>
          {!won && (
            <Animated.View style={[styles.pulled, { width: pullWidth }]} pointerEvents="none">
              <Stripe roles={roles} band={6} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
        </View>
        <KitText t="title" color={roles.text} style={styles.centre}>{subtitle}</KitText>

        {!won && (
          <KitText t="body" color={roles.textMuted} style={[styles.centre, styles.consolation]}>
            One match away. The medal round your neck is the one nobody wants.
          </KitText>
        )}
      </Animated.View>

      <Plate label="On to awards night" icon="forward" roles={roles} onPress={onContinue} style={styles.cta} />

      {won && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: prim.cotton, opacity: flash }]} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[6] },
  body: { alignItems: 'center', gap: space[3], alignSelf: 'stretch' },
  label: { alignSelf: 'stretch', borderWidth: border.plate, paddingVertical: space[4], paddingHorizontal: space[5], overflow: 'hidden' },
  title: { textAlign: 'center' },
  pulled: { position: 'absolute', left: 0, bottom: 0, height: 12, overflow: 'hidden' },
  centre: { textAlign: 'center' },
  consolation: { maxWidth: 300 },
  cta: { alignSelf: 'stretch' },
})
