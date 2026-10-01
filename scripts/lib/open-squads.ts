/**
 * Club-season squads from Wikipedia + Wikidata: the open-data pipeline's squad
 * step (docs/release/06-OUR-OWN-DATA.md §4.2, measured in §4.2a).
 *
 * Two routes, because the game uses two kinds of club-season:
 *
 *   HISTORY (the top leagues' past seasons): player-first. A player's "Career
 *     statistics" table is one template everywhere, while club-season articles
 *     exist only for big clubs and are laid out by hand. So: league table →
 *     clubs → candidates (the club's players category ∪ Wikidata spells) →
 *     each candidate's career row for THIS club and season. No row, not in
 *     that squad: nobody is guessed in.
 *
 *   CURRENT (every association's 2025–26): the club article's current squad,
 *     which even San Marino's clubs keep, then each player's own page for age
 *     and playing time where one exists.
 *
 * Plus the World Cup squads article for the national teams.
 */
import {
  careerRows, categoryMembers, currentSquad, fifaCountries, getPages, getPlayerPages, infoboxSpells,
  leagueTableFor, personFacts, plain, resolveTitles, sparql, splitTop, balancedTemplate, firstLink,
  type PersonFacts,
} from './wikipedia'
import type { DataLevel } from './open-rating'
import { clubNames } from './club-match'

export type OpenPlayer = {
  article: string | null   // English article title (the evidence, the join key); null for a bare name
  name: string             // without the "(footballer, born 1993)" part
  apps: number | null      // league appearances that season (null = unknown)
  goals: number | null
  totalApps?: number | null   // all competitions that season (league, cups, Europe), when the career row has it
  totalGoals?: number | null
  games: number            // league games he could have played (a January signing gets half)
  birthYear: number | null
  position: string | null  // game code (GK, CB, LB…)
  country: string | null   // sporting nationality, country name
  demonym: string | null
  level: DataLevel
}
export type OpenClubSeason = { title: string; qid?: string; position: number; players: OpenPlayer[] }

// ── Page facts ───────────────────────────────────────────────────────────────

// The infobox's words for positions → the game's codes. Order matters: "left
// winger" before "winger", "defensive midfielder" before "midfielder".
const POSITION_WORDS: [RegExp, string][] = [
  [/goal ?keeper/, 'GK'],
  [/centre[- ]?back|center[- ]?back|central defender|sweeper/, 'CB'],
  [/left[- ](full[- ]|wing[- ])?back/, 'LB'],
  [/right[- ](full[- ]|wing[- ])?back|full[- ]back|wing[- ]back/, 'RB'],
  [/defender/, 'CB'],
  [/defensive midfielder|holding midfielder/, 'CDM'],
  [/attacking midfielder|playmaker/, 'CAM'],
  [/left midfielder/, 'LM'],
  [/right midfielder/, 'RM'],
  [/left wing(er)?/, 'LW'],
  [/right wing(er)?/, 'RW'],
  [/winger|wide midfielder/, 'RW'],
  [/midfielder/, 'CM'],
  [/centre[- ]forward|center[- ]forward|striker|forward/, 'ST'],
]
// The squad templates only say GK/DF/MF/FW: the middle of each line.
const COARSE: Record<string, string> = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' }

export function infoboxPosition(wikitext: string): string | null {
  const raw = wikitext.match(/\|\s*position\s*=([^\n]*)/i)?.[1]
  if (!raw) return null
  // "[[Midfielder#Central midfielder|Central midfielder]], [[Winger]]": the
  // first listed position is the main one.
  const first = plain(raw).split(/,|\/|<br|;| or /i)[0].toLowerCase()
  return POSITION_WORDS.find(([re]) => re.test(first))?.[1] ?? null
}

export function birthYear(wikitext: string): number | null {
  const m = wikitext.match(/\{\{\s*birth[ _]date(?: and age)?\s*\|(?:\s*(?:df|mf)\s*=\s*\w+\s*\|)?\s*(\d{4})/i)
    ?? wikitext.match(/\|\s*birth_date\s*=[^\n]*?\b(1[89]\d\d|20\d\d)\b/)
  return m ? Number(m[1]) : null
}

const displayName = (title: string) => title.replace(/\s*\(.*\)\s*$/, '')

type Parsed = {
  rows: ReturnType<typeof careerRows>
  spells: ReturnType<typeof infoboxSpells>
  birthYear: number | null
  position: string | null
}

// Parse in chunks and keep only what's needed: a league's players run to
// thousands of articles, too many to hold as text at once.
async function parsePlayers(titles: string[], onProgress?: (d: number, n: number) => void): Promise<Map<string, Parsed>> {
  const out = new Map<string, Parsed>()
  for (let i = 0; i < titles.length; i += 500) {
    for (const [t, pg] of await getPlayerPages(titles.slice(i, i + 500))) {
      const w = pg.wikitext ?? ''
      out.set(t, { rows: careerRows(w), spells: infoboxSpells(w), birthYear: birthYear(w), position: infoboxPosition(w) })
    }
    onProgress?.(Math.min(i + 500, titles.length), titles.length)
  }
  return out
}

// ── Candidates for a club ────────────────────────────────────────────────────

/**
 * Everyone who could have played for the club in [fromYear, toYear]: its players
 * category plus Wikidata's spells there, thinned by birth year BEFORE any page
 * is fetched (the category runs back to the club's founding: Arsenal's is four
 * figures). A title Wikidata can't date is kept; the career row decides.
 */
async function clubCandidates(club: { title: string; qid?: string; alt?: string }, fromYear: number, toYear: number, facts: Map<string, PersonFacts>) {
  // Both namings: English clubs file "X players", Spanish ones (and others)
  // "X footballers". Reading only "players" left Getafe with 8 players a season.
  const set = new Set<string>([
    ...await categoryMembers(`Category:${club.title} players`),
    ...await categoryMembers(`Category:${club.title} footballers`),
    // The name the league table linked, when the article has since moved: SPAL's
    // article became "Ars et Labor Ferrara Calcio" after the club was refounded,
    // but its players are still filed under the old club's category.
    ...(club.alt && club.alt !== club.title ? [
      ...await categoryMembers(`Category:${club.alt} players`),
      ...await categoryMembers(`Category:${club.alt} footballers`),
    ] : []),
  ])
  // Still (nearly) empty: the category is named after a short name that's
  // neither title. SPAL's players sit in "Category:SPAL players" while the
  // article is "Ars et Labor Ferrara Calcio" and the link "S.P.A.L.". Wikidata's
  // aliases for the club carry that short name.
  if (set.size < 100 && club.qid) {
    const aliases = ((await clubNames([club.qid])).get(club.qid) ?? []).filter(a => a !== club.title && a !== club.alt).slice(0, 6)
    for (const a of aliases) for (const suffix of ['players', 'footballers']) for (const t of await categoryMembers(`Category:${a} ${suffix}`)) set.add(t)
  }
  if (club.qid) {
    // A non-literal date is "unknown value": YEAR() on it errors and silently
    // fails the filter (Conor Coady vanished that way), so it counts as unknown.
    const rows = await sparql(`
      SELECT DISTINCT ?article WHERE {
        ?player p:P54 ?spell . ?spell ps:P54 wd:${club.qid} .
        OPTIONAL { ?spell pq:P580 ?start } OPTIONAL { ?spell pq:P582 ?end }
        FILTER(!BOUND(?start) || !isLiteral(?start) || YEAR(?start) <= ${toYear + 1})
        FILTER(!BOUND(?end) || !isLiteral(?end) || YEAR(?end) >= ${fromYear})
        ?article schema:about ?player ; schema:isPartOf <https://en.wikipedia.org/> .
      }`)
    for (const r of rows) set.add(decodeURIComponent(r.article.split('/wiki/').pop()).replace(/_/g, ' '))
  }
  const titles = [...set]
  const unknown = titles.filter(t => !facts.has(t))
  for (const [t, f] of await personFacts(unknown)) facts.set(t, f)
  // Playing between 15 and 42: generous at both ends on purpose.
  return titles.filter(t => {
    const by = facts.get(t)?.birthYear
    return by === undefined || (by <= toYear - 15 && by >= fromYear - 42)
  })
}

// ── HISTORY route ────────────────────────────────────────────────────────────

/**
 * Many seasons of one league at once, so each player page is fetched and parsed
 * ONCE for all of them (one page carries a whole career).
 */
export async function historyLeague(
  articleFor: (year: number) => string, years: number[], opts: { fullGames: (clubs: number) => number; onProgress?: (d: number, n: number) => void },
): Promise<Map<number, OpenClubSeason[]>> {
  const tables = new Map<number, { position: number; title: string; qid?: string }[]>()
  for (const y of years) {
    const table = await leagueTableFor(articleFor(y))
    const pages = await getPages(table.map(t => t.title))
    tables.set(y, table.map(t => ({ position: t.position, title: pages.get(t.title)!.title, qid: pages.get(t.title)!.wikidata, alt: t.title })))
  }
  return historyFromTables(tables, years, opts.fullGames, opts.onProgress)
}

type Table = { position: number; title: string; qid?: string; alt?: string }[]

// The history route's core, for any set of club-seasons: a whole league across
// seasons (historyLeague) or one club (historyClub). One place for the rules,
// so the single-club path can't drift from the league one again (it had no
// infobox fallback, and Slovan Bratislava's 2024–25 came out with 3 players).
async function historyFromTables(
  tables: Map<number, Table>, years: number[], fullGames: (clubs: number) => number, onProgress?: (d: number, n: number) => void,
): Promise<Map<number, OpenClubSeason[]>> {
  // Clubs across all the seasons (promoted and relegated ones come and go).
  const clubs = new Map<string, { title: string; qid?: string; alt?: string; years: number[] }>()
  for (const [y, t] of tables) for (const c of t) {
    const e = clubs.get(c.title) ?? { title: c.title, qid: c.qid, alt: c.alt, years: [] }
    e.years.push(y); clubs.set(c.title, e)
  }
  const facts = new Map<string, PersonFacts>()
  const cand = new Map<string, string[]>()
  for (const c of clubs.values()) cand.set(c.title, await clubCandidates(c, Math.min(...c.years), Math.max(...c.years), facts))
  const parsed = await parsePlayers([...new Set([...cand.values()].flat())], onProgress)
  // Only the links that decide something get resolved: rows in the seasons we
  // build, and spells starting in one of their second halves (the January
  // check). Every club in every career would be tens of thousands of lookups.
  const joinYears = new Set(years.map(y => y + 1))
  const canon = await resolveTitles([...parsed.values()].flatMap(v => [
    ...v.rows.filter(r => years.includes(r.season)).map(r => r.club),
    // …and every spell of a player with no career table (the infobox fallback).
    ...v.spells.filter(s => joinYears.has(s.from) || !v.rows.length).map(s => s.club),
  ]))
  const same = (link: string, club: string) => (canon.get(link) ?? link) === club

  const out = new Map<number, OpenClubSeason[]>()
  for (const [y, table] of tables) {
    const full = fullGames(table.length)
    const seasonClubs: OpenClubSeason[] = table.map(c => {
      const players: OpenPlayer[] = []
      for (const t of cand.get(c.title) ?? []) {
        const v = parsed.get(t)
        if (!v) continue
        const row = v.rows.find(r => r.season === y && same(r.club, c.title) && r.apps > 0)
        if (!row) {
          // No career table at all (8% of England 2018–19 in the probe): the
          // infobox spell stands in if it covers the season, its apps spread
          // over the spell's seasons, marked partial. A page WITH a table but no
          // row for this season wasn't in this squad, so it stays out.
          if (v.rows.length) continue
          const spell = v.spells.find(s => same(s.club, c.title) && !s.loan && s.from <= y && (s.to === null || s.to >= y + 1))
          // The parent spell covers loans away too, and a long spell covers
          // seasons he never played: the first build padded Serie A and Ligue 1
          // squads to ~37 (Parma 2020–21: 50, eleven with no apps). So the spell
          // must list apps, and a loan elsewhere that season means he wasn't here.
          if (!spell || !spell.caps) continue
          const awayOnLoan = v.spells.some(s => s.loan && !same(s.club, c.title) && s.from <= y && (s.to === null || s.to >= y + 1))
          if (awayOnLoan) continue
          const seasons = Math.max(1, (spell.to ?? Math.max(...years) + 1) - spell.from)
          const f = facts.get(t)
          players.push({
            article: t, name: displayName(t), apps: spell.caps !== null ? Math.round(spell.caps / seasons) : null, goals: null,
            games: full, birthYear: v.birthYear ?? f?.birthYear ?? null, position: v.position,
            country: f?.country ?? null, demonym: f?.demonym ?? null, level: 'partial',
          })
          continue
        }
        // A January signing: his FIRST spell at this club starts in the season's
        // second calendar year, so he could only play the second half.
        // (Almirón's 10 games for Newcastle in 2018–19 were 10 of ~15, not of 38.)
        // "First" matters: Lenglet's loan at Atlético becoming permanent opens a
        // second spell in 2025, which read as a January arrival and halved him.
        const atClub = v.spells.filter(s => same(s.club, c.title))
        const midSeason = atClub.length > 0 && Math.min(...atClub.map(s => s.from)) === y + 1
        const f = facts.get(t)
        players.push({
          article: t, name: displayName(t), apps: row.apps, goals: row.goals, totalApps: row.totalApps, totalGoals: row.totalGoals,
          games: midSeason ? Math.ceil(full / 2) : full,
          birthYear: v.birthYear ?? f?.birthYear ?? null, position: v.position,
          country: f?.country ?? null, demonym: f?.demonym ?? null, level: 'full',
        })
      }
      // Can't field a team on the strict rules (Valladolid 2018–19 lost its
      // defenders): the looser infobox reading fills in, spells that cover the
      // season without listing apps, still never a player away on loan.
      const DEF = new Set(['CB', 'LB', 'RB'])
      const playable = players.length >= 11 && players.some(p => p.position === 'GK') && players.filter(p => DEF.has(p.position ?? '')).length >= 3
      if (!playable) {
        const have = new Set(players.map(p => p.article))
        for (const t of cand.get(c.title) ?? []) {
          const v = parsed.get(t)
          if (!v || v.rows.length || have.has(t)) continue
          const covers = v.spells.some(s => same(s.club, c.title) && !s.loan && s.from <= y && (s.to === null || s.to >= y + 1))
          const awayOnLoan = v.spells.some(s => s.loan && !same(s.club, c.title) && s.from <= y && (s.to === null || s.to >= y + 1))
          if (!covers || awayOnLoan) continue
          const f = facts.get(t)
          players.push({
            article: t, name: displayName(t), apps: null, goals: null, games: full,
            birthYear: v.birthYear ?? f?.birthYear ?? null, position: v.position,
            country: f?.country ?? null, demonym: f?.demonym ?? null, level: 'partial',
          })
        }
      }
      return { title: c.title, qid: c.qid, position: c.position, players }
    })
    // A season in progress: "games he could have played" is the matchdays so
    // far, which the league's most-used player shows better than the fixture list.
    const maxApps = Math.max(0, ...seasonClubs.flatMap(c => c.players.map(p => p.apps ?? 0)))
    if (maxApps > 0 && maxApps < full * 0.8) for (const c of seasonClubs) for (const p of c.players) p.games = Math.min(p.games, maxApps)
    out.set(y, seasonClubs)
  }
  return out
}

/** One club's season by the history route (a Champions League side from outside the five leagues). */
export async function historyClub(title: string, year: number, fullGames: number): Promise<OpenPlayer[]> {
  const page = (await getPages([title])).get(title)!
  const built = await historyFromTables(new Map([[year, [{ position: 1, title: page.title, qid: page.wikidata }]]]), [year], () => fullGames)
  return built.get(year)?.[0]?.players ?? []
}

// ── CURRENT route ────────────────────────────────────────────────────────────

let fifa: Awaited<ReturnType<typeof fifaCountries>> | null = null

/**
 * A league's CURRENT season from its clubs' squad lists. Each player's level:
 *   full    — a career row for this season (apps so far) or last season;
 *   partial — a page with an age, apps estimated from the infobox spell;
 *   bare    — a name, position and nationality only (rated by the bare rule).
 */
export async function currentLeague(article: string, year: number, fullGames: number): Promise<OpenClubSeason[]> {
  fifa ??= await fifaCountries()
  const table = await leagueTableFor(article)
  const clubPages = await getPages(table.map(t => t.title))
  const clubs = table.map(t => ({ position: t.position, page: clubPages.get(t.title)! }))
  const squads = clubs.map(c => ({ c, squad: currentSquad(c.page.wikitext ?? '') }))
  const linked = [...new Set(squads.flatMap(s => s.squad.map(e => e.article).filter((a): a is string => !!a)))]
  const parsed = await parsePlayers(linked)
  const facts = await personFacts(linked)
  const canon = await resolveTitles([...parsed.values()].flatMap(v => [...v.rows.filter(r => r.season >= year - 1).map(r => r.club), ...v.spells.map(s => s.club)]))

  const seasonClubs = squads.map(({ c, squad }) => {
    const same = (link: string) => (canon.get(link) ?? link) === c.page.title
    const players: OpenPlayer[] = squad.map(e => {
      const nat = fifa!.get(e.nat.toUpperCase())
      const base = {
        article: null as string | null, name: e.name, apps: null as number | null, goals: null as number | null, games: fullGames,
        birthYear: null as number | null, position: COARSE[e.pos.toUpperCase()] ?? null,
        country: nat?.country ?? null, demonym: nat?.demonym ?? null, level: 'bare' as DataLevel,
      }
      const v = e.article ? parsed.get(e.article) : undefined
      if (!e.article || !v || (!v.rows.length && !v.spells.length && v.birthYear === null)) return base
      const f = facts.get(e.article)
      const p = { ...base, article: e.article, name: displayName(e.article), birthYear: v.birthYear ?? f?.birthYear ?? null, position: v.position ?? base.position, level: 'partial' as DataLevel }
      const now = v.rows.find(r => r.season === year && same(r.club))
      const last = v.rows.find(r => r.season === year - 1)
      if (now) return { ...p, apps: now.apps, goals: now.goals, totalApps: now.totalApps, totalGoals: now.totalGoals, level: 'full' as DataLevel, games: -1 } // games: set below, from the matchdays so far
      if (last) return { ...p, apps: last.apps, goals: last.goals, totalApps: last.totalApps, totalGoals: last.totalGoals, level: 'full' as DataLevel }
      // Infobox apps over the current spell, spread over its seasons so far.
      const spell = v.spells.find(s => same(s.club) && s.to === null && s.caps !== null)
      if (spell) return { ...p, apps: Math.round(spell.caps! / Math.max(1, year - spell.from + 1)) }
      return p // an age and a position, no apps: rated by the bare rule, with his age known
    })
    return { title: c.page.title, qid: c.page.wikidata, position: c.position, players }
  })
  const maxApps = Math.max(1, ...seasonClubs.flatMap(c => c.players.filter(p => p.games === -1).map(p => p.apps ?? 0)))
  for (const c of seasonClubs) for (const p of c.players) if (p.games === -1) p.games = maxApps
  return seasonClubs
}

/**
 * The last fallback for a squad still too thin to play (a club whose English
 * page lists no squad: Domžale, Rabotnički, Pas de la Casa…): Wikidata's own
 * "member of sports team" (P54) records with an open spell, which cover players
 * with no English article at all. Name, position (P413), birth year and
 * nationality; no apps, so they're rated as low-data players.
 */
export async function wikidataSquad(qid: string, year: number): Promise<OpenPlayer[]> {
  const rows = await sparql(`
    SELECT ?p (SAMPLE(?name) AS ?label) (SAMPLE(?pl) AS ?pos) (MIN(YEAR(?b)) AS ?born) (SAMPLE(?cl) AS ?country) (SAMPLE(?dn) AS ?demonym) WHERE {
      ?p p:P54 ?s . ?s ps:P54 wd:${qid} .
      OPTIONAL { ?s pq:P580 ?start } OPTIONAL { ?s pq:P582 ?end }
      FILTER(!BOUND(?end) || (isLiteral(?end) && YEAR(?end) >= ${year + 1}))
      FILTER(!BOUND(?start) || !isLiteral(?start) || YEAR(?start) >= ${year - 6})
      ?p wdt:P106 wd:Q937857 .
      ?p rdfs:label ?name . FILTER(LANG(?name) = "en" || LANG(?name) = "mul")
      OPTIONAL { ?p wdt:P569 ?b . FILTER(isLiteral(?b)) }
      OPTIONAL { ?p wdt:P413 ?position . ?position rdfs:label ?pl . FILTER(LANG(?pl) = "en") }
      OPTIONAL { ?p wdt:P1532|wdt:P27 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en")
                 OPTIONAL { ?c wdt:P1549 ?dn . FILTER(LANG(?dn) = "en") } }
      FILTER(!BOUND(?b) || YEAR(?b) >= ${year - 40})
    } GROUP BY ?p`)
  return rows.map(r => ({
    article: null, name: r.label, apps: null, goals: null, games: 0,
    birthYear: r.born ? Number(r.born) : null,
    position: r.pos ? POSITION_WORDS.find(([re]) => re.test(r.pos.toLowerCase()))?.[1] ?? null : null,
    country: r.country ?? null, demonym: r.demonym ?? null, level: 'bare' as DataLevel,
  }))
}

// ── The World Cup ────────────────────────────────────────────────────────────

export type NationSquad = { nation: string; players: { article: string | null; name: string; position: string | null; birthYear: number | null; caps: number | null; goals: number | null; club: string | null }[] }

/**
 * "2026 FIFA World Cup squads": one ===Nation=== heading per team, then
 * {{nat fs g player|no=|pos=|name=|age=|caps=|goals=|club=}} rows.
 */
export async function worldCupSquads(article: string): Promise<NationSquad[]> {
  const w = (await getPages([article])).get(article)?.wikitext ?? ''
  const out: NationSquad[] = []
  const heads = [...w.matchAll(/^===\s*([^=\n]+?)\s*===\s*$/gm)]
  for (let i = 0; i < heads.length; i++) {
    const section = w.slice(heads[i].index!, heads[i + 1]?.index ?? w.length)
    const players: NationSquad['players'] = []
    for (const m of section.matchAll(/\{\{\s*nat fs (?:g )?player\b/gi)) {
      const tpl = balancedTemplate(section, m.index!)
      const arg = (k: string) => splitTop(tpl.slice(2, -2), '|').map(s => s.trim()).find(s => new RegExp(`^${k}\\s*=`).test(s))?.replace(/^[^=]*=/, '').trim() ?? ''
      const nameRaw = arg('name')
      if (!nameRaw) continue
      const age = arg('age').match(/\|\s*(19\d\d|20\d\d)\s*\|/g)
      const num = (s: string) => (/^\d+$/.test(plain(s)) ? Number(plain(s)) : null)
      players.push({
        article: firstLink(nameRaw), name: plain(nameRaw), position: COARSE[plain(arg('pos')).toUpperCase()] ?? null,
        // {{birth date and age2|2026|6|11|1990|3|4}}: the SECOND year is the birth year.
        birthYear: age && age.length >= 2 ? Number(age[1].replace(/\D/g, '')) : null,
        caps: num(arg('caps')), goals: num(arg('goals')), club: firstLink(arg('club')),
      })
    }
    if (players.length >= 10) out.push({ nation: plain(heads[i][1]), players })
  }
  return out
}
