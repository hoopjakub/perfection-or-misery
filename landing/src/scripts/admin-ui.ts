// The admin's screens (docs/website/02 §5, §5a, 03 §5), loaded by
// admin-shell.ts only once the database has said this session is the admin's
// at the second factor. Every action here is a qa_admin_ function that checks
// that again, caps the hour and writes the log; this file decides nothing.
// Questions are other people's text, opened by the one account that can read
// everything (04 §6): all of it goes in through text nodes, never as HTML.
import { h, type Kid } from '../lib/dom'
import { rpc } from '../lib/session'

type Status = 'open' | 'seen' | 'planned' | 'answered' | 'declined' | 'duplicate'
const STATUSES: Status[] = ['open', 'seen', 'planned', 'answered', 'declined', 'duplicate']
type Row = { id: string; status: Status; asker: string | null; earlier: number; body: string; visibility: string; admin_private: boolean;
  conversation: string; created_at: string; edited_at: string | null; seen_at: string | null; last_activity_at: string; edited_since_seen: boolean }
type Question = { id: string; user_id: string; body: string; status: Status; visibility: string; admin_private: boolean; public_body: string | null;
  answer: string | null; declined_reason: string | null; duplicate_of: string | null; conversation: string; created_at: string; edited_at: string | null; edit_count: number }
type Opened = { question: Question; messages: { fromAdmin: boolean; body: string; at: string }[] }
type Update = { id: string; title: string; body: string; created_at: string; edited_at: string | null }
type Flag = { id: number; target_type: 'player' | 'club'; target_id: string; text: string; reason: string; source: string; reports: number; created_at: string; details: string[] }

let root: HTMLElement
let view: HTMLElement
const askers = new Map<string, string>()   // question id → asker, from the inbox (the open call doesn't name them)

const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`
}
const show = (...kids: Kid[]) => view.replaceChildren(...kids.filter(Boolean) as (Node | string)[])
const note = (t: string, cls = 'c-note') => h('p', { class: cls }, t)
const tag = (t: string, cls = '') => h('span', { class: `tag st ${cls}` }, t)
const button = (text: string, onClick: () => unknown, kind = 'quiet') => {
  const b = h('button', { type: 'button', class: `plate ${kind}` }, text) as HTMLButtonElement
  b.addEventListener('click', async () => { b.disabled = true; try { await onClick() } finally { b.disabled = false } })
  return b
}
// The database's refusals, in words. NOT_ADMIN mid-session means the second
// factor lapsed (or the row was removed): reload, which starts the shell over.
function failed(code: string, n?: number) {
  if (code === 'NOT_ADMIN' || code === 'SIGNED_OUT') { location.reload(); return 'Signed out.' }
  return ({
    ADMIN_BUSY: 'The hourly cap on admin actions is reached (qa_settings.admin_actions_per_hour).',
    OFFLINE: 'Couldn’t reach the server.',
    NOT_FOUND: 'That isn’t there any more.',
    TOO_SHORT: 'An answer needs some text.',
    TOO_LONG: 'Too long.',
    BAD_STATUS: 'That status doesn’t fit (a duplicate needs another question’s id).',
    NO_CONVERSATION: 'The conversation isn’t open.',
    NO_SUCH_FLAG: 'That flag was already dealt with.',
    BAD_ACTION: 'That action doesn’t apply to this kind of flag.',
  } as Record<string, string>)[code] ?? `Failed: ${code}${n ? ` ${n}` : ''}`
}
async function act(errEl: HTMLElement, name: string, args: object): Promise<boolean> {
  errEl.textContent = ''
  const r = await rpc(name, args)
  if (r.error !== undefined) { errEl.textContent = failed(r.error, r.n); return false }
  return true
}
const errLine = () => h('p', { class: 'c-error', role: 'alert' })

// ── The tabs ────────────────────────────────────────────────────────────────
const TABS = [['inbox', 'Inbox'], ['updates', 'Updates'], ['moderation', 'Moderation'], ['log', 'Log']] as const
function route() {
  const [tab, id] = location.hash.slice(1).split('/')
  for (const a of root.querySelectorAll<HTMLAnchorElement>('.c-tabs a')) a.toggleAttribute('aria-current', a.hash === `#${tab || 'inbox'}`)
  if (tab === 'q' && id) return question(id)
  if (tab === 'updates') return updates()
  if (tab === 'moderation') return moderation()
  if (tab === 'log') return log()
  return inbox()
}

export function mount(el: HTMLElement, onSignOut: () => void) {
  root = el
  view = h('div', { 'aria-live': 'polite' })
  const nav = h('nav', { class: 'c-tabs', 'aria-label': 'Admin' }, ...TABS.map(([k, t]) => h('a', { href: `#${k}` }, t)))
  root.replaceChildren(h('div', { class: 'c-row spread' }, nav, button('Sign out', onSignOut)), view)
  addEventListener('hashchange', route)
  route()
}

// ── The inbox (02 §5) ───────────────────────────────────────────────────────
let filter: { status: string; edited: boolean } = { status: '', edited: false }
async function inbox() {
  const select = h('select', { class: 'field', 'aria-label': 'Status' }, h('option', { value: '' }, 'Every status'),
    ...STATUSES.map(s => h('option', { value: s, selected: filter.status === s }, s))) as HTMLSelectElement
  const edited = h('input', { type: 'checkbox', checked: filter.edited }) as HTMLInputElement
  const bar = h('div', { class: 'c-row admin-filters' }, select, h('label', { class: 'c-radio' }, edited, 'Edited since I looked'))
  select.addEventListener('change', () => { filter.status = select.value; inbox() })
  edited.addEventListener('change', () => { filter.edited = edited.checked; inbox() })
  show(bar, note('Loading…', 'muted'))
  const r = await rpc<Row[]>('qa_admin_inbox', { p_status: filter.status || null, p_edited_only: filter.edited })
  if (r.error !== undefined) return show(bar, note(failed(r.error)))
  for (const q of r.data) if (q.asker) askers.set(q.id, q.asker)
  show(bar, r.data.length ? h('div', { class: 'c-list' }, ...r.data.map(q => h('a', { class: 'c-item c-link', href: `#q/${q.id}` },
    h('p', { class: 'c-row' }, tag(q.status, `st-${q.status}`), q.edited_since_seen && tag('Edited', 'st-new'),
      q.visibility === 'public' && !q.admin_private && tag('Public'), q.conversation === 'open' && tag('Conversation'),
      h('span', { class: 'tag muted' }, `${q.asker ?? '(deleted)'}${q.earlier ? ` · ${q.earlier} earlier` : ''} · ${ago(q.created_at)}${q.edited_at ? ` · edited ${ago(q.edited_at)} ago` : ''}`)),
    h('p', { class: 'c-text clamp' }, q.body)))) : note('Nothing here.'))
}

// ── One question ────────────────────────────────────────────────────────────
async function question(id: string) {
  show(note('Loading…', 'muted'))
  // Opening an open question marks it seen (the database does it).
  const r = await rpc<Opened>('qa_admin_open', { p_id: id })
  if (r.error !== undefined) return show(note(failed(r.error)), h('p', {}, h('a', { href: '#inbox' }, '← Inbox')))
  const { question: q, messages } = r.data
  const reload = () => question(id)

  // Decide: the status, with the answer, the reason or the duplicate.
  const e1 = errLine()
  const status = h('select', { class: 'field', 'aria-label': 'Status' }, ...(['seen', 'planned', 'answered', 'declined', 'duplicate'] as Status[])
    .map(s => h('option', { value: s, selected: q.status === s }, s))) as HTMLSelectElement
  const text = h('textarea', { class: 'field', rows: '6', 'aria-label': 'Answer or reason', placeholder: 'The answer (needed for answered), or the reason (optional for declined)' }) as HTMLTextAreaElement
  text.value = q.status === 'declined' ? q.declined_reason ?? '' : q.answer ?? ''
  const dup = h('input', { class: 'field', 'aria-label': 'Duplicate of (question id)', placeholder: 'Duplicate of: the other question’s id', value: q.duplicate_of ?? '' }) as HTMLInputElement
  const sync = () => { dup.hidden = status.value !== 'duplicate'; text.hidden = !['answered', 'declined'].includes(status.value) }
  status.addEventListener('change', sync); sync()
  const decide = h('section', { class: 'admin-box' }, h('h2', { class: 'c-head' }, 'Decide'), status, text, dup, e1,
    button('Save and tell the asker', async () => {
      if (await act(e1, 'qa_admin_decide', { p_id: id, p_status: status.value, p_text: text.hidden ? null : text.value, p_duplicate_of: dup.hidden ? null : dup.value.trim() || null })) reload()
    }, 'primary'))

  // Privacy: only a question the asker ticked Public can be shown; the admin
  // can hide it and reword it for the page, never make a private one public.
  const e2 = errLine()
  const privacy = q.visibility === 'public' ? (() => {
    const hide = h('input', { type: 'checkbox', checked: q.admin_private }) as HTMLInputElement
    const wording = h('textarea', { class: 'field', rows: '3', 'aria-label': 'Wording on the public page', placeholder: 'Wording on the public page (blank keeps the asker’s)' }) as HTMLTextAreaElement
    wording.value = q.public_body ?? ''
    return h('section', { class: 'admin-box' }, h('h2', { class: 'c-head' }, 'Public page'),
      h('label', { class: 'c-radio' }, hide, 'Keep it off the public page'), wording, e2,
      button('Save', async () => { if (await act(e2, 'qa_admin_set_private', { p_id: id, p_private: hide.checked, p_public_wording: wording.value })) reload() }, 'secondary'))
  })() : note('Private: the asker’s choice. It never appears publicly.', 'muted small')

  // The private conversation (02 §4a).
  const e3 = errLine()
  const msg = h('textarea', { class: 'field', rows: '3', 'aria-label': 'Message' }) as HTMLTextAreaElement
  const conv = h('section', { class: 'c-conv' }, h('h2', { class: 'c-head' }, `Conversation · ${q.conversation}`),
    ...messages.map(m => h('div', { class: `c-msg${m.fromAdmin ? ' from-admin' : ''}` }, h('p', { class: 'tag muted' }, `${m.fromAdmin ? 'You' : 'Asker'} · ${when(m.at)}`), h('p', { class: 'c-text' }, m.body))),
    q.conversation === 'open' && msg,
    e3,
    h('div', { class: 'c-row' },
      q.conversation === 'open' && button('Send', async () => { if (msg.value.trim() && await act(e3, 'qa_admin_message', { p_id: id, p_body: msg.value })) reload() }, 'secondary'),
      button(q.conversation === 'open' ? 'Close the conversation' : 'Open a conversation', async () => {
        if (await act(e3, 'qa_admin_conversation', { p_id: id, p_open: q.conversation !== 'open' })) reload()
      })))

  // Delete, for abuse: the log keeps the id, the text goes.
  const e4 = errLine()
  const short = q.body.length > 60 ? `${q.body.slice(0, 57)}…` : q.body
  const del = h('section', { class: 'admin-box danger' }, e4, button('Delete this question', async () => {
    if (!confirm(`Delete “${short}” for good? The asker sees it vanish; the log keeps only its id.`)) return
    if (await act(e4, 'qa_admin_delete', { p_id: id })) location.hash = '#inbox'
  }))

  show(
    h('p', {}, h('a', { href: '#inbox' }, '← Inbox')),
    h('p', { class: 'c-row' }, tag(q.status, `st-${q.status}`), tag(q.visibility), q.admin_private && tag('Hidden by you'),
      h('span', { class: 'tag muted' }, `${askers.get(id) ?? 'asker'} · asked ${when(q.created_at)}${q.edited_at ? ` · edited ${when(q.edited_at)} (${q.edit_count}×)` : ''}`)),
    h('p', { class: 'c-text admin-question' }, q.body),
    h('p', { class: 'tag muted' }, `id ${q.id}`),
    decide, privacy, conv, del)
}

// ── Updates ─────────────────────────────────────────────────────────────────
async function updates(editing?: Update): Promise<unknown> {
  const e = errLine()
  const title = h('input', { class: 'field', 'aria-label': 'Title', placeholder: 'Title', value: editing?.title ?? '' }) as HTMLInputElement
  const text = h('textarea', { class: 'field', rows: '8', 'aria-label': 'Text', placeholder: 'What’s new. Plain text; blank lines make paragraphs.' }) as HTMLTextAreaElement
  text.value = editing?.body ?? ''
  const form: HTMLElement = h('section', { class: 'admin-box' }, h('h2', { class: 'c-head' }, editing ? 'Edit the update' : 'Write an update'), title, text, e,
    h('div', { class: 'c-row' },
      button(editing ? 'Save' : 'Publish', async () => { if (await act(e, 'qa_admin_update_save', { p_id: editing?.id ?? null, p_title: title.value, p_body: text.value })) updates() }, 'primary'),
      editing && button('Cancel', () => updates())))
  show(form, note('Loading…', 'muted'))
  const r = await rpc<Update[]>('qa_updates_list', { p_limit: 50 })
  if (r.error !== undefined) return show(form, note(failed(r.error)))
  show(form, h('div', { class: 'c-list' }, ...r.data.map(u => {
    const ue = errLine()
    return h('article', { class: 'c-item' },
      h('p', { class: 'tag muted' }, `${when(u.created_at)}${u.edited_at ? ` · edited ${when(u.edited_at)}` : ''}`),
      h('h3', { class: 'c-head' }, u.title), h('p', { class: 'c-text clamp' }, u.body), ue,
      h('div', { class: 'c-row' }, button('Edit', () => updates(u)), button('Delete', async () => {
        if (!confirm(`Delete the update “${u.title}”?`)) return
        if (await act(ue, 'qa_admin_update_delete', { p_id: u.id })) updates()
      })))
  })))
}

// ── Moderation (02 §5a): the app's reports and unsure names ─────────────────
const ACTIONS: Record<Flag['target_type'], [string, string, string][]> = {
  player: [
    ['dismiss', 'Let it be', 'Close this flag and change nothing.'],
    ['rename', 'Take the name', 'The player’s name is replaced at once and they must choose a new one.'],
    ['ban', 'Ban', 'The player is banned: no runs, chat, clubs or reports; their name is replaced and they leave their club.'],
  ],
  club: [
    ['dismiss', 'Let it be', 'Close this flag and change nothing.'],
    ['rename', 'Take the name', 'The club’s name and about text are replaced.'],
    ['close', 'Close the club', 'The club is deleted and its members are left without one.'],
  ],
}
async function moderation() {
  // The word lists, read-only (editing stays in the repo, scripts/moderation/).
  const word = h('input', { class: 'field', 'aria-label': 'A word or name to check', placeholder: 'Check a word or name against the lists' }) as HTMLInputElement
  const verdict = h('span', { class: 'tag' })
  const check = h('form', { class: 'c-row admin-filters' }, word, h('button', { type: 'submit', class: 'plate quiet' }, 'Check'), verdict)
  check.addEventListener('submit', async ev => {
    ev.preventDefault()
    const r = await rpc<string>('check_name', { p_text: word.value })
    verdict.textContent = r.error !== undefined ? failed(r.error) : `→ ${r.data}`
  })
  show(check, note('Loading…', 'muted'))
  const r = await rpc<Flag[]>('qa_admin_mod_inbox')
  if (r.error !== undefined) return show(check, note(failed(r.error)))
  show(check, r.data.length ? h('div', { class: 'c-list' }, ...r.data.map(f => {
    const e = errLine()
    return h('article', { class: 'c-item' },
      h('p', { class: 'c-row' }, tag(f.target_type), tag(f.source), f.reports > 0 && tag(`${f.reports} report${f.reports === 1 ? '' : 's'}`, 'st-new'),
        h('span', { class: 'tag muted' }, `${ago(f.created_at)} ago · ${f.reason}`)),
      h('p', { class: 'c-text admin-question' }, f.text),
      f.details.length > 0 && h('ul', { class: 'small' }, ...f.details.map(d => h('li', {}, d))),
      h('p', { class: 'tag muted' }, `${f.target_type} id ${f.target_id}`), e,
      h('div', { class: 'c-row' }, ...ACTIONS[f.target_type].map(([a, label, says]) => button(label, async () => {
        if (!confirm(`${label}: “${f.text}”\n\n${says}`)) return
        if (await act(e, 'qa_admin_mod_act', { p_flag: f.id, p_action: a })) moderation()
      }, a === 'dismiss' ? 'quiet' : 'secondary'))))
  })) : note('No open flags.'))
}

// ── The log (append-only; reading it isn't logged) ──────────────────────────
async function log() {
  show(note('Loading…', 'muted'))
  const r = await rpc<{ action: string; target: string | null; at: string }[]>('qa_admin_log_read', { p_limit: 200 })
  if (r.error !== undefined) return show(note(failed(r.error)))
  show(r.data.length ? h('div', { class: 'c-list' }, ...r.data.map(l => h('p', { class: 'c-row admin-log' },
    h('span', { class: 'tag muted' }, when(l.at)), h('span', { class: 'tag' }, l.action), h('span', { class: 'small muted' }, l.target ?? '')))) : note('Nothing yet.'))
}
