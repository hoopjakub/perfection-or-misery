// Phase 9, Diagnostics step 3 (docs/diagnostics/04-CHECKS.md §2.5): the version
// of the engine's SEEDED output, the way DB_VERSION is the database's.
//
// A saved run keeps seeds, not sheets: every match sheet, Deep Match and run
// stat is rebuilt from its seed by today's engine. So a change to what a seed
// produces quietly rewrites every past run's numbers. That can be the right
// call, but it has to be a decision: bump this, run
// `npx tsx scripts/diag-golden.ts`, and commit the new src/diag/golden.ts in
// the same change. scripts/verify-diag-golden.ts fails until you do.
//
// 2 (8 Oct 2026, Phase 9.75, P9.75-18): the engine's pow, exp, sin, tanh,
// atan2 and hypot moved to src/lib/pmath.ts, the same bits on every JS engine.
// The phone (Hermes) computed different sheets from the web (V8) for the same
// seed; past runs' sheets change once, by a hair, and then agree everywhere.
export const ENGINE_VERSION = 2
