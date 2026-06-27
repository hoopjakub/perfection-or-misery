import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const DB_PATH  = path.join(__dirname, '../assets/db/players_v5.db')
const SEED_DIR = path.join(__dirname, 'seed')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE leagues (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    country TEXT NOT NULL, games_per_season INTEGER NOT NULL, tier INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE clubs (
    id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(id),
    name TEXT NOT NULL, short_name TEXT NOT NULL,
    primary_color TEXT NOT NULL, secondary_color TEXT,
    logo TEXT
  );
  CREATE TABLE club_seasons (
    id TEXT PRIMARY KEY, club_id TEXT NOT NULL REFERENCES clubs(id),
    year_start INTEGER NOT NULL, year_end INTEGER NOT NULL,
    historical_ovr INTEGER NOT NULL, league_position INTEGER
  );
  CREATE TABLE players (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, nationality TEXT NOT NULL,
    birth_year INTEGER, primary_position TEXT NOT NULL,
    secondary_positions TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE player_seasons (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
    club_season_id TEXT NOT NULL REFERENCES club_seasons(id),
    ovr INTEGER NOT NULL, attack INTEGER, defense INTEGER,
    physical INTEGER, pace INTEGER, technical INTEGER,
    goals INTEGER, assists INTEGER, appearances INTEGER,
    is_icon INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE legendary_pairs (
    player_a_id TEXT NOT NULL REFERENCES players(id),
    player_b_id TEXT NOT NULL REFERENCES players(id),
    bonus_ovr INTEGER NOT NULL, label TEXT,
    PRIMARY KEY (player_a_id, player_b_id)
  );
  CREATE TABLE _meta (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  CREATE INDEX idx_ps_club_season ON player_seasons(club_season_id);
  CREATE INDEX idx_ps_player      ON player_seasons(player_id);
  CREATE INDEX idx_cs_club        ON club_seasons(club_id);
  CREATE INDEX idx_cs_year        ON club_seasons(year_start);
  CREATE INDEX idx_clubs_league   ON clubs(league_id);
`)

const insertLeague = db.prepare(
  `INSERT OR IGNORE INTO leagues (id, name, country, games_per_season, tier) VALUES (?, ?, ?, ?, ?)`
)
const insertClub = db.prepare(
  `INSERT OR IGNORE INTO clubs (id, league_id, name, short_name, primary_color, secondary_color, logo) VALUES (?, ?, ?, ?, ?, ?, ?)`
)
const insertClubSeason = db.prepare(
  `INSERT OR IGNORE INTO club_seasons (id, club_id, year_start, year_end, historical_ovr, league_position) VALUES (?, ?, ?, ?, ?, ?)`
)
const insertPlayer = db.prepare(
  `INSERT OR IGNORE INTO players (id, name, nationality, birth_year, primary_position, secondary_positions) VALUES (?, ?, ?, ?, ?, ?)`
)
const insertPlayerSeason = db.prepare(
  `INSERT OR IGNORE INTO player_seasons
    (id, player_id, club_season_id, ovr, attack, defense, physical, pace, technical, goals, assists, appearances, is_icon)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)

const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'))

for (const file of files) {
  console.log(`processing ${file}...`)
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), 'utf-8'))

  insertLeague.run(
    data.league.id,
    data.league.name,
    data.league.country,
    data.league.games_per_season,
    data.league.tier
  )

  for (const club of data.clubs) {
    insertClub.run(
      club.id,
      club.league_id,
      club.name,
      club.short_name,
      club.primary_color,
      club.secondary_color ?? null,
      club.logo ?? null
    )

    for (const season of club.seasons) {
      insertClubSeason.run(
        season.id,
        season.club_id,
        season.year_start,
        season.year_end,
        season.historical_ovr,
        season.league_position ?? null
      )

      for (const player of season.players) {
        const secPos = Array.isArray(player.secondary_positions)
          ? JSON.stringify(player.secondary_positions)
          : (player.secondary_positions ?? '[]')
        insertPlayer.run(
          player.id,
          player.name,
          player.nationality,
          player.birth_year ?? null,
          player.primary_position,
          secPos
        )

        insertPlayerSeason.run(
          `${player.id}_${season.year_start}`,
          player.id,
          season.id,
          player.ovr,
          player.attack ?? null,
          player.defense ?? null,
          player.physical ?? null,
          player.pace ?? null,
          player.technical ?? null,
          player.goals ?? 0,
          player.assists ?? 0,
          player.appearances ?? 0,
          player.is_icon ?? 0
        )
      }
    }
  }
}

// Auto-bump the app's DB_VERSION (single source of truth = src/db/setup.ts) so
// every build triggers a re-copy on device without us editing it by hand.
const setupPath = path.join(__dirname, '../src/db/setup.ts')
let newVersion = 8
try {
  const setup = fs.readFileSync(setupPath, 'utf-8')
  const m = setup.match(/const DB_VERSION = (\d+)/)
  if (!m) throw new Error('DB_VERSION not found in setup.ts')
  newVersion = parseInt(m[1], 10) + 1
  fs.writeFileSync(setupPath, setup.replace(/const DB_VERSION = \d+/, `const DB_VERSION = ${newVersion}`))
  console.log(`↑ bumped DB_VERSION ${m[1]} → ${newVersion} in src/db/setup.ts`)
} catch (e: any) {
  console.warn(`! could not auto-bump DB_VERSION (${e.message}); baking ${newVersion}`)
}

// Bake the same version into the asset's _meta for reference.
db.prepare(`INSERT OR REPLACE INTO _meta (key, value) VALUES ('db_version', ?)`).run(newVersion)

console.log(`✓ built ${DB_PATH} (v${newVersion})`)
db.close()