// The admin page's shell (docs/website/03 §3.3, §4): sign in, the second
// factor, and only then the admin screens. In order:
//   1. the password (the game's account, as everywhere on the site);
//   2. is this the admin's account? (site_is_admin_account(), about yourself
//      only). If not: "Nothing here", signed out. A player who finds the
//      address isn't walked into enrolling an authenticator;
//   3. the authenticator: enrol it the first time (a QR code), then a code
//      every sign-in. The project ends a first-level session of an account
//      with a factor after 15 minutes (07 D8), so the code comes straight away;
//   4. site_is_admin() at the second level, then the screens, fetched now.
// English only: the one reader is the maintainer.
import { h } from '../lib/dom'
import { scope, session, signIn, signOut, rpc, claims, authCall, adopt, configured, type TokenReply } from '../lib/session'

scope('pom-site-admin')
const title = document.querySelector<HTMLElement>('.admin-title')!
const body = document.querySelector<HTMLElement>('[data-admin-body]')!
const show = (heading: string, ...kids: (Node | string)[]) => { title.textContent = heading; body.replaceChildren(...kids) }
const err = () => h('p', { class: 'c-error', role: 'alert' })

async function nothing() {
  await signOut()
  show('Nothing here', h('p', { class: 'muted' }, 'This page isn’t for this account.'), h('p', {}, h('a', { href: '/' }, 'Back to the front page')))
}

function password() {
  const name = h('input', { id: 'a-user', class: 'field', autocomplete: 'username', required: true, autocapitalize: 'none', spellcheck: 'false' }) as HTMLInputElement
  const pass = h('input', { id: 'a-pass', class: 'field', type: 'password', autocomplete: 'current-password', required: true }) as HTMLInputElement
  const e = err()
  const go = h('button', { type: 'submit', class: 'plate primary' }, 'Sign in') as HTMLButtonElement
  const form = h('form', { class: 'c-form', method: 'post' },
    h('label', { for: 'a-user', class: 'tag' }, 'Username'), name, h('label', { for: 'a-pass', class: 'tag' }, 'Password'), pass, e, go)
  form.addEventListener('submit', async ev => {
    ev.preventDefault()
    go.disabled = true; e.textContent = ''
    const r = await signIn(name.value, pass.value)
    go.disabled = false
    if (r !== 'ok') { e.textContent = r === 'wrong' ? 'That username and password don’t match.' : r === 'busy' ? 'Too many tries. Wait a few minutes.' : 'Couldn’t reach the server.'; return }
    pass.value = ''
    next()
  })
  show('Sign in', form)
  name.focus()
}

type Factor = { id: string; factor_type: string; status: 'verified' | 'unverified' }

async function secondFactor() {
  const u = await authCall('user', 'GET')
  if (!u.ok) { await signOut(); return password() }
  const factors = (((await u.json()) as { factors?: Factor[] }).factors ?? []).filter(f => f.factor_type === 'totp')
  let factor = factors.find(f => f.status === 'verified')
  let enrol: Node | null = null
  if (!factor) {
    // First time: clear any half-finished enrolment, then a new one.
    for (const f of factors) await authCall(`factors/${f.id}`, 'DELETE')
    const r = await authCall('factors', 'POST', { factor_type: 'totp', friendly_name: `site ${new Date().toISOString().slice(0, 10)}` })
    if (!r.ok) return show('Authenticator', h('p', { class: 'c-error' }, 'Couldn’t start the authenticator set-up. Reload and try again.'))
    const j = (await r.json()) as { id: string; totp: { qr_code: string; secret: string } }
    factor = { id: j.id, factor_type: 'totp', status: 'unverified' }
    enrol = h('div', { class: 'admin-enrol' },
      h('p', {}, 'Scan this with your authenticator app once. Keep it only there.'),
      h('img', { src: j.totp.qr_code, alt: 'The authenticator QR code', width: '200', height: '200', class: 'admin-qr' }),
      h('details', {}, h('summary', { class: 'tag' }, 'Can’t scan? Type the key'), h('code', { class: 'admin-secret' }, j.totp.secret)))
  }
  const code = h('input', { id: 'a-code', class: 'field', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: '6', required: true }) as HTMLInputElement
  const e = err()
  const go = h('button', { type: 'submit', class: 'plate primary' }, 'Verify') as HTMLButtonElement
  const form = h('form', { class: 'c-form' }, h('label', { for: 'a-code', class: 'tag' }, 'The six-digit code'), code, e, go)
  const id = factor.id
  form.addEventListener('submit', async ev => {
    ev.preventDefault()
    go.disabled = true; e.textContent = ''
    const c = await authCall(`factors/${id}/challenge`, 'POST', {})
    const ch = c.ok ? ((await c.json()) as { id: string }) : null
    const v = ch ? await authCall(`factors/${id}/verify`, 'POST', { challenge_id: ch.id, code: code.value.trim() }) : null
    go.disabled = false
    if (!v?.ok) { e.textContent = v?.status === 429 ? 'Too many tries. Wait a minute.' : 'That code didn’t work. Try the next one.'; code.select(); return }
    adopt((await v.json()) as TokenReply)
    next()
  })
  show('Authenticator', ...(enrol ? [enrol] : []), form)
  code.focus()
}

async function next() {
  if (!configured) return show('Not set up', h('p', {}, 'The site has no Supabase settings.'))
  if (!session()) return password()
  const mine = await rpc<boolean>('site_is_admin_account')
  if (mine.error === 'SIGNED_OUT') return password()
  if (mine.error !== undefined) return show('Sign in', h('p', { class: 'c-error' }, `Couldn’t check the account (${mine.error}). Reload to try again.`))
  if (!mine.data) return nothing()
  if (claims().aal !== 'aal2') return secondFactor()
  const admin = await rpc<boolean>('site_is_admin')
  if (!admin.data) return nothing()
  title.textContent = 'Admin'
  // The screens, fetched only now (03 §4 "the bundle").
  const ui = await import('./admin-ui')
  ui.mount(body, async () => { await signOut(); password() })
}

next()
