// The top bar's account corner, on every page: Sign in (a dialog over the
// page you're on, so you never leave it) or your name and Sign out.
import { h } from '../lib/dom'
import { session, signOut, username } from '../lib/session'
import { signInForm, type AuthStrings } from '../lib/signin-form'

const slot = document.querySelector<HTMLElement>('[data-who]')
const S = JSON.parse(document.getElementById('auth-strings')?.textContent ?? '{}') as AuthStrings

if (slot && S.signIn) {
  if (session()) {
    const out = h('button', { type: 'button', class: 'plate quiet' }, S.signOut)
    out.addEventListener('click', async () => { await signOut(); location.reload() })
    slot.replaceChildren(h('span', { class: 'tag who-name', title: S.signedInAs }, username() ?? ''), out)
  } else if (!location.pathname.endsWith('/signin')) {
    // <dialog> gives the focus trap, Escape and the backdrop for free.
    const dialog = h('dialog', { class: 'signin-dialog', 'aria-labelledby': 'hd-title' }) as HTMLDialogElement
    const close = h('button', { type: 'button', class: 'plate quiet', 'aria-label': S.close }, '✕')
    close.addEventListener('click', () => dialog.close())
    // Signed in: reload, so the page you're on shows you as signed in.
    const { form, focus } = signInForm(S, 'hd', () => location.reload())
    dialog.append(h('div', { class: 'c-row spread' }, h('h2', { id: 'hd-title', class: 'super signin-title' }, S.signIn), close), form)
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close() })   // a click on the backdrop
    document.body.append(dialog)
    const open = h('button', { type: 'button', class: 'plate quiet' }, S.signIn)
    open.addEventListener('click', () => { dialog.showModal(); focus() })
    slot.replaceChildren(open)
  }
}
