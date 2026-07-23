// src/db/setup.ts
import * as SQLite from 'expo-sqlite'
import { Asset } from 'expo-asset'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'

// Increment this whenever the bundled players_v5.db changes.
// This forces the device to re-copy the fresh DB on next launch.
const DB_VERSION = 13

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
  const asset = Asset.fromModule(require('../../assets/db/players_v5.db'))
  await asset.downloadAsync()
  const uri = asset.localUri ?? asset.uri
  const res = await fetch(uri)
  const bytes = new Uint8Array(await res.arrayBuffer())
  _db = await SQLite.deserializeDatabaseAsync(bytes)
  console.log('[db] web: bundled db loaded into memory')
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

  if (!dbInfo.exists || existingVersion < DB_VERSION) {
    console.log(`[db] version ${existingVersion} < ${DB_VERSION} (or db missing), replacing db...`)

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
    const asset = Asset.fromModule(require('../../assets/db/players_v5.db'))
    await asset.downloadAsync()

    if (asset.localUri) {
      await FileSystem.copyAsync({ from: asset.localUri, to: dbPath })
      // Write version file
      await FileSystem.writeAsStringAsync(verPath, String(DB_VERSION))
      console.log(`[db] db replaced successfully, version = ${DB_VERSION}`)
    } else {
      throw new Error('[db] asset has no localUri')
    }
  } else {
    console.log(`[db] db version ${existingVersion} is current — skipping re-copy`)
  }

  // Open the database connection
  _db = await SQLite.openDatabaseAsync('pom.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
}