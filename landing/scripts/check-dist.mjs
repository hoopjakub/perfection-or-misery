// The built site, checked (docs/website/10-AUDIT-ADDENDUM.md §2.9, §3; 09 §7):
//   npm run build && npm run check
// Fails on: a real competition name in anything a visitor reads (the HTML and
// text files; the rename table itself ships inside the script and is the one
// place those names belong); a page without one h1, a lang, a canonical and
// its hreflang pair, or with a description outside 120–170 characters; an
// inline script the content security policy would block; a link to a page
// the build doesn't have; the page weight over its budget.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIST = path.join(process.cwd(), 'dist')
const RENAMES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/renames.json'), 'utf8'))
let failures = 0
const fail = msg => { failures++; console.log(`❌ ${msg}`) }
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p) } return out }
const files = walk(DIST)
const rel = f => '/' + path.relative(DIST, f).replace(/\\/g, '/')

// 1 · No real names where a visitor reads (whole words, as renameText matches).
const readable = files.filter(f => /\.(html|txt|xml)$/.test(f))
for (const f of readable) {
  const text = fs.readFileSync(f, 'utf8')
  for (const [real] of RENAMES) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u')
    if (re.test(text)) fail(`${rel(f)} says "${real}" (a real competition name on the public site)`)
  }
}

// 2 · Every page's basics.
const pages = files.filter(f => f.endsWith('.html'))
const hrefs = new Set(pages.map(f => rel(f).replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '') || '/'))
for (const f of pages) {
  const html = fs.readFileSync(f, 'utf8')
  const name = rel(f)
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length
  if (h1 !== 1) fail(`${name}: ${h1} h1s`)
  if (!/<html lang="(en|sk)"/.test(html)) fail(`${name}: no lang on <html>`)
  const noindex = /<meta name="robots" content="noindex"/.test(html)
  if (!noindex) {
    if (!/<link rel="canonical"/.test(html)) fail(`${name}: no canonical`)
    if (!/hreflang="en"/.test(html) || !/hreflang="sk"/.test(html) || !/hreflang="x-default"/.test(html)) fail(`${name}: the language pair is incomplete`)
    const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
    if (desc.length < 120 || desc.length > 170) fail(`${name}: description is ${desc.length} characters`)
  }
  // Inline scripts: only data (JSON, JSON-LD), never code (the CSP's script-src 'self').
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) {
    if (!/type="application\/(ld\+)?json"/.test(m[1])) fail(`${name}: an inline script the CSP would block: <script${m[1]}>`)
  }
  // Internal links resolve.
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const target = m[1].replace(/\/$/, '') || '/'
    if (/\.(png|woff|css|js|json|txt|xml)$/.test(target)) { if (!fs.existsSync(path.join(DIST, target))) fail(`${name}: ${target} isn't in the build`) }
    else if (!hrefs.has(target)) fail(`${name}: links to ${target}, which isn't a page`)
  }
}

// 3 · The weight (09 §1, roadmap Phase 10: under 100 KB before images): the
// front page's HTML, CSS and JS, gzipped. Fonts reported beside it.
const gz = f => zlib.gzipSync(fs.readFileSync(f)).length
const front = path.join(DIST, 'index.html')
const html = fs.readFileSync(front, 'utf8')
const assets = [...html.matchAll(/(?:href|src)="(\/_astro\/[^"]+\.(?:css|js))"/g)].map(m => path.join(DIST, m[1]))
const weight = gz(front) + assets.reduce((s, f) => s + gz(f), 0)
const fonts = files.filter(f => f.endsWith('.woff')).reduce((s, f) => s + fs.statSync(f).size, 0)
console.log(`front page: ${(weight / 1024).toFixed(1)} KB gzipped (HTML ${(gz(front) / 1024).toFixed(1)}, ${assets.length} CSS/JS files); fonts ${(fonts / 1024).toFixed(0)} KB (WOFF, cached a year)`)
if (weight > 100 * 1024) fail(`the front page weighs ${(weight / 1024).toFixed(1)} KB gzipped, over 100 KB`)

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
