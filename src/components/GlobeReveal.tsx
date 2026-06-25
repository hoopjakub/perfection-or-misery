import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Circle, Path, G, Defs, RadialGradient, Stop, ClipPath } from 'react-native-svg'
import { makeProjection, featurePath, featureCentroid, graticulePath } from '@/lib/globe-geo'
import { colors } from '@/theme'

// Root-level asset (matches the require() convention used for logos).
const world = require('../../assets/geo/countries-110m.geo.json')
const FEATURES: any[] = world.features

export type GlobePhase = 'spinning' | 'locked'

// A spinning orthographic globe that eases to a stop with `target` facing front
// and glowing in `accent`. Calls onLock() once it settles. Text is the caller's job.
export function GlobeReveal({ targetId, targetName, accent, size = 220, spinMs = 2600, onLock }: {
  targetId?: number | null       // numeric ISO 3166-1 (preferred)
  targetName?: string | null     // fallback: feature name (case-insensitive contains)
  accent: string
  size?: number
  spinMs?: number
  onLock?: () => void
}) {
  const R = size * 0.43
  const C = size / 2
  const rafRef = useRef<number | null>(null)
  const lockedRef = useRef(false)
  const centerRef = useRef({ lon: 0, lat: -15 })
  const [, force] = useState(0)
  const [phase, setPhase] = useState<GlobePhase>('spinning')

  const target = useMemo(() => {
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
  }, [targetId, targetName])

  useEffect(() => {
    lockedRef.current = false
    setPhase('spinning')
    const [tLon, tLat] = target ? featureCentroid(target) : [0, 20]
    const startLon = centerRef.current.lon
    const startLat = centerRef.current.lat
    const spins = 2
    const endLon = tLon + 360 * spins        // a couple of revolutions, land facing target
    const endLat = Math.max(-55, Math.min(55, tLat))
    const t0 = Date.now()
    let lastDraw = 0

    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / spinMs)
      const e = 1 - Math.pow(1 - t, 3)       // easeOutCubic — fast then settle
      centerRef.current = {
        lon: startLon + (endLon - startLon) * e,
        lat: startLat + (endLat - startLat) * e,
      }
      const now = Date.now()
      if (now - lastDraw > 28 || t >= 1) { force(x => x + 1); lastDraw = now } // ~30fps
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else if (!lockedRef.current) { lockedRef.current = true; setPhase('locked'); onLock?.() }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target])

  const { lon, lat } = centerRef.current
  const proj = makeProjection(lon, lat, R, C, C)
  const gratD = graticulePath(proj)
  const locked = phase === 'locked'
  const clipId = 'globeClip'

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="ocean" cx="38%" cy="32%" r="75%">
            <Stop offset="0%" stopColor={colors.bgElevated} />
            <Stop offset="100%" stopColor={colors.bg} />
          </RadialGradient>
          <ClipPath id={clipId}>
            <Circle cx={C} cy={C} r={R} />
          </ClipPath>
        </Defs>

        {/* ocean sphere */}
        <Circle cx={C} cy={C} r={R} fill="url(#ocean)" stroke={accent} strokeWidth={1.25} strokeOpacity={locked ? 0.9 : 0.4} />

        <G clipPath={`url(#${clipId})`}>
          {/* graticule */}
          <Path d={gratD} fill="none" stroke={colors.border} strokeWidth={0.5} strokeOpacity={0.5} />
          {/* countries */}
          {FEATURES.map((f, i) => {
            if (f === target) return null
            const d = featurePath(f, proj)
            if (!d) return null
            return <Path key={i} d={d} fill={colors.bgCard} fillOpacity={0.9} stroke={colors.border} strokeWidth={0.4} />
          })}
          {/* target — only lights up in the accent once the spin has locked;
              during the spin it looks like any other country, so the reveal lands */}
          {target && (() => {
            const d = featurePath(target, proj)
            if (!d) return null
            return locked
              ? <Path d={d} fill={accent} fillOpacity={1} stroke={accent} strokeWidth={1.25} />
              : <Path d={d} fill={colors.bgCard} fillOpacity={0.9} stroke={colors.border} strokeWidth={0.4} />
          })()}
        </G>

        {/* whirl ring */}
        <Circle
          cx={C} cy={C} r={R + 6}
          fill="none" stroke={accent}
          strokeWidth={locked ? 2 : 1}
          strokeOpacity={locked ? 0.8 : 0.3}
          strokeDasharray={locked ? '2 6' : '10 14'}
        />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
})
