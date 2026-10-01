/**
 * Matching Wikipedia's clubs (and nations) to the game's club identities, one
 * to one. WHY a module: the first matcher scored each Wikipedia club against
 * the game's clubs on shared words and took the best, independently. Ties broke
 * badly ("Inter Milan" and "AC Milan" both reduce to "milan"; "Olympique
 * Lyonnais" and "Olympique de Marseille" to "olympique"), so one game club was
 * claimed twice and AC Milan and Lyon vanished from every season; and clubs
 * whose article carries the full native name (Helsingin Jalkapalloklubi, for
 * HJK) never matched at all. So:
 *   • every Wikipedia club brings its Wikidata label and aliases ("HJK", "KR",
 *     "Lyon"), and the best-scoring of its names counts;
 *   • ties break on how alike the whole names are (letter pairs);
 *   • assignment is greedy one-to-one, best pairs first, so no game club can be
 *     claimed twice.
 */
import { sparql } from './wikipedia'

const STOP = new Set(['fc', 'cf', 'ac', 'sc', 'afc', 'as', 'ss', 'fk', 'sk', 'nk', 'kf', 'ks', 'club', 'football', 'calcio', 'de', 'the', 'cd', 'ud', 'sd', 'rc', 'rcd', 'us', 'ssc', 'ogc', 'vfb', 'vfl', 'tsg', 'sv', 'bv', '1', 'fsv', 'sl', 'cp', 'sp', 'fu', 'bk', 'if', 'ik', 'ff', 'kv', 'rsc', 'krc', 'mfk', 'msk', 'fotbal', 'futbol', 'hnk', 'gnk', 'pfc', 'men', 's', 'f', 'c'])
// Letters that don't decompose under NFD and so survive accent-stripping
// (Kasımpaşa, Wisła Płock came out unmatched): folded by hand.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/ß/g, 'ss')
  .replace(/ı/g, 'i').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ħ/g, 'h')
const words = (s: string) => new Set(fold(s).replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)))

function wordScore(a: string, b: string) {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const w of A) if (B.has(w)) common++
  const shared = common / Math.min(A.size, B.size)
  if (shared >= 0.5) return shared
  // Initials: the game's "HB Tórshavn" is Havnar Bóltfelag, "KÍ" is Klaksvíkar
  // Ítróttarfelag. A game word equal to the other name's initials counts.
  const initials = (S: Set<string>, full: string) => fold(full).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0]).join('')
  const ia = initials(A, a), ib = initials(B, b)
  if ([...B].some(w => w.length >= 2 && w === ia) || [...A].some(w => w.length >= 2 && w === ib)) return 1
  // Spelling variants with no shared word ("AE Larisa" / "A.E. Larissas",
  // "Nuremberg" / "Nürnberg"): near-identical core names still pass.
  const core = (S: Set<string>) => [...S].join('')
  return dice(core(A), core(B)) >= 0.65 ? 0.6 : shared
}
// Dice coefficient on letter pairs of the folded names: the tie-breaker.
function dice(a: string, b: string) {
  const pairs = (s: string) => { const f = fold(s).replace(/[^a-z0-9]/g, ''); const m = new Map<string, number>(); for (let i = 0; i < f.length - 1; i++) m.set(f.slice(i, i + 2), (m.get(f.slice(i, i + 2)) ?? 0) + 1); return m }
  const A = pairs(a), B = pairs(b)
  let common = 0, total = 0
  for (const [k, n] of A) { common += Math.min(n, B.get(k) ?? 0); total += n }
  for (const n of B.values()) total += n
  return total ? (2 * common) / total : 0
}

const aliasCache = new Map<string, string[]>()
/** Wikidata English label + aliases for each Q-id (cached). */
export async function clubNames(qids: string[]): Promise<Map<string, string[]>> {
  const todo = [...new Set(qids)].filter(q => q && !aliasCache.has(q))
  for (let i = 0; i < todo.length; i += 150) {
    const batch = todo.slice(i, i + 150)
    const rows = await sparql(`
      SELECT ?q ?name WHERE {
        VALUES ?q { ${batch.map(q => 'wd:' + q).join(' ')} }
        { ?q rdfs:label ?name } UNION { ?q skos:altLabel ?name }
        FILTER(LANG(?name) = "en" || LANG(?name) = "mul")
      }`)
    for (const q of batch) aliasCache.set(q, [])
    for (const r of rows) aliasCache.get(r.q.split('/').pop())!.push(r.name)
  }
  return new Map(qids.map(q => [q, aliasCache.get(q) ?? []]))
}

/**
 * A club's colours from Wikidata: "club colours" (P6364) → each colour's sRGB
 * hex (P465). For clubs the game has no identity for yet, and the first step
 * of replacing the Transfermarkt-crest colours everywhere (§4.8).
 */
export async function clubColours(qids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (let i = 0; i < qids.length; i += 150) {
    const batch = qids.slice(i, i + 150)
    const rows = await sparql(`
      SELECT ?q ?hex WHERE {
        VALUES ?q { ${batch.map(q => 'wd:' + q).join(' ')} }
        ?q p:P6364 ?st . ?st ps:P6364 ?c . ?c wdt:P465 ?hex .
      }`)
    for (const r of rows) {
      const q = r.q.split('/').pop()
      const hex = '#' + String(r.hex).replace(/^#/, '').toUpperCase()
      if (/^#[0-9A-F]{6}$/.test(hex)) out.set(q, [...(out.get(q) ?? []), hex])
    }
  }
  return out
}

const field = (w: string, k: string) => w.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|]*)`))?.[1]?.trim() ?? ''
const hexOf = (v: string) => (/^#?[0-9A-Fa-f]{6}$/.test(v) ? '#' + v.replace('#', '').toUpperCase() : null)

/**
 * A club's colours from its article's infobox KIT (the football-kit drawing's
 * hex values): the shirt first, then the first different colour among the
 * shorts, socks, sleeves and the away shirt. WHY this ahead of Wikidata: the
 * kit is exact and nearly every club article has one, while Wikidata's "club
 * colours" (P6364) sit on under half the game's clubs (Bayern has none) and
 * name generic colours ("red" = FF0000).
 */
export function infoboxKit(wikitext: string): string[] {
  const shirt = hexOf(field(wikitext, 'body1'))
  if (!shirt) return []
  const second = ['shorts1', 'socks1', 'leftarm1', 'body2'].map(k => hexOf(field(wikitext, k))).find(c => c && c !== shirt)
  return second ? [shirt, second] : [shirt]
}

/** The infobox's ground and capacity: the fallback where Wikidata has no home venue. */
export function infoboxGround(wikitext: string): Venue | null {
  const raw = field(wikitext, 'ground') || field(wikitext, 'stadium')
  if (!raw) return null
  const link = raw.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
  const name = (link ? (link[2] ?? link[1]) : raw.split(',')[0]).replace(/<[^>]+>|\{\{[^}]*\}\}/g, '').trim()
  if (!name) return null
  const cap = Number(field(wikitext, 'capacity').replace(/[^\d]/g, '').slice(0, 7))
  return { name, capacity: cap > 0 ? cap : undefined }
}

export type Venue = { name: string; capacity?: number; city?: string; country?: string }

/**
 * Each club's CURRENT home ground from Wikidata (home venue, P115, with no end
 * date), with its capacity (P1083), city (P131) and country (P17): the open
 * replacement for the Transfermarkt stadium pages (P8-93's data).
 */
export async function clubVenues(qids: string[]): Promise<Map<string, Venue>> {
  const out = new Map<string, Venue>()
  for (let i = 0; i < qids.length; i += 100) {
    const batch = qids.slice(i, i + 100)
    const rows = await sparql(`
      SELECT ?q ?name (MAX(?cap) AS ?capacity) (SAMPLE(?cityL) AS ?city) (SAMPLE(?countryL) AS ?country) WHERE {
        VALUES ?q { ${batch.map(q => 'wd:' + q).join(' ')} }
        ?q p:P115 ?st . ?st ps:P115 ?v . FILTER NOT EXISTS { ?st pq:P582 ?end }
        ?v rdfs:label ?name . FILTER(LANG(?name) = "en" || LANG(?name) = "mul")
        OPTIONAL { ?v wdt:P1083 ?cap }
        OPTIONAL { ?v wdt:P131 ?c . ?c rdfs:label ?cityL . FILTER(LANG(?cityL) = "en") }
        OPTIONAL { ?v wdt:P17 ?co . ?co rdfs:label ?countryL . FILTER(LANG(?countryL) = "en") }
      } GROUP BY ?q ?name`)
    for (const r of rows) {
      const q = r.q.split('/').pop()
      // Several current venues (a club sharing grounds, or data not yet tidied):
      // the biggest is the home ground most fans would name.
      const cap = r.capacity ? Math.round(Number(r.capacity)) : undefined
      const cur = out.get(q)
      if (cur && (cur.capacity ?? 0) >= (cap ?? 0)) continue
      out.set(q, { name: r.name, capacity: cap, city: r.city, country: r.country })
    }
  }
  return out
}

export type Candidate = { title: string; names: string[] }

/**
 * One-to-one: each Wikipedia club to at most one game club and back. A pair
 * needs a word score of at least 0.5 on its best name.
 */
export function matchOneToOne<T>(wiki: Candidate[], game: T[], nameOf: (t: T) => string): Map<string, T> {
  const pairs: { w: string; g: number; s: number }[] = []
  for (const c of wiki) {
    const names = [c.title, ...c.names]
    game.forEach((g, gi) => {
      const gn = nameOf(g)
      const best = Math.max(...names.map(n => wordScore(n, gn)))
      if (best >= 0.5) pairs.push({ w: c.title, g: gi, s: best + 0.25 * Math.max(...names.map(n => dice(n, gn))) })
    })
  }
  pairs.sort((a, b) => b.s - a.s)
  const out = new Map<string, T>()
  const taken = new Set<number>()
  for (const p of pairs) {
    if (out.has(p.w) || taken.has(p.g)) continue
    out.set(p.w, game[p.g]); taken.add(p.g)
  }
  return out
}
