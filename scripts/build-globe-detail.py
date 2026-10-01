# P8.5-34: the About globe's close-up detail.
# The globe spins on Natural Earth's 1:110m outlines (assets/geo/countries-110m),
# where Slovakia is a few dozen points: zoomed in until the country fills the
# view, its borders read as a polygon, not a country ("on zooming the country
# borders should become a lot more sharp", the maintainer, 1 Oct 2026). This
# takes the 1:10m outlines (public domain, naturalearthdata.com) for the
# countries in view at the close-up, clipped to a box round Slovakia, and
# writes them in the 110m file's shape; GlobeReveal draws them instead of the
# whole world while it's zoomed in.
# 1:10m, not 1:50m: simplified to the same tolerance, 1:50m gave Slovakia 80
# points and 1:10m 144 (110m: 33); the extra ones are the real border's bends.
# Run from the project root:  python scripts/build-globe-detail.py
import json, urllib.request

SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"
# What the close-up can show. The globe switches to this set only once its
# whole view lies inside this box (GlobeReveal: DETAIL_ARC), so every outline
# is clipped to it: its cut edges are never on screen. About 6.8 degrees of arc
# each way from Slovakia's centre (19.4 E, 48.8 N; a degree of longitude is
# 0.65 of one there).
LON0, LON1, LAT0, LAT1 = 9.0, 30.0, 42.0, 56.0

src = json.load(urllib.request.urlopen(SRC, timeout=60))

def clip(ring):
    """Sutherland-Hodgman against the box: a closed ring stays closed."""
    edges = [(lambda p: p[0] >= LON0, 0, LON0), (lambda p: p[0] <= LON1, 0, LON1),
             (lambda p: p[1] >= LAT0, 1, LAT0), (lambda p: p[1] <= LAT1, 1, LAT1)]
    pts = ring
    for inside, axis, v in edges:
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev): out.append(cross(prev, cur, axis, v))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur, axis, v))
        pts = out
        if not pts: break
    return pts

# At the close-up a pixel is about 0.04 degrees (Slovakia, ~5.5 degrees wide,
# spans ~150 px of the 180 px globe). Points closer than a third of that to
# the line through their neighbours can't be seen; Douglas-Peucker drops them.
TOL = 0.013

def simplify(ring):
    if len(ring) < 4: return ring
    def dist(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = (dx * dx + dy * dy) ** 0.5
        return abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / n if n else ((p[0]-a[0])**2 + (p[1]-a[1])**2) ** 0.5
    keep = [False] * len(ring); keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        i, j = stack.pop()
        best, k = 0, -1
        for m in range(i + 1, j):
            d = dist(ring[m], ring[i], ring[j])
            if d > best: best, k = d, m
        if best > TOL:
            keep[k] = True; stack += [(i, k), (k, j)]
    return [q for q, kk in zip(ring, keep) if kk]

def cross(a, b, axis, v):
    t = (v - a[axis]) / (b[axis] - a[axis])
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]

out = []
for f in src["features"]:
    p = f["properties"]
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    near = []
    for poly in polys:
        rings = [simplify(clip(r)) for r in poly]
        if len(rings[0]) < 3: continue
        # 3 decimals is ~100 m: far finer than a pixel at the close-up.
        near.append([[[round(x, 3), round(y, 3)] for x, y in r] for r in rings if len(r) >= 3])
    if not near:
        continue
    iso = str(p.get("ISO_N3") or "").lstrip("0") or None
    out.append({"type": "Feature", "id": iso, "properties": {"name": p["NAME"]},
                "geometry": {"type": "MultiPolygon", "coordinates": near}})

json.dump({"type": "FeatureCollection", "features": out},
          open("assets/geo/central-europe-10m.geo.json", "w", encoding="utf-8"), separators=(",", ":"))
pts = sum(len(r) for f in out for poly in f["geometry"]["coordinates"] for r in poly)
print(len(out), "countries,", pts, "points:", ", ".join(f"{f['properties']['name']}={f['id']}" for f in out))
