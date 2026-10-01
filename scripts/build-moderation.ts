// P8.5-44 · Builds supabase/moderation-words.sql from the lists in
// scripts/moderation/ (see SOURCES.md there for where each comes from).
//
//   npx tsx scripts/build-moderation.ts
//
// Then run supabase/moderation-words.sql in the Supabase SQL editor (after
// moderation.sql). Re-run both steps whenever a list changes.
//
// Each word is stored in two matching forms, both built HERE so the SQL stays
// simple:
//  · rx: for names. The name is first lower-cased, stripped of accents, digit
//    swaps undone and everything but letters dropped (mod_letters); rx then
//    matches the word's letters with each run allowed to stretch ("fuuuck").
//    A run keeps its length as the minimum ("nigger" needs two g's), which is
//    what keeps Niger and Nigeria apart from it. Collapsing every double
//    instead, the first idea, would have blocked both. A digit or symbol that
//    stands for a vowel becomes * and matches ANY vowel: "f4ck" is fuck to a
//    reader, though 4 is an a.
//  · pattern: for chat, on the message as written: each letter a class of its
//    accented and digit forms, stretching too, with word edges unless the word
//    is one caught inside others. Separators aren't bridged in chat on
//    purpose: "f.u.c.k" gets through, the maintainer's "let them be cheeky".
import fs from 'fs'
import path from 'path'

const DIR = path.join(__dirname, 'moderation')
const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8')
const lines = (f: string) => read(f).split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))

// The same as the SQL's mod_norm + mod_letters (translate before dropping).
const LEET_FROM = '4@31!0$57+|'
const LEET_TO = '******sttl'
export function letters(s: string): string {
  const base = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return [...base].map(c => { const i = LEET_FROM.indexOf(c); return i >= 0 ? LEET_TO[i] : c }).join('').replace(/[^a-z*]/g, '')
}
/** A list word's own letters: its digits read as the letters they stand for. */
export const wordLetters = (s: string) => letters(s.replace(/[4@]/g, 'a').replace(/3/g, 'e').replace(/[1!]/g, 'i').replace(/0/g, 'o'))

const runs = (w: string) => w.match(/(.)\1*/g) ?? []
const rep = (n: number) => (n === 1 ? '+' : `{${n},}`)

/** The name form (see the top). */
export const nameRx = (w: string) => runs(w).map(r => ('aeioul'.includes(r[0]) ? `[${r[0]}*]` : r[0]) + rep(r.length)).join('')

// The endings a word may carry and still be that word (fucker, kurvy). A
// short word takes only a plural: with every ending, "nig" was Niger, "spic"
// was spicy and "fag" was Fago, a real footballer's name.
export const ENDS_LONG = '(s|es|ed|er|ers|ing|in|y|o|a|i|e|u|ou|om|ek|ka|ko|ovi|ov|ach)?'
export const ENDS_SHORT = '(s|es)?'
export const endsFor = (w: string) => (w.length < 5 ? ENDS_SHORT : ENDS_LONG)

// What each letter may be written as in chat. A vowel takes any of the vowel
// digits (as in names); '1' and '|' sit in l too.
const VD = '4@310!'
const CLASS: Record<string, string> = {
  a: 'aàáâäãåą' + VD, c: 'cčćç', d: 'dď', e: 'eèéêëěę' + VD, i: 'iíìîï|' + VD, l: 'l1|ľĺł', n: 'nňñń', o: 'oóòôöõ' + VD,
  r: 'rŕř', s: 's5$šś', t: 't7+ť', u: 'uúùûüů' + VD, y: 'yý', z: 'zžźż', g: 'g9', b: 'b8',
}
const EDGE_L = '(?<![a-zÀ-ɏ])'
const EDGE_R = '(?![a-zÀ-ɏ])'

/** The chat form (see the top): `shown` as typed in the list, words of a phrase on any spacing. */
export function chatPattern(shown: string, embed: boolean): string {
  const body = shown.split(/\s+/).map(part =>
    runs(wordLetters(part)).map(r => { const c = CLASS[r[0]]; return (c ? `[${c}]` : r[0]) + rep(r.length) }).join(''),
  ).join('\\s+')
  // A whole word's ending is captured (\1 in the SQL) and kept after the replacement.
  return embed ? body : EDGE_L + body + endsFor(wordLetters(shown)) + EDGE_R
}

// Replacements for words that don't name their own: silly, never another swear.
const POOL = { en: ['fudge', 'sugar', 'biscuits', 'crumbs', 'pickles', 'banana', 'cabbage', 'potato', 'noodle'],
  cs: ['brokolica', 'kapusta', 'zemiak', 'rožok', 'halušky', 'bryndza', 'lokša'] }
const pick = (w: string, pool: string[]) => pool[[...w].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % pool.length]

export type Word = { word: string; shown: string; kind: 'hard' | 'review'; lang: string; embed: boolean; rx: string; pattern: string | null; replacement: string | null; source: string }

export function buildLists() {
  const words = new Map<string, Word>()
  const skipped: string[] = []
  const add = (shown: string, o: { kind: 'hard' | 'review'; lang: string; embed: boolean; replacement?: string; source: string }) => {
    const w = wordLetters(shown)
    // A word that loses letters to the swaps ("1488" is "ia"), holds
    // something that isn't a letter, or is too short to tell apart from
    // innocent ones can't be matched safely.
    if (w.length < 3 || /[0-9]/.test(shown.replace(/[4@31!0$57+|]/g, '')) || /[^\p{L}\s'@$!|+0-9.-]/u.test(shown)) { skipped.push(shown); return }
    const hard = o.kind === 'hard'
    words.set(w, {
      word: w, shown, kind: o.kind, lang: o.lang, embed: o.embed, rx: nameRx(w),
      // Only sure words are swapped in chat; a "maybe" word is just a word there.
      pattern: hard ? chatPattern(shown, o.embed) : null,
      replacement: hard ? (o.replacement ?? pick(w, o.lang === 'en' ? POOL.en : POOL.cs)) : null,
      source: o.source,
    })
  }
  const exclude = new Set(lines('exclude.txt').map(wordLetters))

  // Downloaded lists first, so our own override them.
  for (const l of lines('sources/ldnoobw-en.txt')) if (!exclude.has(wordLetters(l))) add(l, { kind: 'hard', lang: 'en', embed: false, source: 'ldnoobw' })
  for (const l of lines('sources/ldnoobw-cs.txt')) if (!exclude.has(wordLetters(l))) add(l, { kind: 'hard', lang: 'cs', embed: false, source: 'ldnoobw' })
  // cuss rates each word 0 (often innocent) to 2 (almost always profane); only the 2s are taken.
  for (const m of read('sources/cuss-en.js').matchAll(/^\s*'?([^':\n]+?)'?\s*:\s*(\d)\s*,?\s*$/gm)) {
    if (m[2] === '2' && !exclude.has(wordLetters(m[1]))) add(m[1], { kind: 'hard', lang: 'en', embed: false, source: 'cuss' })
  }
  for (const [file, lang] of [['own-en.txt', 'en'], ['own-sk.txt', 'sk']] as const) {
    for (const raw of lines(file)) {
      const [lhs, rhs] = raw.split('=').map(s => s.trim())
      const review = lhs.startsWith('?')
      const embed = lhs.startsWith('!')
      add(lhs.replace(/^[!?]/, ''), { kind: review ? 'review' : 'hard', lang, embed, replacement: rhs || undefined, source: 'own' })
    }
  }

  // A downloaded word our own list already covers goes: "fuuck" from cuss,
  // longer than our fuck, was swapped first, and for a random word
  // ("cabbage") instead of ours (fudge). Covered = holds one of our
  // inside-words, or is one of our words with an ending.
  const own = [...words.values()].filter(w => w.source === 'own' && w.kind === 'hard')
    .map(o => ({ o, inside: new RegExp(o.rx), whole: new RegExp(`^(${o.rx})${endsFor(o.word)}$`) }))
  for (const w of [...words.values()]) {
    if (w.source !== 'own' && own.some(({ o, inside, whole }) => (o.embed && inside.test(w.word)) || whole.test(w.word))) words.delete(w.word)
  }

  const allow = [...new Set(lines('allow.txt').map(wordLetters))].filter(Boolean)

  // Real names decide what a downloaded word may refuse. cuss rates many
  // slurs that are also everyday surnames as sure (Dago, Haji, Gora, Pollock,
  // Moskal, Dong), and this is a football game: a player named after a real
  // footballer mustn't be turned away. So every downloaded word is run
  // against the bundled DB's club and player names, the same way the SQL
  // runs a name (namesHit), and one that refuses any of them goes to review
  // instead: still flagged in the inbox, never refused, never swapped in chat
  // (where people talk about those players). Our own words are deliberate
  // and stay strict, real names or not (Suka, Pica).
  const demoted: string[] = []
  const hit = realNamesTest(allow)
  for (const w of words.values()) {
    if (w.source !== 'own' && w.kind === 'hard' && hit(w)) { w.kind = 'review'; w.pattern = null; w.replacement = null; demoted.push(w.shown) }
  }

  const groups: { kind: 'identity' | 'hostile'; word: string }[] = []
  let section: 'identity' | 'hostile' | null = null
  for (const l of lines('identity-hostile.txt')) {
    const s = l.match(/^\[(identity|hostile)\]$/)
    if (s) { section = s[1] as 'identity' | 'hostile'; continue }
    const w = wordLetters(l)
    if (section && w && !groups.some(g => g.kind === section && g.word === w)) groups.push({ kind: section, word: w })
  }
  return { words: [...words.values()].sort((a, b) => a.word.localeCompare(b.word)), allow, groups, skipped, demoted }
}

/** A name's words as the SQL's mod_tokens makes them, each with the allowlisted words taken out. */
export function nameTokens(name: string, allow: string[]): string[] {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9@$!|+À-ɏ]+/)
    .map(t => allow.reduce((s, a) => s.split(a).join(''), letters(t))).filter(Boolean)
}

// Every real name's words joined with | between them: one regex per listed
// word scans them all at once (a word's rx never holds a |, so it can't run
// from one name's word into the next).
function realNamesTest(allow: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  const db = new Database(path.join(__dirname, '..', 'assets', 'db', 'players_v5.db'), { readonly: true })
  const names = (db.prepare('select name from clubs union select name from players').all() as { name: string }[]).map(r => r.name)
  db.close()
  const toks = '|' + [...new Set(names.flatMap(n => nameTokens(n, allow)))].join('|') + '|'
  return (w: Word) => new RegExp(`\\|(?:${w.rx})${endsFor(w.word)}\\|`).test(toks) || (w.word.length >= 6 && new RegExp(w.rx).test(toks))
}

// The name checks run as a few big alternations rather than one regex per
// word: two thousand regexes a name took 140 ms (in PGlite). Postgres
// compiles each alternation once per connection and keeps it.
export function compiled(words: Word[], groups: { kind: string; word: string }[]) {
  const alt = (rxs: string[]) => rxs.join('|') || 'x^'
  const tok = (ws: { word: string; rx: string }[]) =>
    `^(?:(?:${alt(ws.filter(w => w.word.length >= 5).map(w => w.rx))})${ENDS_LONG}|(?:${alt(ws.filter(w => w.word.length < 5).map(w => w.rx))})${ENDS_SHORT})$`
  const hard = words.filter(w => w.kind === 'hard')
  const review = words.filter(w => w.kind === 'review')
  const group = (kind: string) => groups.filter(g => g.kind === kind).map(g => ({ word: g.word, rx: nameRx(g.word) }))
  const id = group('identity'), host = group('hostile')
  return {
    // Anywhere in the name's letters joined up ("xXfuckXx"): the inside-words.
    hard_any: alt(hard.filter(w => w.embed).map(w => w.rx)),
    // Inside one of the name's words: long words, which rarely sit inside an
    // innocent one. Not across words: "Martin Kern" joined up holds "tinker".
    hard_long: alt(hard.filter(w => !w.embed && w.word.length >= 6).map(w => w.rx)),
    // One of the name's words, with an ending.
    hard_tok: tok(hard),
    review_long: alt(review.filter(w => w.word.length >= 5).map(w => w.rx)),
    review_tok: tok(review),
    identity_long: alt(id.filter(g => g.word.length >= 4).map(g => g.rx)),
    identity_tok: tok(id),
    hostile_long: alt(host.filter(g => g.word.length >= 4).map(g => g.rx)),
    hostile_tok: tok(host),
    // Chat's quick test: a message whose letters hold no listed word skips the swapping.
    chat_any: alt(hard.filter(w => w.pattern).map(w => w.rx)),
  }
}

const q = (s: string | null) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`)

export function buildSql(): string {
  const { words, allow, groups } = buildLists()
  const out = [
    '-- P8.5-44 · GENERATED by scripts/build-moderation.ts from scripts/moderation/. Do not edit:',
    '-- change the lists and run the script again. Run after moderation.sql.',
    '-- Sources: LDNOOBW (CC BY 4.0), cuss (MIT), our own lists. See scripts/moderation/SOURCES.md.',
    'begin;',
    'truncate public.mod_words, public.mod_allow, public.mod_compiled;',
    'insert into public.mod_compiled (kind, rx) values\n' + Object.entries(compiled(words, groups)).map(([k, v]) => `  ('${k}', ${q(v)})`).join(',\n') + ';',
  ]
  for (let i = 0; i < words.length; i += 200) {
    out.push('insert into public.mod_words (word, shown, kind, lang, embed, rx, pattern, replacement, source) values')
    out.push(words.slice(i, i + 200).map(w =>
      `  (${q(w.word)}, ${q(w.shown)}, '${w.kind}', '${w.lang}', ${w.embed}, ${q(w.rx)}, ${q(w.pattern)}, ${q(w.replacement)}, '${w.source}')`).join(',\n') + ';')
  }
  if (allow.length) out.push('insert into public.mod_allow (word) values\n' + allow.map(a => `  (${q(a)})`).join(',\n') + ';')
  out.push('commit;', '')
  return out.join('\n')
}

if (require.main === module) {
  const { words, allow, groups, skipped, demoted } = buildLists()
  fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'moderation-words.sql'), buildSql())
  const by = (f: (w: Word) => boolean) => words.filter(f).length
  console.log(`moderation-words.sql: ${words.length} words (${by(w => w.kind === 'hard')} sure, ${by(w => w.kind === 'review')} to review, ${by(w => w.embed)} caught inside words), ${allow.length} allowed, ${groups.length} group words`)
  console.log(`  by source: own ${by(w => w.source === 'own')}, ldnoobw ${by(w => w.source === 'ldnoobw')}, cuss ${by(w => w.source === 'cuss')}`)
  if (skipped.length) console.log(`  skipped (can't be matched safely): ${skipped.join(', ')}`)
  if (demoted.length) console.log(`  to review, not refused (they'd refuse a real footballer or club): ${demoted.length}: ${demoted.join(', ')}`)
}
