import { ScrollViewStyleReset } from 'expo-router/html'
import { WEB_CHROME_CSS } from '@/lib/webChrome'

// Expo Router's web root document shell. Two real bugs this fixes:
//
// 1. Without `html, body, #root { height: 100% }`, RN's `flex: 1` on the
//    mounted app has no percentage basis to size against — the app can end
//    up shorter than the actual browser viewport, leaving a gap where
//    whatever's behind the page (OS wallpaper, browser chrome) shows through
//    instead of the app's own background.
// 2. Setting `background-color` here (not just on a React-rendered View)
//    means the raw page has its ground from the very first paint, before React even
//    mounts — no flash of default/white background either.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#141416" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: htmlStyle }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

const htmlStyle = WEB_CHROME_CSS
