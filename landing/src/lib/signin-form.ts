// The sign-in form (docs/website/11 §2), in two places: the top bar's sign-in
// on every page (the maintainer, 9 Oct 2026: "you should be able to log in at
// the home page itself") and /community/signin, where a link sends you.
import { h } from './dom'
import { signIn, configured } from './session'
import { GAME_URL } from '../i18n'
import type { CStrings } from '../community-i18n'

export const AUTH_KEYS = ['signIn', 'signOut', 'signInLine', 'username', 'password', 'show', 'hide', 'noAccount', 'noRecover',
  'wrong', 'tooMany', 'offline', 'notSetUp', 'signedInAs', 'close'] as const
export type AuthStrings = Pick<CStrings, (typeof AUTH_KEYS)[number]>

/** The form; `done` runs once you're signed in. `id` keeps two forms on one
 *  page apart (their labels point at their own fields). */
export function signInForm(S: AuthStrings, id: string, done: () => void) {
  const name = h('input', { id: `${id}-user`, class: 'field', name: 'username', autocomplete: 'username', required: true, maxlength: '38', autocapitalize: 'none', spellcheck: 'false' }) as HTMLInputElement
  const pass = h('input', { id: `${id}-pass`, class: 'field', name: 'password', type: 'password', autocomplete: 'current-password', required: true }) as HTMLInputElement
  const reveal = h('button', { type: 'button', class: 'plate quiet', 'aria-controls': `${id}-pass`, 'aria-pressed': 'false' }, S.show)
  reveal.addEventListener('click', () => {
    const shown = pass.type === 'password'
    pass.type = shown ? 'text' : 'password'
    reveal.textContent = shown ? S.hide : S.show
    reveal.setAttribute('aria-pressed', String(shown))
  })
  const err = h('p', { class: 'c-error', role: 'alert' }, configured ? '' : S.notSetUp)
  const go = h('button', { type: 'submit', class: 'plate primary' }, S.signIn) as HTMLButtonElement
  // method post: if the script ever failed mid-submit, the password would
  // never land in the address bar.
  const form = h('form', { class: 'c-form', method: 'post' },
    h('p', {}, S.signInLine),
    h('label', { for: `${id}-user`, class: 'tag' }, S.username), name,
    h('label', { for: `${id}-pass`, class: 'tag' }, S.password), h('div', { class: 'c-row' }, pass, reveal),
    err, go,
    h('p', { class: 'small' }, h('a', { href: GAME_URL }, `${S.noAccount} →`)),
    h('p', { class: 'muted small' }, S.noRecover))
  form.addEventListener('submit', async e => {
    e.preventDefault()
    if (!configured) return
    go.disabled = true; err.textContent = ''
    const r = await signIn(name.value, pass.value)
    go.disabled = false
    if (r === 'ok') return done()
    err.textContent = r === 'wrong' ? S.wrong : r === 'busy' ? S.tooMany : S.offline
    if (r === 'wrong') pass.select()
  })
  return { form, focus: () => name.focus() }
}
