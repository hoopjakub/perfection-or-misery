/**
 * Phase 10.5 · One over-the-air update, to both builds, each in its own names.
 *
 *   npx tsx scripts/publish-update.ts --message "What changed, one line"
 *   npx tsx scripts/publish-update.ts --message "…" --dry   (export and check, publish nothing)
 *
 * The maintainer, 11 Oct 2026: the personal build should get every code update
 * the public one gets, keeping its crests and real names. So the same code is
 * exported twice:
 *   public    EXPO_PUBLIC_BRAND_MODE=original → checked for real names
 *             (verify-legal-bundle --update) → channel production
 *   personal  EXPO_PUBLIC_BRAND_MODE=real → checked that it IS the personal one
 *             (the same check must fail on it) → channels production-personal
 *             and preview-personal
 * The brand mode is always set here, never taken from .env: the local .env is
 * the personal build's, so a plain `eas update` would put real names on every
 * public phone. Nothing is published unless both exports pass their checks.
 *
 * An update carries code only (app.json updates.assetPatternsToBeBundled): the
 * crests, the database and the fonts stay the APK's. A new native part, a new
 * crest or a new database needs a new APK, not this.
 */
import { spawnSync } from 'child_process'
import { rmSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const args = process.argv.slice(2)
const message = args[args.indexOf('--message') + 1]
const dry = args.includes('--dry')
if (!args.includes('--message') || !message) { console.error('usage: npx tsx scripts/publish-update.ts --message "…" [--dry]'); process.exit(1) }

const root = path.join(__dirname, '..')
const work = mkdtempSync(path.join(tmpdir(), 'pom-update-'))
const run = (cmd: string, brand: 'original' | 'real', extra: Record<string, string> = {}) => {
  console.log(`\n$ ${cmd}   (EXPO_PUBLIC_BRAND_MODE=${brand})`)
  const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_BRAND_MODE: brand, ...extra } })
  return r.status === 0
}
const fail = (why: string) => { console.error(`\n❌ ${why}. Nothing was published.`); process.exit(1) }

const flavours = [
  { brand: 'original' as const, dir: path.join(work, 'public'), channels: ['production'] },
  { brand: 'real' as const, dir: path.join(work, 'personal'), channels: ['production-personal', 'preview-personal'] },
]

// 1 · Both exports, both checks, before anything goes out.
for (const f of flavours) {
  if (!run(`npx expo export -p android --clear --output-dir "${f.dir}"`, f.brand)) fail(`the ${f.brand} export failed`)
  const clean = run(`npx tsx scripts/verify-legal-bundle.ts "${f.dir}" --update`, f.brand)
  if (f.brand === 'original' && !clean) fail('the public export has real names in it')
  if (f.brand === 'real' && clean) fail('the personal export passed the public check: it isn’t the personal build')
}
console.log('\n✓ public export clean; personal export is the personal one')
if (dry) { console.log(`dry run: exports kept in ${work}`); process.exit(0) }

// 2 · Publish each export as it was checked (--skip-bundler: nothing rebuilt in between).
for (const f of flavours) for (const channel of f.channels) {
  if (!run(`npx eas-cli update --channel ${channel} --platform android --skip-bundler --input-dir "${f.dir}" --message "${message.replace(/"/g, '\\"')}" --non-interactive`, f.brand)) {
    fail(`publishing to ${channel} failed (the channels before it may already have the update)`)
  }
}
rmSync(work, { recursive: true, force: true })
console.log('\n✅ published: production (public), production-personal and preview-personal (personal)')
