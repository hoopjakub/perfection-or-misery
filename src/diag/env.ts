// Phase 9, Diagnostics step 4 (docs/diagnostics/02-POM-ARCHITECTURE.md §5):
// the environment a report was made in. Font scale, reduce motion and the
// window class are here because layouts depend on them: "the verdict clips"
// means something only next to "font 1.3".
//
// Nothing personal: the browser is named by family, never the full user agent.
import { Platform, PixelRatio, Dimensions, AccessibilityInfo, Appearance } from 'react-native'
import Constants from 'expo-constants'
import { ENGINE_VERSION } from '@/engine/version'
import { DB_VERSION } from '@/db/setup'

export type Env = {
  app: string
  build: 'dev' | 'release'
  engine: number
  db: number
  platform: string        // "android 35", "web"
  jsEngine: 'hermes' | 'v8' | 'other'
  device: string          // "Xiaomi POCO X6 5G", "Chrome 140"
  hardware?: string       // web only: "8 cores · 8 GB"
  window: string          // "412×915 @2.6 compact"
  fontScale: number
  reduceMotion: boolean
  scheme: string
  sessionMin: number
}

const started = Date.now()

function browser(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  // Order matters: Edge and Opera say Chrome too, and Chrome says Safari.
  for (const [name, re] of [['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/], ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]] as const) {
    const m = ua.match(re)
    if (m) return `${name} ${m[1]}`
  }
  return 'a browser'
}

const sizeClass = (w: number) => (w < 600 ? 'compact' : w < 1024 ? 'medium' : 'expanded')

export async function readEnv(): Promise<Env> {
  const { width, height } = Dimensions.get('window')
  const c = (Platform as any).constants ?? {}
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {}
  let reduceMotion = false
  try { reduceMotion = await AccessibilityInfo.isReduceMotionEnabled() } catch { /* not on this platform */ }
  return {
    app: Constants.expoConfig?.version ?? '?',
    build: __DEV__ ? 'dev' : 'release',
    engine: ENGINE_VERSION,
    db: DB_VERSION,
    platform: Platform.OS === 'web' ? 'web' : `${Platform.OS} ${Platform.Version}`,
    jsEngine: (globalThis as any).HermesInternal ? 'hermes' : Platform.OS === 'web' && /Chrome|Edg/.test(nav.userAgent ?? '') ? 'v8' : 'other',
    device: Platform.OS === 'web' ? browser() : [c.Brand, c.Model].filter(Boolean).join(' ') || Platform.OS,
    hardware: Platform.OS === 'web' && (nav.hardwareConcurrency || nav.deviceMemory)
      ? [nav.hardwareConcurrency && `${nav.hardwareConcurrency} cores`, nav.deviceMemory && `${nav.deviceMemory} GB`].filter(Boolean).join(' · ')
      : undefined,
    window: `${Math.round(width)}×${Math.round(height)} @${PixelRatio.get().toFixed(1)} ${sizeClass(width)}`,
    fontScale: Math.round(PixelRatio.getFontScale() * 100) / 100,
    reduceMotion,
    scheme: Appearance.getColorScheme() ?? 'unknown',
    sessionMin: Math.round((Date.now() - started) / 60000),
  }
}
