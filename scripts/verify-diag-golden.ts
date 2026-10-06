/**
 * The engine's seeded output is what the golden file says it is (Phase 9,
 * docs/diagnostics/04-CHECKS.md §2.5).
 *
 *   npx tsx scripts/verify-diag-golden.ts
 *   npx tsx scripts/verify-diag-golden.ts --replay <seed>   (a self-test violation, run again here)
 *
 * Recomputes the fingerprint under Node and fails if it differs from
 * src/diag/golden.ts, or if ENGINE_VERSION moved without regenerating. So any
 * change to what a seed produces (and with it every saved run's sheets) has to
 * be made on purpose: bump ENGINE_VERSION, `npx tsx scripts/diag-golden.ts`.
 * Also runs the self-test's invariants over the same matches the phone does.
 */
import { computeFingerprint, compareFingerprint, syntheticMatch, fingerprintSeed, FINGERPRINT_SEEDS } from '../src/diag/fingerprint'
import { GOLDEN } from '../src/diag/golden'
import { generateMatchDetail } from '../src/engine/match-detail'
import { buildDeepMatchTimeline } from '../src/engine/deep-match'
import { checkMatchDetail, checkTimeline } from '../src/engine/invariants'

let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

/** The self-test's per-match check (src/diag/checks.ts does the same). */
export function invariantsFor(seed: number): string[] {
  const m = syntheticMatch(seed)
  const d = generateMatchDetail(m)
  if (!d) return ['the sheet failed to generate']
  return [...checkMatchDetail(d, m), ...checkTimeline(buildDeepMatchTimeline(d, seed), d, m)]
}

const replayAt = process.argv.indexOf('--replay')
if (replayAt > 0) {
  const seed = Number(process.argv[replayAt + 1])
  const v = invariantsFor(seed)
  console.log(v.length ? v.map(x => `❌ seed ${seed}: ${x}`).join('\n') : `seed ${seed}: every invariant holds`)
  process.exit(v.length ? 1 : 0)
}

const now = computeFingerprint()
const verdict = compareFingerprint(now, GOLDEN)
check(verdict.status === 'MATCH', `fingerprint ${verdict.status}${verdict.detail ? ` (${verdict.detail})` : ''}: if the change is meant, bump ENGINE_VERSION and run scripts/diag-golden.ts`)
check(now.raw.length === FINGERPRINT_SEEDS && now.raw.every(h => h !== 0), 'a fingerprint seed produced no sheet')
// Deterministic within one engine, or the comparison means nothing.
check(fingerprintSeed(7).raw === now.raw[6], 'the same seed hashed twice gives two answers')
// The comparison catches what it exists for.
const tampered = { ...GOLDEN, shown: [...GOLDEN.shown], raw: [...GOLDEN.raw] }
tampered.raw[4] ^= 1
check(compareFingerprint(GOLDEN, tampered).status === 'RAW DIFFERS', 'a raw-only difference isn\'t reported as RAW DIFFERS')
tampered.shown[1] ^= 1
check(compareFingerprint(now, tampered).status === 'SHOWN DIFFERS', 'a shown difference isn\'t reported')
check(compareFingerprint(now, { ...GOLDEN, engine: GOLDEN.engine + 1 }).status === 'STALE', 'a golden file from another engine version isn\'t STALE')

// The self-test's invariant run, over the first 200 seeds.
let broken = 0
for (let seed = 1; seed <= 200; seed++) {
  const v = invariantsFor(seed)
  if (v.length) { broken++; if (broken <= 3) check(false, `seed ${seed}: ${v[0]}`) }
}
check(broken === 0, `${broken} of 200 synthetic matches break an invariant`)

console.log(`\nengine ${now.engine} · ${verdict.status} · 200 synthetic matches checked`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
