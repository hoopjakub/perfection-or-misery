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

// Web chrome (scrollbars, selection, ambient backdrop, focus rings). The same
// rules live in +html.tsx for first-paint, but that shell is only re-read on a
// dev-server restart — injecting here too makes the styles live immediately in
// dev and belt-and-braces in production. Guarded by id so it never doubles up.
function installWebChrome() {
  if (document.getElementById('pom-web-chrome')) return
  const style = document.createElement('style')
  style.id = 'pom-web-chrome'
  style.textContent = `
    body {
      background-image:
        radial-gradient(1200px 700px at 15% -10%, rgba(59, 130, 246, 0.10), transparent 60%),
        radial-gradient(1000px 600px at 85% 110%, rgba(239, 68, 68, 0.07), transparent 60%),
        radial-gradient(800px 500px at 50% 50%, rgba(255, 255, 255, 0.02), transparent 70%);
      background-attachment: fixed;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    * { scrollbar-width: thin; scrollbar-color: #374151 transparent; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
    *::-webkit-scrollbar-thumb:hover { background: #4B5563; }
    ::selection { background: rgba(59, 130, 246, 0.45); color: #F9FAFB; }
    :focus { outline: none; }
    :focus-visible { outline: 2px solid #3B82F6; outline-offset: 2px; border-radius: 4px; }
    [role="button"], [tabindex="0"], a { cursor: pointer; }
    [role="button"] { transition: opacity 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 120ms ease; }
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
        installWebChrome()
        installFlagFont().catch(console.error)
      }
    }
    boot().catch(console.error)
  }, [])

  // This is a mobile-first layout — on a wide desktop browser window it would
  // otherwise stretch full-bleed. Cap it to a phone-like column and center it,
  // and give the column hairline edges + a soft glow so on PC it reads as a
  // deliberate device frame sitting on the ambient backdrop (painted by
  // +html.tsx), not a stretched mobile site.
  const webFrame = Platform.OS === 'web'
    ? {
        maxWidth: 480, width: '100%' as const, alignSelf: 'center' as const, flex: 1,
        borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#1F2937',
        // @ts-ignore — web-only CSS shadow (RN types don't know boxShadow)
        boxShadow: '0 0 80px rgba(59, 130, 246, 0.10), 0 0 24px rgba(0, 0, 0, 0.60)',
      }
    : { flex: 1 }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* transparent outer layer lets +html.tsx's ambient gradients show on PC */}
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#0A0E1A' }}>
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