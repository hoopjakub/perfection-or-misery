// The website's community, from the app (docs/website 05 step 8): the row on
// You, and the question notices (type 'qa', written by supabase/qa.sql's
// qa_notify) that open the question on the site. The site is its own address
// (perfection-or-misery-website, not the game's), in the app's language.
import { Linking } from 'react-native'
import { LANGUAGE, t } from '@/i18n'
import { log } from '@/diag/log'

export const WEBSITE = (process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://perfection-or-misery-website.vercel.app').replace(/\/$/, '')

/** A community page's address: '' is the updates, '/question?id=…' one question. */
export const communityUrl = (path = '') => `${WEBSITE}${LANGUAGE === 'sk' ? '/sk' : ''}/community${path}`

export function openCommunity(path = '') {
  Linking.openURL(communityUrl(path)).catch(e => log.warn('app', 'community: could not open the site', String(e)))
}

/** A question notice's question, or null for any other notice. */
export const questionOf = (n: { type: string; payload: { questionId?: unknown } }) =>
  n.type === 'qa' && typeof n.payload.questionId === 'string' && /^[0-9a-f-]{36}$/i.test(n.payload.questionId) ? n.payload.questionId : null

/** What a question notice says, by what happened (qa_notify's kinds). */
export function questionNoticeLine(kind: string | undefined): string {
  switch (kind) {
    case 'seen': return t('friends.qa.seen')
    case 'planned': return t('friends.qa.planned')
    case 'answered': return t('friends.qa.answered')
    case 'declined': return t('friends.qa.declined')
    case 'duplicate': return t('friends.qa.duplicate')
    case 'conversation': return t('friends.qa.conversation')
    case 'message': return t('friends.qa.message')
    default: return t('friends.qa.other')
  }
}
