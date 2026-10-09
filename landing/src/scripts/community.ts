// The community pages' script (docs/website/02 §6–7, 11 §2, §4). One file for
// all six pages; the page is named on the root element. Everything a player
// or the database wrote goes in through textContent, never as HTML.
import { rpc, session, configured } from '../lib/session'
import { h, fill, type Kid } from '../lib/dom'
import { signInForm } from '../lib/signin-form'
import type { CStrings } from '../community-i18n'

const root = document.querySelector<HTMLElement>('[data-c-root]')!
const body = root.querySelector<HTMLElement>('[data-c-body]')!
const page = root.dataset.page ?? ''
const lang = root.dataset.lang === 'sk' ? 'sk' : 'en'
const BASE = root.dataset.base ?? '/community'
const S = JSON.parse(document.getElementById('c-strings')!.textContent!) as CStrings
const params = new URLSearchParams(location.search)

// ── Small helpers ───────────────────────────────────────────────────────────
const show = (...kids: Kid[]) => body.replaceChildren(...kids.filter(Boolean) as (Node | string)[])
const note = (text: string, cls = 'c-note') => h('p', { class: cls }, text)
const fmtDate = (iso: string) => new Intl.DateTimeFormat(lang === 'sk' ? 'sk-SK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
const fmtWait = (secs: number) => {
  const m = Math.max(1, Math.ceil(secs / 60))
  return m < 60 ? fill(S.minutes, { n: m }) : fill(S.hours, { h: Math.floor(m / 60), m: m % 60 })
}
const here = () => location.pathname + location.search
const signInHref = (next = here()) => `${BASE}/signin?next=${encodeURIComponent(next)}`
const plate = (href: string, text: string, kind = 'primary') => h('a', { class: `plate ${kind}`, href }, text, h('span', { 'aria-hidden': 'true' }, '→'))
// A database error as the player reads it: the rule's own line, or a fallback.
const said = (code: string, n?: number, fallback = S.loadFailed) => {
  if (code === 'OFFLINE') return S.offline
  if (code === 'COOLDOWN') return fill(S.COOLDOWN, { n: fmtWait(n ?? 60) })
  const line = (S as unknown as Record<string, string>)[code]
  return typeof line === 'string' && /^[A-Z_]+$/.test(code) ? line : fallback
}
const statusTag = (st: keyof CStrings['status']) => h('span', { class: `tag st st-${st}` }, S.status[st][0])

// ── Updates ─────────────────────────────────────────────────────────────────
type Update = { id: string; title: string; body: string; created_at: string; edited_at: string | null }
async function updates() {
  const r = await rpc<Update[]>('qa_updates_list', { p_limit: 50 })
  if (r.error !== undefined) return show(note(said(r.error)))
  show(
    r.data.length ? h('div', { class: 'c-list' }, ...r.data.map(u => h('article', { class: 'c-item', id: `u-${u.id}` },
      h('p', { class: 'tag muted' }, fmtDate(u.created_at)),
      h('h2', { class: 'c-head' }, u.title),
      h('p', { class: 'c-text' }, u.body)))) : note(S.noUpdates),
    h('div', { class: 'c-actions' }, plate(`${BASE}/ask`, S.ask)),
  )
}

// ── The public Q&A and its search (02 §7) ───────────────────────────────────
type Published = { id: string; question: string; answer: string; answered_at: string }
const qaItem = (q: Published, link = true) => h('article', { class: 'c-item' },
  h('p', { class: 'c-question' }, link ? h('a', { href: `${BASE}/question?id=${q.id}` }, q.question) : q.question),
  h('p', { class: 'tag muted' }, `${S.answer} · ${fmtDate(q.answered_at)}`),
  h('p', { class: 'c-answer' }, q.answer))

async function questions() {
  const q = (params.get('q') ?? '').trim()
  const input = h('input', { type: 'search', name: 'q', id: 'c-q', class: 'field', placeholder: S.searchPlaceholder, maxlength: '200', value: q, autocomplete: 'off' })
  const form = h('form', { class: 'c-search', role: 'search', action: `${BASE}/questions` },
    h('label', { for: 'c-q', class: 'tag' }, S.searchLabel),
    h('div', { class: 'c-row' }, input, h('button', { type: 'submit', class: 'plate quiet' }, S.search)))
  show(form, note(S.loading, 'muted'))
  const r = q ? await rpc<Published[]>('qa_search', { p_text: q }) : await rpc<Published[]>('qa_published', { p_limit: 50 })
  if (r.error !== undefined) return show(form, note(said(r.error)))
  // Nothing found: the search becomes the question (its first 100 characters).
  const ask = `${BASE}/ask${q ? `?q=${encodeURIComponent(q.slice(0, 100))}` : ''}`
  show(form,
    r.data.length ? h('div', { class: 'c-list' }, ...r.data.map(x => qaItem(x))) : q ? h('p', { class: 'c-note' }, h('a', { href: ask }, S.noMatch)) : note(S.noQuestions),
    h('div', { class: 'c-actions' }, plate(ask, S.ask)))
}

// ── Asking (02 §6) ──────────────────────────────────────────────────────────
type CanAsk = { state: string; seconds: number | null; activeId: string | null; minLen: number; maxLen: number; editCooldown: number }
async function ask(): Promise<unknown> {
  const pre = (params.get('q') ?? '').slice(0, 100)
  if (!session()) return show(note(S.signedOut), h('div', { class: 'c-actions' }, plate(signInHref(), S.signIn)))
  const r = await rpc<CanAsk>('qa_can_ask')
  if (r.error !== undefined) return r.error === 'SIGNED_OUT' ? ask() : show(note(said(r.error)))
  const c = r.data
  if (c.state === 'ACTIVE_QUESTION') return show(note(S.ACTIVE_QUESTION), h('div', { class: 'c-actions' }, plate(`${BASE}/question?id=${c.activeId}`, S.openYours)))
  if (c.state !== 'OK') return show(note(said(c.state, c.seconds ?? undefined)), h('div', { class: 'c-actions' }, plate(`${BASE}/mine`, S.mine, 'secondary')))

  const text = h('textarea', { id: 'c-text', class: 'field', rows: '6', maxlength: String(c.maxLen), placeholder: S.placeholder, required: true }) as HTMLTextAreaElement
  text.value = pre
  const count = h('span', { class: 'tag muted' })
  const recount = () => (count.textContent = fill(S.counter, { n: text.value.length, max: c.maxLen }))
  recount(); text.addEventListener('input', recount)
  const radio = (v: string, label: string, checked: boolean) => h('label', { class: 'c-radio' }, h('input', { type: 'radio', name: 'vis', value: v, checked }), label)
  const err = h('p', { class: 'c-error', role: 'alert' })
  const send = h('button', { type: 'submit', class: 'plate primary' }, S.send) as HTMLButtonElement
  const form = h('form', { class: 'c-form' },
    h('p', {}, S.askLine),
    h('label', { for: 'c-text', class: 'sr-only' }, S.askTitle), text,
    h('div', { class: 'c-row spread' }, count, h('fieldset', { class: 'c-vis' }, h('legend', { class: 'sr-only' }, S.visibilityLine), radio('public', S.public, false), radio('private', S.private, true))),
    h('p', { class: 'muted small' }, S.visibilityLine),
    h('p', { class: 'muted small' }, S.age),
    err, send)
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const v = text.value.trim()
    if (v.length < c.minLen) { err.textContent = fill(S.TOO_SHORT, { n: c.minLen }); return }
    send.disabled = true; send.textContent = S.sending; err.textContent = ''
    const pub = (form.querySelector('input[name=vis]:checked') as HTMLInputElement | null)?.value === 'public'
    const res = await rpc<string>('qa_ask', { p_body: v, p_public: pub })
    if (res.data) { location.href = `${BASE}/question?id=${res.data}`; return }
    send.disabled = false; send.textContent = S.send
    err.textContent = res.error === 'TOO_SHORT' ? fill(S.TOO_SHORT, { n: c.minLen }) : res.error === 'TOO_LONG' ? fill(S.TOO_LONG, { n: c.maxLen }) : said(res.error!, res.n, S.sendFailed)
  })
  show(form)
}

// ── Your questions, like an inbox (02 §4b) ──────────────────────────────────
type Mine = { id: string; body: string; status: keyof CStrings['status']; visibility: string; answer: string | null; declined_reason: string | null;
  duplicate_of: string | null; conversation: string; created_at: string; edited_at: string | null; last_activity_at: string; changed: boolean }
async function mine(): Promise<unknown> {
  if (!session()) return show(note(S.signInFirst), h('div', { class: 'c-actions' }, plate(signInHref(), S.signIn)))
  const r = await rpc<Mine[]>('qa_mine')
  if (r.error !== undefined) return r.error === 'SIGNED_OUT' ? mine() : show(note(said(r.error)))
  show(
    r.data.length ? h('div', { class: 'c-list' }, ...r.data.map(q => h('a', { class: 'c-item c-link', href: `${BASE}/question?id=${q.id}` },
      h('p', { class: 'c-row' }, statusTag(q.status), q.changed && h('span', { class: 'tag st st-new' }, S.changed), h('span', { class: 'tag muted' }, fmtDate(q.last_activity_at))),
      h('p', { class: 'c-question clamp' }, q.body)))) : note(S.mineEmpty),
    h('div', { class: 'c-actions' }, plate(`${BASE}/ask`, S.ask)))
}

// ── One question: yours (with its conversation), or a published one ────────
type Opened = { question: Mine | null; messages: { fromAdmin: boolean; body: string; at: string }[] }
async function question() {
  const id = params.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return show(note(S.notFound))
  if (session()) {
    const r = await rpc<Opened>('qa_open_mine', { p_id: id })
    if (r.data?.question) return yours(r.data)
    if (r.error && r.error !== 'NOT_FOUND' && r.error !== 'NOT_MEMBER' && r.error !== 'SIGNED_OUT') return show(note(said(r.error)))
  }
  const p = await rpc<Published[]>('qa_published_one', { p_id: id })
  if (p.error !== undefined) return show(note(said(p.error)))
  show(p.data.length ? qaItem(p.data[0], false) : note(S.notFound), h('p', {}, h('a', { href: `${BASE}/questions` }, S.allQuestions)))
}

async function yours({ question: q, messages }: Opened) {
  if (!q) return
  const active = q.status === 'open' || q.status === 'seen'
  const parts: Kid[] = [
    h('p', { class: 'c-row' }, statusTag(q.status), h('span', { class: 'tag muted' }, q.visibility === 'public' ? S.publicTag : S.privateTag)),
    h('p', { class: 'muted small' }, S.status[q.status][1]),
    h('p', { class: 'c-question' }, q.body),
    h('p', { class: 'tag muted' }, fill(S.sentOn, { d: fmtDate(q.created_at) }) + (q.edited_at ? ` · ${fill(S.editedOn, { d: fmtDate(q.edited_at) })}` : '')),
  ]
  if (q.answer) parts.push(h('p', { class: 'tag muted' }, S.answer), h('p', { class: 'c-answer' }, q.answer))
  if (q.declined_reason) parts.push(h('p', { class: 'c-answer' }, q.declined_reason))
  if (q.duplicate_of) parts.push(h('p', {}, h('a', { href: `${BASE}/question?id=${q.duplicate_of}` }, S.openIt)))
  if (active) parts.push(await editing(q))
  if (q.conversation !== 'none') parts.push(conversation(q, messages))
  show(...parts, h('p', {}, h('a', { href: `${BASE}/mine` }, S.mine)))
}

// Edit and withdraw, while it's open or seen. The disabled plate names what's
// missing (the kit's rule): when editing comes back.
async function editing(q: Mine) {
  const box = h('div', { class: 'c-actions' })
  const c = await rpc<CanAsk>('qa_can_ask')
  const cooldown = c.data?.editCooldown ?? 600
  const left = q.edited_at ? Math.ceil((new Date(q.edited_at).getTime() + cooldown * 1000 - Date.now()) / 1000) : 0
  const edit = h('button', { type: 'button', class: `plate secondary${left > 0 ? ' is-disabled' : ''}`, 'aria-disabled': left > 0 ? 'true' : undefined },
    left > 0 ? fill(S.editIn, { n: fmtWait(left) }) : S.edit)
  const withdraw = h('button', { type: 'button', class: 'plate quiet' }, S.withdraw)
  const err = h('p', { class: 'c-error', role: 'alert' })
  edit.addEventListener('click', () => {
    if (left > 0) return
    const text = h('textarea', { class: 'field', rows: '6', maxlength: String(c.data?.maxLen ?? 1000) }) as HTMLTextAreaElement
    text.value = q.body
    const save = h('button', { type: 'button', class: 'plate primary' }, S.save)
    const cancel = h('button', { type: 'button', class: 'plate quiet' }, S.cancel)
    cancel.addEventListener('click', () => question())
    save.addEventListener('click', async () => {
      const r = await rpc('qa_edit', { p_id: q.id, p_body: text.value.trim() })
      if (r.error !== undefined) err.textContent = r.error === 'EDIT_COOLDOWN' ? fill(S.editIn, { n: fmtWait(r.n ?? 60) }) : r.error === 'EDIT_LIMIT' ? S.editLimit
        : r.error === 'TOO_SHORT' ? fill(S.TOO_SHORT, { n: c.data?.minLen ?? 10 }) : said(r.error, r.n, S.sendFailed)
      else question()
    })
    box.replaceChildren(text, err, h('div', { class: 'c-row' }, save, cancel))
    text.focus()
  })
  withdraw.addEventListener('click', async () => {
    const short = q.body.length > 60 ? `${q.body.slice(0, 57)}…` : q.body
    if (!confirm(fill(S.confirmWithdraw, { q: short }))) return
    const r = await rpc('qa_withdraw', { p_id: q.id })
    if (r.error !== undefined) err.textContent = said(r.error)
    else location.href = `${BASE}/mine`
  })
  box.append(err, h('div', { class: 'c-row' }, edit, withdraw))
  return box
}

// The private conversation (02 §4a): only the admin opens one; the asker replies.
function conversation(q: Mine, messages: Opened['messages']) {
  const list = h('div', { class: 'c-conv' }, h('h2', { class: 'c-head' }, S.conversation),
    ...messages.map(m => h('div', { class: `c-msg${m.fromAdmin ? ' from-admin' : ''}` },
      h('p', { class: 'tag muted' }, `${m.fromAdmin ? S.fromAdmin : S.fromYou} · ${fmtDate(m.at)}`), h('p', { class: 'c-text' }, m.body))))
  if (q.conversation !== 'open') { list.append(note(S.convClosed, 'muted small')); return list }
  const text = h('textarea', { class: 'field', rows: '3', maxlength: '1000', 'aria-label': S.reply }) as HTMLTextAreaElement
  const err = h('p', { class: 'c-error', role: 'alert' })
  const send = h('button', { type: 'button', class: 'plate secondary' }, S.reply)
  send.addEventListener('click', async () => {
    if (!text.value.trim()) return
    const r = await rpc('qa_reply', { p_id: q.id, p_body: text.value.trim() })
    if (r.error !== undefined) err.textContent = said(r.error, r.n, S.sendFailed)
    else question()
  })
  list.append(text, err, send)
  return list
}

// ── Sign in (11 §2) ─────────────────────────────────────────────────────────
// Where to go after: only a path on this site, never another address.
const next = () => { const n = params.get('next') ?? ''; return n.startsWith('/') && !n.startsWith('//') ? n : BASE }
function signin() {
  if (session()) { location.replace(next()); return }
  const { form, focus } = signInForm(S, 'c', () => location.replace(next()))
  show(form)
  focus()
}

// ── Go ──────────────────────────────────────────────────────────────────────
if (!configured) show(note(S.notSetUp))
else ({ '': updates, questions, ask, mine, question, signin } as Record<string, () => unknown>)[page]?.()
