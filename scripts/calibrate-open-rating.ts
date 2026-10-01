/**
 * Calibration report for the open-data OVR (docs/release/06-OUR-OWN-DATA.md
 * §4.5): rate a real league-season from Wikipedia facts and compare with the
 * game's current scale.
 *
 *   npx tsx scripts/calibrate-open-rating.ts
 *
 * Today's (Transfermarkt-built) ratings are a YARDSTICK here and nothing more:
 * they're read to print a correlation and the biggest disagreements for a
 * person to judge, and never feed a constant. The model's constants are set by
 * hand in scripts/lib/open-rating.ts. This comparison runs once, offline; no
 * Transfermarkt value goes near the open build.
 */
import Database from 'better-sqlite3'
import path from 'path'
import { bandForRank, openOvr } from './lib/open-rating'
import { historyLeague } from './lib/open-squads'
import { requestCount } from './lib/wikipedia'

const ARTICLE = '2018–19 Premier League'
const SEASON = 2018
const BAND = bandForRank(1) // England

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) }
function pearson(a: number[], b: number[]) {
  const ma = mean(a), mb = mean(b)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}

async function main() {
  const built = await historyLeague(() => ARTICLE, [SEASON], {
    fullGames: n => (n - 1) * 2, onProgress: (d, n) => process.stdout.write(`\r  player pages ${d}/${n}`),
  })
  const clubs = built.get(SEASON)!
  process.stdout.write('\n')
  const rated = clubs.flatMap(c => c.players.map(p => ({
    club: c.title, clubPosition: c.position, ...p,
    ovr: openOvr({
      clubPosition: c.position, clubs: clubs.length, games: p.games, apps: p.apps, goals: p.goals,
      position: p.position, age: p.birthYear ? SEASON - p.birthYear : null, level: p.level, seedName: p.article ?? p.name,
    }, BAND),
  })))

  // The yardstick: today's squads for the same season, matched by name.
  // The old (Transfermarkt-built) database as a yardstick, only when given one:
  // the bundled DB is the open data now, so comparing with it would be circular.
  if (!process.env.TM_DB) { console.log(`
  (no TM_DB given: no comparison with the old ratings)`); return }
  const db = new Database(process.env.TM_DB, { readonly: true })
  const today = db.prepare(`
    SELECT p.name AS name, ps.ovr AS ovr FROM player_seasons ps
    JOIN players p ON p.id = ps.player_id JOIN club_seasons cs ON cs.id = ps.club_season_id
    JOIN clubs c ON c.id = cs.club_id
    WHERE c.league_id = 'premier_league' AND cs.year_start = ? AND ps.appearances > 0`).all(SEASON) as { name: string; ovr: number }[]
  db.close()
  const todayByName = new Map(today.map(r => [norm(r.name), r.ovr]))

  const o = rated.map(r => r.ovr)
  console.log(`\n=== ${ARTICLE}: ${rated.length} players rated from Wikipedia`)
  console.log(`  ours:  mean ${mean(o).toFixed(1)}  sd ${sd(o).toFixed(1)}  range ${Math.min(...o)}–${Math.max(...o)}`)
  const t = today.map(r => r.ovr)
  console.log(`  game:  mean ${mean(t).toFixed(1)}  sd ${sd(t).toFixed(1)}  range ${Math.min(...t)}–${Math.max(...t)}  (today's scale)`)
  const known = { position: rated.filter(r => r.position).length, age: rated.filter(r => r.birthYear).length, goals: rated.filter(r => r.goals !== null).length }
  console.log(`  inputs known: position ${known.position}/${rated.length}, age ${known.age}, goals ${known.goals}`)

  console.log('\n  pos  club                              avg   best')
  for (const c of clubs) {
    const mine = rated.filter(r => r.club === c.title).map(r => r.ovr)
    console.log(`  ${String(c.position).padStart(3)}  ${c.title.padEnd(32).slice(0, 32)} ${mean(mine).toFixed(1).padStart(5)} ${String(Math.max(...mine)).padStart(6)}`)
  }

  const matched = rated.flatMap(r => { const v = todayByName.get(norm(r.name)); return v === undefined ? [] : [{ ...r, today: v }] })
  console.log(`\n  matched by name to today's squads: ${matched.length}/${rated.length}`)
  console.log(`  correlation with today's ratings: ${pearson(matched.map(m => m.ovr), matched.map(m => m.today)).toFixed(2)}  (a sanity check, not a target)`)
  const top = [...rated].sort((a, b) => b.ovr - a.ovr).slice(0, 15)
  console.log('\n  our top 15: ' + top.map(r => `${r.name} ${r.ovr}`).join(', '))
  const diff = [...matched].sort((a, b) => (b.ovr - b.today) - (a.ovr - a.today))
  const line = (m: (typeof matched)[number]) => `${m.name} (${m.club.replace(/ F\.C\.| A\.F\.C\./, '')}, ${m.apps} apps, ${m.goals ?? '?'} g, ${m.position ?? '?'}) ours ${m.ovr} vs ${m.today}`
  console.log('\n  we rate HIGHER than today:\n    ' + diff.slice(0, 8).map(line).join('\n    '))
  console.log('\n  we rate LOWER than today:\n    ' + diff.slice(-8).reverse().map(line).join('\n    '))
  console.log(`\n${requestCount()} requests made this run.`)
}

main().catch(e => { console.error(e); process.exit(1) })
