// Phase 9.75 (P9.75-02, R3-06) · The draft's reel, read from the real database:
//   npx tsx scripts/verify-spin.ts
// Fails on:
//  · a World Cup reel item without a flag (every World Cup side is a nation);
//  · a reel item whose mark id isn't a club (TeamMark finds crests by club, so
//    a season id draws no crest);
//  · a club fact keyed by something that isn't a club (the draft looks facts
//    up by club; 18 of 20 were keyed by ids the data rebuild had renamed, and
//    the draft asked by season besides, so none ever showed: L-14).
import path from 'path'
import Database from 'better-sqlite3'
import { spinItem, type ClubSeasonRow } from '../src/engine/draft'
import type { GameMode } from '../src/types/game'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; if (failures <= 10) console.log(`❌ ${msg}`) } }

const db = new Database(path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const clubs = new Set((db.prepare('SELECT id FROM clubs').all() as { id: string }[]).map(r => r.id))
const rows = (where: string) => db.prepare(
  `SELECT cs.*, c.id AS club_id, c.name AS club_name, c.primary_color, l.id AS league_id
   FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id JOIN leagues l ON l.id = c.league_id ${where}`).all() as ClubSeasonRow[]

const cases: [GameMode, string][] = [
  ['world_cup', `WHERE l.id LIKE 'wc_%'`], ['champions_league', `WHERE l.id LIKE 'ucl_%'`],
  ['league', `WHERE l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%' AND l.id NOT LIKE 'cucl_%'`],
]
let items = 0
for (const [mode, where] of cases) {
  const pool = rows(where)
  check(pool.length > 0, `${mode}: no seasons in the pool`)
  for (const c of pool) {
    const it = spinItem(mode, c)
    items++
    check(!!it.clubId && clubs.has(it.clubId), `${mode}: ${c.club_name}'s reel item is marked "${it.clubId}", not a club`)
    if (mode === 'world_cup') check(!!it.flag, `world_cup: ${c.club_name} has no flag on the reel`)
  }
}

// The facts, hand-written and from open data, in both languages (Phase 9.75, D7).
const hand = require('./club_facts.json') as Record<string, Record<string, string[]>>
const open = require('./club_facts_wd.json') as Record<string, Record<string, string[]>>
const facts = [...new Set([...Object.keys(hand.en ?? {}), ...Object.keys(open.en ?? {})])]
for (const k of facts) check(clubs.has(k), `club fact keyed "${k}", which isn't a club`)
for (const src of [hand, open]) for (const id of Object.keys(src.en ?? {}))
  check((src.sk?.[id]?.length ?? 0) === src.en[id].length, `${id}: ${src.en[id].length} facts in English, ${src.sk?.[id]?.length ?? 0} in Slovak`)
// Every club the game spins (not a nation, whose card is its flag) has a fact.
const spun = [...clubs].filter(id => !id.endsWith('_nt'))
const withFact = spun.filter(id => (hand.en?.[id]?.length ?? 0) + (open.en?.[id]?.length ?? 0) > 0)
check(withFact.length / spun.length >= 0.95, `only ${withFact.length} of ${spun.length} clubs have a fact`)
console.log(`club facts: ${withFact.length} of ${spun.length} clubs, in English and Slovak`)
// P9.75 (the phone, 9 Oct): the nations had none, and the clubs' were "all
// either club is in {city} or club was created in {year}". Most sides now
// have something a fan would know: a title, a famous name, a nickname.
const nations = [...clubs].filter(id => id.endsWith('_nt'))
const nationFacts = nations.filter(id => (open.en?.[id]?.length ?? 0) > 0)
check(nationFacts.length >= 40, `only ${nationFacts.length} of ${nations.length} nations have a fact`)
const PLAIN = /^(Founded|Based|Plays at|Has played)/
const rich = spun.filter(id => (hand.en?.[id]?.length ?? 0) > 0 || (open.en?.[id] ?? []).some(f => !PLAIN.test(f)))
check(rich.length / spun.length >= 0.7, `only ${rich.length} of ${spun.length} clubs have more than founded, city and ground`)
// A second tier's title isn't a club's headline (AC Milan read "Serie B").
for (const [id, fs] of Object.entries(open.en ?? {})) for (const f of fs)
  check(!/^(Serie [B-D]|Ligue [23]|Segunda División|EFL Championship|2\. Bundesliga)\b/.test(f), `${id}: a lower tier's title: ${f}`)
console.log(`nation facts: ${nationFacts.length} of ${nations.length}; clubs with more than the plain facts: ${rich.length} of ${spun.length}`)

console.log(`${items} reel items, ${facts.length} fact keys`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
