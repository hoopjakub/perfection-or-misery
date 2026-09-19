import { useEffect } from 'react'
import { View, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { Asset } from 'expo-asset'
import { getDb } from '@/db/setup'
import { initAuthListener } from '@/store/userStore'
import { ensureGuestSession } from '@/lib/auth'
import { useFonts } from 'expo-font'
import { MAX_CONTENT } from '@/hooks/useSizeClass'
import { PageMeta } from '@/components/PageMeta'
import { OfflineStrip } from '@/components/OfflineStrip'
import { installEscBack } from '@/lib/webKeys'
import { StatusBar } from 'expo-status-bar'
import { WEB_CHROME_CSS } from '@/lib/webChrome'

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

export default function RootLayout() {
  // Fonts are local files, so this resolves in a frame or two. A load error
  // still renders the app (on the system face) rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS)

  useEffect(() => {
    async function boot() {
      // getDb() alone guarantees the bundled db is copied/opened (native) or
      // deserialized (web) — every query module calls it independently too,
      // and they all share the same in-flight init, so this is just the
      // earliest of those calls, not a required first step. See db/setup.ts.
      await getDb()
      initAuthListener()
      await ensureGuestSession()

      if (Platform.OS === 'web') {
        installWebChrome()
        installEscBack()
        installFlagFont().catch(console.error)
      }
    }
    boot().catch(console.error)
  }, [])

  // Phase 6 (docs/ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md §2): the old 480px
  // phone column is gone. The frame now only stops at MAX_CONTENT on very
  // wide monitors; each screen decides its own width (KitScreen's 'column'
  // or 'wide', WebColumn for the old screens), and from 1024px the tabs turn
  // into the left rail, which the 480 cap made impossible.
  const webFrame = Platform.OS === 'web'
    ? { maxWidth: MAX_CONTENT, width: '100%' as const, alignSelf: 'center' as const, flex: 1 }
    : { flex: 1 }

  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <PageMeta />
      {/* transparent outer layer lets +html.tsx's page ground show beside the column */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#0A0E1A' }}>
        <View style={[{ backgroundColor: '#0A0E1A' }, webFrame]}>
          <OfflineStrip />
          <Stack screenOptions={{
            headerShown:  false,
            contentStyle: { backgroundColor: '#0A0E1A' },
            animation:    'fade',
          }} />
        </View>
      </View>
    </GestureHandlerRootView>
  )
}