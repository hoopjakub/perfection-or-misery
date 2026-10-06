import { supabase } from '@/lib/supabase'
import { t } from '@/i18n'
import { en } from '@/i18n/en'

// P8.5-44 · The app's side of supabase/moderation.sql. The database decides
// (a refused name raises BAD_WORD, whatever app sent it); this only says so
// in the player's language and files reports. The inbox that reads the
// reports is the website's (docs/website/02 §5a), not the app's.

// What a refused name gets back: one of the lines in moderation.refusals
// (src/i18n), at random, so a second try doesn't read the same line. The
// maintainer, 1 Oct 2026: each language its own lines, not translations of
// each other ("A ty tu čo skúšaš, môj?"). Only names are answered like this:
// chat is cleaned quietly, never told off.
const REFUSAL_KEYS = Object.keys(en.moderation.refusals) as (keyof typeof en.moderation.refusals)[]

export function refusalLine(): string {
  return t(`moderation.refusals.${REFUSAL_KEYS[Math.floor(Math.random() * REFUSAL_KEYS.length)]}`)
}

const message = (e: unknown) => String((e as { message?: string })?.message ?? e)
export const isBadWord = (e: unknown) => /BAD_WORD/.test(message(e))
export const isBanned = (e: unknown) => /BANNED/.test(message(e))
export const bannedText = () => t('moderation.banned')

/** Asks before a name is used anywhere it can't be taken back (an account's
 *  sign-in name). 'ok' too when moderation.sql hasn't run yet: the database
 *  checks again on save either way. */
export async function checkName(text: string): Promise<'ok' | 'review' | 'blocked'> {
  const { data, error } = await (supabase as any).rpc('check_name', { p_text: text })
  if (error) return 'ok'
  return data === 'blocked' || data === 'review' ? data : 'ok'
}

// ── Reports ──────────────────────────────────────────────────────────────────
export type ReportReason = 'name' | 'hate' | 'harassment' | 'cheating' | 'other'
export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'name', label: t('moderation.reasonName') },
  { id: 'hate', label: t('moderation.reasonHate') },
  { id: 'harassment', label: t('moderation.reasonHarassment') },
  { id: 'cheating', label: t('moderation.reasonCheating') },
  { id: 'other', label: t('moderation.reasonOther') },
]

export async function report(type: 'player' | 'club', id: string, reason: ReportReason, details: string): Promise<void> {
  const { error } = await (supabase as any).rpc('report', { p_type: type, p_id: id, p_reason: reason, p_details: details.trim() || null })
  if (error) throw error
}
