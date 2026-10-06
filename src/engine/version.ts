// Phase 9, Diagnostics step 3 (docs/diagnostics/04-CHECKS.md §2.5): the version
// of the engine's SEEDED output, the way DB_VERSION is the database's.
//
// A saved run keeps seeds, not sheets: every match sheet, Deep Match and run
// stat is rebuilt from its seed by today's engine. So a change to what a seed
// produces quietly rewrites every past run's numbers. That can be the right
// call, but it has to be a decision: bump this, run
// `npx tsx scripts/diag-golden.ts`, and commit the new src/diag/golden.ts in
// the same change. scripts/verify-diag-golden.ts fails until you do.
export const ENGINE_VERSION = 1
