/**
 * Second coverage probe (docs/release/06-OUR-OWN-DATA.md §4.2a point 5): do the
 * LOCAL Wikipedias fill the small leagues' gaps? English gave Slovakia's current
 * squads an article for 64% of players and San Marino's for 11%. Local players
 * often have a page only in their own language, under the same licence and the
 * same API rules, so: for every player in the English squad lists, find a local
 * page, and count what we'd know about him with English + local together.
 *
 *   npx tsx scripts/probe-local-wikis.ts
 *
 * A local page is found three ways, in order:
 *   1. the English article's Wikidata sitelink (skwiki / itwiki);
 *   2. the local club page's own squad list, matched by name, if it links him;
 *   3. an article titled with his name, accepted only if it's a footballer's.
 * What's read from it: the birth year, and apps in his CURRENT spell (the last,
 * open-ended one in the infobox; the squad list already says he's at the club).
 */
import {
  careerRows, currentSquad, getPages, infoboxSpells, leagueTable, requestCount, resolveTitles, sitelinks,
} from './lib/wikipedia'

type Lang = 'sk' | 'it'
const PROBES: { label: string; article: string; season: number; lang: Lang }[] = [
  { label: 'Slovakia 2025–26', article: '2025–26 Slovak First Football League', season: 2025, lang: 'sk' },
  { label: 'San Marino 2025–26', article: '2025–26 Campionato Sammarinese di Calcio', season: 2025, lang: 'it' },
]

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

// The two local squad templates: sk "Futbalová súpiska hráč|…|meno=[[…]]",
// it "Calciatore in rosa|…|nome=[[…]]". Returns normalised name → linked title.
function localSquadLinks(wikitext: string, lang: Lang): Map<string, string> {
  const re = lang === 'sk' ? /Futbalová súpiska hráč[^}]*?meno\s*=\s*([^|}]+)/g : /Calciatore in rosa[^}]*?nome\s*=\s*([^|}]+)/g
  const out = new Map<string, string>()
  for (const m of wikitext.matchAll(re)) {
    const link = m[1].match(/\[\[([^\]|]+)(?:\|([^\]]+))?/)
    if (link) out.set(norm(link[2] ?? link[1]), link[1].trim())
  }
  return out
}

const isFootballer = (w: string, lang: Lang) =>
  lang === 'sk' ? /Infobox futbalista/i.test(w) : /Disciplina\s*=\s*Calcio/i.test(w) || /Attività\s*=\s*calciatore/i.test(w)

function localBirthYear(w: string, lang: Lang): number | null {
  const m = lang === 'sk'
    ? w.match(/dátum narodenia\s*=\s*\{\{\s*(?:dnv|dátum narodenia a vek)\s*\|\s*(\d{4})/i) ?? w.match(/\(\s*\*\s*\[\[[^\]]+\]\]\s*\[\[(\d{4})\]\]/)
    : w.match(/AnnoNascita\s*=\s*(\d{4})/)
  return m ? Number(m[1]) : null
}

// Apps in the open-ended last spell ("2020-" / "|2025-|Tre Penne|17 (1)").
function localCurrentApps(w: string, lang: Lang): number | null {
  if (lang === 'sk') {
    const field = (k: string) => w.match(new RegExp(`\\|\\s*${k}\\s*=([^\\n]*)`))?.[1] ?? ''
    const years = field('roky').split(/<br\s*\/?\s*>/i).map(s => s.trim()).filter(Boolean)
    const apps = field('zápasy\\(góly\\)').split(/<br\s*\/?\s*>/i).map(s => s.replace(/\{\{0\}\}/g, '').trim()).filter(Boolean)
    if (!years.length || !/[–-]\s*$/.test(years[years.length - 1])) return null
    const n = apps[years.length - 1]?.match(/^(\d+)/)
    return n ? Number(n[1]) : null
  }
  const squadre = w.match(/\|\s*Squadre\s*=\s*\{\{Carriera sportivo([\s\S]*?)\n\}\}/)?.[1] ?? ''
  const spells = [...squadre.matchAll(/^\s*\|\s*(\d{4})\s*-\s*(\d{4})?\s*\|[^\n]*?\|\s*(\d+)\s*\(/gm)]
  const last = spells[spells.length - 1]
  return last && !last[2] ? Number(last[3]) : null
}

const enBirth = (w: string) => /\{\{\s*birth date( and age)?\s*\|\s*(df=\w+\|)?\s*\d{4}/i.test(w)

async function probe(p: (typeof PROBES)[number]) {
  const league = (await getPages([p.article])).get(p.article)!
  const table = leagueTable(league.wikitext ?? '')
  const clubPages = await getPages(table.map(t => t.title))
  const clubs = table.map(t => clubPages.get(t.title)!)
  const site = p.lang + 'wiki'
  const clubLinks = await sitelinks(clubs.map(c => c.wikidata!).filter(Boolean), [site])
  const localClubTitles = clubs.map(c => clubLinks.get(c.wikidata ?? '')?.[site]).filter((t): t is string => !!t)
  const localClubs = await getPages(localClubTitles, p.lang)

  const squads = clubs.map(c => ({ c, squad: currentSquad(c.wikitext ?? '') }))
  const enTitles = squads.flatMap(s => s.squad.map(e => e.article).filter((a): a is string => !!a))
  const enPages = await getPages(enTitles)
  const enLinks = await sitelinks([...enPages.values()].map(pg => pg.wikidata!).filter(Boolean), [site])
  // English playing-time signals, as in the first probe (career row / infobox apps at the club).
  const spellCanon = await resolveTitles([...enPages.values()].flatMap(pg => infoboxSpells(pg.wikitext ?? '').map(s => s.club)))

  // Resolve every player to a local title first, then fetch them in one go.
  const localTitleOf = new Map<string, string>() // key: club|name
  const guesses: string[] = []
  for (const { c, squad } of squads) {
    const lt = clubLinks.get(c.wikidata ?? '')?.[site]
    const local = lt ? localSquadLinks(localClubs.get(lt)?.wikitext ?? '', p.lang) : new Map()
    for (const e of squad) {
      const key = c.title + '|' + e.name
      const viaSitelink = e.article ? enLinks.get(enPages.get(e.article)?.wikidata ?? '')?.[site] : undefined
      const viaSquad = local.get(norm(e.name))
      const t = viaSitelink ?? viaSquad
      if (t) localTitleOf.set(key, t); else { localTitleOf.set(key, '?' + e.name); guesses.push(e.name) }
    }
  }
  const direct = await getPages(guesses, p.lang)
  const wanted = [...localTitleOf.values()].filter(t => !t.startsWith('?'))
  const localPages = await getPages(wanted, p.lang)

  const rows = squads.map(({ c, squad }) => {
    const n = { en: 0, local: 0, either: 0, age: 0, apps: 0 }
    for (const e of squad) {
      const enW = e.article ? enPages.get(e.article)?.wikitext ?? '' : ''
      const t = localTitleOf.get(c.title + '|' + e.name)!
      const lw = t.startsWith('?')
        ? (direct.get(t.slice(1))?.wikitext ?? '')
        : (localPages.get(t)?.wikitext ?? '')
      const hasLocal = !!lw && isFootballer(lw, p.lang)
      if (enW) n.en++
      if (hasLocal) n.local++
      if (enW || hasLocal) n.either++
      if ((enW && enBirth(enW)) || (hasLocal && localBirthYear(lw, p.lang))) n.age++
      const enApps = enW && (careerRows(enW).some(r => r.season >= p.season - 1)
        || infoboxSpells(enW).some(s => (spellCanon.get(s.club) ?? s.club) === c.title && s.to === null && s.caps !== null))
      if (enApps || (hasLocal && localCurrentApps(lw, p.lang) !== null)) n.apps++
    }
    return { title: c.title, squad: squad.length, ...n }
  })

  const tot = rows.reduce((a, r) => ({ squad: a.squad + r.squad, en: a.en + r.en, local: a.local + r.local, either: a.either + r.either, age: a.age + r.age, apps: a.apps + r.apps }), { squad: 0, en: 0, local: 0, either: 0, age: 0, apps: 0 })
  const pct = (a: number) => (tot.squad ? Math.round((100 * a) / tot.squad) : 0) + '%'
  console.log(`\n=== ${p.label} · English + ${p.lang}.wikipedia`)
  console.log('  club                                   squad      en   local  either     age    apps')
  for (const r of rows) console.log(`  ${r.title.padEnd(38).slice(0, 38)} ${[r.squad, r.en, r.local, r.either, r.age, r.apps].map(x => String(x).padStart(7)).join(' ')}`)
  console.log(`  → ${tot.squad} squad places: article ${pct(tot.en)} English only → ${pct(tot.either)} with ${p.lang}; age ${pct(tot.age)}; playing time ${pct(tot.apps)}`)
}

async function main() {
  for (const p of PROBES) await probe(p)
  console.log(`\n${requestCount()} requests made this run (0 means everything came from the cache).`)
}

main().catch(e => { console.error(e); process.exit(1) })
