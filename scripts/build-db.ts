import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const DB_PATH  = path.join(__dirname, '../assets/db/players.db')
const SEED_DIR = path.join(__dirname, 'seed')

// make sure assets/db exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

// delete old db if exists
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)

const db = new Database(DB_PATH)

// schema
db.exec(`
  CREATE TABLE leagues (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    country TEXT NOT NULL, games_per_season INTEGER NOT NULL, tier INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE clubs (
    id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(id),
    name TEXT NOT NULL, short_name TEXT NOT NULL,
    primary_color TEXT NOT NULL, secondary_color TEXT
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
  CREATE INDEX idx_ps_club_season ON player_seasons(club_season_id);
  CREATE INDEX idx_ps_player      ON player_seasons(player_id);
  CREATE INDEX idx_cs_club        ON club_seasons(club_id);
  CREATE INDEX idx_cs_year        ON club_seasons(year_start);
  CREATE INDEX idx_clubs_league   ON clubs(league_id);
`)

// load all json files from seed/
const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'))

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), 'utf-8'))

  // insert league
  db.prepare(`INSERT OR IGNORE INTO leagues (id, name, country, games_per_season, tier)
  VALUES (?, ?, ?, ?, ?)`).run(
  data.league.id,
  data.league.name,
  data.league.country,
  data.league.games_per_season,
  data.league.tier
  )

// replace the club insert
  db.prepare(`INSERT OR IGNORE INTO clubs (id, league_id, name, short_name, primary_color, secondary_color)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    club.id,
    club.league_id,
    club.name,
    club.short_name,
    club.primary_color,
    club.secondary_color ?? null
  )

// replace the club_season insert
  db.prepare(`INSERT OR IGNORE INTO club_seasons (id, club_id, year_start, year_end, historical_ovr, league_position)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    season.id,
    season.club_id,
    season.year_start,
    season.year_end,
    season.historical_ovr,
    season.league_position ?? null
  )

// replace the player insert
  db.prepare(`INSERT OR IGNORE INTO players (id, name, nationality, birth_year, primary_position, secondary_positions)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    player.id,
    player.name,
    player.nationality,
    player.birth_year ?? null,
    player.primary_position,
    player.secondary_positions
  )

        // insert player_season
        db.prepare(`INSERT OR IGNORE INTO player_seasons
          (id, player_id, club_season_id, ovr, attack, defense, physical, pace, technical, goals, assists, appearances, is_icon)
          VALUES (@id, @player_id, @club_season_id, @ovr, @attack, @defense, @physical, @pace, @technical, @goals, @assists, @appearances, @is_icon)
        `).run({
          id:            `${player.id}_${season.year_start}`,
          player_id:     player.id,
          club_season_id: season.id,
          ovr:           player.ovr,
          attack:        player.attack,
          defense:       player.defense,
          physical:      player.physical,
          pace:          player.pace,
          technical:     player.technical,
          goals:         player.goals ?? 0,
          assists:       player.assists ?? 0,
          appearances:   player.appearances ?? 0,
          is_icon:       player.is_icon ?? 0,
        })
      }
    }
  }
}

console.log(`built ${DB_PATH}`)
db.close()