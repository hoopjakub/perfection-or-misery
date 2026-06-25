// Pure orthographic-globe math — no d3 dependency, so Metro never has to resolve
// an ESM-only package. The projection is the standard orthographic centred at
// (cLon, cLat); validated to match d3.geoOrthographic exactly (0px error).

const DEG = Math.PI / 180

export type Projector = (lon: number, lat: number) => { x: number; y: number; front: boolean }

export function makeProjection(cLon: number, cLat: number, R: number, cx: number, cy: number): Projector {
  const p0 = cLat * DEG, sP0 = Math.sin(p0), cP0 = Math.cos(p0)
  return (lon, lat) => {
    const dl = (lon - cLon) * DEG, pr = lat * DEG, cP = Math.cos(pr), sP = Math.sin(pr)
    const x = cP * Math.sin(dl)
    const y = cP0 * sP - sP0 * cP * Math.cos(dl)
    const front = sP0 * sP + cP0 * cP * Math.cos(dl) >= 0
    return { x: cx + R * x, y: cy - R * y, front }
  }
}

// Build an SVG path for a feature, emitting only front-hemisphere runs (split at
// the limb). Back points break the run, so no wrong chords cross the disc; an SVG
// clip circle keeps everything inside the globe.
function ringPath(ring: number[][], proj: Projector): string {
  let d = '', open = false
  for (let i = 0; i < ring.length; i++) {
    const p = proj(ring[i][0], ring[i][1])
    if (p.front) { d += (open ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); open = true }
    else open = false
  }
  return d
}

export function featurePath(feature: any, proj: Projector): string {
  const g = feature.geometry
  if (!g) return ''
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  let d = ''
  for (const poly of polys) for (const ring of poly) d += ringPath(ring, proj)
  return d
}

// Approximate spherical centroid (vertex mean on the unit sphere) — good enough
// to rotate a country to face the viewer.
export function featureCentroid(feature: any): [number, number] {
  const g = feature.geometry
  if (!g) return [0, 0]
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  let X = 0, Y = 0, Z = 0, n = 0
  for (const poly of polys) for (const [lon, lat] of poly[0]) {
    const l = lon * DEG, p = lat * DEG
    X += Math.cos(p) * Math.cos(l); Y += Math.sin(p); Z += Math.cos(p) * Math.sin(l); n++
  }
  if (!n) return [0, 0]
  return [Math.atan2(Z / n, X / n) / DEG, Math.asin(Math.max(-1, Math.min(1, Y / n))) / DEG]
}

// Faint graticule (meridians + parallels) as a single path.
export function graticulePath(proj: Projector): string {
  let d = ''
  const seg = (pts: number[][]) => {
    let open = false
    for (const [lon, lat] of pts) {
      const p = proj(lon, lat)
      if (p.front) { d += (open ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); open = true }
      else open = false
    }
  }
  for (let lon = -180; lon <= 180; lon += 30) {
    const pts: number[][] = []
    for (let lat = -80; lat <= 80; lat += 4) pts.push([lon, lat])
    seg(pts)
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: number[][] = []
    for (let lon = -180; lon <= 180; lon += 4) pts.push([lon, lat])
    seg(pts)
  }
  return d
}
