/**
 * The open-data build (docs/release/06-OUR-OWN-DATA.md §7, roadmap P8.5-32):
 * every competition the game's modes use, rebuilt from Wikipedia + Wikidata
 * with PoM's own rating, written as seeds in the SAME shapes as scripts/seed/,
 * so build-db.ts and the app need no change.
 *
 *   npx tsx scripts/build-open-seeds.ts            # everything
 *   ONLY=la_liga npx tsx scripts/build-open-seeds.ts
 *
 * What it matches, from today's seeds:
 *   • the five leagues, 2018–19 to 2025–26 (history route);
 *   • all 55 associations, 2025–26 (current route; the five reuse the above);
 *   • Champions League 2024–25 and 2025–26, Europa and Conference League 2025–26
 *     (each club's squad from its league build; 2024–25 outsiders by the
 *     history route for that one club);
 *   • the 2026 World Cup's 48 squads.
 * Club identities (ids, names, short names, colours) are carried over from
 * today's seeds for now, so saves and screens line up; the colours are the one
 * part still derived from Transfermarkt crests and are replaced from Wikidata
 * in a later step (§4.8).
 *
 * Writes scripts/seed-open/*.json and scripts/seed-open/_report.json (the
 * coverage and rating detail the spreadsheets are made from). Today's seeds are
 * read for identities and for the coverage comparison only.
 */
import fs from 'fs'
import path from 'path'
import { flagForNationality } from '../src/data/geo-iso'
import { leagueArticle } from './lib/open-leagues'
import { attributes, bandForRank, openOvrParts, slugify, teamStrength, type LeagueBand, type RatingParts } from './lib/open-rating'
import { currentLeague, historyClub, historyLeague, wikidataSquad, worldCupSquads, type OpenClubSeason, type OpenPlayer } from './lib/open-squads'
import { getPages, requestCount } from './lib/wikipedia'
import { clubColours, clubNames, clubVenues, infoboxGround, infoboxKit, matchOneToOne, type Candidate, type Venue } from './lib/club-match'

// The game's club identities (ids, names, short codes, which clubs play which
// competition), kept from the old seeds with every player and Transfermarkt id
// taken out (30 Sept 2026), so the Transfermarkt seeds themselves could go.
const SEED = path.join(__dirname, 'seed-identity')
// OPEN_OUT: write somewhere else (a trial build beside a running one).
const OUT = process.env.OPEN_OUT ?? path.join(__dirname, 'seed-open')
const ONLY = process.env.ONLY
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'))
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`)

const custom = read('CustomUcl.json')
const RANK = new Map<string, number>(custom.leagues.map((l: any) => [l.seedId, l.assocRank]))
const GAMES = new Map<string, number>(custom.leagues.map((l: any) => [l.seedId, l.games]))
const TOP5 = ['premier_league', 'serie_a', 'la_liga', 'bundesliga', 'ligue_1']

// ── Matching Wikipedia clubs to the game's club identities ─────────────────
// (scripts/lib/club-match.ts: one-to-one, with Wikidata aliases.) The Q-id of
// every Wikipedia club seen, so its aliases can be fetched.
const QID = new Map<string, string>()
// …and each GAME club id's Q-id, once matched: the colours and grounds step
// (finishClubs) looks clubs up by it.
const CLUB_QID = new Map<string, string>()
const CLUB_TITLE = new Map<string, string>() // game club id → its Wikipedia article (for the infobox kit and ground)
const candidates = async (titles: string[]): Promise<Candidate[]> => {
  const names = await clubNames(titles.map(t => QID.get(t)).filter((q): q is string => !!q))
  return titles.map(t => ({ title: t, names: names.get(QID.get(t) ?? '') ?? [] }))
}
/** The Wikipedia club (from a pool of titles) that is this game club, if any. */
async function wikiFor(name: string, pool: string[]): Promise<string | undefined> {
  return [...matchOneToOne(await candidates(pool), [name], n => n).keys()][0]
}

// ── Players → seed records ───────────────────────────────────────────────────
type Rated = OpenPlayer & { parts: RatingParts; club: string; clubPosition: number }

// Where Wikidata's wording and the game's differ (the game's list, in
// src/data/geo-iso.ts, was read off the old database's values).
const NATIONALITY_ALIAS: Record<string, string> = {
  'Ivory Coast': 'Ivorian', Ivoirian: 'Ivorian', "Côte d'Ivoire": 'Ivorian', Nigeria: 'Nigerian',
  'Democratic Republic of the Congo': 'Congolese', 'Republic of the Congo': 'Congolese', 'Cape Verde': 'Cape Verdean',
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina', 'Czech Republic': 'Czech', Czechia: 'Czech', 'South Korea': 'South Korean',
  'Republic of Ireland': 'Irish', 'United States': 'American', Türkiye: 'Turkish', Turkey: 'Turkish',
  'Kingdom of the Netherlands': 'Dutch', Netherlands: 'Dutch', 'The Gambia': 'The Gambia', Gambia: 'The Gambia',
}

// Wikidata's demonyms come in odd shapes too: plurals ("Zambians",
// "Venezuelans"), lowercase ("dane"), or a region ("Catalan", "Persian").
Object.assign(NATIONALITY_ALIAS, {
  Persian: 'Iranian', Iran: 'Iranian', Catalan: 'Spanish', 'Euskal-Erria': 'Spanish', Basque: 'Spanish',
  Santomean: 'Sao Tome and Principe', Kittitian: 'St. Kitts & Nevis', Nevisian: 'St. Kitts & Nevis', Macau: 'Macao', Dane: 'Danish',
})

function nationality(p: { demonym: string | null; country: string | null }) {
  // Whatever the app turns into a flag: demonym first, then the country name,
  // then cleaned-up forms and the aliases for either.
  const raw = [p.demonym, p.country].filter((v): v is string => !!v)
  const tidy = raw.flatMap(v => {
    const cap = v.charAt(0).toUpperCase() + v.slice(1)
    return [v, cap, cap.replace(/s$/, ''), NATIONALITY_ALIAS[v], NATIONALITY_ALIAS[cap]]
  }).filter((v): v is string => !!v)
  for (const v of tidy) if (flagForNationality(v)) return v
  return p.demonym ?? p.country ?? 'Unknown'
}

// `clubsInLeague` defaults to the table given; a lone club (a 2024–25
// Champions League outsider) passes its league's size.
function rate(clubs: OpenClubSeason[], band: LeagueBand, season: number, clubsInLeague = clubs.length): Rated[] {
  return clubs.flatMap(c => c.players.map(p => ({
    ...p, club: c.title, clubPosition: c.position,
    parts: openOvrParts({
      clubPosition: c.position, clubs: clubsInLeague, games: p.games, apps: p.apps, goals: p.goals,
      position: p.position, age: p.birthYear ? season - p.birthYear : null,
      level: p.level, seedName: p.article ?? p.name,
    }, band),
  })))
}

// A name in a script slugify strips entirely (Cyrillic, Greek, Japanese) comes
// out empty, and every such player at a club shared one id: a stable hash of
// the name stands in.
// Letters NFD doesn't decompose would otherwise just vanish from an id
// ("str_msgodset", "fc_su_uroy", Ødegaard → "martin_degaard").
const foldLetters = (s: string) => s.replace(/[Øø]/g, 'o').replace(/[Ææ]/g, 'ae').replace(/[Ðð]/g, 'd').replace(/[Þþ]/g, 'th')
  .replace(/ß/g, 'ss').replace(/[ıİ]/g, 'i').replace(/[Łł]/g, 'l').replace(/[Đđ]/g, 'd').replace(/[Ħħ]/g, 'h').replace(/[Œœ]/g, 'oe')
const slugOrHash = (s: string) => slugify(foldLetters(s)) || 'p' + [...s].reduce((h, ch) => Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0, 2166136261).toString(36)
const idOf = (p: { article: string | null; name: string }, clubId: string) =>
  // An article title is unique (it carries the disambiguator); a bare name isn't,
  // so it's tied to its club.
  p.article ? slugOrHash(p.article) : `${slugOrHash(p.name)}__${clubId}`

// build-db.ts keys a player-season on `${player.id}_${year}` and skips a
// repeat, so an id may appear ONCE per season across every seed file. The old
// seeds kept that by giving each competition's copy its own suffix (_ucl,
// _uel, _uecl, _cucl, _nt); the first open build didn't, and Barcelona's
// 2025–26 players went to whichever file loaded first, leaving the La Liga,
// Champions League and custom-path copies empty. `taken` also catches the same
// player at two clubs of one league in one season (a January move), where the
// second club gets a club-specific id rather than losing him.
const taken = new Set<string>()
function playerRecord(p: Rated, clubId: string, year: number, suffix = '') {
  const pos = p.position ?? 'CM'
  let id = idOf(p, clubId) + suffix
  if (taken.has(`${id}_${year}`)) id = `${idOf(p, clubId)}__${clubId}${suffix}`
  // Last guard: two people with one name at one club.
  for (let n = 2; taken.has(`${id}_${year}`); n++) id = `${idOf(p, clubId)}__${clubId}_${n}${suffix}`
  taken.add(`${id}_${year}`)
  return {
    id, name: p.name, nationality: nationality(p), birth_year: p.birthYear,
    primary_position: pos, secondary_positions: [], ovr: p.parts.ovr, ...attributes(pos, p.parts.ovr),
    goals: p.goals ?? 0, assists: 0, appearances: p.apps ?? 0, is_icon: 0,
  }
}

// Can the squad field a team: 11 players, a keeper, 3 defenders (the same
// shape verify-open-seeds checks).
const DEF = new Set(['CB', 'LB', 'RB'])
function playable(players: { position: string | null }[], min = 11) {
  return players.length >= min && players.some(p => p.position === 'GK') && players.filter(p => DEF.has(p.position ?? '')).length >= 3
}

// ── Report ───────────────────────────────────────────────────────────────────
const report: any = { built: new Date().toISOString(), coverage: [], unmatched: [], ratings: {} }
function cover(league: string, season: number, club: string, before: number, after: number, extra: Record<string, any> = {}) {
  report.coverage.push({ league, season, club, before, after, ...extra })
}

// ── 1 · The five leagues, every season ───────────────────────────────────────
const leagueOut = new Map<string, Map<number, Rated[]>>() // seedId → year → rated (reused by UCL/UEL/UECL/WC)

async function buildTop5(seedId: string) {
  const seed = read(`${seedId}.json`)
  const years = [...new Set<number>(seed.clubs.flatMap((c: any) => c.seasons.map((s: any) => s.year_start)))].sort()
  const band = bandForRank(RANK.get(seedId) ?? 3)
  log(`${seedId}: ${years.length} seasons, band ${band.bottom.toFixed(1)}–${band.top.toFixed(1)}`)
  const built = await historyLeague(y => leagueArticle(seedId, y), years, {
    fullGames: n => (n - 1) * 2,
    onProgress: (d, n) => { if (d % 2000 < 500 || d === n) log(`  ${seedId}: player pages ${d}/${n}`) },
  })
  const perYear = new Map<number, Rated[]>()
  const outClubs = seed.clubs.map((c: any) => ({ ...c, seasons: [] as any[] }))
  for (const [y, clubs] of built) {
    const rated = rate(clubs, band, y)
    perYear.set(y, rated)
    const seedThisYear = seed.clubs.filter((c: any) => c.seasons.some((s: any) => s.year_start === y))
    for (const c of clubs) if (c.qid) QID.set(c.title, c.qid)
    const match = matchOneToOne(await candidates(clubs.map(c => c.title)), seedThisYear, (c: any) => c.name)
    for (const wc of clubs) {
      const sc = match.get(wc.title)
      const players = rated.filter(r => r.club === wc.title)
      if (!sc) { report.unmatched.push({ league: seedId, season: y, wikipedia: wc.title, players: players.length }); continue }
      if (QID.get(wc.title)) CLUB_QID.set(sc.id, QID.get(wc.title)!)
      CLUB_TITLE.set(sc.id, wc.title)
      const old = sc.seasons.find((s: any) => s.year_start === y)
      const recs = players.map(p => playerRecord(p, sc.id, y))
      const out = outClubs.find((c: any) => c.id === sc.id)
      out.seasons.push({ id: old.id, club_id: sc.id, year_start: y, year_end: y + 1, historical_ovr: teamStrength(recs), league_position: wc.position, players: recs })
      cover(seedId, y, sc.name, old.players.length, recs.length, { wikipedia: wc.title, full: recs.length })
    }
    const matched = new Set(match.values())
    for (const sc of seedThisYear) if (!matched.has(sc)) {
      cover(seedId, y, sc.name, sc.seasons.find((s: any) => s.year_start === y).players.length, 0, { wikipedia: null })
    }
    // Every La Liga season, rated, for the review sheet.
    if (seedId === 'la_liga') (report.ratings.la_liga ??= {})[y] = rated.map(r => ({ ...r, nationality: nationality(r), attrs: attributes(r.position ?? 'CM', r.parts.ovr) }))
  }
  for (const c of outClubs) delete c.tm_id
  write(`${seedId}.json`, { league: seed.league, clubs: outClubs.filter((c: any) => c.seasons.length) })
  leagueOut.set(seedId, perYear)
}

// ── 2 · All 55 associations, 2025–26 ─────────────────────────────────────────
const cuclRated = new Map<string, Rated[]>() // seedId → rated (2025)

async function buildCustom() {
  const outClubs: any[] = []
  for (const lg of custom.leagues) {
    const seedId = lg.seedId
    const band = bandForRank(lg.assocRank)
    let rated: Rated[]
    if (TOP5.includes(seedId) && leagueOut.get(seedId)?.get(2025)) rated = leagueOut.get(seedId)!.get(2025)!
    else {
      try {
        const clubs = await currentLeague(leagueArticle(seedId, 2025), 2025, lg.games)
        for (const c of clubs) if (c.qid) QID.set(c.title, c.qid)
        // A thin squad list (Rukh Lviv's page listed 9) is topped up from the
        // club's own 2025-26 history: players whose career row or infobox puts
        // them there this season, added only if they aren't on the list already.
        for (const c of clubs) if (c.players.length < 16) {
          const have = new Set(c.players.map(p => p.article).filter(Boolean))
          const extra = (await historyClub(c.title, 2025, lg.games)).filter(p => !have.has(p.article))
          if (extra.length) { c.players.push(...extra); report.toppedUp = [...(report.toppedUp ?? []), { club: c.title, added: extra.length, from: 'history' }] }
          // Still too thin: Wikidata's squad records, names not already there.
          if (c.players.length < 16 && c.qid) {
            const names = new Set(c.players.map(p => p.name.toLowerCase()))
            // Only up to a 22-man squad, youngest first: Wikidata's "still at the
            // club" spells go stale (Újpest got 39 at first), and the youngest
            // are the likeliest still to be there.
            const wd = (await wikidataSquad(c.qid, 2025)).filter(p => !names.has(p.name.toLowerCase()))
              .sort((a, b) => (b.birthYear ?? 0) - (a.birthYear ?? 0)).slice(0, Math.max(0, 22 - c.players.length))
            if (wd.length) { c.players.push(...wd); report.toppedUp = [...(report.toppedUp ?? []), { club: c.title, added: wd.length, from: 'wikidata' }] }
          }
        }
        rated = rate(clubs, band, 2025)
      } catch (e: any) { log(`  ✗ ${seedId}: ${e.message}`); rated = [] }
    }
    cuclRated.set(seedId, rated)
    const seedClubs = custom.clubs.filter((c: any) => c.league_id === seedId)
    const wikiClubs = [...new Set(rated.map(r => r.club))]
    const match = matchOneToOne(await candidates(wikiClubs), seedClubs, (c: any) => c.name)
    // Wikipedia's 2025 line-up is the truth: several small leagues' game lists
    // were a season out of date (Iceland's had Keflavík and Thór, Wikipedia's
    // table has Vestri and Afturelding). A club with no game identity gets a new
    // one, named from Wikidata, coloured from Wikidata's club colours.
    const fresh = wikiClubs.filter(wt => !match.has(wt))
    const freshNames = await clubNames(fresh.map(wt => QID.get(wt)).filter((q): q is string => !!q))
    const freshColours = await clubColours(fresh.map(wt => QID.get(wt)).filter((q): q is string => !!q))
    for (const wt of wikiClubs) {
      let sc = match.get(wt)
      const players = rated.filter(r => r.club === wt)
      if (!sc) {
        const q = QID.get(wt) ?? ''
        const name = freshNames.get(q)?.[0] ?? wt.replace(/\s*\(.*\)$/, '')
        const [primary, secondary] = [...(freshColours.get(q) ?? []), '#1E293B', '#94A3B8']
        const main = [...name.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().matchAll(/[A-Z]{3,}/g)].map(m => m[0]).sort((a, b) => b.length - a.length)[0] ?? name.toUpperCase()
        sc = {
          id: `${slugOrHash(name)}_cucl`, name, short_name: main.slice(0, 3), primary_color: primary, secondary_color: secondary, logo: null,
          league_id: seedId, assoc_rank: lg.assocRank, year_start: 2025, year_end: 2026, players: [],
        }
        report.newClubs = [...(report.newClubs ?? []), { league: seedId, club: name, wikipedia: wt, colours: freshColours.has(q) }]
      }
      if (QID.get(wt)) CLUB_QID.set(sc.id, QID.get(wt)!)
      CLUB_TITLE.set(sc.id, wt)
      const recs = players.map(p => playerRecord(p, sc.id, 2025, '_cucl'))
      // Can't field a team even after the top-ups (Domžale, Rabotnički, Pas de
      // la Casa: no squad on their pages, stale or no Wikidata records). Left
      // out of the pool rather than padded with invented players; all of them
      // sit in the bottom half of their tables, so no European place moves.
      if (!playable(players)) {
        report.dropped = [...(report.dropped ?? []), { league: seedId, club: sc.name, position: players[0].clubPosition, players: recs.length }]
        cover(`cucl_${seedId}`, 2025, sc.name, sc.players.length, 0, { wikipedia: wt, note: `left out: ${recs.length} players, can't field a team (keeper + 3 defenders)` })
        continue
      }
      const { tm_id, ...ident } = sc
      outClubs.push({ ...ident, league_position: players[0].clubPosition, historical_ovr: teamStrength(recs), players: recs })
      cover(`cucl_${seedId}`, 2025, sc.name, sc.players.length, recs.length, {
        wikipedia: wt, full: players.filter(p => p.level === 'full').length,
        partial: players.filter(p => p.level === 'partial').length, bare: players.filter(p => p.level === 'bare').length,
      })
    }
    const matched = new Set(match.values())
    for (const sc of seedClubs) if (!matched.has(sc)) {
      cover(`cucl_${seedId}`, 2025, sc.name, sc.players.length, 0, { wikipedia: null, note: "not in Wikipedia's 2025-26 table (the game's list was out of date)" })
    }
    log(`  cucl ${seedId}: ${wikiClubs.length} clubs, ${rated.length} players`)
  }
  write('CustomUcl.json', { ...custom, clubs: outClubs })
}

// ── 3 · The European competitions ────────────────────────────────────────────
// A club's squad for a season, from what's already built: the five leagues
// (any season) or the 2025 association builds. Returns the league too, for the
// band a 2024–25 outsider needs.
async function findSquad(name: string, year: number): Promise<{ rated: Rated[]; seedId: string } | null> {
  for (const [seedId, perYear] of leagueOut) {
    const rated = perYear.get(year)
    if (!rated) continue
    const club = await wikiFor(name, [...new Set(rated.map(r => r.club))])
    if (club) return { rated: rated.filter(r => r.club === club), seedId }
  }
  if (year === 2025) for (const [seedId, rated] of cuclRated) {
    const club = await wikiFor(name, [...new Set(rated.map(r => r.club))])
    if (club) return { rated: rated.filter(r => r.club === club), seedId }
  }
  return null
}
async function leagueOfClub(name: string): Promise<{ seedId: string; wikiTitle: string } | null> {
  for (const [seedId, rated] of cuclRated) {
    const club = await wikiFor(name, [...new Set(rated.map(r => r.club))])
    if (club) return { seedId, wikiTitle: club }
  }
  return null
}

// The old seeds' suffix for each competition's copy of a player.
const SUFFIX: Record<string, string> = { 'champions_league.json': '_ucl', 'europa_league.json': '_uel', 'conference_league.json': '_uecl' }

async function buildEurope(file: string) {
  const seed = read(file)
  const outClubs: any[] = []
  for (const c of seed.clubs) {
    const { tm_id, ...ident } = c
    const seasons: any[] = []
    for (const s of c.seasons) {
      let rated = (await findSquad(c.name, s.year_start))?.rated ?? null
      if (!rated && s.year_start !== 2025) {
        // 2024–25 outsider: its own history, rated in its association's band.
        // A Champions League side finished near the top at home, so it's rated
        // as a runner-up (2nd of 12): the league table of that season isn't
        // part of this build.
        const home = await leagueOfClub(c.name)
        if (home) {
          const players = await historyClub(home.wikiTitle, s.year_start, GAMES.get(home.seedId) ?? 34)
          if (playable(players, 16)) rated = rate([{ title: home.wikiTitle, position: 2, players }], bandForRank(RANK.get(home.seedId) ?? 20), s.year_start, 12)
          else {
            // Too little history on Wikipedia for that season (Slovak players
            // rarely have career tables): its 2025-26 squad stands in, and the
            // report says so.
            rated = cuclRated.get(home.seedId)?.filter(r => r.club === home.wikiTitle) ?? null
            report.proxied = [...(report.proxied ?? []), { club: c.name, season: s.year_start, from: '2025-26 squad', found: players.length }]
          }
        }
      }
      if (rated?.[0] && QID.get(rated[0].club)) CLUB_QID.set(c.id, QID.get(rated[0].club)!)
      if (rated?.[0]) CLUB_TITLE.set(c.id, rated[0].club)
      const recs = (rated ?? []).map(p => playerRecord(p, c.id, s.year_start, SUFFIX[file]))
      cover(seed.league.id, s.year_start, c.name, s.players.length, recs.length, { wikipedia: rated ? rated[0]?.club ?? null : null })
      if (recs.length) seasons.push({ ...s, historical_ovr: teamStrength(recs), players: recs })
    }
    if (seasons.length) outClubs.push({ ...ident, seasons })
  }
  write(file, { league: seed.league, clubs: outClubs })
  log(`  ${file}: ${outClubs.length}/${seed.clubs.length} clubs`)
}

// ── 4 · The World Cup ────────────────────────────────────────────────────────
async function buildWorldCup() {
  const seed = read('world_cup.json')
  const nations = await worldCupSquads('2026 FIFA World Cup squads')
  // A national-team player's rating is his CLUB rating for 2025–26 where we
  // built it; otherwise (a club outside everything above) an estimate from his
  // caps, in the band of a mid-ranked association. Both counted in the report.
  const byArticle = new Map<string, Rated>()
  for (const r of [...cuclRated.values()].flat()) if (r.article) byArticle.set(r.article, r)
  // Wikipedia's names for three nations differ from the game's.
  const NATION_ALIAS: Record<string, string[]> = { 'Ivory Coast': ["Côte d'Ivoire"], 'Czech Republic': ['Czechia'], Turkey: ['Turkiye', 'Türkiye'] }
  const byNation = new Map(matchOneToOne(nations.map(n => ({ title: n.nation, names: NATION_ALIAS[n.nation] ?? [] })), seed.clubs, (c: any) => c.name))
  const nationMatch = new Map<any, (typeof nations)[number]>()
  for (const [title, club] of byNation) nationMatch.set(club, nations.find(n => n.nation === title)!)
  const outClubs: any[] = []
  for (const c of seed.clubs) {
    const { tm_id, ...ident } = c
    const nation = nationMatch.get(c)
    const s = c.seasons[0]
    if (!nation) { cover('wc_2026', s.year_start, c.name, s.players.length, 0, { wikipedia: null }); continue }
    let fromClub = 0
    const recs = nation.players.map(p => {
      const club = p.article ? byArticle.get(p.article) : undefined
      if (club) fromClub++
      const est = 66 + Math.min(8, (p.caps ?? 0) / 10)
      const ovr = club ? club.parts.ovr : Math.round(est)
      const pos = club?.position ?? p.position ?? 'CM'
      return {
        id: `${(p.article ? slugify(p.article) : slugify(p.name))}_nt`, name: p.name, nationality: c.name, birth_year: p.birthYear,
        primary_position: pos, secondary_positions: [], ovr, ...attributes(pos, ovr),
        goals: p.goals ?? 0, assists: 0, appearances: p.caps ?? 0, is_icon: 0,
      }
    })
    cover('wc_2026', s.year_start, c.name, s.players.length, recs.length, { wikipedia: nation.nation, fromClub })
    outClubs.push({ ...ident, seasons: [{ ...s, historical_ovr: teamStrength(recs), players: recs }] })
  }
  write('world_cup.json', { league: seed.league, clubs: outClubs })
  log(`  world cup: ${outClubs.length}/${seed.clubs.length} nations`)
}

// ── 5 · Colours and grounds, from Wikidata ─────────────────────────────────
// The last two things the old seeds carried from Transfermarkt: club colours
// (read off its crests) and the grounds (its stadium pages). Wikidata's "club
// colours" (P6364) and "home venue" (P115) replace them where it has them;
// where it doesn't, the identity's colour stays and is listed as the gap.
const STADIUMS_TS = path.join(__dirname, '../src/data/stadiums.ts')

async function finishClubs() {
  const qids = [...new Set(CLUB_QID.values())]
  const colours = await clubColours(qids)
  const venues = await clubVenues(qids)
  // The club articles are already cached from the build: kit and ground read off them.
  const pages = await getPages([...new Set(CLUB_TITLE.values())])
  const kit = (id: string) => { const t = CLUB_TITLE.get(id); return t ? infoboxKit(pages.get(t)?.wikitext ?? '') : [] }
  const ground = (id: string) => { const t = CLUB_TITLE.get(id); return t ? infoboxGround(pages.get(t)?.wikitext ?? '') : null }
  const source = { kit: 0, wikidata: 0 }
  const light = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 }
  const gap: { club: string; qid: string | null }[] = []
  let fromWikidata = 0
  const stadiums: Record<string, Venue> = {}
  const recolour = (club: any) => {
    if (club.id?.endsWith('_nt')) return // nations wear their flag's colours
    const q = CLUB_QID.get(club.id)
    const k = kit(club.id)
    const c = k.length ? k : q ? colours.get(q) : undefined
    if (c?.length) source[k.length ? 'kit' : 'wikidata']++
    if (c?.length) {
      club.primary_color = c[0]
      // One colour only: the second is whichever of white or near-black reads on it.
      club.secondary_color = c.find(x => x !== c[0]) ?? (light(c[0]) ? '#111111' : '#FFFFFF')
      fromWikidata++
    } else gap.push({ club: club.name, qid: q ?? null })
    const v = (q ? venues.get(q) : undefined) ?? ground(club.id)
    if (v) stadiums[club.name] = v
  }
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))
    for (const club of d.clubs ?? []) recolour(club)
    write(f, d)
  }
  report.colours = { fromOpenData: fromWikidata, ...source, gap: gap.length, gapClubs: [...new Map(gap.map(g => [g.club, g])).values()] }
  const keys = Object.keys(stadiums).sort()
  fs.writeFileSync(STADIUMS_TS, `// GENERATED by scripts/build-open-seeds.ts (P8.5-32) — don't edit by hand.
// Every club's current home ground from Wikidata (home venue P115 with no end
// date, capacity P1083, city P131, country P17; CC0), keyed by the club's
// display name (one real club, several ids). ${keys.length} clubs. Replaced the
// Transfermarkt-scraped grounds of P8-93 on 30 September 2026.
export type Stadium = { name: string; capacity?: number; city?: string; country?: string }

export const STADIUMS: Record<string, Stadium> = {
${keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(stadiums[k])},`).join('\n')}
}
`)
  log(`  colours: ${fromWikidata} club records from open data (${source.kit} from the Wikipedia kit, ${source.wikidata} from Wikidata), ${gap.length} kept (the gap); grounds for ${keys.length} clubs`)
}

function write(file: string, data: any) {
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(data, null, 1))
}

async function main() {
  const top5 = ONLY ? TOP5.filter(s => s === ONLY) : TOP5
  for (const s of top5) await buildTop5(s)
  if (!ONLY) {
    log('associations 2025–26'); await buildCustom()
    for (const f of ['champions_league.json', 'europa_league.json', 'conference_league.json']) await buildEurope(f)
    await buildWorldCup()
    await finishClubs()
  }
  // Rated players with their parts, for the La Liga sheet (trimmed to what it shows).
  write('_report.json', report)
  log(`done: ${requestCount()} requests`)
}

main().catch(e => { console.error(e); process.exit(1) })
