import { Platform } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'

// D11 — the share label. Native captures the verdict card itself and shares
// the image, because a screenshot is what actually gets sent to a group chat.
// Web has no expo-sharing: it uses the browser's own share sheet when there is
// one, and falls back to the clipboard.
export type ShareResult = 'shared' | 'copied' | 'unavailable'

export async function shareRunLabel(view: React.Component | null, text: string): Promise<ShareResult> {
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as (Navigator & { share?: (d: { text: string }) => Promise<void> }) | undefined
      if (nav?.share) { await nav.share({ text }); return 'shared' }
      if (nav?.clipboard) { await nav.clipboard.writeText(text); return 'copied' }
      return 'unavailable'
    }
    if (!view || !(await Sharing.isAvailableAsync())) return 'unavailable'
    const uri = await captureRef(view, { format: 'png', quality: 0.95 })
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: text })
    return 'shared'
  } catch (e) {
    console.warn('[share] failed:', e)
    return 'unavailable'
  }
}
