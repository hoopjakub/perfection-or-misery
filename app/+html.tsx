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
`
