/**
 * P8.5-31: write public/latest.json, the record the app checks for a newer
 * build (src/lib/appUpdate.ts), from a released APK.
 *
 *   npx tsx scripts/release-latest.ts --apk path/to/app.apk --build 12 \
 *     [--url https://…] [--min 10] [--notes "One line on what's new"]
 *
 * --url defaults to the releases repo (github.com/hoopjakub/perfection-or-misery-release,
 * made 1 Oct 2026): a release tagged v<app.json version> with the APK
 * attached as perfection-or-misery.apk. Tag and name it that way and the
 * address is right without typing it.
 *
 * --build is the build's versionCode (EAS prints it; appVersionSource is
 * remote). The version comes from app.json. The SHA-256 is worked out from
 * the APK itself, so the app can refuse a download that doesn't match.
 * Upload the APK to the releases repo first, then run this, then deploy the
 * web build (public/ is served as is: /latest.json).
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, statSync } from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const version = JSON.parse(readFileSync(path.join(__dirname, '../app.json'), 'utf8')).expo.version as string
const RELEASES = 'https://github.com/hoopjakub/perfection-or-misery-release/releases/download'
const apk = arg('apk'), url = arg('url') ?? `${RELEASES}/v${version}/perfection-or-misery.apk`, build = Number(arg('build'))
if (!apk || !Number.isInteger(build) || build <= 0) {
  console.error('usage: --apk <file> --build <versionCode> [--url <https download address>] [--min <versionCode>] [--notes "…"]')
  process.exit(1)
}
if (!/^https:\/\//.test(url)) { console.error('--url must be https'); process.exit(1) }
const min = arg('min') != null ? Number(arg('min')) : undefined
if (min != null && !(Number.isInteger(min) && min > 0 && min <= build)) { console.error('--min must be a versionCode no higher than --build'); process.exit(1) }

const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex')
// size and released: for the website's download page (docs/website/11 §3);
// the app reads neither.
const size = statSync(apk).size, released = new Date().toISOString().slice(0, 10)
const record = { version, build, url, sha256, size, released, ...(min != null ? { minBuild: min } : {}), ...(arg('notes') ? { notes: arg('notes') } : {}) }
writeFileSync(path.join(__dirname, '../public/latest.json'), JSON.stringify(record, null, 2) + '\n')
console.log('wrote public/latest.json:', record)
