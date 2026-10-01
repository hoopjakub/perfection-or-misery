/**
 * P8.5-31: write public/latest.json, the record the app checks for a newer
 * build (src/lib/appUpdate.ts), from a released APK.
 *
 *   npx tsx scripts/release-latest.ts --apk path/to/app.apk --build 12 \
 *     --url https://github.com/<you>/<releases-repo>/releases/download/v0.9.1/perfection-or-misery.apk \
 *     [--min 10] [--notes "One line on what's new"]
 *
 * --build is the build's versionCode (EAS prints it; appVersionSource is
 * remote). The version comes from app.json. The SHA-256 is worked out from
 * the APK itself, so the app can refuse a download that doesn't match.
 * Upload the APK to the releases repo first, then run this, then deploy the
 * web build (public/ is served as is: /latest.json).
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const apk = arg('apk'), url = arg('url'), build = Number(arg('build'))
if (!apk || !url || !Number.isInteger(build) || build <= 0) {
  console.error('usage: --apk <file> --url <https download address> --build <versionCode> [--min <versionCode>] [--notes "…"]')
  process.exit(1)
}
if (!/^https:\/\//.test(url)) { console.error('--url must be https'); process.exit(1) }
const min = arg('min') != null ? Number(arg('min')) : undefined
if (min != null && !(Number.isInteger(min) && min > 0 && min <= build)) { console.error('--min must be a versionCode no higher than --build'); process.exit(1) }

const version = JSON.parse(readFileSync(path.join(__dirname, '../app.json'), 'utf8')).expo.version as string
const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex')
const record = { version, build, url, sha256, ...(min != null ? { minBuild: min } : {}), ...(arg('notes') ? { notes: arg('notes') } : {}) }
writeFileSync(path.join(__dirname, '../public/latest.json'), JSON.stringify(record, null, 2) + '\n')
console.log('wrote public/latest.json:', record)
