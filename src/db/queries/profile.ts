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
export type ProfileLook = { colour: string; effect: LookEffect }
export type LookEffect = 'none' | 'tape' | 'stripe' | 'rivets' | 'stitch'

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

/** Your own details, to edit. null when the table doesn't exist yet. */
export async function fetchOwnDetails(uid: string): Promise<{ details: ProfileDetails; look: ProfileLook; avatarPath: string | null } | null> {
  const [d, l, p] = await Promise.all([
    (supabase as any).from('profile_details').select('*').eq('user_id', uid).maybeSingle(),
    (supabase as any).from('profile_looks').select('colour, effect').eq('user_id', uid).maybeSingle(),
    (supabase as any).from('profiles').select('avatar_path').eq('id', uid).maybeSingle(),
  ])
  if (missing(d.error) || missing(l.error)) return null
  if (d.error) throw d.error
  return {
    details: { ...EMPTY_DETAILS, ...(d.data ?? {}) },
    look: { colour: l.data?.colour ?? 'ink', effect: (l.data?.effect ?? 'none') as LookEffect },
    avatarPath: p.data?.avatar_path ?? null,
  }
}

/** Saves the details and the look, and keeps the public badge in step with
 *  the favourites switch (the badge beside your name follows it). */
export async function saveProfile(uid: string, details: ProfileDetails, look: ProfileLook): Promise<void> {
  const now = new Date().toISOString()
  const db = supabase as any
  const d = await db.from('profile_details').upsert({ user_id: uid, ...details, updated_at: now })
  if (d.error) throw d.error
  const l = await db.from('profile_looks').upsert({ user_id: uid, ...look, updated_at: now })
  if (l.error) throw l.error
  const showBadge = details.show_favourites && !!details.favourite_team_id
  const p = await db.from('profiles').update({
    badge_team_id: showBadge ? details.favourite_team_id : null,
    badge_team_name: showBadge ? details.favourite_team_name : null,
  }).eq('id', uid)
  if (p.error) throw p.error
}

export function avatarUrl(path?: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

// A new file name per upload, so a changed picture isn't served from a cache;
// the old file is removed after the new one is in place.
async function uploadPicture(uid: string, name: 'avatar' | 'crest', jpeg: Blob | ArrayBuffer): Promise<string> {
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
  if (Platform.OS !== 'web') {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 })
    if (res.canceled || !res.assets?.[0]) return null
    const { uri, width, height } = res.assets[0]
    const scale = Math.min(1, AVATAR_PX / Math.max(width || AVATAR_PX, height || AVATAR_PX))
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
  const scale = Math.min(1, AVATAR_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85))
}
const AVATAR_PX = 512

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
  // With your club's colours (P8-142) when supabase/side-colours.sql has run; without, when it hasn't.
  let res = await (supabase as any).from('profile_looks').select('crest, crest_path, crest_everywhere, side_colours').eq('user_id', uid).maybeSingle()
  if (res.error && missing(res.error)) res = await (supabase as any).from('profile_looks').select('crest, crest_path, crest_everywhere').eq('user_id', uid).maybeSingle()
  const data = res.data
  if (res.error || !data) return null
  const design = readDesign(data.crest)
  const colours = readColours(data.side_colours)
  if (!design && !data.crest_path && !colours) return null
  return { design, imagePath: data.crest_path ?? null, everywhere: !!data.crest_everywhere, colours }
}

/** P8-142: your club's colours, on the look row. False when the column isn't
 *  there yet (supabase/side-colours.sql not run), so the screen can say so. */
export async function saveSideColours(uid: string, colours: SideColours | null): Promise<boolean> {
  const { error } = await (supabase as any).from('profile_looks').upsert({ user_id: uid, side_colours: colours, updated_at: new Date().toISOString() })
  if (error && missing(error)) return false
  if (error) throw error
  return true
}

export async function saveCrest(uid: string, choice: CrestChoice): Promise<void> {
  const { error } = await (supabase as any).from('profile_looks').upsert({
    user_id: uid, crest: choice.design, crest_path: choice.imagePath, crest_everywhere: choice.everywhere,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

/** A picture for the crest: the avatar's picker and upload, in its own file. */
export async function uploadCrestPicture(uid: string, jpeg: Blob | ArrayBuffer, previousPath: string | null): Promise<string> {
  const path = await uploadPicture(uid, 'crest', jpeg)
  if (previousPath && previousPath !== path) await supabase.storage.from('avatars').remove([previousPath])
  return path
}
