import * as SQLite from 'expo-sqlite'
import { documentDirectory, getInfoAsync, makeDirectoryAsync, copyAsync } from 'expo-file-system'
import { Asset } from 'expo-asset'

let _db: SQLite.SQLiteDatabase | null = null

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db
  _db = await SQLite.openDatabaseAsync('pom.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
  return _db
}

export async function initBundledDb(): Promise<void> {
  const dbPath = `${documentDirectory}SQLite/pom.db`
  const exists = await getInfoAsync(dbPath)

  if (exists.exists) {
    console.log('[db] already exists, skipping copy')
    _db = await SQLite.openDatabaseAsync('pom.db')
    await _db.execAsync('PRAGMA journal_mode = WAL;')
    await _db.execAsync('PRAGMA foreign_keys = ON;')
    return
  }

  await makeDirectoryAsync(`${documentDirectory}SQLite/`, { intermediates: true })
  const asset = Asset.fromModule(require('../../assets/db/players.db'))
  await asset.downloadAsync()
  await copyAsync({ from: asset.localUri!, to: dbPath })
  console.log('[db] bundled db copied')

  _db = await SQLite.openDatabaseAsync('pom.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
}