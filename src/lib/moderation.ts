import { supabase } from '@/lib/supabase'

// P8.5-44 · The app's side of supabase/moderation.sql. The database decides
// (a refused name raises BAD_WORD, whatever app sent it); this only says so
// in the player's language, files reports, and runs the moderator's inbox.

// What a refused name gets back. The maintainer, 1 Oct 2026: each language
// its own lines, not translations of each other ("A ty tu čo skúšaš, môj?"),
// and one picked at random so a second try doesn't read the same line.
// Only names are answered like this: chat is cleaned quietly, never told off.
const REFUSALS = {
  en: [
    'Nice try. Pick another one.',
    "The kit man won't print that on a shirt.",
    "That name's been sent off before it came on.",
    'The referee heard that. Something else?',
    "VAR had a look. It isn't going in.",
    'Your gran plays this game too, you know.',
    'Not on our pitch. Try another.',
    "Straight red. That one's not happening.",
  ],
  sk: [
    'A ty tu čo skúšaš, môj?',
    'Toto by ti ani mama na dres nevyšila.',
    'Rozhodca to počul. Skús niečo iné.',
    'Takto sa v šatni nehovorí.',
    'Pekný pokus. Ďalší, prosím.',
    'To by ani tréner nepovedal nahlas.',
    'Červená karta. Vymysli niečo slušnejšie.',
    'Fuj. Ešte raz, a pekne.',
  ],
}

// ponytail: the phone's language until Wave E adds the app's own setting;
// then read that here instead.
function lang(): 'en' | 'sk' {
  try { return /^(sk|cs)/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'sk' : 'en' } catch { return 'en' }
}

export function refusalLine(): string {
  const pool = REFUSALS[lang()]
  return pool[Math.floor(Math.random() * pool.length)]
}

const message = (e: unknown) => String((e as { message?: string })?.message ?? e)
export const isBadWord = (e: unknown) => /BAD_WORD/.test(message(e))
export const isBanned = (e: unknown) => /BANNED/.test(message(e))
export const BANNED_TEXT = 'This account has been banned.'

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
  { id: 'name', label: 'An offensive name' },
  { id: 'hate', label: 'Hate or slurs' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'cheating', label: 'Cheating' },
  { id: 'other', label: 'Something else' },
]

export async function report(type: 'player' | 'club', id: string, reason: ReportReason, details: string): Promise<void> {
  const { error } = await (supabase as any).rpc('report', { p_type: type, p_id: id, p_reason: reason, p_details: details.trim() || null })
  if (error) throw error
}

// ── The inbox (profiles.is_admin only; the database refuses anyone else) ─────
export type Flag = {
  id: number
  target_type: 'player' | 'club' | 'message'
  target_id: string
  text: string | null
  reason: string
  source: 'auto' | 'report'
  reports: number
  created_at: string
  details: string[]
}
export type FlagAction = 'dismiss' | 'rename' | 'ban' | 'close'

export async function fetchInbox(): Promise<Flag[]> {
  const { data, error } = await (supabase as any).rpc('mod_inbox')
  if (error) throw error
  return (data ?? []) as Flag[]
}

export async function actOnFlag(id: number, action: FlagAction): Promise<void> {
  const { error } = await (supabase as any).rpc('mod_act', { p_flag: id, p_action: action })
  if (error) throw error
}
