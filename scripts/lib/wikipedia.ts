/**
 * Shared Wikipedia + Wikidata library: the open-data replacement for the
 * Transfermarkt scrape (docs/release/06-OUR-OWN-DATA.md, roadmap P8.5-32).
 *
 * WHY this source and not the others: Transfermarkt's terms (§11.1) and FotMob's
 * forbid automated access; Wikipedia's rules ALLOW it on conditions, and this
 * file is where those conditions live, so no caller can skip them:
 *   • a User-Agent naming the tool and the PROJECT's contact address, with "bot"
 *     in it (Wikimedia User-Agent policy) — never a browser string, never a
 *     personal address;
 *   • one request at a time, spaced out (API etiquette: <5 req/s unauthenticated),
 *     `maxlag=5` so we back off when the servers are busy, and honour Retry-After;
 *   • wikitext through the Action API, never scraped HTML;
 *   • every response cached on disk, so a re-run reads the cache, not Wikipedia.
 * Only FACTS are taken (who played where, apps, goals), never article prose, and
 * the app credits "Wikipedia (CC BY-SA 4.0) and Wikidata (CC0)".
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const UA = 'PerfectionOrMiseryBot/0.1 (perfectionormisery@gmail.com) node-fetch'
// Any language edition: the local ones (sk, it) carry players English lacks.
const api = (lang: string) => `https://${lang}.wikipedia.org/w/api.php`
// Cache keys stay unprefixed for English so the first runs' cache stays valid.
const ck = (kind: string, lang: string, t: string) => (lang === 'en' ? kind : `${kind}${lang}:`) + t
const SPARQL = 'https://query.wikidata.org/sparql'
const CACHE_DIR = path.join(__dirname, '../.cache/wikipedia')
// 350 ms apart ≈ 3 req/s: comfortably under the 5/s ceiling, and the cache means
// the slow first run is paid once.
const GAP_MS = 350

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let lastRequest = 0
let requests = 0
export const requestCount = () => requests

function cachePath(key: string) {
  return path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json')
}
function readCache<T>(key: string): T | undefined {
  try { return JSON.parse(fs.readFileSync(cachePath(key), 'utf8')) } catch { return undefined }
}
function writeCache(key: string, value: unknown) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(cachePath(key), JSON.stringify(value))
}

// The one place a request leaves this machine. Serial by construction: every
// caller awaits it, and the gap is enforced here, not trusted to callers.
async function politeGet(url: string, accept = 'application/json', attempt = 1): Promise<any> {
  const wait = lastRequest + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequest = Date.now()
  requests++
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } })
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`GET ${url.slice(0, 120)} → ${res.status}`)
    const retry = Number(res.headers.get('retry-after')) || 5 * attempt
    await sleep(retry * 1000)
    return politeGet(url, accept, attempt + 1)
  }
  if (!res.ok) throw new Error(`GET ${url.slice(0, 120)} → ${res.status}`)
  // The query service streams its JSON and cuts it off when a query runs long,
  // which arrives as a 200 with a broken body. Retry a couple of times; if it
  // keeps happening, the query is too big and the caller should split it.
  const text = await res.text()
  let body: any
  try { body = JSON.parse(text) } catch {
    if (attempt >= 3) throw new Error(`unparseable response (${text.length} bytes) from ${url.slice(0, 120)}`)
    await sleep(10_000)
    return politeGet(url, accept, attempt + 1)
  }
  // maxlag: the API answers 200 with an error when replication is behind. That's
  // its way of saying "not now" — pause and retry rather than push through.
  if (body?.error?.code === 'maxlag') {
    if (attempt >= 5) throw new Error('maxlag persisted')
    await sleep((Number(res.headers.get('retry-after')) || 5) * 1000)
    return politeGet(url, accept, attempt + 1)
  }
  return body
}

async function apiQuery(params: Record<string, string>, lang = 'en'): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })
  return politeGet(`${api(lang)}?${qs}`)
}

export type WikiPage = {
  title: string            // canonical title after redirects
  wikitext: string | null  // null = missing page
  wikidata?: string        // Q-id from pageprops
}

/**
 * Fetch many pages' current wikitext (+ Wikidata id), 20 titles per request,
 * following redirects. Keyed in the result by the title AS ASKED, so callers
 * can look up what they passed in. Cached per asked title.
 */
export async function getPages(titles: string[], lang = 'en'): Promise<Map<string, WikiPage>> {
  const out = new Map<string, WikiPage>()
  const todo: string[] = []
  for (const t of new Set(titles)) {
    const hit = readCache<WikiPage>(ck('page:', lang, t))
    if (hit) out.set(t, hit); else todo.push(t)
  }
  // 20 per request: big club and league articles fill a response quickly, and
  // a smaller batch means fewer `continue` round-trips for the same pages.
  for (let i = 0; i < todo.length; i += 20) {
    for (const [asked, page] of await fetchPages(todo.slice(i, i + 20), lang)) {
      out.set(asked, page)
      writeCache(ck('page:', lang, asked), page)
    }
  }
  return out
}

/**
 * One batch of pages from the API, uncached. When the response hits the size
 * cap, the API moves the rest of the content into `continue`; we follow it, and
 * gather the normalisation and redirect lists from EVERY response (they come in
 * the first one, so reading only the last lost the asked→canonical mapping).
 */
async function fetchPages(batch: string[], lang: string): Promise<Map<string, WikiPage>> {
  const got = new Map<string, WikiPage>()
  const hop = new Map<string, string>()
  let cont: Record<string, string> = {}
  let body: any
  do {
    body = await apiQuery({
      action: 'query', titles: batch.join('|'), redirects: '1',
      prop: 'revisions|pageprops', rvprop: 'content', rvslots: 'main', ppprop: 'wikibase_item',
      ...cont,
    }, lang)
    for (const n of body.query?.normalized ?? []) hop.set(n.from, n.to)
    for (const r of body.query?.redirects ?? []) hop.set(r.from, r.to)
    for (const p of body.query?.pages ?? []) {
      const prev = got.get(p.title)
      const text = p.revisions?.[0]?.slots?.main?.content ?? prev?.wikitext ?? null
      got.set(p.title, { title: p.title, wikitext: p.missing ? null : text, wikidata: p.pageprops?.wikibase_item ?? prev?.wikidata })
    }
    cont = body.continue ?? {}
  } while (body.continue)
  const out = new Map<string, WikiPage>()
  for (const asked of batch) {
    let t = asked
    for (let k = 0; k < 3 && hop.has(t); k++) t = hop.get(t)!
    out.set(asked, got.get(t) ?? { title: t, wikitext: null })
  }
  return out
}

/**
 * A player page cut down to what the pipeline reads: the lead (birth date in
 * prose), the football infobox, and the "Career statistics" section. WHY: the
 * full build touches tens of thousands of player articles, and caching them
 * whole ran to gigabytes; this keeps every field the parsers use while cutting
 * the cache ~10×. A parser that ever needs more bumps TRIM_VERSION and refetches.
 */
const TRIM_VERSION = 1
export function trimPlayerPage(w: string): string {
  const parts = [w.slice(0, 3000)]
  const box = w.search(/\{\{\s*Infobox football biography/i)
  if (box >= 0) parts.push(balancedTemplate(w, box))
  const cs = w.search(/^==+\s*Career statistics\s*==+/im)
  if (cs >= 0) {
    const rest = w.slice(cs)
    const end = rest.slice(2).search(/^==[^=]/m)
    parts.push(end < 0 ? rest : rest.slice(0, end + 2))
  }
  return parts.join('\n\n')
}

/** Like getPages, for player articles: cached trimmed (see trimPlayerPage). */
export async function getPlayerPages(titles: string[]): Promise<Map<string, WikiPage>> {
  const out = new Map<string, WikiPage>()
  const todo: string[] = []
  for (const t of new Set(titles)) {
    const hit = readCache<WikiPage>(`ptrim${TRIM_VERSION}:${t}`) ?? readCache<WikiPage>('page:' + t) // full pages from the probes still count
    if (hit) out.set(t, hit); else todo.push(t)
  }
  // Fetched uncached (fetchPages) so only the trimmed copy is written. 50 per
  // request: player pages are small next to club articles, and `continue`
  // carries whatever doesn't fit.
  for (let i = 0; i < todo.length; i += 50) {
    const got = await fetchPages(todo.slice(i, i + 50), 'en')
    for (const [asked, page] of got) {
      const trimmed = { ...page, wikitext: page.wikitext === null ? null : trimPlayerPage(page.wikitext) }
      out.set(asked, trimmed)
      writeCache(`ptrim${TRIM_VERSION}:${asked}`, trimmed)
    }
  }
  return out
}

export type PersonFacts = { birthYear?: number; country?: string; demonym?: string }

/**
 * Birth year and sporting nationality for many English article titles in ONE
 * Wikidata query per 300 titles, without fetching the articles. Two jobs:
 *   • thin a club's players category (which runs back to the club's founding)
 *     to the people who could have played in the seasons we build, BEFORE
 *     paying for their pages;
 *   • nationality, which the career tables don't carry: "country for sport"
 *     (P1532, so England not the UK), else citizenship (P27), with the
 *     country's English demonym (P1549).
 */
export async function personFacts(titles: string[]): Promise<Map<string, PersonFacts>> {
  const out = new Map<string, PersonFacts>()
  for (let i = 0; i < titles.length; i += 150) await personFactsBatch(titles.slice(i, i + 150), out)
  return out
}

// The first version asked for "P1532, else P27" inside the query (a UNION with
// FILTER NOT EXISTS) over 300 titles, and the query service timed out with a
// 503. Now both properties come back as plain OPTIONALs and the preference is
// made here; and a batch that still fails is split in half until it passes.
async function personFactsBatch(batch: string[], out: Map<string, PersonFacts>): Promise<void> {
  if (!batch.length) return
  const values = batch.map(t => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@en`).join(' ')
  let rows: any[]
  try {
    rows = await sparql(`
      SELECT ?title (MIN(YEAR(?b)) AS ?year) (SAMPLE(?sl) AS ?sport) (SAMPLE(?sd) AS ?sportDemonym)
             (SAMPLE(?cl) AS ?citizen) (SAMPLE(?cd) AS ?citizenDemonym) WHERE {
        VALUES ?title { ${values} }
        ?article schema:name ?title ; schema:isPartOf <https://en.wikipedia.org/> ; schema:about ?p .
        OPTIONAL { ?p wdt:P569 ?b . FILTER(isLiteral(?b)) }
        OPTIONAL { ?p wdt:P1532 ?s . ?s rdfs:label ?sl . FILTER(LANG(?sl) = "en")
                   OPTIONAL { ?s wdt:P1549 ?sd . FILTER(LANG(?sd) = "en") } }
        OPTIONAL { ?p wdt:P27 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en")
                   OPTIONAL { ?c wdt:P1549 ?cd . FILTER(LANG(?cd) = "en") } }
      } GROUP BY ?title`)
  } catch (e) {
    if (batch.length <= 10) throw e
    const half = Math.ceil(batch.length / 2)
    await personFactsBatch(batch.slice(0, half), out)
    await personFactsBatch(batch.slice(half), out)
    return
  }
  for (const r of rows) {
    // "Country for sport" first: England, not the United Kingdom.
    out.set(r.title, {
      birthYear: r.year ? Number(r.year) : undefined,
      country: r.sport ?? r.citizen, demonym: r.sport ? r.sportDemonym : r.citizenDemonym,
    })
  }
}

/** FIFA trigram (the squad templates' nat=ENG) → country name, from Wikidata P3441. */
// The FIFA code (P3441) sits on national TEAMS and federations as well as on
// countries, and the first version sampled whichever came back: "SRB" became
// "Serbia national futsal team" and 40% of players lost their flag. So every
// row comes back and the country is chosen here: a label that isn't a team or a
// federation, else a team label cut down to its country ("Brazil men's
// national football team" → "Brazil").
const TEAMISH = /\b(national|team|federation|association|union|league)\b/i
const cutToCountry = (l: string) => l.replace(/\s+(men's|women's|national|football|futsal|association|team|under-\d+).*$/i, '').trim()

// FIFA codes that aren't the IOC code, or have no IOC code (the home nations).
const FIFA_ONLY: Record<string, string> = {
  ENG: 'England', SCO: 'Scotland', WAL: 'Wales', NIR: 'Northern Ireland', KVX: 'Kosovo', FRO: 'Faroe Islands',
  GIB: 'Gibraltar', CUW: 'Curaçao', TPE: 'Taiwan', MAC: 'Macau', NCL: 'New Caledonia', TAH: 'Tahiti',
}

export async function fifaCountries(): Promise<Map<string, { country: string; demonym?: string }>> {
  const out = new Map<string, { country: string; demonym?: string }>()
  // 1. The IOC code (P984) sits on the country items themselves and matches the
  //    FIFA trigram for nearly every nation (GER, NED, SUI, CRO, POR…).
  const ioc = await sparql(`
    SELECT ?code (SAMPLE(?l) AS ?country) (SAMPLE(?dn) AS ?demonym) WHERE {
      ?c wdt:P984 ?code . ?c rdfs:label ?l . FILTER(LANG(?l) = "en")
      OPTIONAL { ?c wdt:P1549 ?dn . FILTER(LANG(?dn) = "en") }
    } GROUP BY ?code`)
  for (const r of ioc) if (!TEAMISH.test(r.country)) out.set(r.code, { country: r.country, demonym: r.demonym })
  // 2. Codes the IOC list lacks: the FIFA code (P3441), which sits on national
  //    teams and federations, cut down to the country's name.
  const fifa = await sparql(`SELECT ?code ?l WHERE { ?c wdt:P3441 ?code . ?c rdfs:label ?l . FILTER(LANG(?l) = "en") }`)
  for (const r of fifa) if (!out.has(r.code) && /national/i.test(r.l)) out.set(r.code, { country: cutToCountry(r.l) })
  // 3. The ones that differ or have no IOC code at all.
  for (const [code, country] of Object.entries(FIFA_ONLY)) out.set(code, { country })
  return out
}

/** Resolve titles to canonical titles (redirects followed), without content. */
export async function resolveTitles(titles: string[], lang = 'en'): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const todo: string[] = []
  for (const t of new Set(titles)) {
    const hit = readCache<string>(ck('title:', lang, t))
    if (hit) out.set(t, hit); else todo.push(t)
  }
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50)
    const body = await apiQuery({ action: 'query', titles: batch.join('|'), redirects: '1' }, lang)
    const hop = new Map<string, string>()
    for (const n of body.query?.normalized ?? []) hop.set(n.from, n.to)
    for (const r of body.query?.redirects ?? []) hop.set(r.from, r.to)
    for (const asked of batch) {
      let t = asked
      for (let k = 0; k < 3 && hop.has(t); k++) t = hop.get(t)!
      out.set(asked, t)
      writeCache(ck('title:', lang, asked), t)
    }
  }
  return out
}

/**
 * Every article in a category (namespace 0 only), e.g. "Category:Arsenal F.C.
 * players". WHY: Wikidata's club spells (P54) miss real squad members (6 of the
 * 18 Wolves 2018–19 players checked, Rúben Neves among them), but every player
 * article is filed under its clubs' player categories. So the category is the
 * candidate list, and the career table decides who played which season.
 */
export async function categoryMembers(category: string, lang = 'en'): Promise<string[]> {
  const hit = readCache<string[]>(ck('cat:', lang, category))
  if (hit) return hit
  const out: string[] = []
  let cont: Record<string, string> = {}
  do {
    const body = await apiQuery({ action: 'query', list: 'categorymembers', cmtitle: category, cmnamespace: '0', cmlimit: '500', ...cont }, lang)
    for (const m of body.query?.categorymembers ?? []) out.push(m.title)
    cont = body.continue ?? {}
  } while (Object.keys(cont).length)
  writeCache(ck('cat:', lang, category), out)
  return out
}

/**
 * Wikidata sitelinks: for each Q-id, its article title on the given wikis
 * (e.g. ['skwiki', 'itwiki']). How an English squad entry finds its local page.
 */
export async function sitelinks(qids: string[], sites: string[]): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>()
  const todo: string[] = []
  for (const q of new Set(qids)) {
    const hit = readCache<Record<string, string>>(`links:${sites.join(',')}:${q}`)
    if (hit) out.set(q, hit); else todo.push(q)
  }
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50)
    const qs = new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'sitelinks', sitefilter: sites.join('|'), ids: batch.join('|'), maxlag: '5' })
    const body = await politeGet(`https://www.wikidata.org/w/api.php?${qs}`)
    for (const q of batch) {
      const links = Object.fromEntries(Object.entries(body.entities?.[q]?.sitelinks ?? {}).map(([site, v]: [string, any]) => [site, v.title]))
      out.set(q, links)
      writeCache(`links:${sites.join(',')}:${q}`, links)
    }
  }
  return out
}

/** A Wikidata SPARQL query (CC0 data), cached by query text. */
export async function sparql(query: string): Promise<any[]> {
  const hit = readCache<any[]>('sparql:' + query)
  if (hit) return hit
  const body = await politeGet(`${SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, 'application/sparql-results+json')
  const rows = body.results.bindings.map((b: any) =>
    Object.fromEntries(Object.entries(b).map(([k, v]: [string, any]) => [k, v.value])))
  writeCache('sparql:' + query, rows)
  return rows
}

// ── Wikitext helpers ─────────────────────────────────────────────────────────

/** Split on a separator at bracket depth 0 (outside [[…]] and {{…}}). */
export function splitTop(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2)
    if (two === '[[' || two === '{{') { depth++; i++; continue }
    if ((two === ']]' || two === '}}') && depth > 0) { depth--; i++; continue }
    if (depth === 0 && s.startsWith(sep, i)) { parts.push(s.slice(start, i)); start = i + sep.length; i += sep.length - 1 }
  }
  parts.push(s.slice(start))
  return parts
}

/** First [[link]] target in a string (without #section), or null. */
export function firstLink(s: string): string | null {
  const m = s.match(/\[\[([^\]|#]+)/)
  return m ? m[1].trim() : null
}

/** Plain text of a cell: links → label, templates and refs and tags dropped. */
export function plain(s: string): string {
  let t = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '')
  for (let k = 0; k < 4; k++) t = t.replace(/\{\{[^{}]*\}\}/g, '')
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, '').replace(/'''?/g, '')
  return t.replace(/&nbsp;/g, ' ').trim()
}

/** Find the balanced {{…}} starting at `from` (index of the opening "{{"). */
export function balancedTemplate(s: string, from: number): string {
  let depth = 0
  for (let i = from; i < s.length - 1; i++) {
    if (s[i] === '{' && s[i + 1] === '{') { depth++; i++ }
    else if (s[i] === '}' && s[i + 1] === '}') { depth--; i++; if (depth === 0) return s.slice(from, i + 1) }
  }
  return s.slice(from)
}

/**
 * Parse a wikitable into rows of raw cell strings, with rowspans expanded, so
 * every row carries its Club and Division even when the page wrote them once
 * with rowspan="8". Header rows come out as rows too; callers drop them by
 * shape (a career row has a season cell, a header doesn't). "!" cells count as
 * cells, because plainrowheaders tables write the club column with "!".
 */
export function parseTable(table: string): string[][] {
  const rows: string[][] = []
  const pending: { text: string; left: number }[] = [] // per column: carried rowspan
  let raw: { text: string; span: number }[] = []
  const flush = () => {
    if (!raw.length) return
    const row: string[] = []
    let col = 0
    const carry = () => { while (pending[col]?.left > 0) { row.push(pending[col].text); pending[col].left--; col++ } }
    for (const c of raw) {
      carry()
      row.push(c.text)
      if (c.span > 1) pending[col] = { text: c.text, left: c.span - 1 }
      col++
    }
    carry()
    rows.push(row)
    raw = []
  }
  for (const line of table.split('\n')) {
    const l = line.trim()
    if (l.startsWith('{|') || l.startsWith('|+')) continue
    if (l.startsWith('|-') || l.startsWith('|}')) { flush(); continue }
    const isHeader = l.startsWith('!')
    // A line that isn't a cell continues the previous cell (multi-line content).
    if (!isHeader && !l.startsWith('|')) { if (raw.length) raw[raw.length - 1].text += '\n' + l; continue }
    for (const cell of splitTop(l.slice(1), isHeader ? '!!' : '||')) {
      // "attrs | content": split on the first top-level single pipe.
      const bits = splitTop(cell, '|')
      const attrs = bits.length > 1 ? bits[0] : ''
      const text = (bits.length > 1 ? bits.slice(1).join('|') : bits[0]).trim()
      const span = Number(attrs.match(/rowspan\s*=\s*"?(\d+)/)?.[1] ?? 1)
      const colspan = Number(attrs.match(/colspan\s*=\s*"?(\d+)/)?.[1] ?? 1)
      for (let k = 0; k < colspan; k++) raw.push({ text, span })
    }
  }
  flush()
  return rows
}

/** "2015–16", "2015-2016", "2015/16" → 2015 (the season's start year), else null. */
export function seasonStart(s: string): number | null {
  const m = plain(s).match(/^(\d{4})\s*[–\-/]\s*(\d{2}|\d{4})$/)
  if (m) return Number(m[1])
  const single = plain(s).match(/^(\d{4})$/) // calendar-year leagues
  return single ? Number(single[1]) : null
}

const int = (s: string): number | null => {
  const m = plain(s).replace(/[,\s]/g, '').match(/^\(?(\d+)\)?$/)
  return m ? Number(m[1]) : null
}

export type CareerRow = {
  club: string; season: number
  apps: number; goals: number | null            // league
  totalApps: number; totalGoals: number | null  // all competitions (the row's Total pair)
}

/**
 * A player's "Career statistics → Club" table: one row per club-season with
 * LEAGUE apps and goals. The club is the row's first link (rowspans expanded);
 * league apps are the first number after the season cell (the Division cell,
 * when present, is text and gets skipped). Totals rows have no season and drop out.
 */
export function careerRows(wikitext: string): CareerRow[] {
  const head = wikitext.search(/^==+\s*Career statistics\s*==+/im)
  if (head < 0) return []
  const section = wikitext.slice(head)
  const clubHead = section.search(/^===+\s*Club/im)
  const from = clubHead >= 0 ? clubHead : 0
  const start = section.indexOf('{|', from)
  if (start < 0) return []
  const end = section.indexOf('\n|}', start)
  const rows = parseTable(section.slice(start, end < 0 ? undefined : end + 3))
  // Every link in the table by its label: a later plain-text mention ("Watford")
  // means the club linked earlier as [[Watford F.C.|Watford]]. Resolving the
  // bare text instead lands on the town (Watford, Girona, Nantes: three
  // keepers lost that way).
  const byLabel = new Map<string, string>()
  for (const row of rows) for (const cell of row) for (const m of cell.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)) {
    const target = m[1].trim()
    byLabel.set(plain(m[2] ?? m[1]).toLowerCase(), target)
    byLabel.set(target.toLowerCase(), target)
  }
  const out: CareerRow[] = []
  for (const row of rows) {
    const si = row.findIndex(c => seasonStart(c) !== null)
    if (si < 0) continue
    // Two layouts in the wild: "Club | Season | Division | Apps…" (today's
    // template) and "Season | Club | League | Apps…" (older pages, e.g. a lot of
    // Slovak players). So the club cell is the one just before the season, or,
    // with the season first, the one just after it.
    // The cell's LINK when it has one, else its TEXT: Wikipedia links a club
    // only at its first mention, so a second spell reads "Newcastle United" or
    // "Eintracht Frankfurt (loan)" in plain text. Looking only for links took
    // the next link in the row ("Premier League") as the club, and dropped
    // Dúbravka's and Trapp's whole spells, keepers and all. The redirect lookup
    // downstream turns "Newcastle United" into "Newcastle United F.C.".
    const clubCell = si > 0 ? row[si - 1] : row[si + 1] ?? ''
    const text = plain(clubCell).replace(/\(.*?\)/g, '').trim()
    const club = firstLink(clubCell) ?? byLabel.get(text.toLowerCase()) ?? text
    if (!club || /^(total|career total|club)$/i.test(club)) continue
    const nums = row.slice(si + 1).map(int)
    const ai = nums.findIndex(n => n !== null)
    if (ai < 0) continue
    const apps = nums[ai]!, goals = nums[ai + 1] ?? null
    // The Total pair is the row's last two numbers (cup, league cup, Europe and
    // "other" sit between, often as "—"). A table with no competitions beyond
    // the league has just the one pair, and a Total below the league figure is
    // a misread row, so both fall back to the league numbers.
    const vals = nums.filter((n): n is number => n !== null)
    const hasTotal = vals.length >= 4 && vals[vals.length - 2] >= apps
    out.push({
      club, season: seasonStart(row[si])!, apps, goals,
      totalApps: hasTotal ? vals[vals.length - 2] : apps, totalGoals: hasTotal ? vals[vals.length - 1] : goals,
    })
  }
  return out
}

export type Spell = { club: string; from: number; to: number | null; caps: number | null; loan: boolean }

/** The infobox's senior career: years1/clubs1/caps1 … (the fallback when there's no table). */
export function infoboxSpells(wikitext: string): Spell[] {
  const at = wikitext.search(/\{\{\s*Infobox football biography/i)
  if (at < 0) return []
  const box = balancedTemplate(wikitext, at)
  const field = (k: string) => {
    const m = box.match(new RegExp(`\\|\\s*${k}\\s*=([^\\n]*)`))
    return m ? m[1].trim() : ''
  }
  const out: Spell[] = []
  for (let i = 1; i <= 40; i++) {
    const clubRaw = field(`clubs${i}`)
    if (!clubRaw) { if (i > 3) break; continue }
    const years = plain(field(`years${i}`))
    const y = years.match(/(\d{4})\s*(?:[–\-]\s*(\d{4})?)?/)
    const club = firstLink(clubRaw)
    if (!y || !club) continue
    const open = /[–\-]\s*$/.test(years) || /[–\-]\s*present/i.test(years)
    out.push({
      club,
      from: Number(y[1]),
      to: y[2] ? Number(y[2]) : open ? null : Number(y[1]),
      caps: int(field(`caps${i}`)),
      loan: /loan/i.test(clubRaw),
    })
  }
  return out
}

export type SquadEntry = { name: string; article: string | null; nat: string; pos: string }

/**
 * The CURRENT squad on a club's article: {{Fs player|no=|nat=|pos=|name=[[…]]}}
 * (and its "Football squad player" spelling). For the small leagues this is the
 * only squad Wikipedia keeps, and it's exactly the season the game uses for them.
 * Only the "First-team squad" part: the loan-out and reserve lists that follow
 * use the same template, so parsing stops at the next level-2/3 heading.
 */
export function currentSquad(wikitext: string): SquadEntry[] {
  // Prefer the specific heading ("===Current squad===" under "==Players==" on
  // most Slovak clubs); fall back to a bare "==Players==" / "==Squad==".
  let head = wikitext.search(/^==+\s*(Current squad|First[- ]team squad|First team)\s*==+/im)
  if (head < 0) head = wikitext.search(/^==+\s*(Players|Squad)\s*==+/im)
  if (head < 0) return []
  const rest = wikitext.slice(head)
  const firstLine = rest.indexOf('\n')
  // Stop at the next level-2 heading, or a sub-heading for players who AREN'T
  // the first team (same template, different list).
  const next = rest.slice(firstLine).search(/^(==[^=]|=+[^=\n]*(loan|reserve|youth|academy|under-|B team|women|staff|management|former|retired|notable|captain)[^=\n]*=+)/im)
  const section = next < 0 ? rest : rest.slice(0, firstLine + next)
  const out: SquadEntry[] = []
  for (const m of section.matchAll(/\{\{\s*(?:Fs player|Football squad player)\b/gi)) {
    const tpl = balancedTemplate(section, m.index!)
    const arg = (k: string) => splitTop(tpl.slice(2, -2), '|').map(s => s.trim()).find(s => s.startsWith(k + '='))?.slice(k.length + 1).trim() ?? ''
    const nameRaw = arg('name')
    if (!nameRaw) continue
    out.push({ name: plain(nameRaw), article: firstLink(nameRaw), nat: arg('nat'), pos: arg('pos') })
  }
  return out
}

/**
 * The league table for a league-season ARTICLE, following the page where it
 * really lives: Serie A, La Liga, the Bundesliga, Ligue 1, Greece and Ireland
 * write `==League table== {{2024–25 Serie A table}}` and keep the table in that
 * template. Checked first because a split-season article's first inline table
 * can be a playoff group (Greece's came out as 4 clubs).
 */
export async function leagueTableFor(article: string): Promise<{ position: number; title: string }[]> {
  const w = (await getPages([article])).get(article)?.wikitext
  if (!w) return []
  const sec = w.search(/^==+\s*(League table|Table|Standings|Regular season)\s*==+/im)
  if (sec >= 0) {
    const body = w.slice(sec, sec + 3000)
    const included = body.match(/\{\{\s*([^{}|\n]+ table)\s*\}\}/i)?.[1]
    if (included) {
      const t = `Template:${included.trim()}`
      const tw = (await getPages([t])).get(t)?.wikitext
      const rows = tw ? leagueTable(tw) : []
      if (rows.length) return rows
    }
  }
  return leagueTable(w)
}

/**
 * The league table from a league-season article: the FIRST Module:Sports table
 * block, whose `team1=…teamN=` order is the final standings and whose
 * `name_XXX=[[Club]]` gives each code's article.
 */
export function leagueTable(wikitext: string): { position: number; title: string }[] {
  const at = wikitext.search(/\{\{\s*#invoke:\s*Sports table/i)
  if (at < 0) return []
  const block = balancedTemplate(wikitext, at)
  // Codes aren't ASCII everywhere: Slovak pages use ŽIL and KOŠ, hence \p{L}.
  const names = new Map<string, string>()
  for (const m of block.matchAll(/\|\s*name_([\p{L}\p{N}_]+)\s*=\s*(\[\[[^\]]+\]\])/gu)) names.set(m[1], firstLink(m[2])!)
  // Two ways to write the order: `team1=ARS |team2=…` (older pages) or one
  // `team_order = SLO, ŽIL, …` list (newer ones).
  let codes: string[] = []
  const list = block.match(/\|\s*team_order\s*=\s*([^|}]+)/)
  if (list) codes = list[1].replace(/<!--[\s\S]*?-->/g, '').split(',').map(c => c.trim()).filter(Boolean)
  else for (const m of block.matchAll(/\|\s*team(\d+)\s*=\s*([\p{L}\p{N}_]+)/gu)) codes[Number(m[1]) - 1] = m[2]
  // Split-season leagues (a regular stage, then championship/relegation groups)
  // put the regular stage first, which lists EVERY club: right for "who played",
  // not for final positions. The full build reads the groups; the probe needn't.
  return codes.flatMap((code, i) => names.has(code) ? [{ position: i + 1, title: names.get(code)! }] : [])
}
