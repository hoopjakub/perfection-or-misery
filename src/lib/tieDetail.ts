import { t } from '@/i18n'
import type { StageTie } from '@/engine/stages'

/**
 * The line under a tie, the same everywhere (L-06 / C-04): each leg from side
 * A's view (A sits on the left of every row), then extra time and the
 * shootout, in the app's language. Seven places used to write it, in English,
 * three different ways (the last was the live bracket, centralisation step 5).
 * Kept out of the components so a verifier can read it.
 */
export function tieDetail(tie: StageTie): string | undefined {
  const parts = tie.legs ? tie.legs.map(l => `${l.a}–${l.b}`) : []
  if (tie.extraTime) parts.push(t('hub.aet'))
  if (tie.shootout) parts.push(tie.pens ? t('hub.pensScore', { a: tie.pens.a, b: tie.pens.b }) : t('hub.pens'))
  return parts.join(' · ') || undefined
}

