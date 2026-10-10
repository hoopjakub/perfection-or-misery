// The latest Android build (docs/website/11 §3, 07 F3): the game's own
// /latest.json, the record the app checks for updates (src/lib/appUpdate.ts),
// written by scripts/release-latest.ts. Read at build (the page as built) and
// again in the browser (a release shows without redeploying the site).
import { GAME_URL } from '../i18n'

export const LATEST_URL = `${GAME_URL}/latest.json`
export type Release = { version: string; build: number; url: string; sha256: string; notes?: string; size?: number; released?: string }

// The same shape check as the app's isLatest: a record that fails it is no
// release at all, never a broken button.
export function asRelease(x: unknown): Release | null {
  const r = x as Release
  return r && typeof r.version === 'string' && Number.isInteger(r.build) && typeof r.url === 'string'
    && /^https:\/\//.test(r.url) && /^[0-9a-f]{64}$/i.test(r.sha256 ?? '') ? r : null
}

/** The record, null when there's no release yet, 'unreachable' when it couldn't be read. */
export async function readRelease(): Promise<Release | null | 'unreachable'> {
  try {
    const res = await fetch(LATEST_URL, { headers: { 'Cache-Control': 'no-cache' } })
    if (res.status === 404) return null
    if (!res.ok) return 'unreachable'
    // The game's web build answers an unknown path with its app page (200,
    // HTML): no file yet means no release, not a fault.
    return asRelease(await res.json().catch(() => null))
  } catch { return 'unreachable' }
}

export const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(0)} MB`
