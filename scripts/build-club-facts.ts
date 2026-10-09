/**
 * Phase 9.75 (D7): club facts for every club and every nation, in English and
 * Slovak, from open data. Writes scripts/club_facts_wd.json.
 *
 *   npx tsx scripts/build-club-facts.ts
 *
 * The first pass (8 Oct) wrote what every club has: when it was founded,
 * where it's based, its ground. The maintainer, 9 Oct: "absolutely bland…
 * some clubs have it nice, like Everton, that is the kind of stuff it should
 * have", and the nations had none. So the facts now lead with what a club is
 * known for, all from Wikidata (CC0), every number counted from its items:
 *  - titles: each season or edition whose winner (P1346) is the club, grouped
 *    by its competition (P3450): the league (one in the club's own country,
 *    with a known year), the national cup, Europe's and the world's cups; a
 *    nation's World Cup, continental and FIFA titles. Friendlies, super cups
 *    and youth cups are left out;
 *  - famous names: the three footballers who played for it (P54) with the most
 *    Wikipedia articles (sitelinks);
 *  - the ground, with the year it opened (P1619) when Wikidata's home venue
 *    (P115) is the ground the game shows;
 *  - the nickname (P1449).
 * Founded-and-based-in stays only for a club with fewer than three of those.
 * The hand-written facts (scripts/club_facts.json) come first in the app. The
 * public build shows none (clubFactsData.legal.ts).
 *
 * Clubs: scripts/seed-open/_qids.json (game id → Wikidata item, written by
 * build-open-seeds). Nations: the national team (P31 Q6979593, or since
 * 2025 Q135408445, "men's national association football team") behind the
 * nation's English Wikipedia article. Every SPARQL answer is cached (scripts/.cache).
 */
import fs from 'fs'
import path from 'path'
import { sparql } from './lib/wikipedia'
import { STADIUMS } from '../src/data/stadiums'
import Database from 'better-sqlite3'

const QIDS: Record<string, string> = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-open/_qids.json'), 'utf8'))
const db = new Database(path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const NAME = new Map((db.prepare('SELECT id, name FROM clubs').all() as { id: string; name: string }[]).map(r => [r.id, r.name]))

const qOf = (uri: string) => String(uri).split('/').pop()!
const values = (qs: string[]) => qs.map(q => 'wd:' + q).join(' ')
async function batched<T>(qs: string[], size: number, fn: (b: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < qs.length; i += size) out.push(...await fn(qs.slice(i, i + size)))
  return out
}

// ── Nations ──────────────────────────────────────────────────────────────────
// The game's names where English Wikipedia's article says it differently.
const WIKI_NAME: Record<string, string> = {
  'IR Iran': 'Iran', 'Korea Republic': 'South Korea', 'Turkiye': 'Turkey', 'Czechia': 'Czech Republic',
  "Côte d'Ivoire": 'Ivory Coast', 'DR Congo': 'DR Congo', 'United States': 'United States', 'Cabo Verde': 'Cape Verde',
}
// The first pass looked nations up by country (P1532) and men's football
// (P2094), and found one in 48: most national-team items carry neither. The
// English Wikipedia article is the reliable handle: "Spain national football
// team", "United States men's national soccer team".
async function nationQids(): Promise<Map<string, string>> {
  const ids = [...NAME].filter(([id]) => id.endsWith('_nt'))
  const titles = (name: string) => {
    const w = WIKI_NAME[name] ?? name
    return [`${w} national football team`, `${w} men's national football team`, `${w} men's national soccer team`, `${w} national soccer team`]
  }
  const all = ids.flatMap(([, name]) => titles(name))
  const rows = await batched(all, 60, b => sparql(`
    SELECT ?a ?q ?links WHERE {
      VALUES ?a { ${b.map(x => JSON.stringify(x) + '@en').join(' ')} }
      ?art schema:about ?q ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?a .
      ?q wdt:P31 ?kind ; wikibase:sitelinks ?links . VALUES ?kind { wd:Q6979593 wd:Q135408445 }
    }`))
  const byTitle = new Map(rows.map(r => [r.a as string, { q: qOf(r.q), links: Number(r.links) }]))
  const out = new Map<string, string>()
  for (const [id, name] of ids) {
    const hit = titles(name).map(x => byTitle.get(x)).filter(Boolean).sort((a, b) => b!.links - a!.links)[0]
    if (hit) out.set(id, hit.q)
    else console.log(`  no national team found for ${name} (${id})`)
  }
  return out
}

// ── Titles ───────────────────────────────────────────────────────────────────
type Title = { comp: string; en: string; sk: string; n: number; last?: number; kind: 'league' | 'cup' | 'intl' }
// Competitions Wikidata types only as "association football competition".
const INTL_EXTRA = new Set(['Q715496' /* UEFA Cup */, 'Q245375' /* Inter-Cities Fairs Cup */, 'Q18760' /* UEFA Europa League */])
const INTL_TYPES = /international association football clubs cup|club world championship/
// A nation's: the World Cup, the continental championships, FIFA's other cups.
const NATION_ORGS = /^(FIFA|Union of European Football Associations|CONMEBOL|Confederation of African Football|Asian Football Confederation|CONCACAF|Oceania Football Confederation)$/
const NOT_SENIOR = /Under-|U-?\d\d|Youth|Olympic|Superclásico|Women/i
// A second tier's title as a club's first fact misleads: AC Milan's read
// "Serie B: 2 titles" because Wikidata names no winner for its Serie A
// seasons. A league below the top is left out by its level (P3983) where
// Wikidata has one, and by name where it doesn't (Serie B has none).
const LOWER_TIER = /Serie [B-D]\b|Ligue [23]\b|^2\.|Segunda|Second Division|Third Division|Championship|League (One|Two)\b|Eerste Divisie|Zweite|Liga 2\b|Challenge League|Superettan|\bB$|\bII\b|Prva B|1\. Division/i

async function titlesOf(qs: string[], nation: boolean): Promise<Map<string, Title[]>> {
  const rows = await batched(qs, 40, b => sparql(`
    SELECT ?q ?comp ?compEn ?compSk (GROUP_CONCAT(DISTINCT ?typeEn; separator="|") AS ?types) (GROUP_CONCAT(DISTINCT ?orgEn; separator="|") AS ?orgs)
           (SAMPLE(?sameCountry) AS ?home) (MIN(?level) AS ?lvl) (COUNT(DISTINCT ?s) AS ?n) (MAX(YEAR(COALESCE(?end, ?pit, ?start))) AS ?last) WHERE {
      VALUES ?q { ${values(b)} }
      ?s wdt:P1346 ?q ; wdt:P3450 ?comp .
      OPTIONAL { ?s wdt:P582 ?end } OPTIONAL { ?s wdt:P585 ?pit } OPTIONAL { ?s wdt:P580 ?start }
      OPTIONAL { ?comp rdfs:label ?compEn FILTER(LANG(?compEn) = "en") }
      OPTIONAL { ?comp rdfs:label ?compSk FILTER(LANG(?compSk) = "sk") }
      OPTIONAL { ?comp wdt:P31 ?type . ?type rdfs:label ?typeEn FILTER(LANG(?typeEn) = "en") }
      OPTIONAL { ?comp wdt:P664 ?org . ?org rdfs:label ?orgEn FILTER(LANG(?orgEn) = "en") }
      OPTIONAL { ?comp wdt:P17 ?cc . ?q wdt:P17 ?kc . BIND(?cc = ?kc AS ?sameCountry) }
      OPTIONAL { ?comp wdt:P3983 ?level }
    } GROUP BY ?q ?comp ?compEn ?compSk`))
  const out = new Map<string, Title[]>()
  for (const r of rows) {
    if (!r.compEn || NOT_SENIOR.test(r.compEn)) continue
    const comp = qOf(r.comp), types = String(r.types ?? ''), orgs = String(r.orgs ?? '').split('|')
    const last = r.last ? Number(r.last) : undefined
    let kind: Title['kind'] | null = null
    if (nation) kind = orgs.some(o => NATION_ORGS.test(o)) ? 'intl' : null
    else if (/(^|\|)association football league(\||$)/.test(types)) {
      // A league counts when its titles have years (reserve and regional
      // leagues often don't) and it's in the club's own country: Wikidata
      // once had Real Madrid winning two MLS seasons.
      const top = r.lvl ? Number(r.lvl) === 1 : !LOWER_TIER.test(r.compEn)
      kind = last && top && String(r.home) !== 'false' ? 'league' : null
    } else if (/national association football cup/.test(types)) kind = 'cup'
    else if (INTL_TYPES.test(types) || INTL_EXTRA.has(comp)) kind = 'intl'
    if (!kind || (last && last > 2026)) continue
    const q = qOf(r.q)
    out.set(q, [...(out.get(q) ?? []), { comp, en: r.compEn, sk: r.compSk || r.compEn, n: Number(r.n), last, kind }])
  }
  return out
}

// The ones worth a sentence: two leagues (a club's old and new top flight,
// the First Division and the Premier League), the cup, the best of Europe.
function pickTitles(ts: Title[]): Title[] {
  const by = (k: Title['kind']) => ts.filter(t => t.kind === k).sort((a, b) => b.n - a.n || (b.last ?? 0) - (a.last ?? 0))
  return [...by('league').slice(0, 2), ...by('cup').slice(0, 1), ...by('intl').slice(0, 2)]
}

const skTitles = (n: number) => (n === 1 ? 'titul' : n <= 4 ? 'tituly' : 'titulov')
function titleLine(t: Title): [string, string] {
  if (t.n === 1) return t.last
    ? [`${t.en}: won in ${t.last}.`, `${t.sk}: titul v roku ${t.last}.`]
    : [`${t.en}: won once.`, `${t.sk}: jeden titul.`]
  return t.last
    ? [`${t.en}: ${t.n} titles, the last in ${t.last}.`, `${t.sk}: ${t.n} ${skTitles(t.n)}, naposledy v roku ${t.last}.`]
    : [`${t.en}: ${t.n} titles.`, `${t.sk}: ${t.n} ${skTitles(t.n)}.`]
}

// ── Famous names ─────────────────────────────────────────────────────────────
async function famousOf(qs: string[]): Promise<Map<string, { en: string; sk: string }[]>> {
  const rows = await batched(qs, 15, b => sparql(`
    SELECT ?q ?p ?pEn ?pSk ?links WHERE {
      VALUES ?q { ${values(b)} }
      ?p wdt:P54 ?q ; wdt:P106 wd:Q937857 ; wikibase:sitelinks ?links . FILTER(?links >= 50)
      ?p rdfs:label ?pEn FILTER(LANG(?pEn) = "en")
      OPTIONAL { ?p rdfs:label ?pSk FILTER(LANG(?pSk) = "sk") }
    }`))
  const all = new Map<string, { en: string; sk: string; links: number }[]>()
  for (const r of rows) {
    const q = qOf(r.q), list = all.get(q) ?? []
    if (!list.some(x => x.en === r.pEn)) list.push({ en: r.pEn, sk: r.pSk || r.pEn, links: Number(r.links) })
    all.set(q, list)
  }
  return new Map([...all].map(([q, l]) => [q, l.sort((a, b) => b.links - a.links || (a.en < b.en ? -1 : 1)).slice(0, 3)]))
}
const andList = (xs: string[], and: string) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`

// ── The ground, the place, the nickname ──────────────────────────────────────
type Info = { year?: number; cityEn?: string; citySk?: string; nick?: string; venues: { name: string; opened?: number }[] }

async function infoFor(qids: string[]): Promise<Map<string, Info>> {
  const out = new Map<string, Info>()
  const rows = await batched(qids, 100, b => sparql(`
    SELECT ?q (MIN(YEAR(?inc)) AS ?year) (SAMPLE(?hEn) AS ?hqEn) (SAMPLE(?hSk) AS ?hqSk) (SAMPLE(?lEn) AS ?locEn) (SAMPLE(?lSk) AS ?locSk) (SAMPLE(?nk) AS ?nick) WHERE {
      VALUES ?q { ${values(b)} }
      OPTIONAL { ?q wdt:P571 ?inc }
      OPTIONAL { ?q wdt:P159 ?h . ?h rdfs:label ?hEn . FILTER(LANG(?hEn) = "en")
                 OPTIONAL { ?h rdfs:label ?hSk . FILTER(LANG(?hSk) = "sk") } }
      OPTIONAL { ?q wdt:P131 ?l . ?l rdfs:label ?lEn . FILTER(LANG(?lEn) = "en")
                 OPTIONAL { ?l rdfs:label ?lSk . FILTER(LANG(?lSk) = "sk") } }
      OPTIONAL { ?q wdt:P1449 ?nk . FILTER(LANG(?nk) = "en") }
    } GROUP BY ?q`))
  for (const r of rows) {
    const year = r.year ? Number(r.year) : undefined
    out.set(qOf(r.q), {
      year: year && year > 1800 && year <= 2026 ? year : undefined,
      // One place for both languages: the headquarters where Wikidata has it,
      // else where the club is located (Barcelona's English label came from a
      // district and its Slovak one from the city before).
      cityEn: r.hqEn || r.locEn || undefined,
      citySk: r.hqEn ? r.hqSk || r.hqEn : r.locSk || r.locEn || undefined,
      nick: r.nick || undefined,
      venues: [],
    })
  }
  const venues = await batched(qids, 100, b => sparql(`
    SELECT ?q ?vEn (MIN(YEAR(?open)) AS ?opened) WHERE {
      VALUES ?q { ${values(b)} }
      ?q wdt:P115 ?v . ?v rdfs:label ?vEn FILTER(LANG(?vEn) = "en") OPTIONAL { ?v wdt:P1619 ?open }
    } GROUP BY ?q ?vEn`))
  for (const r of venues) out.get(qOf(r.q))?.venues.push({ name: r.vEn, opened: r.opened ? Number(r.opened) : undefined })
  return out
}

// The same ground under another label ("Bernabéu", "Santiago Bernabéu
// Stadium") shares a long word; a new ground doesn't (Everton's two).
const words = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(w => w.length >= 4 && w !== 'stadium' && w !== 'stadion' && w !== 'arena' && w !== 'park'))
const sameGround = (a: string, b: string) => { const w = words(b); return [...words(a)].some(x => w.has(x)) }

const enNum = (n: number) => n.toLocaleString('en-GB')
const skNum = (n: number) => n.toLocaleString('sk-SK').replace(/ /g, ' ')

async function main() {
  const nations = await nationQids()
  console.log(`${nations.size} of ${[...NAME.keys()].filter(k => k.endsWith('_nt')).length} nations matched`)
  const ids = new Map<string, string>([...Object.entries(QIDS).filter(([id]) => NAME.has(id)), ...nations])
  const clubQs = [...new Set([...ids].filter(([id]) => !id.endsWith('_nt')).map(([, q]) => q))]
  const nationQs = [...new Set(nations.values())]
  const allQs = [...new Set(ids.values())]

  const info = await infoFor(allQs)
  console.log('info done')
  const titles = new Map([...await titlesOf(clubQs, false), ...await titlesOf(nationQs, true)])
  console.log('titles done')
  const famous = await famousOf(allQs)
  console.log('famous names done')

  const en: Record<string, string[]> = {}, sk: Record<string, string[]> = {}
  let rich = 0
  for (const [id, q] of ids) {
    const nation = id.endsWith('_nt')
    const i = info.get(q) ?? { venues: [] }
    const e: string[] = [], s: string[] = []
    const add = ([a, b]: [string, string]) => { e.push(a); s.push(b) }

    for (const tl of pickTitles(titles.get(q) ?? [])) add(titleLine(tl))
    const names = famous.get(q) ?? []
    if (names.length) add([
      `Famous names to have played for ${nation ? 'the national side' : 'the club'}: ${andList(names.map(n => n.en), 'and')}.`,
      `Slávne mená, ktoré hrali za ${nation ? 'reprezentáciu' : 'klub'}: ${andList(names.map(n => n.sk), 'a')}.`,
    ])
    const ground = nation ? undefined : STADIUMS[NAME.get(id) ?? '']
    if (ground?.name) {
      const opened = i.venues.filter(v => v.opened && sameGround(v.name, ground.name)).map(v => v.opened!).sort((a, b) => b - a)[0]
      const cap = ground.capacity
      add([
        `Plays at ${ground.name}${cap ? `, which holds ${enNum(cap)}` : ''}${opened ? `${cap ? ' and' : ', which'} opened in ${opened}` : ''}.`,
        // "Domáci štadión: …", not "na štadióne Štadión Pasienky".
        `Domáci štadión: ${ground.name}${cap ? `, ${skNum(cap)} miest` : ''}${opened ? `, otvorený v roku ${opened}` : ''}.`,
      ])
    }
    if (i.nick) add([`Nicknamed “${i.nick}”.`, `Prezývka: „${i.nick}“.`])
    // The plain ones only where there's little else to say.
    const known = e.length - (ground?.name ? 1 : 0)
    if (known < 3) {
      if (nation && i.year) add([`Has played as a national side since ${i.year}.`, `Reprezentácia hrá od roku ${i.year}.`])
      else if (!nation && i.year && i.cityEn) add([`Founded in ${i.year}, and based in ${i.cityEn}.`, `Klub vznikol v roku ${i.year} a sídli v meste ${i.citySk}.`])
      else if (!nation && i.year) add([`Founded in ${i.year}.`, `Klub vznikol v roku ${i.year}.`])
      else if (!nation && i.cityEn) add([`Based in ${i.cityEn}.`, `Sídli v meste ${i.citySk}.`])
    } else rich++
    if (e.length) { en[id] = e; sk[id] = s }
  }
  fs.writeFileSync(path.join(__dirname, 'club_facts_wd.json'), JSON.stringify({ en, sk }, null, 1) + '\n')
  const n = Object.keys(en).length
  console.log(`${n} of ${ids.size} sides have facts (${Object.keys(en).filter(k => k.endsWith('_nt')).length} nations); ${rich} with three or more beyond the ground; ${Object.values(en).reduce((x, f) => x + f.length, 0)} sentences a language`)
}
main().catch(e => { console.error(e); process.exit(1) })
