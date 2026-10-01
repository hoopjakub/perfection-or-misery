import { Platform } from 'react-native'
import { File as FsFile } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { readDesign, readColours, type CrestChoice, type SideColours } from '@/lib/yourCrest'
import { supabase } from '@/lib/supabase'
import { getDb } from '../setup'
import { isRunWon, type AchievementRun } from './leaderboard'
import { modeInfo } from '@/data/modes'

// P8-88: the profile a player shapes, and P8-89's "whose run is this".
// Everything here reads and writes the tables in supabase/profile.sql, and
// every call degrades to what exists if that file hasn't been applied yet:
// a missing table or function gives the plain profile, never an error screen.

export type PublicProfile = {
  id: string
  username: string | null
  avatar_path?: string | null
  badge_team_id?: string | null
  badge_team_name?: string | null
  favourite_team_id?: string | null
  favourite_team_name?: string | null
  favourite_player?: string | null
  /** null: hidden by the owner (or not set up yet). */
  pinned_run_ids?: string[] | null
  shown_achievements?: string[] | null
  playtime_seconds?: number | null
  runs_played?: number
  colour?: string | null
  effect?: string | null
  /** P8-178: the rest of the look (supabase/profile-plus.sql); read through readLook. */
  banner?: unknown
  theme?: unknown
  frame?: string | null
  status?: string | null
  pronouns?: string | null
  about?: string | null
}

export type ProfileDetails = {
  favourite_team_id: string | null
  favourite_team_name: string | null
  favourite_player: string | null
  show_runs: boolean
  show_achievements: boolean
  show_playtime: boolean
  show_favourites: boolean
  pinned_run_ids: string[]
  shown_achievements: string[]
}
export type LookEffect = 'none' | 'tape' | 'stripe' | 'rivets' | 'stitch'

// ── The look, tenfold (P8-178) ───────────────────────────────────────────────
// Discord's profile is the bar: a banner (a colour, a gradient or a picture),
// a profile theme of two colours that tints the whole card, a frame around
// your picture, a status, your pronouns and an about-me. On the look row
// (supabase/profile-plus.sql), public like the rest of the look.
export type BannerKind = 'colour' | 'gradient' | 'picture'
export type Banner = { kind: BannerKind; from: string; to: string; path?: string | null }
export type ProfileTheme = { primary: string; accent: string }
export type AvatarFrame = 'none' | 'ring' | 'double' | 'tape' | 'rivets' | 'stitch' | 'gold' | 'stars'
export const AVATAR_FRAMES: { id: AvatarFrame; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'ring', label: 'Ring' }, { id: 'double', label: 'Double' },
  { id: 'tape', label: 'Tape' }, { id: 'rivets', label: 'Rivets' }, { id: 'stitch', label: 'Stitched' },
  { id: 'gold', label: 'Gold' }, { id: 'stars', label: 'Stars' },
]
/** The same limits supabase/profile-plus.sql checks. */
export const LOOK_LIMITS = { status: 60, pronouns: 24, about: 190 }

export type ProfileLook = {
  colour: string
  effect: LookEffect
  banner?: Banner | null
  theme?: ProfileTheme | null
  frame?: AvatarFrame
  status?: string | null
  pronouns?: string | null
  about?: string | null
}

const hex = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null)
/** A stored banner, trusted no further than its shape: a kind, two colours, and
 *  a picture only as a banner file in a user's own folder. */
export function readBanner(raw: unknown): Banner | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kind = r.kind === 'colour' || r.kind === 'gradient' || r.kind === 'picture' ? r.kind : null
  const from = hex(r.from), to = hex(r.to) ?? from
  const path = typeof r.path === 'string' && /^[0-9a-f-]{36}\/banner-\d+\.jpg$/i.test(r.path) ? r.path : null
  if (!kind || !from || (kind === 'picture' && !path)) return null
  return { kind, from, to: to!, path }
}
export function readTheme(raw: unknown): ProfileTheme | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const primary = hex(r.primary), accent = hex(r.accent)
  return primary && accent ? { primary, accent } : null
}
export const readFrame = (raw: unknown): AvatarFrame => (AVATAR_FRAMES.some(f => f.id === raw) ? raw as AvatarFrame : 'none')
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
/** A public profile's look, read safely (another player's row). */
export function readLook(p: Pick<PublicProfile, 'colour' | 'effect' | 'banner' | 'theme' | 'frame' | 'status' | 'pronouns' | 'about'> | null | undefined): ProfileLook {
  return {
    colour: typeof p?.colour === 'string' ? p.colour : 'ink',
    effect: (['none', 'tape', 'stripe', 'rivets', 'stitch'].includes(p?.effect ?? '') ? p!.effect : 'none') as LookEffect,
    banner: readBanner(p?.banner), theme: readTheme(p?.theme), frame: readFrame(p?.frame),
    status: clip(p?.status, LOOK_LIMITS.status), pronouns: clip(p?.pronouns, LOOK_LIMITS.pronouns), about: clip(p?.about, LOOK_LIMITS.about),
  }
}

export const EMPTY_DETAILS: ProfileDetails = {
  favourite_team_id: null, favourite_team_name: null, favourite_player: null,
  show_runs: true, show_achievements: true, show_playtime: true, show_favourites: true,
  pinned_run_ids: [], shown_achievements: [],
}

// "The table or function doesn't exist yet" — supabase/profile.sql not applied.
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (['42P01', '42883', 'PGRST202', 'PGRST205', '42703', 'PGRST204'].includes(e.code ?? '') || /does not exist|could not find/i.test(e.message ?? ''))

/** What anyone may see of a profile (the owner's privacy switches applied by
 *  public_profile() in the database). Falls back to the plain profile row. */
export async function fetchPublicProfile(uid: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('public_profile' as never, { uid } as never)
  if (!error && data) return data as unknown as PublicProfile
  if (error && !missing(error)) throw error
  const { data: row, error: rowError } = await supabase.from('profiles').select('id, username').eq('id', uid).maybeSingle()
  if (rowError) throw rowError
  if (!row) return null
  const { count } = await supabase.from('runs').select('id', { count: 'exact', head: true }).eq('user_id', uid)
  return { ...(row as { id: string; username: string | null }), runs_played: count ?? 0 }
}

/** Your own details, to edit. null when the table doesn't exist yet. `plus`:
 *  whether supabase/profile-plus.sql has run (P8-178's banner, theme and the rest). */
export async function fetchOwnDetails(uid: string): Promise<{ details: ProfileDetails; look: ProfileLook; avatarPath: string | null; plus: boolean } | null> {
  const db = supabase as any
  const [d, lp, p] = await Promise.all([
    db.from('profile_details').select('*').eq('user_id', uid).maybeSingle(),
    db.from('profile_looks').select('colour, effect, banner, theme, frame, status, pronouns, about').eq('user_id', uid).maybeSingle(),
    db.from('profiles').select('avatar_path').eq('id', uid).maybeSingle(),
  ])
  const plus = !missing(lp.error)
  const l = plus ? lp : await db.from('profile_looks').select('colour, effect').eq('user_id', uid).maybeSingle()
  if (missing(d.error) || missing(l.error)) return null
  if (d.error) throw d.error
  return {
    details: { ...EMPTY_DETAILS, ...(d.data ?? {}) },
    look: readLook(l.data),
    avatarPath: p.data?.avatar_path ?? null,
    plus,
  }
}

/** Saves the details and the look, and keeps the public badge in step with
 *  the favourites switch (the badge beside your name follows it). Returns
 *  whether P8-178's part of the look was saved: false until
 *  supabase/profile-plus.sql has run (the rest is saved either way). */
export async function saveProfile(uid: string, details: ProfileDetails, look: ProfileLook): Promise<{ plus: boolean }> {
  const now = new Date().toISOString()
  const db = supabase as any
  const d = await db.from('profile_details').upsert({ user_id: uid, ...details, updated_at: now })
  if (d.error) throw d.error
  const l = await db.from('profile_looks').upsert({ user_id: uid, colour: look.colour, effect: look.effect, updated_at: now })
  if (l.error) throw l.error
  const x = await db.from('profile_looks').upsert({
    user_id: uid, banner: look.banner ?? null, theme: look.theme ?? null, frame: look.frame ?? 'none',
    status: clip(look.status, LOOK_LIMITS.status), pronouns: clip(look.pronouns, LOOK_LIMITS.pronouns), about: clip(look.about, LOOK_LIMITS.about),
    updated_at: now,
  })
  if (x.error && !missing(x.error)) throw x.error
  const showBadge = details.show_favourites && !!details.favourite_team_id
  const p = await db.from('profiles').update({
    badge_team_id: showBadge ? details.favourite_team_id : null,
    badge_team_name: showBadge ? details.favourite_team_name : null,
  }).eq('id', uid)
  if (p.error) throw p.error
  return { plus: !x.error }
}

export function avatarUrl(path?: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

// A new file name per upload, so a changed picture isn't served from a cache;
// the old file is removed after the new one is in place.
async function uploadPicture(uid: string, name: 'avatar' | 'crest' | 'banner', jpeg: Blob | ArrayBuffer): Promise<string> {
  const path = `${uid}/${name}-${Date.now()}.jpg`
  if ((jpeg as ArrayBuffer).byteLength === 0 || (jpeg as Blob).size === 0) throw new Error('EMPTY_PICTURE')
  const up = await supabase.storage.from('avatars').upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })
  if (up.error) throw up.error
  return path
}

export async function uploadAvatar(uid: string, jpeg: Blob | ArrayBuffer, previousPath: string | null): Promise<string> {
  const path = await uploadPicture(uid, 'avatar', jpeg)
  const p = await (supabase as any).from('profiles').update({ avatar_path: path }).eq('id', uid)
  if (p.error) throw p.error
  if (previousPath && previousPath !== path) await supabase.storage.from('avatars').remove([previousPath])
  return path
}

/** P8-88: a picture chosen and shrunk on the device before it's uploaded —
 *  about 512 px on the long side, re-encoded as JPEG, never the raw photo.
 *  The web does it with a file input and a canvas; a phone with the system's
 *  photo picker (square crop) and expo-image-manipulator. On a phone the file
 *  goes up as an ArrayBuffer: a Blob read from a file:// URI uploads empty on
 *  some Android versions. null when nothing was chosen. */
export async function pickAvatar(): Promise<Blob | ArrayBuffer | null> {
  return pickPicture([1, 1], AVATAR_PX)
}

/** P8-178: the banner, wide (3:1) and larger on its long side. */
export async function pickBanner(): Promise<Blob | ArrayBuffer | null> {
  return pickPicture([3, 1], BANNER_PX)
}

async function pickPicture(aspect: [number, number], px: number): Promise<Blob | ArrayBuffer | null> {
  if (Platform.OS !== 'web') {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 1 })
    if (res.canceled || !res.assets?.[0]) return null
    const { uri, width, height } = res.assets[0]
    const scale = Math.min(1, px / Math.max(width || px, height || px))
    const ctx = ImageManipulator.manipulate(uri)
    if (scale < 1) ctx.resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
    const image = await ctx.renderAsync()
    const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
    // Read through expo-file-system: fetch(file://).arrayBuffer() isn't dependable
    // in React Native and could upload an empty file.
    return await new FsFile(out.uri).arrayBuffer()
  }
  if (typeof document === 'undefined') return null
  const file = await new Promise<File | null>(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
  if (!file) return null
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, px / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85))
}
const AVATAR_PX = 512
const BANNER_PX = 1200

/** P8-178: a banner picture, in its own file; the old one goes. */
export async function uploadBanner(uid: string, jpeg: Blob | ArrayBuffer, previousPath: string | null): Promise<string> {
  const path = await uploadPicture(uid, 'banner', jpeg)
  if (previousPath && previousPath !== path) await supabase.storage.from('avatars').remove([previousPath])
  return path
}

/** Real-life favourite team: any club or nation in the bundled database, one
 *  row per name. A club appears once per competition copy (`_ucl`, `_cucl`);
 *  the smallest id is the plain one where there is one. */
export async function searchTeams(query: string): Promise<{ id: string; name: string }[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const db = await getDb()
  return db.getAllAsync<{ id: string; name: string }>(
    `SELECT MIN(id) AS id, name FROM clubs WHERE name LIKE ? GROUP BY name ORDER BY name LIMIT 20`,
    [`%${q}%`],
  )
}

/** A trophy id ("world_cup:hard") as people read it. */
export function trophyLabel(id: string, hardness?: number): string {
  const [mode, diff = 'any'] = id.split(':')
  const title = modeInfo(mode as never)?.title ?? mode.replace(/_/g, ' ')
  return `${title} · ${diff === 'any' ? 'WON' : diff.toUpperCase()}${hardness != null ? ` ${hardness.toFixed(1)}/11` : ''}`
}

/** The trophies a player has won, as ids the profile can show: one per mode
 *  and difficulty ("world_cup:hard"), labelled for people. */
export function earnedTrophies(runs: AchievementRun[]): { id: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const r of runs) {
    if (!isRunWon(r)) continue
    const id = `${r.mode}:${r.difficulty ?? 'any'}`
    if (!seen.has(id)) seen.set(id, trophyLabel(id, r.difficulty === 'custom' ? r.difficulty_meta?.hardness : undefined))
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }))
}

/** A few runs by id, for the pins on a profile. */
export async function fetchRunsByIds(ids: string[]) {
  if (!ids.length) return []
  const { data, error } = await (supabase as any).from('runs')
    .select('id, score, tier, mode, league_name, year_start, final_position, teams_in_league, wins, draws, losses, created_at, difficulty, difficulty_meta')
    .in('id', ids)
  if (error) throw error
  return ids.map(id => (data ?? []).find((r: { id: string }) => r.id === id)).filter(Boolean)
}

/** "12 h 40 min" */
export function formatPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

// ── Your crest (P8-132) ──────────────────────────────────────────────────────
// On the look row (supabase/crest.sql). Until that SQL is applied the columns
// don't exist: reading gives null, and saving says so rather than failing quietly.
export async function fetchCrest(uid: string): Promise<CrestChoice | null> {
  // With the newest columns first, then without each migration in turn:
  // crest_avatar (profile-plus.sql, P8-175), side_colours (side-colours.sql, P8-142).
  const db = supabase as any
  let res = await db.from('profile_looks').select('crest, crest_path, crest_everywhere, side_colours, crest_avatar').eq('user_id', uid).maybeSingle()
  if (res.error && missing(res.error)) res = await db.from('profile_looks').select('crest, crest_path, crest_everywhere, side_colours').eq('user_id', uid).maybeSingle()
  if (res.error && missing(res.error)) res = await db.from('profile_looks').select('crest, crest_path, crest_everywhere').eq('user_id', uid).maybeSingle()
  const data = res.data
  if (res.error || !data) return null
  const design = readDesign(data.crest)
  const colours = readColours(data.side_colours)
  // P8-175: your profile picture as your crest — whichever picture you have now.
  let imagePath: string | null = data.crest_path ?? null
  if (data.crest_avatar) {
    const p = await db.from('profiles').select('avatar_path').eq('id', uid).maybeSingle()
    imagePath = p.data?.avatar_path ?? null
  }
  if (!design && !imagePath && !colours) return null
  return { design, imagePath, everywhere: !!data.crest_everywhere, colours, avatar: !!data.crest_avatar }
}

// ── Your pin (P8-168) ─────────────────────────────────────────────────────────
/** The ID tag's pin colour: a palette id or any #rrggbb. (Its letters became
 *  your club's tag, P8-181; supabase/pin.sql's pin_letters column is unused.) */
export type Pin = { colour: string }
export const DEFAULT_PIN: Pin = { colour: 'orange' }

export async function fetchPin(uid: string): Promise<Pin | null> {
  const { data, error } = await (supabase as any).from('profile_looks').select('pin_colour').eq('user_id', uid).maybeSingle()
  if (error || !data) return null
  return { colour: data.pin_colour ?? DEFAULT_PIN.colour }
}

/** False when the column isn't there yet (supabase/pin.sql not run). */
export async function savePin(uid: string, pin: Pin): Promise<boolean> {
  const { error } = await (supabase as any).from('profile_looks').upsert({ user_id: uid, pin_colour: pin.colour, updated_at: new Date().toISOString() })
  if (error && missing(error)) return false
  if (error) throw error
  return true
}

/** P8-142: your club's colours, on the look row. False when the column isn't
 *  there yet (supabase/side-colours.sql not run), so the screen can say so. */
export async function saveSideColours(uid: string, colours: SideColours | null): Promise<boolean> {
  const { error } = await (supabase as any).from('profile_looks').upsert({ user_id: uid, side_colours: colours, updated_at: new Date().toISOString() })
  if (error && missing(error)) return false
  if (error) throw error
  return true
}

/** Saves the crest. With `avatar` the crest is your profile picture: the path
 *  isn't stored, the flag is, so it follows the picture when you change it.
 *  Returns false when that flag couldn't be kept (profile-plus.sql not run). */
export async function saveCrest(uid: string, choice: CrestChoice): Promise<boolean> {
  const db = supabase as any
  const base = { user_id: uid, crest: choice.design, crest_path: choice.avatar ? null : choice.imagePath, crest_everywhere: choice.everywhere, updated_at: new Date().toISOString() }
  const { error } = await db.from('profile_looks').upsert({ ...base, crest_avatar: !!choice.avatar })
  if (!error) return true
  if (!missing(error)) throw error
  const second = await db.from('profile_looks').upsert(base)
  if (second.error) throw second.error
  return !choice.avatar
}
