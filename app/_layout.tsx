import { useEffect } from 'react'
import { View, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'
import { Asset } from 'expo-asset'
import { initBundledDb, getDb } from '@/db/setup'
import { initAuthListener } from '@/store/userStore'
import { ensureGuestSession } from '@/lib/auth'

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

export default function RootLayout() {
  useEffect(() => {
    async function boot() {
      await initBundledDb()
      await getDb()
      initAuthListener()
      await ensureGuestSession()

      if (Platform.OS === 'web') {
        installFlagFont().catch(console.error)
      }
    }
    boot().catch(console.error)
  }, [])

  // This is a mobile-first layout — on a wide desktop browser window it would
  // otherwise stretch full-bleed. Cap it to a phone-like column and center it,
  // same pattern most mobile-designed apps use when also shipped on web.
  const webFrame = Platform.OS === 'web'
    ? { maxWidth: 480, width: '100%' as const, alignSelf: 'center' as const, flex: 1 }
    : { flex: 1 }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
        <View style={[{ backgroundColor: '#0A0E1A' }, webFrame]}>
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