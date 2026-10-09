/**
 * Phase 10, step 2 (docs/website/09-LANDING-SHAPE.md): what the landing page
 * needs from the game, written into landing/ so the site builds with Astro
 * alone (no SQLite, no React, nothing from the app at the site's build):
 *
 *   node scripts/build-landing-data.cjs        (after brand-logo.cjs)
 *
 *  - landing/src/data/reel.json: the spin's club-seasons (09 §4.1, 08 H2), from
 *    the LEGAL database only (altered names), with the club's own kit colours
 *    (the legal flavour never uses crest-derived colours, src/lib/brand.ts:75);
 *  - landing/src/data/copy.json: the ladder's names and lines and the mode
 *    names, from the game's own i18n, passed through the legal rename table
 *    (src/data/legal-names.js), so the site says what the public app says;
 *  - landing/src/data/version.json: the game's version, for EARLY ACCESS;
 *  - landing/public/: the icons and the link preview from public/ (made by
 *    scripts/brand-logo.cjs), and the fonts subset to Latin + Latin Extended-A
 *    (Slovak's č ď ľ ň ŕ š ť ž ô ä) as WOFF, self-hosted.
 * Run again with each release; the outputs are committed.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const Database = require('better-sqlite3')
const { renameText } = require('../src/data/legal-names.js')

const ROOT = path.join(__dirname, '..')
const L = (...p) => path.join(ROOT, 'landing', ...p)
fs.mkdirSync(L('src/data'), { recursive: true })
fs.mkdirSync(L('public/fonts'), { recursive: true })

// ── The reel ────────────────────────────────────────────────────────────────
{
  const db = new Database(path.join(ROOT, 'assets/db/players_legal.db'), { readonly: true })
  // Domestic club-seasons only (the cups' rows repeat these clubs), with a squad.
  const rows = db.prepare(`
    select c.id as club, c.name as name, cs.year_start as year, c.primary_color as a, coalesce(c.secondary_color, '#FFFFFF') as b
    from club_seasons cs join clubs c on c.id = cs.club_id
    where c.league_id not like 'ucl_%' and c.league_id not like 'wc_%' and c.league_id not like 'cucl_%'
      and exists (select 1 from player_seasons ps where ps.club_season_id = cs.id)
    order by c.id, cs.year_start`).all()
  // One season per club at most (a reel of the same club twice reads wrong),
  // picked by a fixed hash so the file only changes when the data does.
  const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 }
  const byClub = new Map()
  for (const r of rows) { const best = byClub.get(r.club); if (!best || hash(r.club + r.year) > hash(best.club + best.year)) byClub.set(r.club, r) }
  const season = y => `${y}/${String(y + 1).slice(-2)}`
  const reel = [...byClub.values()].sort((x, y) => hash(x.club) - hash(y.club)).map(r => ({ name: r.name, season: season(r.year), a: r.a, b: r.b }))
  fs.writeFileSync(L('src/data/reel.json'), JSON.stringify(reel) + '\n')
  console.log(`reel.json: ${reel.length} club-seasons, ${fs.statSync(L('src/data/reel.json')).size} bytes`)
}

// ── The game's own words, in the legal flavour ─────────────────────────────
{
  // A tiny reader for the i18n files' flat string leaves (they're TS objects).
  const leaf = (file, dotted) => {
    const s = fs.readFileSync(path.join(ROOT, 'src/i18n', file), 'utf8')
    let at = 0
    for (const part of dotted.split('.')) {
      const m = new RegExp(`\\n\\s*${part}: [{']`, 'g'); m.lastIndex = at
      const hit = m.exec(s); if (!hit) throw new Error(`${file}: no ${dotted}`)
      at = hit.index + hit[0].length - 1
    }
    const q = s.slice(at).match(/^'((?:[^'\\]|\\.)*)'/)
    if (!q) throw new Error(`${file}: ${dotted} is not a string`)
    return q[1].replace(/\\'/g, "'")
  }
  // Every tier's name in a language (the `tiers` block of its i18n file).
  const tierNames = file => {
    const s = fs.readFileSync(path.join(ROOT, 'src/i18n', file), 'utf8')
    const block = s.slice(s.indexOf('\n  tiers: {'), s.indexOf('\n  },', s.indexOf('\n  tiers: {')))
    return Object.fromEntries([...block.matchAll(/\n\s+(\w+): '((?:[^'\\]|\\.)*)'/g)].map(m => [m[1], renameText(m[2].replace(/\\'/g, "'"))]))
  }
  const TIERS = ['perfection', 'almost_perfection', 'champions', 'title_contender', 'champions_league', 'europa_glory', 'almost_matters', 'respectful_mediocrity', 'absolute_misery']
  const copy = {}
  for (const [lang, file] of [['en', 'en.ts'], ['sk', 'sk.ts']]) {
    copy[lang] = {
      ladder: TIERS.map(k => ({ key: k, name: renameText(leaf(file, `tiers.${k}`)), line: renameText(leaf(file, `result.desc.${k}`)) })),
      // Every tier's name, for the week's top five (a cup run's tier too).
      tiers: tierNames(file),
      // The modes the game has (not the World Cup's full route: announced, not built).
      modes: [
        { key: 'league', name: leaf(file, 'modes.league'), line: renameText(leaf(file, 'modes.leagueLine')) },
        { key: 'all_time', name: leaf(file, 'modes.allTime'), line: renameText(leaf(file, 'modes.allTimeLine')) },
        { key: 'chaos', name: leaf(file, 'modes.chaos'), line: renameText(leaf(file, 'modes.chaosLine')), hazard: true },
        { key: 'cursed', name: leaf(file, 'modes.cursed'), line: renameText(leaf(file, 'modes.cursedLine')), hazard: true },
        { key: 'europe_path', name: renameText(lang === 'sk' ? 'Európa · Celá cesta' : 'Europe · Full path'), line: renameText(leaf(file, 'modes.europePathLine')) },
        { key: 'ucl', name: renameText(lang === 'sk' ? 'Liga majstrov' : 'Champions League'), line: renameText(leaf(file, 'modes.uclLine')) },
        { key: 'uel', name: renameText(lang === 'sk' ? 'Európska liga' : 'Europa League'), line: renameText(leaf(file, 'modes.uelLine')) },
        { key: 'uecl', name: renameText(lang === 'sk' ? 'Konferenčná liga' : 'Conference League'), line: renameText(leaf(file, 'modes.ueclLine')) },
        { key: 'world_cup', name: renameText(lang === 'sk' ? 'Majstrovstvá sveta' : 'World Cup'), line: renameText(leaf(file, 'modes.wcLine')) },
      ],
    }
  }
  fs.writeFileSync(L('src/data/copy.json'), JSON.stringify(copy, null, 1) + '\n')
  console.log('copy.json: the ladder in en and sk')
}

// ── The rename table, for text the site reads live (the week's top five) ───
fs.writeFileSync(L('src/data/renames.json'), JSON.stringify(require('../src/data/legal-names.js').RENAMES) + '\n')
console.log('renames.json: the legal rename table')

// ── The version ─────────────────────────────────────────────────────────────
{
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo.version
  fs.writeFileSync(L('src/data/version.json'), JSON.stringify({ version }) + '\n')
  console.log('version.json:', version)
}

// ── The two pieces of the game's code the site uses, copied in ──────────────
// The site builds on its own (Vercel's project for it installs only landing/'s
// dependencies). Importing these from ../src made Vite compile them under the
// app's tsconfig, which extends Expo's: "failed to resolve expo/tsconfig.base"
// on the site's first deploy (9 Oct 2026). So they're copied, marked as copies.
{
  const copyModule = (from, to) => {
    const body = fs.readFileSync(path.join(ROOT, from), 'utf8')
    fs.writeFileSync(L(to), `// COPIED from ${from} by scripts/build-landing-data.cjs. Edit the original and run the script.
` + body)
    console.log(`${to}: copied from ${from}`)
  }
  fs.mkdirSync(L('src/lib/game'), { recursive: true })
  copyModule('src/components/brand/logoParts.ts', 'src/lib/game/logoParts.ts')
  copyModule('src/lib/week.ts', 'src/lib/game/week.ts')
}

// ── Icons and the preview ───────────────────────────────────────────────────
for (const f of ['og.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(ROOT, 'public', f), L('public', f))
fs.copyFileSync(path.join(ROOT, 'assets/favicon.png'), L('public/favicon.png'))
// The language switch is the current language's flag, cut round (9 Oct 2026).
fs.mkdirSync(L('public/flags'), { recursive: true })
for (const [lang, flag] of [['en', 'gb'], ['sk', 'sk']]) fs.copyFileSync(path.join(ROOT, 'assets/flags-large', `${flag}.png`), L('public/flags', `${lang}.png`))
console.log('icons and og.png copied')

// ── Fonts, subset ───────────────────────────────────────────────────────────
{
  const F = p => path.join(ROOT, 'node_modules/@expo-google-fonts', p)
  const fonts = [
    ['barlow-condensed/900Black_Italic/BarlowCondensed_900Black_Italic.ttf', 'super.woff'],
    ['martian-mono/500Medium/MartianMono_500Medium.ttf', 'tag.woff'],
    ['archivo/400Regular/Archivo_400Regular.ttf', 'body.woff'],
    ['archivo/700Bold/Archivo_700Bold.ttf', 'body-bold.woff'],
    ['archivo/800ExtraBold/Archivo_800ExtraBold.ttf', 'body-black.woff'],
  ]
  // Basic Latin, Latin-1, Latin Extended-A, and the typographic marks the copy uses.
  const unicodes = 'U+0020-007E,U+00A0-00FF,U+0100-017F,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+201E,U+2026,U+00B7,U+2192,U+2193,U+00D7'
  for (const [src, out] of fonts) {
    execFileSync('python', ['-m', 'fontTools.subset', F(src), `--unicodes=${unicodes}`, '--flavor=woff', '--layout-features=*', `--output-file=${L('public/fonts', out)}`])
    console.log(`fonts/${out}: ${fs.statSync(L('public/fonts', out)).size} bytes`)
  }
}
