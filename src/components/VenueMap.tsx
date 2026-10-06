import { label } from '@/i18n/labels'
import { countryName } from '@/data/countries-sk'
import { t, num } from '@/i18n'
import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'
import { type Roles, space, border, prim } from '@/theme'
import { KitText, Tag, Icon } from '@/components/kit'
import { WC_VENUES } from '@/data/venues'

// P8-93: the 2026 World Cup's sixteen grounds on a map of the three host
// countries, and which rounds each one hosts. The outlines are the globe's own
// country shapes (assets/geo, the same file GlobeReveal draws), flattened into
// a plain longitude/latitude map of North America. `played` fills the grounds
// your run played at in orange.
const world = require('../../assets/geo/countries-110m.geo.json')
const HOSTS = new Set(['840', '124', '484'])   // USA, Canada, Mexico (ISO numeric)

// The window: from Vancouver to Boston, from Mexico City to Vancouver, with a
// margin. Longitude is squeezed by cos(35°), so the map isn't stretched sideways.
const LON0 = -128, LON1 = -64, LAT0 = 14, LAT1 = 53
const W = 340, SQUEEZE = Math.cos((35 * Math.PI) / 180)
const H = Math.round((W * (LAT1 - LAT0)) / ((LON1 - LON0) * SQUEEZE))
const px = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H

export function VenueMap({ roles, played = [] }: { roles: Roles; played?: string[] }) {
  const shapes = useMemo(() => (world.features as any[]).filter(f => HOSTS.has(String(f.id))).flatMap(f => {
    const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    return polys.map(poly => poly[0].map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' L '))
      .map(d => `M ${d} Z`)
  }), [])
  const playedIds = new Set(played)
  return (
    <View style={styles.wrap} accessible accessibilityLabel={t('parts.groundsA11y', { n: WC_VENUES.length })}>
      <View style={[styles.map, { borderColor: roles.rule, backgroundColor: roles.sunken }]}>
        <View style={{ width: '100%', aspectRatio: W / H }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {shapes.map((d, i) => <Path key={i} d={d} fill={roles.surface} stroke={roles.rule} strokeWidth={0.8} />)}
          {WC_VENUES.map(v => {
            const final = v.hosts.includes('Final')
            return (
              <React.Fragment key={v.id}>
                <Circle cx={px(v.lon)} cy={py(v.lat)} r={playedIds.has(v.id) ? 5.5 : final ? 5 : 3.5}
                  fill={playedIds.has(v.id) ? prim.orange : final ? prim.gold : roles.text} />
              </React.Fragment>
            )
          })}
        </Svg>
        {/* The final's ground wears a trophy over its dot. It was the words
            THE FINAL beside it, squeezed into the corner of the map. The box
            is the map's own shape, so a percentage of it is a map position. */}
        {WC_VENUES.filter(v => v.hosts.includes('Final')).map(v => (
          <View key={v.id} pointerEvents="none" style={[styles.trophy, { left: `${(px(v.lon) / W) * 100}%`, top: `${(py(v.lat) / H) * 100}%` }]}>
            <Icon name="trophy" size={TROPHY} color={roles.text} label={t('parts.theFinal')} />
          </View>
        ))}
        </View>
      </View>
      {WC_VENUES.map(v => (
        // One column, each line its full width: side by side, the name, the
        // tag and the rounds squeezed each other into broken words.
        <View key={v.id} style={[styles.row, { borderBottomColor: roles.rule }]}>
          <View style={styles.nameLine}>
            {playedIds.has(v.id) && <View style={[styles.dot, { backgroundColor: prim.orange }]} />}
            <KitText t="body" color={roles.text} style={{ flexShrink: 1 }}>{v.name}</KitText>
            {playedIds.has(v.id) && <Tag roles={roles} variant="you">{t('parts.playedHere')}</Tag>}
          </View>
          <KitText t="tag" color={roles.textMuted}>{`${v.city.toUpperCase()} · ${countryName(v.country).toUpperCase()}${v.capacity ? ` · ${num(v.capacity)}` : ''}`}</KitText>
          <KitText t="tag" color={roles.textMuted}>{[t('parts.groups'), ...v.hosts.filter(h => h !== 'Group').map(h => label(h).toUpperCase())].join(' · ')}</KitText>
        </View>
      ))}
    </View>
  )
}

const TROPHY = 16
const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  // Centred on the dot's x, sitting just above it.
  trophy: { position: 'absolute', marginLeft: -TROPHY / 2, marginTop: -TROPHY - 7 },
  map: { borderWidth: border.thin, padding: space[2] },
  row: { gap: 2, paddingVertical: space[2], borderBottomWidth: border.hair },
  nameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
