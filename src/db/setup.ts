// src/db/setup.ts
import * as SQLite from 'expo-sqlite'
import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system/legacy'

// Increment this whenever the bundled players_v5.db changes.
// This forces the device to re-copy the fresh DB on next launch.
const DB_VERSION = 8

let _db: SQLite.SQLiteDatabase | null = null

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db
  _db = await SQLite.openDatabaseAsync('pom.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
  return _db
}

export async function initBundledDb(): Promise<void> {
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