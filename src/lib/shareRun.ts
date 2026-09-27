import { Platform, Share } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'

// D11 — the share label. Native captures the verdict card itself and shares
// the image, because a screenshot is what actually gets sent to a group chat.
// Web has no expo-sharing: it uses the browser's own share sheet when there is
// one, and falls back to the clipboard.
export type ShareResult = 'shared' | 'copied' | 'unavailable'

export async function shareRunLabel(view: React.Component | null, text: string, capture?: { width?: number }): Promise<ShareResult> {
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as (Navigator & { share?: (d: { text: string }) => Promise<void> }) | undefined
      if (nav?.share) { await nav.share({ text }); return 'shared' }
      if (nav?.clipboard) { await nav.clipboard.writeText(text); return 'copied' }
      return 'unavailable'
    }
    if (!view || !(await Sharing.isAvailableAsync())) return 'unavailable'
    // `width` renders the capture at that many pixels across, whatever the
    // screen's density — a share card made for 1080 wide stays sharp (P8-69).
    const uri = await captureRef(view, { format: 'png', quality: 0.95, ...(capture?.width ? { width: capture.width } : {}) })
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: text })
    return 'shared'
  } catch (e) {
    console.warn('[share] failed:', e)
    return 'unavailable'
  }
}

/**
 * P8-121: the run's link, shared as text. A phone's share sheet takes a file
 * OR text, not both: the picture went through expo-sharing, which shares the
 * file alone, and the link rode along as the sheet's title, so it never
 * reached anyone. So the link is its own share, through the system sheet
 * (React Native's Share, text only), and the browser's sheet or the clipboard
 * on the web.
 */
export async function shareRunLink(text: string, link: string): Promise<ShareResult> {
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as (Navigator & { share?: (d: { text?: string; url?: string }) => Promise<void> }) | undefined
      if (nav?.share) { await nav.share({ text, url: link }); return 'shared' }
      if (nav?.clipboard) { await nav.clipboard.writeText(`${text} ${link}`); return 'copied' }
      return 'unavailable'
    }
    await Share.share({ message: `${text} ${link}` })
    return 'shared'
  } catch (e) {
    console.warn('[share] link failed:', e)
    return 'unavailable'
  }
}

/**
 * A run's public link (/r/<id>, served by api/r.ts with the verdict in its
 * preview), or null when there's no site URL or the run was never saved
 * (guests, or a save that hasn't landed yet).
 */
export function runLink(runId: string | null | undefined): string | null {
  const site = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '')
  return site && runId ? `${site}/r/${runId}` : null
}
