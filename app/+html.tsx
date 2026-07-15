import { ScrollViewStyleReset } from 'expo-router/html'

// Expo Router's web root document shell. Two real bugs this fixes:
//
// 1. Without `html, body, #root { height: 100% }`, RN's `flex: 1` on the
//    mounted app has no percentage basis to size against — the app can end
//    up shorter than the actual browser viewport, leaving a gap where
//    whatever's behind the page (OS wallpaper, browser chrome) shows through
//    instead of the app's own background.
// 2. Setting `background-color` here (not just on a React-rendered View)
//    means the raw page is dark from the very first paint, before React even
//    mounts — no flash of default/white background either.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: htmlStyle }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

const htmlStyle = `
  html, body, #root { height: 100%; margin: 0; padding: 0; background-color: #0A0E1A; }

  /* Ambient desktop backdrop — the phone-width column floats on a subtle
     stadium-lights wash instead of a flat void. Pure decoration behind #root's
     transparent margins; costs nothing on mobile (gradients sit under the app). */
  body {
    background-image:
      radial-gradient(1200px 700px at 15% -10%, rgba(59, 130, 246, 0.10), transparent 60%),
      radial-gradient(1000px 600px at 85% 110%, rgba(239, 68, 68, 0.07), transparent 60%),
      radial-gradient(800px 500px at 50% 50%, rgba(255, 255, 255, 0.02), transparent 70%);
    background-attachment: fixed;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Thin dark scrollbars — default chrome scrollbars scream "unfinished" on a
     dark app. Firefox first, then WebKit. */
  * { scrollbar-width: thin; scrollbar-color: #374151 transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
  *::-webkit-scrollbar-thumb:hover { background: #4B5563; }

  /* Brand-colored text selection */
  ::selection { background: rgba(59, 130, 246, 0.45); color: #F9FAFB; }

  /* Keyboard-visible focus ring without polluting mouse clicks */
  :focus { outline: none; }
  :focus-visible { outline: 2px solid #3B82F6; outline-offset: 2px; border-radius: 4px; }

  /* Interactive RN-web elements get a real pointer + snappy color transitions */
  [role="button"], [tabindex="0"], a { cursor: pointer; }
  [role="button"] { transition: opacity 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 120ms ease; }
`
