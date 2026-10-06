import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { UCL_LEAGUES } from './lib/ucl-leagues'
import { clubStrength } from '../src/engine/rating'

// League format comes from the LIVE registry (not the baked seed), so a format
// tweak just needs a rebuild — no re-scrape. Keyed by cucl seedId.
const FORMAT_BY_SEED = new Map(UCL_LEAGUES.map(l => [l.seedId, l.format]))

// The app's data is the OPEN data (scripts/seed-open, from Wikipedia +
// Wikidata, built by build-open-seeds.ts: docs/release/06-OUR-OWN-DATA.md).
// The Transfermarkt seeds and scrapers were deleted on 30 Sept 2026 (they're in
// git history). DB_OUT writes somewhere else instead (a check build for the
// verify scripts) and leaves DB_VERSION alone.
const DB_OUT   = process.env.DB_OUT
const DB_PATH  = DB_OUT ?? path.join(__dirname, '../assets/db/players_v5.db')
const SEED_DIR = path.join(__dirname, 'seed-open')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE leagues (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    country TEXT NOT NULL, games_per_season INTEGER NOT NULL, tier INTEGER NOT NULL DEFAULT 1,
    format TEXT NOT NULL DEFAULT 'double_round_robin'
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
  `INSERT OR IGNORE INTO leagues (id, name, country, games_per_season, tier, format) VALUES (?, ?, ?, ?, ?, ?)`
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

// The custom UCL seed is a COMBINED file (many domestic leagues, one season) with
// a different shape: { competition, holders, leagues[], clubs[] } where each club
// carries its domestic league_id + assoc_rank + league_position. Each domestic
// league becomes a `cucl_<seedId>` leagues row (assoc_rank stored in `tier`), so
// the app's access-list builder can group by association + finish. `cucl_%` is
// excluded from the normal draft pools (see db/queries/seasons.ts).
function ingestCustomUcl(data: any) {
  for (const lg of data.leagues) {
    const format = FORMAT_BY_SEED.get(lg.seedId) ?? lg.format ?? 'double_round_robin'
    insertLeague.run(`cucl_${lg.seedId}`, lg.name, lg.country, lg.games, lg.assocRank, format)
  }
  for (const club of data.clubs) {
    insertClub.run(
      club.id, `cucl_${club.league_id}`, club.name, club.short_name,
      club.primary_color, club.secondary_color ?? null, club.logo ?? null,
    )
    const csId = `${club.id}_${club.year_start}`
    insertClubSeason.run(csId, club.id, club.year_start, club.year_end, club.historical_ovr, club.league_position ?? null)
    for (const player of club.players) {
      const secPos = Array.isArray(player.secondary_positions)
        ? JSON.stringify(player.secondary_positions)
        : (player.secondary_positions ?? '[]')
      insertPlayer.run(player.id, player.name, player.nationality, player.birth_year ?? null, player.primary_position, secPos)
      insertPlayerSeason.run(
        `${player.id}_${club.year_start}`, player.id, csId, player.ovr,
        player.attack ?? null, player.defense ?? null, player.physical ?? null,
        player.pace ?? null, player.technical ?? null,
        player.goals ?? 0, player.assists ?? 0, player.appearances ?? 0, player.is_icon ?? 0,
      )
    }
  }
  const clubSeasons = data.clubs.length
  const players = data.clubs.reduce((s: number, c: any) => s + c.players.length, 0)
  console.log(`  custom UCL: ${data.leagues.length} leagues · ${clubSeasons} clubs · ${players} player-seasons`)
}

const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'))

for (const file of files) {
  console.log(`processing ${file}...`)
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), 'utf-8'))

  if (data.competition?.id === 'custom_ucl' || file === 'CustomUcl.json') {
    ingestCustomUcl(data)
    continue
  }
  // Not every file in seed/ is a league: the grounds (P8-93, stadiums.json) live
  // there too and are bundled by the app as data, not as a league.
  if (!data.league) { console.log('  (not a league seed; skipped)'); continue }

  insertLeague.run(
    data.league.id,
    data.league.name,
    data.league.country,
    data.league.games_per_season,
    data.league.tier,
    data.league.format ?? 'double_round_robin'
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

// One strength scale (Wave G audit G-L3, 3 Oct 2026). Every club-season's
// strength is rated here, from the players the database actually holds for it,
// with the function that rates your XI (clubStrength in src/engine/rating.ts).
// The seeds' stored historical_ovr was the best 14 stretched ×1.55 around 81,
// a different scale from calcTeamOvr, and it's ignored now. Rating after the
// inserts, not per seed file, because a club-season can appear in more than one
// file and INSERT OR IGNORE keeps the first. scripts/verify-strength.ts holds
// every row to within 1 of its own best XI.
{
  const rows = db.prepare(`SELECT ps.club_season_id AS cs, ps.ovr, p.primary_position AS pos
    FROM player_seasons ps JOIN players p ON p.id = ps.player_id`).all() as { cs: string; ovr: number; pos: string }[]
  const byCs = new Map<string, { ovr: number; primaryPosition: string }[]>()
  for (const r of rows) (byCs.get(r.cs) ?? byCs.set(r.cs, []).get(r.cs)!).push({ ovr: r.ovr, primaryPosition: r.pos })
  const rate = db.prepare('UPDATE club_seasons SET historical_ovr = ? WHERE id = ?')
  db.transaction(() => { for (const [cs, ps] of byCs) rate.run(clubStrength(ps), cs) })()
  console.log(`rated ${byCs.size} club-seasons on the XI scale`)
}

// Auto-bump the app's DB_VERSION (single source of truth = src/db/setup.ts) so
// every build triggers a re-copy on device without us editing it by hand.
const setupPath = path.join(__dirname, '../src/db/setup.ts')
let newVersion = 8
try {
  const setup = fs.readFileSync(setupPath, 'utf-8')
  if (DB_OUT) throw new Error('DB_OUT build, not the app\'s database: version left as is')
  const m = setup.match(/const DB_VERSION = (\d+)/)
  if (!m) throw new Error('DB_VERSION not found in setup.ts')
  newVersion = parseInt(m[1], 10) + 1
  fs.writeFileSync(setupPath, setup.replace(/const DB_VERSION = \d+/, `const DB_VERSION = ${newVersion}`))
  console.log(`↑ bumped DB_VERSION ${m[1]} → ${newVersion} in src/db/setup.ts`)
} catch (e: any) {
  console.warn(`! could not auto-bump DB_VERSION (${e.message}); baking ${newVersion}`)
}

// The scrapers write a slate placeholder (#1E293B / #94A3B8) when a crest's
// colours couldn't be read — 57 of the Champions League copies of a club
// (`liverpool_fc_ucl`) among them, whose domestic row has the real colours.
// Every screen reading `clubs` got the placeholder, which reads as black (the
// maintainer, 24 Sept: "the main clubs, all black, only in the UCL"). Here the
// placeholder borrows the same club's real colours by name, once, in the data,
// so no reader has to know about it.
const COLOUR_FIX = `
  UPDATE clubs SET
    primary_color   = (SELECT c2.primary_color   FROM clubs c2 WHERE c2.name = clubs.name AND upper(c2.primary_color) != '#1E293B' LIMIT 1),
    secondary_color = (SELECT c2.secondary_color FROM clubs c2 WHERE c2.name = clubs.name AND upper(c2.primary_color) != '#1E293B' LIMIT 1)
  WHERE upper(primary_color) = '#1E293B'
    AND EXISTS (SELECT 1 FROM clubs c2 WHERE c2.name = clubs.name AND upper(c2.primary_color) != '#1E293B')`
const fixed = db.prepare(COLOUR_FIX).run().changes
console.log(`✓ ${fixed} placeholder club colours replaced with the club's real ones`)

// A-09: the clubs with no row anywhere to borrow from, coloured by hand from
// their clubs' own descriptions (Wikipedia, 4 Oct 2026: Kolos Kovalivka's
// "club colors are white and black"), shirt first, as Juventus and PAOK are.
const HAND_COLOURS: [name: string, primary: string, secondary: string][] = [
  ['Kolos Kovalivka', '#FFFFFF', '#000000'],
]
for (const [name, primary, secondary] of HAND_COLOURS)
  db.prepare(`UPDATE clubs SET primary_color = ?, secondary_color = ? WHERE name = ? AND upper(primary_color) = '#1E293B'`).run(primary, secondary, name)
// And none left: a placeholder reads as black on every screen that draws a club.
const slate = db.prepare(`SELECT id FROM clubs WHERE upper(primary_color) = '#1E293B'`).all() as { id: string }[]
if (slate.length) {
  console.error(`✗ ${slate.length} clubs still have the placeholder colour: ${slate.map(c => c.id).join(', ')}. Add them to HAND_COLOURS.`)
  db.close()
  process.exit(1)
}

// A club-season with no players is an empty team on the draft wheel. It's what
// the first open build shipped (player-season ids repeated across seed files,
// and INSERT OR IGNORE dropped every repeat without a word), so the build now
// refuses to finish quietly with one.
const empty = db.prepare(`
  SELECT c.name, cs.year_start, c.league_id FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id
  WHERE NOT EXISTS (SELECT 1 FROM player_seasons ps WHERE ps.club_season_id = cs.id)`).all() as { name: string; year_start: number; league_id: string }[]
if (empty.length) {
  console.error(`✗ ${empty.length} club-seasons have NO players, e.g. ${empty.slice(0, 5).map(e => `${e.name} ${e.year_start} (${e.league_id})`).join(', ')}`)
  db.close()
  process.exit(1)
}

// Bake the same version into the asset's _meta for reference.
db.prepare(`INSERT OR REPLACE INTO _meta (key, value) VALUES ('db_version', ?)`).run(newVersion)

console.log(`✓ built ${DB_PATH} (v${newVersion})`)
db.close()

// P8.5-30: the LEGAL flavour's database, beside the full one: the same data
// with every competition and league under its plain descriptive name
// (src/data/legal-names.js; metro.config.js bundles this one in the legal
// build). Clubs and players take their altered names from the tables in
// scripts/legal-names/ (drafted by draft-legal-names.ts, edited by the
// maintainer; docs/release/01-NAMES-MARKS-AND-THE-LAW.md L1); a club or player
// the tables don't have yet keeps its name and is counted, so a missing draft
// shows. Same DB_VERSION: an installed app is one flavour or the other.
const { legalLeagueName, renameText } = require('../src/data/legal-names') as {
  legalLeagueName: (name: string, country: string) => string; renameText: (s: string) => string
}
const LEGAL_PATH = DB_OUT ? DB_OUT.replace(/\.db$/, '') + '_legal.db' : path.join(__dirname, '../assets/db/players_legal.db')
fs.copyFileSync(DB_PATH, LEGAL_PATH)
const legal = new Database(LEGAL_PATH)
const leagues = legal.prepare('SELECT id, name, country FROM leagues').all() as { id: string; name: string; country: string }[]
const renameLeague = legal.prepare('UPDATE leagues SET name = ? WHERE id = ?')
legal.transaction(() => { for (const l of leagues) renameLeague.run(legalLeagueName(l.name, l.country), l.id) })()
// The altered names (id,real,altered,review; a quoted field may hold a comma).
function nameTable(file: string): Map<string, string> {
  const p = path.join(__dirname, 'legal-names', file)
  if (!fs.existsSync(p)) return new Map()
  const out = new Map<string, string>()
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(1)) {
    if (!line) continue
    const cells: string[] = []; let f = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) { if (ch === '"' && line[i + 1] === '"') { f += '"'; i++ } else if (ch === '"') q = false; else f += ch }
      else if (ch === '"') q = true
      else if (ch === ',') { cells.push(f); f = '' }
      else f += ch
    }
    cells.push(f)
    if (cells[0] && cells[2]?.trim()) out.set(cells[0], cells[2].trim())
  }
  return out
}
const clubNames = nameTable('clubs.csv'), playerNames = nameTable('players.csv')
const clubs = legal.prepare('SELECT id, name FROM clubs').all() as { id: string; name: string }[]
const renameClub = legal.prepare('UPDATE clubs SET name = ?, short_name = ? WHERE id = ?')
// A short code from the altered name (three letters), so the old one ("BAY") doesn't point back at the real club.
const codeOf = (n: string) => (n.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CLB')
let clubsMissing = 0
legal.transaction(() => {
  for (const c of clubs) {
    const n = clubNames.get(c.id) ?? renameText(c.name)
    if (!clubNames.has(c.id)) clubsMissing++
    renameClub.run(n, codeOf(n), c.id)
  }
})()
const players = legal.prepare('SELECT id, name FROM players').all() as { id: string; name: string }[]
const renamePlayer = legal.prepare('UPDATE players SET name = ? WHERE id = ?')
let playersMissing = 0
legal.transaction(() => {
  for (const p of players) {
    const n = playerNames.get(p.id)
    if (n) renamePlayer.run(n, p.id); else playersMissing++
  }
})()
legal.close()
console.log(`✓ built ${LEGAL_PATH} (legal names: ${leagues.length} leagues, ${clubs.length - clubsMissing}/${clubs.length} clubs, ${players.length - playersMissing}/${players.length} players altered)`)
if (clubsMissing || playersMissing) console.log(`  ${clubsMissing} clubs and ${playersMissing} players have no altered name yet: npx tsx scripts/draft-legal-names.ts`)
// The public build's twins of the tables keyed by a club's real name follow the same table.
require('./build-legal-twins')