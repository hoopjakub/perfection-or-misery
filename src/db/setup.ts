import * as SQLite from 'expo-sqlite'

let _db: SQLite.SQLiteDatabase | null = null

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db
  _db = await SQLite.openDatabaseAsync('pom.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
  await initSchema(_db)
  return _db
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS leagues (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      country           TEXT NOT NULL,
      games_per_season  INTEGER NOT NULL,
      tier              INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id              TEXT PRIMARY KEY,
      league_id       TEXT NOT NULL REFERENCES leagues(id),
      name            TEXT NOT NULL,
      short_name      TEXT NOT NULL,
      primary_color   TEXT NOT NULL,
      secondary_color TEXT
    );

    CREATE TABLE IF NOT EXISTS club_seasons (
      id              TEXT PRIMARY KEY,
      club_id         TEXT NOT NULL REFERENCES clubs(id),
      year_start      INTEGER NOT NULL,
      year_end        INTEGER NOT NULL,
      historical_ovr  INTEGER NOT NULL,
      league_position INTEGER
    );

    CREATE TABLE IF NOT EXISTS players (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      nationality          TEXT NOT NULL,
      birth_year           INTEGER,
      primary_position     TEXT NOT NULL,
      secondary_positions  TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS player_seasons (
      id              TEXT PRIMARY KEY,
      player_id       TEXT NOT NULL REFERENCES players(id),
      club_season_id  TEXT NOT NULL REFERENCES club_seasons(id),
      ovr             INTEGER NOT NULL,
      attack          INTEGER,
      defense         INTEGER,
      physical        INTEGER,
      pace            INTEGER,
      technical       INTEGER,
      goals           INTEGER,
      assists         INTEGER,
      appearances     INTEGER,
      is_icon         INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS legendary_pairs (
      player_a_id  TEXT NOT NULL REFERENCES players(id),
      player_b_id  TEXT NOT NULL REFERENCES players(id),
      bonus_ovr    INTEGER NOT NULL,
      label        TEXT,
      PRIMARY KEY (player_a_id, player_b_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ps_club_season ON player_seasons(club_season_id);
    CREATE INDEX IF NOT EXISTS idx_ps_player      ON player_seasons(player_id);
    CREATE INDEX IF NOT EXISTS idx_cs_club        ON club_seasons(club_id);
    CREATE INDEX IF NOT EXISTS idx_cs_year        ON club_seasons(year_start);
    CREATE INDEX IF NOT EXISTS idx_clubs_league   ON clubs(league_id);
  `)
}