// The site's sign-in (docs/website/11 §2): the game's own accounts, through
// Supabase Auth's REST endpoints and PostgREST directly. supabase-js would be
// the biggest file on the site for a sign-in, a refresh and an RPC call.
// Public values only (the project's address and anon key, as the app ships).
// Sign-in only: the site never makes accounts or guests (08 H21).
const URL_ = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined
export const configured = !!(URL_ && KEY)

type Session = { access_token: string; refresh_token: string; expires_at: number; user_id: string; username: string }
const STORE = 'pom-site-session'

// Storage can be blocked (a private window, cleared site data): then you're
// signed in for this page only, never broken.
let memory: Session | null = null
const read = (): Session | null => {
  try { const s = localStorage.getItem(STORE); return s ? (JSON.parse(s) as Session) : memory } catch { return memory }
}
const write = (s: Session | null) => {
  memory = s
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE) } catch { /* memory only */ }
}

export const session = read
export const username = () => read()?.username ?? null

async function auth(path: string, body: object, token?: string) {
  return fetch(`${URL_}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

type TokenReply = { access_token: string; refresh_token: string; expires_at?: number; expires_in: number; user: { id: string } }
const toSession = (j: TokenReply, name: string): Session => ({
  access_token: j.access_token, refresh_token: j.refresh_token,
  expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + j.expires_in,
  user_id: j.user.id, username: name,
})

/** Sign in with the game's username and password. One message for a wrong
 *  name or password, never which (11 §2). */
export async function signIn(name: string, password: string): Promise<'ok' | 'wrong' | 'busy' | 'offline'> {
  if (!configured) return 'offline'
  // The same address the app makes (src/lib/auth.ts loginWithUsername).
  const email = `${name.toLowerCase().trim()}@pom.internal`
  let res: Response
  try { res = await auth('token?grant_type=password', { email, password }) } catch { return 'offline' }
  if (res.status === 429) return 'busy'
  if (!res.ok) return res.status >= 500 ? 'offline' : 'wrong'
  const j = (await res.json()) as TokenReply
  write(toSession(j, name.trim()))
  // The name as the game shows it (its casing), from the profile.
  const r = await rest<{ username: string | null }[]>(`profiles?select=username&id=eq.${j.user.id}`)
  const shown = r?.[0]?.username
  if (shown) write({ ...read()!, username: shown })
  return 'ok'
}

export async function signOut() {
  const s = read()
  write(null)
  if (s) { try { await auth('logout', {}, s.access_token) } catch { /* the token runs out on its own */ } }
}

// One refresh at a time: two calls that both find the token stale share it.
let refreshing: Promise<boolean> | null = null
async function refresh(): Promise<boolean> {
  const s = read()
  if (!s) return false
  refreshing ??= (async () => {
    try {
      const res = await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
      if (!res.ok) { if (res.status < 500) write(null); return false }
      write(toSession((await res.json()) as TokenReply, s.username))
      return true
    } catch { return false } finally { refreshing = null }
  })()
  return refreshing
}

async function token(): Promise<string> {
  const s = read()
  if (!s) return KEY!
  if (s.expires_at * 1000 - 60_000 < Date.now()) await refresh()
  return read()?.access_token ?? KEY!
}

async function rest<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY!, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' } })
    return res.ok ? ((await res.json()) as T) : null
  } catch { return null }
}

/** A database function. Its own errors come back as their code ('COOLDOWN',
 *  with the number after it in `n`); 'OFFLINE' when the server can't be
 *  reached; 'SIGNED_OUT' when the session is gone. */
export type Rpc<T> = { data: T; error?: undefined; n?: undefined } | { data?: undefined; error: string; n?: number }
export async function rpc<T>(name: string, args: object = {}): Promise<Rpc<T>> {
  if (!configured) return { error: 'OFFLINE' }
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: KEY!, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
    } catch { return { error: 'OFFLINE' } }
    if (res.ok) {
      const text = await res.text()
      return { data: (text ? JSON.parse(text) : null) as T }
    }
    // An expired or revoked token: refresh once and try again.
    if (res.status === 401 && read() && attempt === 0) { if (await refresh()) continue; write(null); return { error: 'SIGNED_OUT' } }
    if (res.status >= 500) return { error: 'OFFLINE' }
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    const [code, n] = (body.message ?? 'FAILED').split(' ')
    return { error: code, n: n ? Number(n) : undefined }
  }
  return { error: 'FAILED' }
}
