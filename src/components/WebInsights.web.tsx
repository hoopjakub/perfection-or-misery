import React from 'react'
import { usePathname, useSegments } from 'expo-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

// P8-179: Vercel's Web Analytics (visits and page views, cookie-free) and
// Speed Insights (Core Web Vitals from real visitors), on the web build only:
// neither package runs on a phone, so the native build gets the empty twin
// (WebInsights.tsx) and never bundles them. Both show in the Vercel project's
// dashboard once they're enabled there (Analytics, Speed Insights tabs).
//
// Pages are grouped by route, not by address: /u/<id> and /r/<id> are one
// page each in the dashboard ("/u/[id]"), not one per player or run. And the
// query string never leaves: /game/result?runId=… is sent as /game/result.
// Vercel hands its scripts' addresses (its "resilient intake") to the build
// as VERCEL_OBSERVABILITY_CLIENT_CONFIG, which the packages look for under a
// framework's prefix (REACT_APP_…) that Expo doesn't inline. vercel.json's
// build command passes it on as EXPO_PUBLIC_…; without it (a local build) the
// packages load the standard /_vercel/… scripts instead.
const config = process.env.EXPO_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG || undefined

const stripQuery = <T extends { url: string }>(e: T): T => ({ ...e, url: e.url.split('?')[0] })

export function WebInsights() {
  const path = usePathname()
  // expo-router's segments, less its groups: ['(tabs)', 'leaderboard'] → /leaderboard.
  const route = '/' + useSegments().filter(s => !s.startsWith('(')).join('/')
  return (
    <>
      <Analytics route={route} path={path} beforeSend={stripQuery} debug={false} configString={config} />
      <SpeedInsights route={route} beforeSend={stripQuery} debug={false} configString={config} />
    </>
  )
}
