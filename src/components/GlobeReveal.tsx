import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Circle, Path, Defs, Pattern, Image as SvgImage } from 'react-native-svg'
import Animated, { useSharedValue, useAnimatedProps, withTiming, withRepeat, withSequence, withDelay, Easing, cancelAnimation, runOnJS, interpolateColor } from 'react-native-reanimated'
import { prim } from '@/theme'
import { flagImageOf } from '@/lib/flags'
import { useReducedMotion } from '@/hooks/useReducedMotion'

// P8-164: the globe, rebuilt. The old one "looks good but lags badly": every
// frame (about 30 a second) React re-rendered the whole SVG, about 180
// country paths, each projected afresh in JavaScript with its trigonometry,
// on the JS thread. Now:
//  - every country's outline is turned into points on the unit sphere once,
//    when the file loads, so a frame is a rotation (a few multiplications a
//    point), not trigonometry;
//  - all the land is ONE path, and the frames run on the UI thread through
//    Reanimated's animated props: no React render per frame at all (on the
//    web, Reanimated sets the path directly the same way);
//  - a point behind the globe is pulled onto its edge instead of breaking the
//    outline, so every country stays one closed shape and fills correctly.
// The outlines were "hard to see": the land is light on a dark sea now, with
// dark borders between countries, so each one reads. And the chosen country
// wears its flag when it lands, not orange.
//
// Map data: assets/geo/countries-110m.geo.json (179 countries, ids are ISO
// 3166-1 numeric; see src/data/geo-iso.ts). No d3-geo at runtime: Metro can't
// resolve its ESM-only package.
const AnimatedPath = Animated.createAnimatedComponent(Path)
const world = require('../../assets/geo/countries-110m.geo.json')
const FEATURES: any[] = world.features
const DEG = Math.PI / 180

// The globe's colours: a dark sea, light land, dark borders, the grid faint.
const SEA = prim.nylonSunken
const LAND_FILL = prim.cottonMuted
const BORDER = prim.nylon
const GRID = prim.ruleNylon

// ── The shapes, once ─────────────────────────────────────────────────────────
// A ring is its points on the unit sphere, flat: x, y, z, x, y, z, …
type Ring = number[]

function polygonsOf(feature: any): number[][][][] {
  const g = feature?.geometry
  return !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
}

/** A country's rings, every `step`th point (the ring always closes). */
function ringsOf(feature: any, step: number): Ring[] {
  const out: Ring[] = []
  for (const poly of polygonsOf(feature)) for (const ring of poly) {
    const r: Ring = []
    for (let i = 0; i < ring.length; i += step) {
      const l = ring[i][0] * DEG, p = ring[i][1] * DEG
      r.push(Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p))
    }
    if (r.length >= 9) out.push(r)
  }
  return out
}

// About 10,700 points in all. The globes spin on every second point; a landed
// country is drawn from every point. (The About globe's every-fourth-point set
// went with P8.5-34: its borders read as blurred.)
const LAND: Ring[] = FEATURES.flatMap(f => ringsOf(f, 2))

/** Meridians and parallels every `spacing` degrees, as open lines. */
function graticule(spacing: number, step: number): Ring[] {
  const lines: Ring[] = []
  const pt = (lon: number, lat: number) => { const l = lon * DEG, p = lat * DEG; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] }
  for (let lon = -180; lon < 180; lon += spacing) {
    const r: Ring = []
    for (let lat = -80; lat <= 80; lat += step) r.push(...pt(lon, lat))
    lines.push(r)
  }
  for (let lat = -60; lat <= 60; lat += spacing) {
    const r: Ring = []
    for (let lon = -180; lon <= 180; lon += step) r.push(...pt(lon, lat))
    lines.push(r)
  }
  return lines
}
const GRATICULE = graticule(30, 6)

/** A country's main landmass: its biggest polygon, by number of points. P8.5-12:
 *  France's outline includes French Guiana, and a centre or reach taken over
 *  every polygon put the camera over the Atlantic, zoomed out to South America. */
function mainPolygon(feature: any): number[][][] | null {
  let best: number[][][] | null = null
  for (const poly of polygonsOf(feature)) if (!best || poly[0].length > best[0].length) best = poly
  return best
}
const mainFeature = (feature: any) => {
  const main = mainPolygon(feature)
  return main ? { ...feature, geometry: { type: 'Polygon', coordinates: main } } : feature
}

/** A country's centre, to turn it to face you: the mean of its main landmass's outer ring on the sphere. */
function centroidOf(feature: any): [number, number] {
  let X = 0, Y = 0, Z = 0, n = 0
  for (const poly of polygonsOf(mainFeature(feature))) for (const [lon, lat] of poly[0]) {
    const l = lon * DEG, p = lat * DEG
    X += Math.cos(p) * Math.cos(l); Y += Math.cos(p) * Math.sin(l); Z += Math.sin(p); n++
  }
  if (!n) return [0, 20]
  return [Math.atan2(Y, X) / DEG, Math.asin(Math.max(-1, Math.min(1, Z / n))) / DEG]
}

// ── The projection ───────────────────────────────────────────────────────────
// Orthographic, centred on (lon, lat), radius R about (C, C). For a point on
// the unit sphere (x, y, z) that's a rotation: the point's screen x is
// y·cosλ₀ − x·sinλ₀, its screen y cosφ₀·z − sinφ₀·(x·cosλ₀ + y·sinλ₀), and it
// faces you when sinφ₀·z + cosφ₀·(x·cosλ₀ + y·sinλ₀) ≥ 0. The same numbers
// d3.geoOrthographic gives. A worklet, so the UI thread can call it every frame.
function project(rings: Ring[], lon: number, lat: number, R: number, C: number, closed: boolean, digits: number): string {
  'worklet'
  const cl = Math.cos(lon * DEG), sl = Math.sin(lon * DEG), cp = Math.cos(lat * DEG), sp = Math.sin(lat * DEG)
  let d = ''
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    let seg = '', open = false, seen = false
    for (let i = 0; i < ring.length; i += 3) {
      const a = ring[i] * cl + ring[i + 1] * sl
      let x = ring[i + 1] * cl - ring[i] * sl
      let y = cp * ring[i + 2] - sp * a
      const front = sp * ring[i + 2] + cp * a >= 0
      if (front) seen = true
      else if (closed) {
        // Behind the globe: onto its edge, so the shape stays closed.
        const m = Math.sqrt(x * x + y * y) || 1
        x /= m; y /= m
      } else { open = false; continue }
      seg += (open ? 'L' : 'M') + (C + R * x).toFixed(digits) + ' ' + (C - R * y).toFixed(digits)
      open = true
    }
    // A ring wholly behind the globe draws nothing (it would be a sliver on the edge).
    if (seen) d += closed ? seg + 'Z' : seg
  }
  return d
}

/** The box a shape covers on screen (its front points), for the flag laid over it. */
function boxOf(rings: Ring[], lon: number, lat: number, R: number, C: number) {
  const cl = Math.cos(lon * DEG), sl = Math.sin(lon * DEG), cp = Math.cos(lat * DEG), sp = Math.sin(lat * DEG)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const ring of rings) for (let i = 0; i < ring.length; i += 3) {
    const a = ring[i] * cl + ring[i + 1] * sl
    if (sp * ring[i + 2] + cp * a < 0) continue
    const x = C + R * (ring[i + 1] * cl - ring[i] * sl), y = C - R * (cp * ring[i + 2] - sp * a)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) } : null
}

function findTarget(targetId?: number | null, targetName?: string | null) {
  if (targetId != null) {
    const byId = FEATURES.find(f => Number(f.id) === Number(targetId))
    if (byId) return byId
  }
  if (targetName) {
    const n = targetName.toLowerCase()
    return FEATURES.find(f => (f.properties?.name ?? '').toLowerCase() === n)
        ?? FEATURES.find(f => (f.properties?.name ?? '').toLowerCase().includes(n))
        ?? null
  }
  return null
}

// An id an SVG url(#…) can hold (React's useId has colons).
const svgId = (raw: string, name: string) => `${name}${raw.replace(/[^a-zA-Z0-9]/g, '')}`

// ── The reveal ───────────────────────────────────────────────────────────────
// Spins twice and eases to a stop with the target facing front, then zooms in
// on it (P8-164's follow-up, the maintainer, 28 September): the country fills
// the view in full detail wearing its flag, and everything around it sinks
// into a fog — the land dimmed and greyed, the grid and the ring gone — so the
// eye goes to one place. The last frame is drawn once from every point of
// every outline, so the borders are crisp where the spin's thinner ones looked
// off. Calls onLock() once it's settled. Text is the caller's job.
const ZOOM_MS = 1500
// The fog: the land barely lifted off the sea, its borders just visible.
const FOG_LAND = prim.ruleNylon
const FOG_BORDER = prim.nylonFaint
// How much of the view the country should span once zoomed in, and the most
// the globe will magnify (a tiny country stays a small shape, not a blur).
const FILL = 0.36
const MAX_ZOOM = 16

// Every point of every country, for the settled frame (made once, when first needed).
let LAND_FULL: Ring[] | null = null
const landFull = () => (LAND_FULL ??= FEATURES.flatMap(f => ringsOf(f, 1)))

/** How far the country reaches from its centre, as an angle on the sphere. */
function reachOf(rings: Ring[], lon: number, lat: number): number {
  const cx = Math.cos(lat * DEG) * Math.cos(lon * DEG), cy = Math.cos(lat * DEG) * Math.sin(lon * DEG), cz = Math.sin(lat * DEG)
  let min = 1
  for (const r of rings) for (let i = 0; i < r.length; i += 3) min = Math.min(min, r[i] * cx + r[i + 1] * cy + r[i + 2] * cz)
  return Math.acos(Math.max(-1, Math.min(1, min)))
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export function GlobeReveal({ targetId, targetName, flag, accent, size = 220, spinMs = 2600, onLock, skip }: {
  targetId?: number | null       // numeric ISO 3166-1 (preferred)
  targetName?: string | null     // fallback: feature name (case-insensitive contains)
  /** P8-164: the chosen country's flag (emoji); it fills the country once landed. */
  flag?: string | null
  accent: string
  size?: number
  spinMs?: number
  onLock?: () => void
  // Set true to land at once (the draw's "tap to lock", 06-MOTION §5.3). The
  // outcome was decided before the spin started; skipping only skips the playback.
  skip?: boolean
}) {
  const reduced = useReducedMotion()
  const R0 = size * 0.43
  const C = size / 2
  const ids = useId()
  const flagFill = svgId(ids, 'flag')
  const target = useMemo(() => findTarget(targetId, targetName), [targetId, targetName])
  const targetRings = useMemo(() => (target ? ringsOf(target, 1) : []), [target])
  const [end, setEnd] = useState<{ lon: number; lat: number; R: number } | null>(null)
  const [locked, setLocked] = useState(false)
  const lockedRef = useRef(false)
  const lon = useSharedValue(0)
  const lat = useSharedValue(-15)
  const zoom = useSharedValue(0)
  const Rz = useSharedValue(R0)

  const lock = () => {
    if (lockedRef.current) return
    lockedRef.current = true
    setLocked(true)
    onLock?.()
  }

  useEffect(() => {
    lockedRef.current = false
    setLocked(false)
    const [tLon, tLat] = target ? centroidOf(target) : [0, 20]
    // Near the country's size: the radius at which it spans FILL of the view.
    // Reach from the main landmass too (French Guiana mustn't widen France's view).
    const reach = target ? reachOf(ringsOf(mainFeature(target), 1), tLon, tLat) : Math.PI / 2
    const R = Math.max(R0, Math.min(R0 * MAX_ZOOM, (FILL * size) / Math.sin(Math.min(reach, 80 * DEG))))
    // Two whole turns on the way; the spin stops at a tilt a globe looks right
    // at, and the zoom finishes centred on the country itself.
    const e = { lon: tLon + 720, lat: tLat, R }
    setEnd(e)
    Rz.value = R
    if (reduced) { lon.value = e.lon; lat.value = e.lat; zoom.value = 1; const t = setTimeout(lock, 150); return () => clearTimeout(t) }
    const out = Easing.out(Easing.cubic)   // fast, then settles
    const glide = Easing.inOut(Easing.cubic)
    lon.value = withTiming(e.lon, { duration: spinMs, easing: out })
    lat.value = withSequence(withTiming(Math.max(-55, Math.min(55, tLat)), { duration: spinMs, easing: out }), withTiming(e.lat, { duration: ZOOM_MS, easing: glide }))
    zoom.value = withDelay(spinMs, withTiming(1, { duration: ZOOM_MS, easing: glide }, finished => { if (finished) runOnJS(lock)() }))
    return () => { cancelAnimation(lon); cancelAnimation(lat); cancelAnimation(zoom) }
  }, [target])

  useEffect(() => {
    if (!skip || !end || lockedRef.current) return
    cancelAnimation(lon); cancelAnimation(lat); cancelAnimation(zoom)
    lon.value = end.lon; lat.value = end.lat; zoom.value = 1
    lock()
  }, [skip, end])

  // Everything below follows the one zoom value: the radius grows, the land
  // and its borders fade into the fog, the grid and the ring go.
  const landProps = useAnimatedProps(() => ({
    d: project(LAND, lon.value, lat.value, R0 + (Rz.value - R0) * zoom.value, C, true, 0),
    fill: interpolateColor(zoom.value, [0, 1], [LAND_FILL, FOG_LAND]),
    stroke: interpolateColor(zoom.value, [0, 1], [BORDER, FOG_BORDER]),
  }))
  const gridProps = useAnimatedProps(() => ({
    d: project(GRATICULE, lon.value, lat.value, R0 + (Rz.value - R0) * zoom.value, C, false, 0),
    strokeOpacity: 1 - zoom.value,
  }))
  const seaProps = useAnimatedProps(() => ({ r: R0 + (Rz.value - R0) * zoom.value }))
  const ringProps = useAnimatedProps(() => ({ strokeOpacity: 0.3 * (1 - zoom.value) }))
  // The country rises out of the fog as the zoom comes in: its own outline,
  // lit, then the flag once it's settled.
  const targetProps = useAnimatedProps(() => ({
    d: project(targetRings, lon.value, lat.value, R0 + (Rz.value - R0) * zoom.value, C, true, 1),
    fillOpacity: zoom.value,
    strokeOpacity: zoom.value,
  }))

  // The settled frame, drawn once from every point: the fog and the country.
  const settled = useMemo(() => {
    if (!locked || !end) return null
    return {
      land: project(landFull(), end.lon, end.lat, end.R, C, true, 1),
      target: target ? project(targetRings, end.lon, end.lat, end.R, C, true, 1) : '',
      box: target ? boxOf(targetRings, end.lon, end.lat, end.R, C) : null,
    }
  }, [locked, end, target, C])
  const flagImage = flagImageOf(flag)
  const flagged = !!settled?.box && flagImage != null

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {flagged && (
          <Defs>
            <Pattern id={flagFill} patternUnits="userSpaceOnUse" x={settled!.box!.x} y={settled!.box!.y} width={settled!.box!.w} height={settled!.box!.h}>
              <SvgImage href={flagImage!} x={0} y={0} width={settled!.box!.w} height={settled!.box!.h} preserveAspectRatio="xMidYMid slice" />
            </Pattern>
          </Defs>
        )}
        <AnimatedCircle cx={C} cy={C} animatedProps={seaProps} fill={SEA} />
        {settled ? (
          <>
            <Path d={settled.land} fill={FOG_LAND} stroke={FOG_BORDER} strokeWidth={0.6} strokeLinejoin="round" />
            {settled.target ? (
              <Path d={settled.target} fill={flagged ? `url(#${flagFill})` : accent} stroke={accent} strokeWidth={2} strokeLinejoin="round" />
            ) : null}
          </>
        ) : (
          <>
            <AnimatedPath animatedProps={gridProps} fill="none" stroke={GRID} strokeWidth={0.6} />
            <AnimatedPath animatedProps={landProps} strokeWidth={0.6} strokeLinejoin="round" />
            {targetRings.length > 0 && <AnimatedPath animatedProps={targetProps} fill={LAND_FILL} stroke={accent} strokeWidth={2} strokeLinejoin="round" />}
          </>
        )}
        {/* The ring around it while it spins; gone once it's zoomed in. */}
        <AnimatedCircle cx={C} cy={C} r={R0 + 6} animatedProps={ringProps} fill="none" stroke={accent} strokeWidth={1} strokeDasharray="10 14" />
      </Svg>
    </View>
  )
}

// ── The endless globe ────────────────────────────────────────────────────────
// The About page's globe (P8.5-34, the maintainer, 1 Oct 2026): it spins, and
// when Slovakia comes round it slowly zooms in until the whole country fills
// the view, with a dot where the game was built (north of Bratislava, between
// Stupava, Malacky, Pezinok and Senec); it holds there, then zooms out and
// spins on, round again.
//
// One clock drives it all: `t` runs 0 → 1 over a whole cycle and repeats, and
// every frame's longitude, tilt, radius and dot come from it in a worklet, so
// there's still no React render per frame. The spin ends facing the country
// and the next one starts from the same view (a full turn round), so the loop
// never jumps.
//
// "The borders are not sharp" (same note): the old one drew every FOURTH point
// rounded to whole pixels. Now every second point to a tenth of a pixel, the
// country itself from every point.
const BUILT_AT: [number, number] = [48.32, 17.18]  // lat, lon
const SPIN_MS = 36000, IN_MS = 2400, HOLD_MS = 3200, OUT_MS = 2400
const CYCLE = SPIN_MS + IN_MS + HOLD_MS + OUT_MS

export function SpinningGlobe({ targetId = 703, accent, size = 160 }: {
  targetId?: number
  accent: string
  size?: number
  /** Kept for callers; the spin's speed is now part of the cycle (SPIN_MS). */
  degPerSec?: number
}) {
  const reduced = useReducedMotion()
  const R = size * 0.43
  const C = size / 2
  const target = useMemo(() => FEATURES.find(f => Number(f.id) === targetId) ?? null, [targetId])
  const targetRings = useMemo(() => (target ? ringsOf(target, 1) : []), [target])
  const [tLon, tLat] = useMemo(() => (target ? centroidOf(target) : [0, 15]), [target])
  const tilt = Math.max(-35, Math.min(45, tLat))
  // Zoomed, the country spans this much of the view (like the draw's reveal).
  const Rz = useMemo(() => {
    const reach = target ? reachOf(ringsOf(mainFeature(target), 1), tLon, tLat) : Math.PI / 2
    return Math.max(R, Math.min(R * MAX_ZOOM, (0.4 * size) / Math.sin(Math.min(reach, 80 * DEG))))
  }, [target, targetRings, tLon, tLat, R, size])
  const dot = useMemo(() => {
    const l = BUILT_AT[1] * DEG, p = BUILT_AT[0] * DEG
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]
  }, [])
  const t = useSharedValue(0)

  useEffect(() => {
    // Less motion: the country zoomed in with its dot, still.
    if (reduced) { t.value = (SPIN_MS + IN_MS + HOLD_MS / 2) / CYCLE; return }
    t.value = 0
    t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false)
    return () => cancelAnimation(t)
  }, [reduced])

  // The view at clock time `c`: longitude, zoom (0 spinning, 1 in close).
  const view = (c: number) => {
    'worklet'
    const ms = c * CYCLE
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    if (ms < SPIN_MS) return { lon: tLon - 360 + 360 * (ms / SPIN_MS), zoom: 0 }
    if (ms < SPIN_MS + IN_MS) return { lon: tLon, zoom: ease((ms - SPIN_MS) / IN_MS) }
    if (ms < SPIN_MS + IN_MS + HOLD_MS) return { lon: tLon, zoom: 1 }
    return { lon: tLon, zoom: 1 - ease((ms - SPIN_MS - IN_MS - HOLD_MS) / OUT_MS) }
  }
  const frame = (c: number) => {
    'worklet'
    const v = view(c)
    return { lon: v.lon, lat: tilt + (tLat - tilt) * v.zoom, r: R + (Rz - R) * v.zoom, zoom: v.zoom }
  }

  const seaProps = useAnimatedProps(() => ({ r: frame(t.value).r }))
  const landProps = useAnimatedProps(() => { const f = frame(t.value); return { d: project(LAND, f.lon, f.lat, f.r, C, true, 1) } })
  const targetProps = useAnimatedProps(() => { const f = frame(t.value); return { d: project(targetRings, f.lon, f.lat, f.r, C, true, 1) } })
  const ringProps = useAnimatedProps(() => ({ strokeOpacity: 0.35 * (1 - frame(t.value).zoom) }))
  // The dot: where the game was built, shown only as the zoom comes in, with a
  // slow pulse while it holds.
  const dotProps = useAnimatedProps(() => {
    const f = frame(t.value)
    const cl = Math.cos(f.lon * DEG), sl = Math.sin(f.lon * DEG), cp = Math.cos(f.lat * DEG), sp = Math.sin(f.lat * DEG)
    const a = dot[0] * cl + dot[1] * sl
    const x = C + f.r * (dot[1] * cl - dot[0] * sl), y = C - f.r * (cp * dot[2] - sp * a)
    const shown = Math.max(0, (f.zoom - 0.6) / 0.4)
    const pulse = 1 + 0.25 * Math.sin(t.value * CYCLE / 260)
    return { cx: x, cy: y, r: 3.2 * pulse, opacity: shown }
  })

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <AnimatedCircle cx={C} cy={C} animatedProps={seaProps} fill={SEA} stroke={accent} strokeWidth={1.25} strokeOpacity={0.5} />
        <AnimatedPath animatedProps={landProps} fill={LAND_FILL} stroke={BORDER} strokeWidth={0.6} strokeLinejoin="round" />
        <AnimatedPath animatedProps={targetProps} fill={accent} stroke={accent} strokeWidth={1.25} strokeLinejoin="round" />
        <AnimatedCircle animatedProps={dotProps} fill={prim.orange} stroke={prim.ink} strokeWidth={1.5} />
        <AnimatedCircle cx={C} cy={C} r={R + 6} animatedProps={ringProps} fill="none" stroke={accent} strokeWidth={1} strokeDasharray="4 8" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
