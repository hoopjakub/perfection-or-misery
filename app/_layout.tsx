import { useEffect } from 'react'
import { View, Platform, AppState } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { installNavGuard } from '@/lib/navGuard'
import { startRunKeeper } from '@/lib/runKeeper'
import { flushSavedRuns } from '@/db/queries/runs'
import { useUserStore } from '@/store/userStore'
import { isOnline, onOnlineChange } from '@/lib/online'
import { checkForAppUpdate } from '@/lib/appUpdate'
import { NavGuard } from '@/components/NavGuard'
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated'
import { useSettingsStore } from '@/store/settingsStore'
import { Asset } from 'expo-asset'
import { getDb } from '@/db/setup'
import { initAuthListener } from '@/store/userStore'
import { ensureGuestSession } from '@/lib/auth'
import { useFonts } from 'expo-font'
import { PageMeta } from '@/components/PageMeta'
import { OfflineStrip } from '@/components/OfflineStrip'
import { WebInsights } from '@/components/WebInsights'
import { installEscBack } from '@/lib/webKeys'
import { StatusBar } from 'expo-status-bar'
import { WEB_CHROME_CSS } from '@/lib/webChrome'
import { EVERYDAY } from '@/lib/appearance'
import { ROLES } from '@/theme'
import { AchievementToast } from '@/components/AchievementToast'

// P8.5-38: the native window behind every screen (seen while a route mounts,
// and between two) is app.json's one fixed colour, #141416, so in light mode
// each load flashed a dark frame. It takes the everyday ground at start-up.
// expo-system-ui is a native module: required in a try, so a dev client built
// before it was added (1 Oct 2026) keeps running without it.
try {
  if (Platform.OS !== 'web') require('expo-system-ui').setBackgroundColorAsync(ROLES[EVERYDAY].bg).catch(() => {})
} catch { /* not in this build yet */ }

// Windows Chromium (incl. Brave) renders color emoji but not country flags —
// the OS/browser combo just lacks the glyphs. Fixed with a unicode-range-
// scoped web font covering only flag codepoints (self-hosted, bundled as an
// asset — no third-party CDN request that Brave Shields or an ad-blocker
// could silently drop).
//
// NOT using the `country-flag-emoji-polyfill` package's own auto-detection:
// it decides whether to inject by drawing a flag emoji to a <canvas> and
// reading the pixels back to see if a real glyph rendered. Brave's anti-
// fingerprinting protection deliberately adds noise to canvas readbacks
// (exactly to defeat this kind of pixel-probing), which breaks the detector
// itself — it can conclude flags already work when they don't. The fix is
// unicode-range scoping, not conditional detection: injecting this
// unconditionally can't affect any other glyph, so there's no downside to
// just always applying it.
async function installFlagFont() {
  const asset = Asset.fromModule(require('../assets/fonts/TwemojiCountryFlags.woff2'))
  await asset.downloadAsync()
  const uri = asset.localUri ?? asset.uri
  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: "Twemoji Country Flags";
      unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067,
        U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F;
      src: url('${uri}') format('woff2');
      font-display: swap;
    }
    html, body, #root { font-family: "Twemoji Country Flags", -apple-system, sans-serif; }
  `
  document.head.appendChild(style)
}

// Web chrome (scrollbars, selection, focus ring). The same CSS is in
// +html.tsx for first paint, but that shell is only re-read on a dev-server
// restart — injecting here too makes it live immediately in dev. Guarded by id
// so it never doubles up.
function installWebChrome() {
  if (document.getElementById('pom-web-chrome')) return
  const style = document.createElement('style')
  style.id = 'pom-web-chrome'
  style.textContent = WEB_CHROME_CSS
  document.head.appendChild(style)
}

// Kit Drop faces (see `font` in src/theme.ts). Required one file at a time:
// importing a package's index would bundle every weight it ships.
const KIT_FONTS = {
  'Kit-Super':       require('@expo-google-fonts/barlow-condensed/900Black_Italic/BarlowCondensed_900Black_Italic.ttf'),
  'Kit-SuperPlain':  require('@expo-google-fonts/barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf'),
  'Kit-Tag':         require('@expo-google-fonts/martian-mono/500Medium/MartianMono_500Medium.ttf'),
  'Kit-TagBold':     require('@expo-google-fonts/martian-mono/700Bold/MartianMono_700Bold.ttf'),
  'Kit-Body':        require('@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf'),
  'Kit-BodyMedium':  require('@expo-google-fonts/archivo/500Medium/Archivo_500Medium.ttf'),
  'Kit-BodyBold':    require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
  'Kit-BodyBlack':   require('@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf'),
}

// Before any screen can navigate: see src/lib/navGuard.ts.
installNavGuard()
// P8-149: the run up to its kick-off is kept on the device as it's played.
startRunKeeper()
// P8.5-24: runs saved on the phone while offline go up now, whenever the app
// comes back online, and whenever it returns to the foreground.
flushSavedRuns()
onOnlineChange(() => { if (isOnline()) flushSavedRuns() })
AppState.addEventListener('change', st => { if (st === 'active') flushSavedRuns() })
// And once you're signed in: at start the session is restored a moment later,
// and a queued run only goes up under the player who played it.
useUserStore.subscribe((st, prev) => { if (st.user?.id && st.user.id !== prev.user?.id) flushSavedRuns() })
// P8.5-31: is there a newer build? Silently, in the background (public build only).
checkForAppUpdate()

export default function RootLayout() {
  const reduceMotion = useSettingsStore(st => st.reduceMotion)
  // Fonts are local files, so this resolves in a frame or two. A load error
  // still renders the app (on the system face) rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS)

  useEffect(() => {
    async function boot() {
      // getDb() alone guarantees the bundled db is copied/opened (native) or
      // deserialized (web) — every query module calls it independently too,
      // and they all share the same in-flight init, so this is just the
      // earliest of those calls, not a required first step. See db/setup.ts.
      //
      // Phase 6 (Lighthouse): NOT on web. There the db is a 10.6 MB download,
      // and fetching it at boot made it race the fonts and the code for the
      // first screen (28 s to first paint on a throttled phone). Home never
      // queries it; the first screen that does (Where you play) opens it then.
      initAuthListener()
      if (Platform.OS !== 'web') await getDb()
      await ensureGuestSession()

      if (Platform.OS === 'web') {
        // Warm the db once Home has painted, so starting a run doesn't wait on it.
        setTimeout(() => { getDb().catch(console.error) }, 2500)
        installWebChrome()
        installEscBack()
        installFlagFont().catch(console.error)
      }
    }
    boot().catch(console.error)
  }, [])

  // Phase 6 (docs/ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md §2): no frame cap at
  // all. The grounds and the rail run to the window's edges; each SCREEN caps
  // its own content (KitScreen's 'column' or 'wide' up to MAX_CONTENT,
  // WebColumn for the old screens). A 1440 frame here left dead bars either
  // side on a 1920 monitor, with the rail floating inside them.
  const webFrame = { flex: 1 }

  // Native: the fonts are local files, a frame or two away, so wait for them.
  // Web (Phase 6, Lighthouse): don't. The static HTML already holds the page,
  // and hiding it until nine font files arrived put first paint at 4.5 s on a
  // throttled phone; the text shows in the fallback face and swaps once loaded.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* P8-45: Settings' "Less motion" stills every spring and transition in
          the app; off, the phone's own setting decides, as before. */}
      {/* Mounted only when on: Reanimated warns every time the config mounts
          ("Reduced motion setting is overwritten with mode 'system'"), and with
          it off the phone's own setting is the default anyway. */}
      {reduceMotion && <ReducedMotionConfig mode={ReduceMotion.Always} />}
      {/* P8.5-25: the first frame matches the everyday ground; each KitScreen sets its own after. */}
      <StatusBar style={EVERYDAY === 'cotton' ? 'dark' : 'light'} />
      <PageMeta />
      {/* P8-179: visits and page speed, on the web only. */}
      <WebInsights />
      {/* transparent outer layer lets +html.tsx's page ground show beside the column */}
      {/* P8.5-25: the ground behind every screen (and behind the fade between
          two) is the everyday one, not the old #0A0E1A navy, which flashed dark
          between screens in light mode. */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : ROLES[EVERYDAY].bg }}>
        <View style={[{ backgroundColor: ROLES[EVERYDAY].bg }, webFrame]}>
          <OfflineStrip />
          <Stack screenOptions={{
            headerShown:  false,
            contentStyle: { backgroundColor: ROLES[EVERYDAY].bg },
            animation:    'fade',
          }} />
          {/* One tap, one screen: blocks taps while a navigation lands. */}
          <NavGuard />
          {/* P8.5-36: a new achievement, over every screen. */}
          <AchievementToast />
        </View>
      </View>
    </GestureHandlerRootView>
  )
}