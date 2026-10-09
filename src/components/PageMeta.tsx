import React from 'react'
import { t } from '@/i18n'
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
const DEFAULT_DESC = t('common.pageDescription')

export function PageMeta({ title, description = DEFAULT_DESC, path, jsonLd }: { title?: string; description?: string; path?: string; jsonLd?: object }) {
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
      {/* Phase 10 (step 1a): the designed 1200 × 630 card from the new logo
          (public/og.png, scripts/brand-logo.cjs), not the square icon. */}
      {SITE ? <meta property="og:image" content={`${SITE}/og.png`} /> : null}
      {SITE ? <meta property="og:image:width" content="1200" /> : null}
      {SITE ? <meta property="og:image:height" content="630" /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      {url ? <link rel="canonical" href={url} /> : null}
      {url ? <meta property="og:url" content={url} /> : null}
      {jsonLd ? <script type="application/ld+json">{JSON.stringify(jsonLd)}</script> : null}
    </Head>
  )
}

/** Structured data for the home page: the game itself, for search results. */
export const GAME_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: NAME,
  description: DEFAULT_DESC,
  genre: ['Sports', 'Football management', 'Roguelike'],
  gamePlatform: ['Web browser', 'Android'],
  applicationCategory: 'Game',
  operatingSystem: 'Android, Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  ...(SITE ? { url: SITE } : {}),
}
