// src/db/setup.ts
import * as SQLite from 'expo-sqlite'
import { log } from '@/diag/log'
import { timeAsync } from '@/diag/perf'
import { Asset } from 'expo-asset'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
// The bundled database, by flavour: metro.config.js swaps ./dbAsset for
// ./dbAsset.legal (generic competition names) in the legal build (P8.5-30).
import DB_ASSET from './dbAsset'

// Increment this whenever the bundled players_v5.db changes.
// This forces the device to re-copy the fresh DB on next launch.
export const DB_VERSION = 22   // exported for the Diagnostics data check

let _db: SQLite.SQLiteDatabase | null = null

// Every query module calls getDb() independently — RootLayout's boot() effect
// is just ONE caller among many, not a gate the others wait on. Without a
// shared in-flight promise, a screen's own query firing near app start (a very
// normal race — nothing here was ever awaited by navigation) could call
// getDb() while RootLayout's initBundledDb() was still mid-flight: on native
// that meant two concurrent attempts to open/copy the same 'pom.db' file,
// sometimes one opening while the other was still deleting/copying it. That
// surfaced as an opaque native crash — "NativeDatabase.prepareAsync ...
// NullPointerException" — instead of a clean, obvious error. Gating every
// caller behind the SAME promise means there's only ever one init in flight,
// no matter how many screens ask for the db at once or how early they ask.
let _initPromise: Promise<SQLite.SQLiteDatabase> | null = null

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db
  if (!_initPromise) _initPromise = initDb()
  return _initPromise
}

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') await initBundledDbWeb()
  else await initBundledDbNative()
  return _db!
}

// Web has no filesystem to copy a bundled file onto — expo-file-system's
// documentDirectory doesn't exist there. But the DB is read-only, so there's
// nothing to persist across sessions anyway: fetch the bundled asset's bytes
// and deserialize them straight into an in-memory (wasm-backed) database each
// time the app loads. Simpler than wiring OPFS, and correct for our use case
// since we never write to this database.
async function initBundledDbWeb(): Promise<void> {
  if (_db) return
  // Phase 9: the web's biggest boot cost (a ~11 MB download), timed apart from opening it.
  const bytes = await timeAsync('db:fetch', async () => {
    const asset = Asset.fromModule(DB_ASSET)
    await asset.downloadAsync()
    const uri = asset.localUri ?? asset.uri
    const res = await fetch(uri)
    return new Uint8Array(await res.arrayBuffer())
  })
  _db = await timeAsync('db:open', () => SQLite.deserializeDatabaseAsync(bytes))
  log.info('db', `ready (web, ${(bytes.length / 1048576).toFixed(1)} MB)`)
}

// Public entry point some callers (RootLayout's boot effect) use explicitly.
// Routes through the SAME gate as getDb() so calling both never double-inits.
export async function initBundledDb(): Promise<void> {
  await getDb()
}

async function initBundledDbNative(): Promise<void> {
  const docDir = FileSystem.documentDirectory as string
  if (!docDir) throw new Error('No document directory')

  const dbDir   = `${docDir}SQLite/`
  const dbPath  = `${dbDir}pom.db`
  const verPath = `${dbDir}pom.db.version`

  // Read existing version from the text file (to avoid locking the database)
  const verInfo = await FileSystem.getInfoAsync(verPath)
  let existingVersion = 0
  if (verInfo.exists) {
    const verStr = await FileSystem.readAsStringAsync(verPath)
    existingVersion = parseInt(verStr.trim()) || 0
  }

  const dbInfo = await FileSystem.getInfoAsync(dbPath)

  if (!dbInfo.exists || existingVersion < DB_VERSION) await timeAsync('db:install', async () => {
    log.info('db', `installing version ${DB_VERSION} (had ${existingVersion || 'none'})`)
    // Reset singleton connection in JS if it exists
    _db = null

    // Delete old db files (including journal/WAL files if they exist, to prevent corruption)
    if (dbInfo.exists) {
      await FileSystem.deleteAsync(dbPath, { idempotent: true })
      await FileSystem.deleteAsync(`${dbPath}-journal`, { idempotent: true })
      await FileSystem.deleteAsync(`${dbPath}-wal`, { idempotent: true })
      await FileSystem.deleteAsync(`${dbPath}-shm`, { idempotent: true })
    }

    // Copy fresh DB from bundled asset
    await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true })
    const asset = Asset.fromModule(DB_ASSET)
    await asset.downloadAsync()

    if (asset.localUri) {
      await FileSystem.copyAsync({ from: asset.localUri, to: dbPath })
      // Write version file
      await FileSystem.writeAsStringAsync(verPath, String(DB_VERSION))
    } else {
      throw new Error('[db] asset has no localUri')
    }
  })

  // Open the database connection
  _db = await timeAsync('db:open', async () => {
    const db = await SQLite.openDatabaseAsync('pom.db')
    await db.execAsync('PRAGMA journal_mode = WAL;')
    await db.execAsync('PRAGMA foreign_keys = ON;')
    return db
  })
}