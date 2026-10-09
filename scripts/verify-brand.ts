// Phase 10, step 1a · The logo has one source, and the opening lines up with
// the splash:
//   npx tsx scripts/verify-brand.ts
//
// The splash image (assets/splash-icon.png) and the opening animation
// (src/components/brand/LogoIntro.tsx) are both drawn from assets/Group 3.svg
// by scripts/brand-logo.cjs. If the SVG changes and the script isn't run, or
// the splash's width in app.json drifts from the animation's, the hand-off
// from the native splash to the app visibly jumps. This fails first.
import fs from 'fs'
import path from 'path'
import { LOGO } from '../src/components/brand/logoParts'

const ROOT = path.join(__dirname, '..')
let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }

// 1 · The parts are the SVG's, as it is now.
const svg = fs.readFileSync(path.join(ROOT, 'assets/Group 3.svg'), 'utf8')
const pathFill = (fill: string) => svg.match(new RegExp(`<path d="([^"]+)" fill="${fill}"`))?.[1]
check(pathFill('white') === LOGO.wordmark, 'the wordmark in logoParts.ts is not the SVG\'s: run node scripts/brand-logo.cjs')
check(pathFill('#D5FF3F') === LOGO.volt, 'the volt triangle in logoParts.ts is not the SVG\'s: run node scripts/brand-logo.cjs')
check(pathFill('#E1141F') === LOGO.red, 'the red triangle in logoParts.ts is not the SVG\'s: run node scripts/brand-logo.cjs')
check(svg.includes(`cx="${LOGO.head.cx}"`) && svg.includes(`r="${LOGO.hole.r}"`), 'the pin in logoParts.ts is not the SVG\'s')

// 2 · The splash is drawn as wide as the opening's first frame.
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const splash = (app.expo.plugins as unknown[]).find(p => Array.isArray(p) && p[0] === 'expo-splash-screen') as [string, { imageWidth?: number; backgroundColor?: string }] | undefined
const intro = fs.readFileSync(path.join(ROOT, 'src/components/brand/LogoIntro.tsx'), 'utf8')
const size = Number(intro.match(/const SIZE = (\d+)/)?.[1])
check(!!splash, 'app.json has no expo-splash-screen plugin')
check(splash?.[1].imageWidth === size, `the splash is ${splash?.[1].imageWidth} wide and the opening ${size}: the hand-off would jump`)
check(splash?.[1].backgroundColor?.toLowerCase() === '#141416', 'the splash ground is not nylon, the opening\'s ground')

// 3 · Every asset the script writes exists and is newer than the SVG.
const svgTime = fs.statSync(path.join(ROOT, 'assets/Group 3.svg')).mtimeMs
for (const f of ['assets/icon.png', 'assets/android-icon-foreground.png', 'assets/android-icon-background.png', 'assets/android-icon-monochrome.png',
  'assets/splash-icon.png', 'assets/favicon.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png', 'public/og.png']) {
  const p = path.join(ROOT, f)
  check(fs.existsSync(p) && fs.statSync(p).mtimeMs >= svgTime, `${f} is missing or older than the logo: run node scripts/brand-logo.cjs`)
}

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
