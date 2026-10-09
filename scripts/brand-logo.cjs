/**
 * Phase 10, step 1a (docs/website/05-OPEN-QUESTIONS.md §3): every brand asset
 * from the one logo file, `assets/Group 3.svg` (the maintainer's, 533 × 528).
 *
 *   node scripts/brand-logo.cjs
 *
 * Two forms of the mark, decided with the maintainer on 9 October 2026:
 *  - **the full logo** (the volt and red triangles, the white wordmark between
 *    them, the orange pin) where it's big enough to read: the opening
 *    animation's end, the 1200 × 630 link preview;
 *  - **the compact mark**: the wordmark taken out and the gap it leaves closed
 *    (each triangle moved 60 units toward the other, 155 → 35), so the two
 *    read as one split diamond at a launcher's or a tab's size, where the
 *    wordmark would be a smear. The pin rides with the top triangle.
 * The two share a centre (y ≈ 226: the triangles move the same distance in
 * opposite directions), so the splash (compact) and the in-app opening
 * (compact → full, src/components/brand/LogoIntro.tsx) line up exactly.
 *
 * Writes over the old P/M plate art (scripts/brand-assets.py, retired):
 *   assets/icon.png, android-icon-{foreground,background,monochrome}.png,
 *   splash-icon.png, favicon.png; public/apple-touch-icon.png, icon-192.png,
 *   icon-512.png, og.png; and src/components/brand/logoParts.ts (the paths the
 *   animation draws, so the app and the files can't drift apart).
 */
const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')

const ROOT = path.join(__dirname, '..')
const SRC = fs.readFileSync(path.join(ROOT, 'assets/Group 3.svg'), 'utf8')

// ── The parts, read from the file (never retyped) ──────────────────────────
const pathFill = fill => {
  const m = SRC.match(new RegExp(`<path d="([^"]+)" fill="${fill}"`))
  if (!m) throw new Error(`no path filled ${fill} in Group 3.svg`)
  return m[1]
}
const one = (re, what) => { const m = SRC.match(re); if (!m) throw new Error(`no ${what} in Group 3.svg`); return m[0] }
const PARTS = {
  wordmark: pathFill('white'),
  volt: pathFill('#D5FF3F'),
  red: pathFill('#E1141F'),
  stick: one(/<rect [^>]*fill="#FF5A00"\/>/, 'pin stick'),
  head: one(/<circle [^>]*fill="#FF5A00"\/>/, 'pin head'),
  hole: one(/<circle [^>]*fill="black"\/>/, 'pin hole'),
}
const NYLON = '#141416', INK = '#0C0C0D', COTTON = '#F3F3F0'
const SHIFT = 60              // each triangle's move to close the gap
const CX = 266.5, CY = 226.3  // the centre both forms share (logo units)
const CANVAS = 533            // the square the splash and the opening draw in

// ── The two forms as SVG bodies ─────────────────────────────────────────────
const top = (dy = 0) => `<g transform="translate(0 ${dy})">${PARTS.stick}${PARTS.head}${PARTS.hole}<path d="${PARTS.volt}" fill="#D5FF3F"/></g>`
const bottom = (dy = 0) => `<g transform="translate(0 ${dy})"><path d="${PARTS.red}" fill="#E1141F"/></g>`
const compact = () => top(SHIFT) + bottom(-SHIFT)
const full = (word = 'white') => top() + bottom() + `<path d="${PARTS.wordmark}" fill="${word}"/>`
// The monochrome layer: one colour, the pin's hole cut out (Android tints it).
const mono = () => `<defs><mask id="m"><rect x="-999" y="-999" width="3000" height="3000" fill="white"/>` +
  `<g transform="translate(0 ${SHIFT})">${PARTS.hole.replace('fill="black"', 'fill="black"')}</g></mask></defs>` +
  `<g mask="url(#m)" fill="white">` +
  `<g transform="translate(0 ${SHIFT})">${PARTS.stick.replace(/fill="[^"]+"/, 'fill="white"')}${PARTS.head.replace(/fill="[^"]+"/, 'fill="white"')}<path d="${PARTS.volt}"/></g>` +
  `<g transform="translate(0 ${-SHIFT})"><path d="${PARTS.red}"/></g></g>`

// A square view of `size` logo units around the shared centre.
const r1 = n => Math.round(n * 10) / 10
const square = size => `${r1(CX - size / 2)} ${r1(CY - size / 2)} ${size} ${size}`

function png(body, viewBox, px, bg, out, w = px, h = px, fonts) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">` +
    (bg ? `<rect x="-5000" y="-5000" width="20000" height="20000" fill="${bg}"/>` : '') + body + '</svg>'
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: fonts ?? { loadSystemFonts: false } })
  fs.writeFileSync(path.join(ROOT, out), r.render().asPng())
  console.log('wrote', out)
}

// The compact mark's farthest point from the centre is the red triangle's
// base corner, about 234 units out. Android's adaptive icon shows a circle of
// 66% of the layer, so the layer must be ≥ 234 / 0.33 ≈ 709 units across; a
// maskable web icon shows 80%, so ≥ 585.
png(compact(), square(720), 1024, NYLON, 'assets/icon.png')
png(compact(), square(720), 1024, null, 'assets/android-icon-foreground.png')
png('', square(720), 1024, NYLON, 'assets/android-icon-background.png')
png(mono(), square(720), 1024, null, 'assets/android-icon-monochrome.png')
// The splash: the opening's first frame. expo-splash-screen draws it
// `imageWidth` wide on nylon; LogoIntro draws the same canvas at that width.
png(compact(), square(CANVAS), 1024, null, 'assets/splash-icon.png')
// The favicon: tight, transparent (a tab can be light or dark; volt, red and
// orange read on both).
png(compact(), square(480), 48, null, 'assets/favicon.png')
png(compact(), square(620), 180, NYLON, 'public/apple-touch-icon.png')
png(compact(), square(620), 192, NYLON, 'public/icon-192.png')
png(compact(), square(620), 512, NYLON, 'public/icon-512.png')

// The link preview, 1200 × 630, designed: the full logo on nylon at left, the
// promise in the super face at right, one tag. Legal-flavour words only (the
// public site and the web build are the legal flavour).
{
  const font = f => path.join(ROOT, 'node_modules/@expo-google-fonts', f)
  const fonts = {
    loadSystemFonts: false,
    fontFiles: [font('barlow-condensed/900Black_Italic/BarlowCondensed_900Black_Italic.ttf'), font('martian-mono/500Medium/MartianMono_500Medium.ttf')],
    defaultFontFamily: 'Barlow Condensed',
  }
  // The logo, 470 px tall, its own 429-unit height (pin top 11.8 → red tip 440.8).
  const k = 470 / 429
  const logo = `<g transform="translate(70 ${80 - 11.8 * k}) scale(${k})">${full()}</g>`
  const superLine = (y, s) => `<text x="680" y="${y}" font-family="Barlow Condensed" font-weight="900" font-style="italic" font-size="78" fill="${COTTON}">${s}</text>`
  const text = superLine(232, 'DRAFT AN XI') + superLine(306, 'FROM REAL') + superLine(380, 'CLUB-SEASONS.') +
    `<text x="684" y="452" font-family="Martian Mono" font-size="22" letter-spacing="1" fill="#A4A4AB">SURVIVE THE SEASON.</text>` +
    `<rect x="684" y="494" width="300" height="4" fill="#FF5A00"/>` +
    `<text x="684" y="540" font-family="Martian Mono" font-size="20" letter-spacing="1" fill="${COTTON}">FREE · BROWSER · ANDROID</text>`
  png(logo + text, '0 0 1200 630', 1200, NYLON, 'public/og.png', 1200, 630, fonts)
}

// The paths, for the opening animation. Generated: edit the SVG, not this.
const out = `// GENERATED by scripts/brand-logo.cjs from assets/Group 3.svg. Don't edit:
// change the SVG and run the script. The parts of the logo, for the opening
// animation (LogoIntro.tsx), which must match the splash image exactly.
export const LOGO = {
  canvas: ${CANVAS},
  /** The square every frame is drawn in, around the centre both forms share. */
  viewBox: '${square(CANVAS)}',
  /** Each triangle's move toward the other in the compact form (logo units). */
  shift: ${SHIFT},
  /** The band's middle, where the wordmark opens from (logo units). */
  seamY: ${(186.75 + 341.25) / 2},
  wordmark: ${JSON.stringify(PARTS.wordmark)},
  volt: ${JSON.stringify(PARTS.volt)},
  red: ${JSON.stringify(PARTS.red)},
  stick: ${JSON.stringify(attrs(PARTS.stick))},
  head: ${JSON.stringify(attrs(PARTS.head))},
  hole: ${JSON.stringify(attrs(PARTS.hole))},
} as const
`
function attrs(tag) {
  const o = {}
  for (const [, k, v] of tag.matchAll(/(\w+)="([^"]+)"/g)) if (k !== 'fill') o[k] = /^-?[\d.]+$/.test(v) ? Number(v) : v
  return o
}
fs.mkdirSync(path.join(ROOT, 'src/components/brand'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'src/components/brand/logoParts.ts'), out)
console.log('wrote src/components/brand/logoParts.ts')
