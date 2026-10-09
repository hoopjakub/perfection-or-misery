/**
 * Phase 9.75 (D7): club facts for every club, in English and Slovak, from
 * open data. Writes scripts/club_facts_wd.json.
 *
 *   npx tsx scripts/build-club-facts.ts
 *
 * The draft showed a fact for twenty Premier League clubs, in English only.
 * These are short sentences built from Wikidata (CC0): when the club was
 * founded (inception, P571), where it's based (headquarters P159, else located
 * in P131, labelled in each language), its nickname (P1449), and its ground
 * from src/data/stadiums.ts (already built from Wikidata's home venue). The
 * hand-written facts (scripts/club_facts.json) come first in the app; these
 * fill every club. The public build shows none (clubFactsData.legal.ts).
 *
 * Reads scripts/seed-open/_qids.json (game club id → Wikidata item, written
 * by build-open-seeds). Every SPARQL answer is cached (scripts/.cache).
 */
import fs from 'fs'
import path from 'path'
import { sparql } from './lib/wikipedia'
import { STADIUMS } from '../src/data/stadiums'
import Database from 'better-sqlite3'

const QIDS: Record<string, string> = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-open/_qids.json'), 'utf8'))
const db = new Database(path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const NAME = new Map((db.prepare('SELECT id, name FROM clubs').all() as { id: string; name: string }[]).map(r => [r.id, r.name]))

type Info = { year?: number; cityEn?: string; citySk?: string; nick?: string }

async function infoFor(qids: string[]): Promise<Map<string, Info>> {
  const out = new Map<string, Info>()
  for (let i = 0; i < qids.length; i += 100) {
    const batch = qids.slice(i, i + 100)
    const rows = await sparql(`
      SELECT ?q (MIN(YEAR(?inc)) AS ?year) (SAMPLE(?hEn) AS ?hqEn) (SAMPLE(?hSk) AS ?hqSk) (SAMPLE(?lEn) AS ?locEn) (SAMPLE(?lSk) AS ?locSk) (SAMPLE(?nk) AS ?nick) WHERE {
        VALUES ?q { ${batch.map(q => 'wd:' + q).join(' ')} }
        OPTIONAL { ?q wdt:P571 ?inc }
        OPTIONAL { ?q wdt:P159 ?h . ?h rdfs:label ?hEn . FILTER(LANG(?hEn) = "en")
                   OPTIONAL { ?h rdfs:label ?hSk . FILTER(LANG(?hSk) = "sk") } }
        OPTIONAL { ?q wdt:P131 ?l . ?l rdfs:label ?lEn . FILTER(LANG(?lEn) = "en")
                   OPTIONAL { ?l rdfs:label ?lSk . FILTER(LANG(?lSk) = "sk") } }
        OPTIONAL { ?q wdt:P1449 ?nk . FILTER(LANG(?nk) = "en") }
      } GROUP BY ?q`)
    for (const r of rows) {
      const q = String(r.q).split('/').pop()!
      const year = r.year ? Number(r.year) : undefined
      out.set(q, {
        year: year && year > 1800 && year <= 2026 ? year : undefined,
        // One place for both languages: the headquarters where Wikidata has it,
        // else where the club is located (Barcelona's English label came from a
        // district and its Slovak one from the city before).
        cityEn: r.hqEn || r.locEn || undefined,
        citySk: r.hqEn ? r.hqSk || r.hqEn : r.locSk || r.locEn || undefined,
        nick: r.nick || undefined,
      })
    }
  }
  return out
}

const enNum = (n: number) => n.toLocaleString('en-GB')
const skNum = (n: number) => n.toLocaleString('sk-SK').replace(/ /g, ' ')

async function main() {
  const info = await infoFor([...new Set(Object.values(QIDS))])
  const en: Record<string, string[]> = {}, sk: Record<string, string[]> = {}
  let clubs = 0
  for (const [id, q] of Object.entries(QIDS)) {
    if (!NAME.has(id)) continue   // built, but not in the game (no squad)
    const i = info.get(q) ?? {}
    const nation = id.endsWith('_nt')
    const ground = STADIUMS[NAME.get(id) ?? '']
    const e: string[] = [], s: string[] = []
    if (i.year) {
      e.push(nation ? `Has played as a national side since ${i.year}.` : `Founded in ${i.year}.`)
      s.push(nation ? `Reprezentácia hrá od roku ${i.year}.` : `Klub vznikol v roku ${i.year}.`)
    }
    if (ground?.name) {
      e.push(ground.capacity ? `Plays at ${ground.name}, which holds ${enNum(ground.capacity)}.` : `Plays at ${ground.name}.`)
      // "Domáci štadión: …", not "na štadióne Štadión Pasienky".
      s.push(ground.capacity ? `Domáci štadión: ${ground.name}, ${skNum(ground.capacity)} miest.` : `Domáci štadión: ${ground.name}.`)
    }
    if (!nation && i.cityEn) {
      e.push(`Based in ${i.cityEn}.`)
      s.push(`Sídli v meste ${i.citySk}.`)
    }
    if (i.nick) {
      e.push(`Nicknamed “${i.nick}”.`)
      s.push(`Prezývka: „${i.nick}“.`)
    }
    if (e.length) { en[id] = e; sk[id] = s; clubs++ }
  }
  fs.writeFileSync(path.join(__dirname, 'club_facts_wd.json'), JSON.stringify({ en, sk }, null, 1) + '\n')
  console.log(`${clubs} of ${Object.keys(QIDS).length} clubs have facts (${Object.values(en).reduce((n, x) => n + x.length, 0)} sentences a language)`)
}
main().catch(e => { console.error(e); process.exit(1) })
