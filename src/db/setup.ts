// src/db/setup.ts
import * as SQLite from 'expo-sqlite'
import { Asset } from 'expo-asset'

// use expo-file-system legacy API
const FileSystem = require('expo-file-system')

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

  const dbDir  = `${docDir}SQLite/`
  const dbPath = `${dbDir}pom.db`

  const info = await FileSystem.getInfoAsync(dbPath)
  if (info.exists) {
    console.log('[db] already exists')
    _db = await SQLite.openDatabaseAsync('pom.db')
    await _db.execAsync('PRAGMA journal_mode = WAL;')
    await _db.execAsync('PRAGMA foreign_keys = ON;')
    return
  }

  await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true })
  const asset = Asset.fromModule(require('../../assets/db/players.db'))
  await asset.downloadAsync()
  await FileSystem.copyAsync({ from: asset.localUri!, to: dbPath })
  console.log('[db] copied bundled db')

  _db = await SQLite.openDatabaseAsync('pom.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
}