/**
 * Coverage probe for the open-data rebuild (docs/release/06-OUR-OWN-DATA.md §7
 * step 2): BEFORE building the pipeline, measure how much of a real club-season
 * Wikipedia can give us, at three league levels.
 *
 *   npx tsx scripts/probe-wikipedia.ts
 *
 * Two routes, because the game uses two kinds of club-season (today's database:
 * the top five leagues from 2018–19 on, the other 50 associations for the
 * CURRENT season only):
 *
 *   history  — player-first (§4.2): the league table → Wikidata club spells
 *              (P54 with dates) → each candidate's "Career statistics" row for
 *              THIS club and season. Club-season articles exist only for big
 *              clubs and are hand-laid-out; the career table is one template.
 *   current  — club-first: the club article's current squad ({{Fs player}}),
 *              which even San Marino's clubs keep, then each player's own page
 *              for stats and age where one exists.
 *
 * Writes nothing to the app. Responses are cached under scripts/.cache/, so a
 * second run costs no requests.
 */
import Database from 'better-sqlite3'
import path from 'path'
import {
  careerRows, categoryMembers, currentSquad, getPages, infoboxSpells, leagueTable, requestCount, resolveTitles, sparql,
} from './lib/wikipedia'

type Probe = {
  label: string; article: string; season: number; route: 'history' | 'current'
  tm: { league: string; season: number } // today's squads, as a yardstick only
}
const PROBES: Probe[] = [
  { label: 'England 2018–19', route: 'history', article: '2018–19 Premier League', season: 2018, tm: { league: 'premier_league', season: 2018 } },
  { label: 'Slovakia 2025–26', route: 'current', article: '2025–26 Slovak First Football League', season: 2025, tm: { league: 'cucl_slovakia_l1', season: 2025 } },
  { label: 'San Marino 2025–26', route: 'current', article: '2025–26 Campionato Sammarinese di Calcio', season: 2025, tm: { league: 'cucl_sanmarino_cs', season: 2025 } },
]

// A club-season needs this many players to be draftable (docs §4.2 step 5).
const MIN_SQUAD = 18

async function leagueClubs(p: Probe) {
  const league = (await getPages([p.article])).get(p.article)!
  if (!league.wikitext) throw new Error(`missing: ${p.article}`)
  const table = leagueTable(league.wikitext)
  const pages = await getPages(table.map(t => t.title))
  return table.map(t => ({ position: t.position, page: pages.get(t.title)! }))
}

async function probeHistory(p: Probe) {
  const clubs = await leagueClubs(p)
  // Candidates: anyone with a spell at the club overlapping the season. Wikidata
  // dates are often year-precision or absent, so the window is loose on purpose;
  // the career row is what confirms.
  const y = p.season
  // One query per club: a whole league in one query ran long enough for the
  // service to cut its response off mid-stream.
  const rows: any[] = []
  for (const c of clubs.filter(c => c.page.wikidata)) rows.push(...(await sparql(`
    SELECT DISTINCT ?club ?article WHERE {
      VALUES ?club { wd:${c.page.wikidata} }
      ?player p:P54 ?spell . ?spell ps:P54 ?club .
      OPTIONAL { ?spell pq:P580 ?start } OPTIONAL { ?spell pq:P582 ?end }
      OPTIONAL { ?player wdt:P569 ?birth }
      # "unknown value" dates come back as an IRI, not a date, and YEAR() on an
      # IRI errors, which silently FAILS the filter: Conor Coady's open Wolves
      # spell vanished that way. So a non-literal date counts as unknown.
      FILTER(!BOUND(?start) || !isLiteral(?start) || YEAR(?start) <= ${y + 1})
      FILTER(!BOUND(?end) || !isLiteral(?end) || YEAR(?end) >= ${y})
      FILTER(!BOUND(?birth) || !isLiteral(?birth) || (YEAR(?birth) >= ${y - 45} && YEAR(?birth) <= ${y - 14}))
      FILTER(BOUND(?start) || BOUND(?end) || BOUND(?birth))
      ?article schema:about ?player ; schema:isPartOf <https://en.wikipedia.org/> .
    }`)))
  const byClub = new Map<string, Set<string>>()
  const add = (qid: string, title: string) => { if (!byClub.has(qid)) byClub.set(qid, new Set()); byClub.get(qid)!.add(title) }
  const fromWikidata = new Set<string>()
  for (const r of rows) {
    const title = decodeURIComponent(r.article.split('/wiki/').pop()).replace(/_/g, ' ')
    add(r.club.split('/').pop(), title)
    fromWikidata.add(title)
  }
  // …plus the club's players category, which catches who Wikidata misses. It
  // lists the club's WHOLE history (Arsenal's runs to four figures), so the
  // first run fetches a lot of pages; they're cached, and the full build needs
  // them anyway, because one player page serves every season of his career.
  // USE_CATEGORY=0 measures Wikidata alone.
  let fromCategory = 0
  if (process.env.USE_CATEGORY !== '0') {
    for (const c of clubs.filter(c => c.page.wikidata)) {
      for (const t of await categoryMembers(`Category:${c.page.title} players`)) {
        if (!byClub.get(c.page.wikidata!)?.has(t)) fromCategory++
        add(c.page.wikidata!, t)
      }
    }
  }
  const all = [...new Set([...byClub.values()].flatMap(s => [...s]))]
  // Parsed in chunks with the wikitext dropped straight after: a league's
  // category players run to thousands of articles, too many to hold as text.
  const parsed = new Map<string, { rows: ReturnType<typeof careerRows>; spells: ReturnType<typeof infoboxSpells> }>()
  for (let i = 0; i < all.length; i += 400) {
    for (const [t, pg] of await getPages(all.slice(i, i + 400))) {
      parsed.set(t, { rows: careerRows(pg.wikitext ?? ''), spells: infoboxSpells(pg.wikitext ?? '') })
    }
    process.stdout.write(`\r  ${p.label}: ${Math.min(i + 400, all.length)}/${all.length} player pages`)
  }
  process.stdout.write('\n')
  // Career tables link clubs in many spellings ("Arsenal F.C.", a redirect…).
  const canon = await resolveTitles([...parsed.values()].flatMap(v => [...v.rows.map(r => r.club), ...v.spells.map(s => s.club)]))
  const same = (link: string, club: string) => (canon.get(link) ?? link) === club

  return clubs.map(c => {
    let table = 0, infobox = 0, wdOnly = 0
    for (const t of byClub.get(c.page.wikidata ?? '') ?? []) {
      const v = parsed.get(t)!
      if (v.rows.length) {
        if (v.rows.some(r => r.season === y && same(r.club, c.page.title) && r.apps > 0)) { table++; if (fromWikidata.has(t)) wdOnly++ }
      } else if (v.spells.some(s => same(s.club, c.page.title) && !s.loan && s.from <= y + 1 && (s.to === null || s.to >= y + 1))) infobox++
    }
    // "wd only": how many of the confirmed players Wikidata alone would have found.
    return { position: c.position, title: c.page.title, cols: { table, 'wd only': wdOnly, infobox }, squad: table + infobox }
  })
}

async function probeCurrent(p: Probe) {
  const clubs = await leagueClubs(p)
  const squads = clubs.map(c => ({ c, squad: currentSquad(c.page.wikitext ?? '') }))
  const linked = squads.flatMap(s => s.squad.map(e => e.article).filter((a): a is string => !!a))
  const pages = await getPages(linked)
  const y = p.season
  const spellsOf = new Map([...pages].map(([t, pg]) => [t, infoboxSpells(pg.wikitext ?? '')]))
  const canon = await resolveTitles([...spellsOf.values()].flatMap(s => s.map(x => x.club)))
  return squads.map(({ c, squad }) => {
    let article = 0, table = 0, caps = 0, age = 0
    for (const e of squad) {
      const w = e.article ? pages.get(e.article)?.wikitext : null
      if (!w) continue // a red link, or no link at all: a name and nothing else
      article++
      // Stats for the season in progress, else last season: either counts as
      // "this page is kept up to date with numbers".
      if (careerRows(w).some(r => r.season === y || r.season === y - 1)) table++
      // The infobox's apps at the CURRENT club: a playing-time signal (apps per
      // season at the club) even where nobody keeps the career table.
      if (spellsOf.get(e.article!)!.some(s => (canon.get(s.club) ?? s.club) === c.page.title && s.to === null && s.caps !== null)) caps++
      if (/\{\{\s*birth date( and age)?\s*\|\s*(df=\w+\|)?\s*\d{4}/i.test(w)) age++
    }
    return { position: c.position, title: c.page.title, cols: { article, table, caps, age }, squad: squad.length }
  })
}

// Today's (Transfermarkt-built) squad sizes, ONLY as a yardstick for the counts;
// nothing from this database goes anywhere near the open build (docs §4.5).
function tmSquads(league: string, season: number): { name: string; n: number }[] {
  // Only against an old (Transfermarkt-built) database given as TM_DB: the
  // bundled one is the open data now.
  if (!process.env.TM_DB) return []
  const db = new Database(process.env.TM_DB, { readonly: true })
  const rows = db.prepare(`
    SELECT c.name AS name, COUNT(*) AS n FROM player_seasons ps
    JOIN club_seasons cs ON cs.id = ps.club_season_id JOIN clubs c ON c.id = cs.club_id
    WHERE c.league_id = ? AND cs.year_start = ? GROUP BY c.name`).all(league, season) as { name: string; n: number }[]
  db.close()
  return rows
}
// Loose name match for the yardstick column: the longest word both names share.
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').split(' ').filter(w => w.length > 3 && !['club', 'calcio'].includes(w))
function todayFor(title: string, tm: { name: string; n: number }[]) {
  const mine = new Set(words(title))
  return tm.find(r => words(r.name).some(w => mine.has(w)))?.n
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0) + '%'

async function main() {
  for (const p of PROBES) {
    const clubs = p.route === 'history' ? await probeHistory(p) : await probeCurrent(p)
    const tm = tmSquads(p.tm.league, p.tm.season)
    const keys = Object.keys(clubs[0]?.cols ?? {})
    console.log(`\n=== ${p.label} · ${p.route} route · ${clubs.length} clubs`)
    console.log('  pos  club                                 ' + keys.map(k => k.padStart(8)).join('') + '   squad   today')
    for (const c of clubs) {
      console.log(`  ${String(c.position).padStart(3)}  ${c.title.padEnd(36).slice(0, 36)} ${keys.map(k => String((c.cols as any)[k]).padStart(8)).join('')} ${String(c.squad).padStart(7)} ${String(todayFor(c.title, tm) ?? '—').padStart(7)}`)
    }
    const sum = (k: string) => clubs.reduce((a, c) => a + ((c.cols as any)[k] ?? 0), 0)
    const squad = clubs.reduce((a, c) => a + c.squad, 0)
    const usable = clubs.filter(c => c.squad >= MIN_SQUAD).length
    if (p.route === 'history') {
      console.log(`  → ${squad} players: ${sum('table')} confirmed by a career row (${pct(sum('table'), squad)}), ${sum('infobox')} infobox estimates`)
    } else {
      console.log(`  → ${squad} squad places: ${pct(sum('article'), squad)} have an article, ${pct(sum('table'), squad)} a career row for this or last season, ${pct(sum('caps'), squad)} infobox apps at this club, ${pct(sum('age'), squad)} a birth date`)
    }
    console.log(`  → avg squad ${(squad / Math.max(1, clubs.length)).toFixed(1)} (today's avg ${(tm.reduce((a, r) => a + r.n, 0) / Math.max(1, tm.length)).toFixed(1)}); ${usable}/${clubs.length} club-seasons reach ${MIN_SQUAD}`)
  }
  console.log(`\n${requestCount()} requests made this run (0 means everything came from the cache).`)
}

main().catch(e => { console.error(e); process.exit(1) })
