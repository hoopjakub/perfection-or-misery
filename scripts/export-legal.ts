/**
 * P8.5-29: the legal pages for the website, from the app's own file
 * (src/data/legal.ts), so the two can never say different things.
 *
 *   npx tsx scripts/export-legal.ts
 *
 * Writes public/legal/<page>.<lang>.json ({ updated, contact, title, intro,
 * sections }) for every page and every language that's written; the web
 * build serves public/ as is, and the landing page (Phase 10) reads them.
 */
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { LEGAL, UPDATED, CONTACT } from '../src/data/legal'

const out = path.join(__dirname, '../public/legal')
mkdirSync(out, { recursive: true })
for (const [page, langs] of Object.entries(LEGAL)) {
  for (const [lang, doc] of Object.entries(langs)) {
    if (!doc) { console.log(`${page}.${lang}: not written yet (falls back to English)`); continue }
    writeFileSync(path.join(out, `${page}.${lang}.json`), JSON.stringify({ updated: UPDATED, contact: CONTACT, ...doc }, null, 2) + '\n')
    console.log(`wrote public/legal/${page}.${lang}.json`)
  }
}
