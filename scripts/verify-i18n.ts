// P8.5-28 · The check that can fail (docs/release/04-LANGUAGES.md §2.4):
//
//   npx tsx scripts/verify-i18n.ts          (STRICT=1: pending Slovak fails too)
//
// Fails on:
//  · a Slovak key English doesn't have (a typo, or a key renamed on one side);
//  · {{placeholders}} that differ between the two ({{club}} in English, none in Slovak);
//  · a count whose Slovak lacks one of _one, _few, _other (1 gól, 2 góly, 5 gólov);
//  · an English key nothing in the app uses (dead text), unless DYNAMIC says
//    it's looked up by a built key;
//  · plain English left in a file that's been moved onto t() (EXTRACTED below):
//    text between tags, or a label-like prop written as a literal.
// Lists, without failing (unless STRICT=1): the English keys with no Slovak
// yet, by area. The language switch stays hidden until that list is empty.
import fs from 'fs'
import path from 'path'
import { en } from '../src/i18n/en'
import { sk } from '../src/i18n/sk'

let failures = 0
const fail = (msg: string) => { failures++; console.log(`❌ ${msg}`) }

const ROOT = path.join(__dirname, '..')
const PLURAL = /_(one|few|many|other)$/
type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, at = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[at + k, v] as [string, string]] : flat(v, `${at}${k}.`)))
const base = (k: string) => k.replace(PLURAL, '')
const holes = (s: string) => [...new Set([...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))].sort().join(',')

// Files whose text is all on t(). Add a file when it's moved over; the scan
// below then fails if English creeps back in as a literal.
const EXTRACTED = [
  'app/settings.tsx', 'app/auth/login.tsx', 'app/auth/register.tsx', 'app/report.tsx', 'app/rename.tsx',
  'app/(tabs)/clubs.tsx', 'app/club/[id].tsx', 'app/club/chat.tsx', 'src/components/ClubView.tsx',
  'src/components/ClubParts.tsx', 'app/friends.tsx', 'app/confirm.tsx', 'src/components/OfflineStrip.tsx',
  'src/components/UpdateStrip.tsx', 'src/components/AchievementToast.tsx', 'app/(tabs)/profile.tsx',
  'src/components/VersionButton.tsx', 'app/profile-edit.tsx', 'app/(tabs)/index.tsx',
  'app/game/mode-select.tsx', 'app/game/difficulty.tsx', 'src/components/kit/run.tsx',
  'app/game/difficulty-custom.tsx', 'app/game/formation-select.tsx', 'app/game/draft.tsx',
  'src/components/setup/DraftParts.tsx', 'app/game/reveal.tsx', 'app/game/placement.tsx',
  'app/game/pundits.tsx', 'src/components/season/SeasonParts.tsx', 'src/components/season/RunChrome.tsx',
  'src/components/season/ModeBanner.tsx', 'src/components/season/CupParts.tsx',
  'src/components/season/RoundTeam.tsx', 'src/components/season/ResultParts.tsx',
  'src/components/season/LeaguePhaseDraw.tsx', 'src/components/season/LeagueSeason.tsx',
  'src/components/season/VerdictBlock.tsx', 'src/lib/punditsSummary.ts',
  'src/components/season/AwardsParts.tsx', 'app/(tabs)/leaderboard.tsx', 'app/(tabs)/runs.tsx',
  'app/game/simulation.tsx', 'app/game/custom-ucl-simulation.tsx', 'app/game/result.tsx',
  // Wave F (step 6): the one result screen and its families replaced cl-, wc- and custom-ucl-result.
  'src/components/season/ResultShell.tsx', 'src/components/season/RunMore.tsx', 'src/lib/resultStory.ts',
  'src/components/season/results/LeagueResult.tsx', 'src/components/season/results/CupResults.tsx',
  'src/components/season/results/OlderRunResult.tsx',
  'app/game/match-stats.tsx', 'src/components/MatchStatsParts.tsx', 'app/game/deep-match.tsx',
  'app/game/run.tsx', 'app/game/club.tsx', 'app/game/player.tsx', 'app/game/story.tsx', 'app/game/sheet.tsx',
  'app/game/rules.tsx', 'app/game/career.tsx', 'app/game/achievements.tsx', 'app/game/awards.tsx',
  'app/game/run-awards.tsx', 'app/r/[id].tsx', 'app/+not-found.tsx', 'app/versions.tsx', 'app/guide.tsx',
  'app/about.tsx', 'app/crest-edit.tsx', 'src/components/match/PitchViews.tsx',
  'src/components/CustomUclViewers.tsx', 'src/components/ui.tsx', 'src/components/BracketTree.tsx',
  'src/components/MedicalTable.tsx', 'src/components/LiveMatch.tsx', 'src/components/profile/ProfileParts.tsx',
  'src/components/VenueMap.tsx', 'src/components/BracketPreview.tsx',
  'src/components/Ceremony.tsx', 'src/components/MomentumGraph.tsx', 'src/components/WCGroupModal.tsx',
  'src/components/InfoBubble.tsx', 'src/components/NavGuard.tsx', 'src/components/QualifyingLadder.tsx',
  'src/lib/liveBracket.ts',
]
// Keys built at run time (t(`tiers.${id}`)): a prefix here counts as used.
const DYNAMIC: string[] = ['moderation.refusals.', 'you.greetings.', 'you.guestGreetings.', 'tiers.', 'difficulty.', 'difficulty.levels.', 'difficulty.taglines.', 'setup.shapes.', 'awards.k.', 'awards.n.', 'seasonNames.', 'result.desc.', 'match.outcome', 'hub.stat.', 'hub.club.', 'hub.reached.', 'rules.ex.', 'rules.fmt.', 'guide.topic.', 'press.', 'com.']

const enFlat = new Map(flat(en as Tree))
const skFlat = new Map(flat(sk))
const enBase = new Map<string, string[]>()
for (const k of enFlat.keys()) enBase.set(base(k), [...(enBase.get(base(k)) ?? []), k])

// ── Slovak against English ───────────────────────────────────────────────────
const skBase = new Map<string, string[]>()
for (const k of skFlat.keys()) skBase.set(base(k), [...(skBase.get(base(k)) ?? []), k])
for (const [b, keys] of skBase) {
  const eKeys = enBase.get(b)
  if (!eKeys) { fail(`sk has ${keys.join(', ')}, which en doesn't`); continue }
  const plural = eKeys.some(k => PLURAL.test(k))
  if (plural) {
    for (const form of ['one', 'few', 'other']) if (!skFlat.has(`${b}_${form}`)) fail(`sk ${b} needs _${form} (Slovak counts have three forms)`)
    if (keys.includes(b)) fail(`sk ${b} is plural in en: write it as ${b}_one/_few/_other`)
  } else if (keys.some(k => PLURAL.test(k))) fail(`sk ${b} has plural forms but en ${b} doesn't count anything`)
  const want = holes(enFlat.get(eKeys[eKeys.length - 1])!)
  for (const k of keys) if (holes(skFlat.get(k)!) !== want) fail(`${k}: placeholders {${holes(skFlat.get(k)!)}} in sk, {${want}} in en`)
}
for (const [b, keys] of enBase) if (keys.some(k => PLURAL.test(k)) && !(enFlat.has(`${b}_one`) && enFlat.has(`${b}_other`))) fail(`en ${b} needs _one and _other`)

// ── Unused English keys ──────────────────────────────────────────────────────
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return d.name === 'node_modules' || d.name === 'i18n' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(d.name) ? [p] : []
  })
}
const code = ['app', 'src'].flatMap(d => sources(path.join(ROOT, d))).map(f => fs.readFileSync(f, 'utf8')).join('\n')
const unused = [...enBase.keys()].filter(b => !DYNAMIC.some(p => b.startsWith(p)) && !code.includes(`'${b}'`) && !code.includes(`"${b}"`))
for (const b of unused) fail(`en ${b} is used nowhere`)

// ── English left as literals in extracted files ──────────────────────────────
// A heuristic: text between tags with a word in it, and label-like props
// given a quoted string. Ids, styles and paths don't match either.
const PROP = /\b(label|title|sub|question|consequence|confirmLabel|stayLabel|placeholder|accessibilityLabel|accessibilityHint|body|message|actionLabel|waitingLabel|missingStep)=(?:"([^"]*[A-Za-z]{2,}[^"]*)"|\{'([^']*[A-Za-z]{2,}[^']*)'\}|\{`([^`]*[A-Za-z]{2,}[^`]*)`\})/g
// Not after = or - (an arrow, `f => f.matchday <= 3`).
const TEXT = /(?<![=-])>\s*([^<>{}\n]*[A-Za-z]{2,}[^<>{}\n]*?)\s*</g
for (const f of EXTRACTED) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  for (const m of src.matchAll(PROP)) {
    // A template that's only ${…} pieces and punctuation has no words of its own.
    if (m[4] !== undefined && !/[A-Za-z]{2,}/.test(m[4].replace(/\$\{[^}]*\}/g, ''))) continue
    fail(`${f}: ${m[1]}= is a literal ("${m[2] ?? m[3] ?? m[4]}")`)
  }
  for (const m of src.matchAll(TEXT)) {
    const text = m[1].trim()
    // The same in both languages: the game's own abbreviations.
    if (['OVR', 'XI', 'xG', 'MOTM', 'VAR'].includes(text)) continue
    // A type's arguments (`WeakMap<Map<…>, Map<…>>`) aren't text either.
    if (/^,\s*\w+$/.test(text)) continue
    // Code between two tags (") : isGuest ? (", "&& (", "return", a type's
    // Promise<…>) isn't text. Real UI text with brackets or = is rare enough.
    if (/[()=|;?]|^:|\breturn\b|\bPromise\b|&&/.test(text) || /^[\s\d.,:·–—/+%-]*$/.test(text)) continue
    fail(`${f}: text "${text}" isn't through t()`)
  }
}

// ── English in capitals, inside {…} or a string (Wave G step 1) ──────────────
// The checks above read text between tags and string props. A tag written in
// capitals inside an expression ({shown ? 'HIDE' : 'SHOW'}, `SEASON ${n}`) slipped
// past them through Wave E; this reads every string literal in an extracted file
// for a word in capitals that isn't one of the game's codes.
{
  const CODES = new Set('GK CB LB RB LWB RWB CDM CM CAM LM RM LW RW ST CF DEF MID ATT FWD OVR XI XG VAR MOTM POTM AET PEN PENS OG RED GOAL FINAL UCL UEL UECL WC PO QF SF ID GUEST IDLE REG FIFA UEFA NFD SVK ABCDEFGHIJKLMNOPQRSTUVWXYZ ABCDEFGHIJKL EUR POST MMKV DATA'.split(' '))
  // DATA: the diagnostics' status words (OK, WARN, FAIL, NO DATA) are codes, the
  // same in both languages and in the report (Phase 9).
  // brand.ts lists club-name prefixes (AFC, KRC…): data, not text.
  const NOT_UI = new Set(['src/lib/brand.ts'])
  const LIT = /(['"`])((?:\\.|(?!\1).)*?)\1/g
  const CAPS = /(?<![A-Za-z0-9_./-])[A-Z][A-Z'’]{2,}(?![A-Za-z0-9_])/g
  // Every screen and component, not only the EXTRACTED list: QualifyingLadder
  // was never put on it, and its capitals went unread through Wave E.
  const UI = ['app', 'src/components', 'src/lib'].flatMap(d => sources(path.join(ROOT, d))).map(f => path.relative(ROOT, f).split(path.sep).join('/'))
  for (const f of UI.filter(x => !NOT_UI.has(x))) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
    text.split(/\r?\n/).forEach((line, i) => {   // some files are CRLF, and `.` stops at \r
      const code = line.replace(/(^|\s)\/\/.*$/, '')
      if (/^\s*(\*|\/\*|import )/.test(code)) return
      for (const m of code.matchAll(LIT)) {
        const body = m[2].replace(/\$\{[^}]*\}/g, ' ')
        if (/^(@\/|\.\.?\/|http|#)/.test(body)) continue
        const before = code.slice(0, m.index)
        if (/[=!]==\s*$/.test(before) || /^\s*[=!]==/.test(code.slice((m.index ?? 0) + m[0].length))) continue   // a comparison is code
        const words = (body.match(CAPS) ?? []).filter(w => !CODES.has(w))
        if (words.length && !/\|\s*$/.test(before) && !/^\s*\|/.test(code.slice((m.index ?? 0) + m[0].length))) fail(`${f}:${i + 1}: capitals "${m[0].slice(0, 60)}" aren't through t()`)
      }
    })
  }
}

// ── The engine's labels (src/i18n/labels.ts) ───────────────────────────────
{
  const { labelIn } = require('../src/i18n/labels') as typeof import('../src/i18n/labels')
  const cases: [string, string][] = [
    ['Round of 16 · Leg 2', 'Osemfinále · Odveta'], ['Matchday 3', '3. kolo'], ['Group B · MD 2', 'Skupina B · 2. kolo'],
    ['ROUND OF 16', 'OSEMFINÁLE'], ['First Qualifying Round · Leg 1', '1. predkolo · Prvý zápas'], ['Final', 'Finále'],
  ]
  for (const [en, want] of cases) { const got = labelIn(en, 'sk'); if (got !== want) fail(`label "${en}" → "${got}", expected "${want}"`) }
  if (labelIn('Round of 16 · Leg 2', 'en') !== 'Round of 16 · Leg 2') fail('label() changes English')
}

// ── The guide against the engine (audit 02 C-4), and the shirt name (L-11) ───
{
  const { tiltForLevel } = require('../src/engine/difficulty') as typeof import('../src/engine/difficulty')
  const body = String(enFlat.get('guide.topic.difficulty.body') ?? '')
  // Medium is level 4. A tilt that isn't zero can't be called "straight".
  if (tiltForLevel(4) !== 0 && /Medium:\*\*[^•]*straight/.test(body)) fail('guide: Medium is "played straight" but its tilt is ' + tiltForLevel(4))
  const { surname } = require('../src/lib/format') as typeof import('../src/lib/format')
  for (const [n, want] of [['Virgil van Dijk', 'van Dijk'], ['Kevin De Bruyne', 'De Bruyne'], ['Harry Kane', 'Kane'], ['Rafael van der Vaart', 'van der Vaart']])
    if (surname(n) !== want) fail(`surname("${n}") → "${surname(n)}", expected "${want}"`)
}

// ── What's left to write ─────────────────────────────────────────────────────
const pending = [...enBase.keys()].filter(b => !skBase.has(b))
const byArea = new Map<string, number>()
for (const b of pending) byArea.set(b.split('.')[0], (byArea.get(b.split('.')[0]) ?? 0) + 1)
console.log(`English keys: ${enBase.size}; with Slovak: ${enBase.size - pending.length}; pending: ${pending.length}`)
for (const [area, n] of byArea) console.log(`  ${area}: ${n} pending`)
if (process.env.STRICT === '1' && pending.length) fail(`${pending.length} keys have no Slovak (STRICT)`)

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
