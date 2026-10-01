// P8.5-31 (docs/release/05-UPDATES-AND-THE-APK.md §2): "a new build is out".
//
// A sideloaded APK has no store to tell it a new version exists, so it asks.
// The record of the latest build is a small file on the website,
// /latest.json, written by scripts/release-latest.ts when a build is
// released:
//   { version, build, url, sha256, minBuild, notes }
// `url` is the APK on GitHub Releases (a public repo of its own, the
// maintainer's call, 1 Oct 2026); `minBuild` is the oldest build still
// allowed, for a change on the server an older build can't follow.
//
// The check runs once, silently, in the background, and only in the public
// build: the personal build (EXPO_PUBLIC_BRAND_MODE=real) is the maintainer's
// own, and must never offer to replace itself with the public APK.
//
// The update: the APK is downloaded to the app's own storage, its SHA-256 is
// checked against the record (a file that doesn't match is deleted, never
// opened), and it's handed to Android's installer, which asks the player to
// confirm (and, the first time, to allow installs from this app). An app
// can't install anything silently; that takes system privileges.
//
// JavaScript-only changes don't come this way: they arrive over the air
// (EAS Update, app.json `updates`), with no install at all.
import { Platform } from 'react-native'
import { create } from 'zustand'

export const LATEST_URL = 'https://perfection-or-misery.vercel.app/latest.json'

export type LatestBuild = { version: string; build: number; url: string; sha256: string; minBuild?: number; notes?: string }
export type UpdateState =
  | { kind: 'none' }
  | { kind: 'available'; latest: LatestBuild; required: boolean }
  | { kind: 'downloading'; latest: LatestBuild; progress: number }
  | { kind: 'failed'; latest: LatestBuild; why: string }

export const useAppUpdate = create<{ state: UpdateState }>(() => ({ state: { kind: 'none' } }))
const set = (state: UpdateState) => useAppUpdate.setState({ state })

const isLatest = (x: unknown): x is LatestBuild => {
  const r = x as LatestBuild
  return !!r && typeof r.version === 'string' && Number.isInteger(r.build) && typeof r.url === 'string'
    && /^https:\/\//.test(r.url) && /^[0-9a-f]{64}$/i.test(r.sha256 ?? '')
}

/** The running build's number (Android's versionCode), or null where there's none. */
function runningBuild(): number | null {
  try {
    const n = Number(require('expo-application').nativeBuildVersion)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}

let checked = false
/** Once a launch: is there a newer build? Never throws, never blocks. */
export async function checkForAppUpdate(): Promise<void> {
  if (checked || Platform.OS !== 'android' || process.env.EXPO_PUBLIC_BRAND_MODE === 'real' || __DEV__) return
  checked = true
  try {
    const mine = runningBuild()
    if (mine == null) return
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(LATEST_URL, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } })
    clearTimeout(t)
    if (!res.ok) return
    const latest: unknown = await res.json()
    if (!isLatest(latest) || latest.build <= mine) return
    set({ kind: 'available', latest, required: latest.minBuild != null && mine < latest.minBuild })
  } catch (e) {
    console.log('[update] check skipped:', String(e))
  }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Download the new APK, check it, and hand it to the installer. */
export async function installAppUpdate(latest: LatestBuild, required = false): Promise<void> {
  const FS = require('expo-file-system/legacy')
  const Crypto = require('expo-crypto')
  const IntentLauncher = require('expo-intent-launcher')
  const file = `${FS.cacheDirectory}pom-${latest.build}.apk`
  try {
    set({ kind: 'downloading', latest, progress: 0 })
    const dl = FS.createDownloadResumable(latest.url, file, {}, (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
      if (p.totalBytesExpectedToWrite > 0) set({ kind: 'downloading', latest, progress: p.totalBytesWritten / p.totalBytesExpectedToWrite })
    })
    const done = await dl.downloadAsync()
    if (!done || done.status !== 200) throw new Error(`download failed (${done?.status ?? 'no answer'})`)
    // The checksum, over the file's bytes: a download that doesn't match the
    // record (broken, or not ours) is deleted and never opened.
    const bytes = base64ToBytes(await FS.readAsStringAsync(file, { encoding: FS.EncodingType.Base64 }))
    const sum = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes))
    if (sum.toLowerCase() !== latest.sha256.toLowerCase()) {
      await FS.deleteAsync(file, { idempotent: true })
      throw new Error("the download didn't match its checksum")
    }
    const uri = await FS.getContentUriAsync(file)
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: uri, type: 'application/vnd.android.package-archive',
      flags: 1,   // FLAG_GRANT_READ_URI_PERMISSION: the installer may read our file
    })
    // Back to "available": the installer is Android's now, and a player who
    // cancels it can tap Update again.
    set({ kind: 'available', latest, required })
  } catch (e) {
    console.warn('[update] install failed:', e)
    set({ kind: 'failed', latest, why: String((e as Error)?.message ?? e) })
  }
}
