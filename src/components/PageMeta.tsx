import React from 'react'
import { Platform } from 'react-native'
import Head from 'expo-router/head'

// Per-route title, description and link preview (Phase 6). Rendered into each
// route's static HTML at export (`web.output: "static"`), so a pasted link
// shows a real title in WhatsApp and Discord. Native ignores it.
//
// Canonical URLs need the public domain, which isn't chosen yet: set
// EXPO_PUBLIC_SITE_URL (e.g. https://perfectionormisery.com) and they appear.
const SITE = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '')
const NAME = 'Perfection or Misery'
const DEFAULT_DESC = 'Draft an XI from random real club-seasons, get dropped into a league or cup, and find out: Perfection or Misery.'

export function PageMeta({ title, description = DEFAULT_DESC, path }: { title?: string; description?: string; path?: string }) {
  if (Platform.OS !== 'web') return null
  const full = title ? `${title} · ${NAME}` : NAME
  const url = SITE && path != null ? `${SITE}${path}` : undefined
  return (
    <Head>
      <title>{full}</title>
      <meta name="description" content={description} />
      <meta property="og:site_name" content={NAME} />
      <meta property="og:title" content={full} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      {SITE ? <meta property="og:image" content={`${SITE}/icon-512.png`} /> : null}
      <meta name="twitter:card" content="summary" />
      {url ? <link rel="canonical" href={url} /> : null}
      {url ? <meta property="og:url" content={url} /> : null}
    </Head>
  )
}
