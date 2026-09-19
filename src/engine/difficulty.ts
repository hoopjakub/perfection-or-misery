// Single source of truth for difficulty. Difficulty used to be three loose
// presets scattered across draft rerolls, a ratings-hidden check, and a match
// tilt. It's now ONE model: a 1–10 "screw-you-er" level plus a reroll count and
// a ratings toggle. easy/medium/hard are just named aliases for levels 2/4/6,
// so the base presets and a fully custom difficulty run through identical code —
// the same tilt, the same hardness metric, the same score multiplier.
//
// Everything difficulty-related derives from here: the match tilt (engine/match.ts),
// the draft reroll allowance and hidden ratings (engine/draft.ts), the run score
// multiplier (db/queries scoring), and the achievements hardness rating.

import type { GameMode } from '@/types/game'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'custom'

export type CustomDifficulty = {
  rerolls:      number   // 0..10 — more rerolls = easier draft AND a lower score
  ratingsShown: boolean  // false = draft blind, harder + worth more
  screwLevel:   number   // 1..10 — the AI's grip on your throat
}

// The 10-level "screw-you-er". easy/medium/hard live at 2/4/6 so the familiar
// names still mean something; the taglines rib the player a bit.
export const SCREW_LEVELS: { level: number; name: string; tagline: string }[] = [
  { level: 1,  name: 'Baby Mode',       tagline: 'Trophies made of foam. Losing takes real effort.' },
  { level: 2,  name: 'Easy',            tagline: 'Training wheels bolted on. Minimal shame.' },
  { level: 3,  name: 'Casual',          tagline: "You're 'not really trying.' Sure you aren't." },
  { level: 4,  name: 'Medium',          tagline: "The honest gamer's choice. Allegedly." },
  { level: 5,  name: 'Sweaty',          tagline: 'Your hands have started to get involved.' },
  { level: 6,  name: 'Hard',            tagline: 'Okay — now you actually mean it.' },
  { level: 7,  name: 'Brutal',          tagline: 'This one leaves a mark.' },
  { level: 8,  name: 'Nightmare',       tagline: 'Sleep is for people on easier settings.' },
  { level: 9,  name: 'Masochist',       tagline: 'Genuinely, what did the AI ever do to you?' },
  { level: 10, name: 'Absolute Misery', tagline: 'The world hates you specifically. Godspeed.' },
]

export function screwLevelInfo(level: number) {
  const clamped = clampInt(level, 1, 10)
  return SCREW_LEVELS[clamped - 1]
}

// Base presets → the three underlying knobs. Kept here (not in the store or the
// draft engine) so there's exactly one definition of what "easy" means.
const PRESET_LEVEL:         Record<Exclude<Difficulty, 'custom'>, number>  = { easy: 2, medium: 4, hard: 6 }
const PRESET_REROLLS:       Record<Exclude<Difficulty, 'custom'>, number>  = { easy: 3, medium: 1, hard: 0 }
const PRESET_RATINGS_SHOWN: Record<Exclude<Difficulty, 'custom'>, boolean> = { easy: true, medium: true, hard: false }

// A sensible starting point when a player first opens the custom panel: right
// between medium and hard, ratings on, a couple of rerolls.
export const DEFAULT_CUSTOM: CustomDifficulty = { rerolls: 2, ratingsShown: true, screwLevel: 5 }

// ── Match tilt ──────────────────────────────────────────────────────────────
// Level → the player-only effective-OVR swing applied in engine/match.ts. Higher
// level = more negative = the AI plays up against you. Linear and slightly harsher
// than the old three-preset values (easy was +4/medium 0/hard −4) so the whole
// base ladder is a few percent tougher — an easy World Cup shouldn't be a walk.
//   1 (Baby)  +4.5    4 (Medium) −1.5    7 (Brutal)   −7.5
//   2 (Easy)  +2.5    5 (Sweaty) −3.5    8 (Nightmare)−9.5
//   3 (Casual)+0.5    6 (Hard)   −5.5    9/10        −11.5/−13.5
export function tiltForLevel(level: number): number {
  return 6.5 - 2 * clampInt(level, 1, 10)
}

// ── The resolved bundle every consumer reads ────────────────────────────────
export type ResolvedDifficulty = {
  screwLevel:     number
  rerolls:        number
  ratingsShown:   boolean   // the difficulty knob only — mode (chaos/cursed) can still force hidden
  tilt:           number
  hardness:       number    // 0..11 (see hardnessOf)
  scoreMultiplier: number
  // CL (full) only — see Big Fixes §4. `weightedPicksDefault` is what the
  // preset/custom difficulty implies on its own (auto ON for easy/medium and
  // for custom, auto OFF for hard); `weightedPicksEffective` folds in the
  // custom-path manual override (only selectable — and only meaningful — when
  // difficulty is 'custom') and is what actually drives the draft-pool filter
  // and the hardness/score impact below. Always `false` outside CL (full).
  weightedPicksDefault:   boolean
  weightedPicksEffective: boolean
}

// Chaos and Cursed have no difficulty picker in mode-select (hasDifficulty:
// false) — but they're not "no difficulty," they're PARTICULARLY nasty ones,
// fixed rather than chosen: Chaos = Brutal (7), Cursed = Masochist (9), both
// zero rerolls and blind ratings. This also closes a real bug — since the
// store's `difficulty` field is only ever cleared by picking a new mode WITH a
// difficulty picker, a chaos/cursed run used to silently inherit whatever
// difficulty was left over from your last easy/medium/hard/custom run. Fixing
// it here, at resolution time, means it can never matter what's sitting in the
// store: any chaos/cursed match always resolves to its own fixed level.
const FIXED_MODE_LEVEL: Partial<Record<GameMode, number>> = { chaos: 7, cursed: 9 }

export function resolveDifficulty(
  difficulty: Difficulty | null,
  custom: CustomDifficulty | null | undefined,
  mode?: GameMode | null,
  // CL (full) weighted-picks manual override — only ever settable (in the
  // UI) when difficulty is 'custom'; ignored otherwise. null = no override.
  weightedPicksOverride?: boolean | null,
): ResolvedDifficulty {
  const fixedLevel = mode ? FIXED_MODE_LEVEL[mode] : undefined
  const knobs = fixedLevel !== undefined
    ? { level: fixedLevel, rerolls: 0, ratingsShown: false }
    : difficulty === 'custom'
    ? { level: custom?.screwLevel ?? DEFAULT_CUSTOM.screwLevel,
        rerolls: custom?.rerolls ?? DEFAULT_CUSTOM.rerolls,
        ratingsShown: custom?.ratingsShown ?? DEFAULT_CUSTOM.ratingsShown }
    // No difficulty set (legacy data, or a screen that hasn't picked one yet)
    // resolves to medium's knobs so the tilt is sane.
    : { level: PRESET_LEVEL[difficulty ?? 'medium'],
        rerolls: PRESET_REROLLS[difficulty ?? 'medium'],
        ratingsShown: PRESET_RATINGS_SHOWN[difficulty ?? 'medium'] }

  // Easy/Medium default ON, Hard defaults OFF, Custom defaults ON (the
  // custom-path toggle is the only way to turn it off) — see Big Fixes §4.
  // Only meaningful for CL (full); every other mode resolves to `false`.
  const weightedPicksDefault = difficulty === 'custom' ? true : knobs.level <= 4
  const weightedPicksEffective = mode !== 'champions_league_custom' ? false
    : difficulty === 'custom' ? (weightedPicksOverride ?? weightedPicksDefault)
    : weightedPicksDefault

  const hardness = hardnessOf(knobs.level, knobs.rerolls, !knobs.ratingsShown, weightedPicksEffective)
  return {
    screwLevel: knobs.level,
    rerolls: knobs.rerolls,
    ratingsShown: knobs.ratingsShown,
    tilt: tiltForLevel(knobs.level),
    hardness,
    scoreMultiplier: scoreMultiplierFor(hardness),
    weightedPicksDefault,
    weightedPicksEffective,
  }
}

// ── Hardness: one 0–11 number that captures how brutal a run's SETTINGS were ──
// Used both for the score multiplier and the achievements "how hard was it" rating.
// Endpoints (by design): Baby + 10 rerolls + ratings shown = 0.0 (easiest possible),
// Absolute Misery + 0 rerolls + ratings hidden = 11.0 (the 11/10 run). Level is the
// dominant axis (0–9); hidden ratings and zero rerolls each add up to a full point.
// Weighted picks (CL full only, Big Fixes §4) shaves off a further point when
// effectively on — it's the same kind of "made the draft easier" knob as
// visible ratings or a pile of rerolls, so it earns less. Clamped at 0 since
// it can otherwise push an already-easy run's raw total negative.
export function hardnessOf(screwLevel: number, rerolls: number, ratingsHidden: boolean, weightedPicks = false): number {
  const level = clampInt(screwLevel, 1, 10)
  const rr    = clampInt(rerolls, 0, 10)
  const h = (level - 1) + (ratingsHidden ? 1 : 0) + (10 - rr) / 10 - (weightedPicks ? 1 : 0)
  return Math.max(0, Math.round(h * 10) / 10)
}

// The multiplier lives with the rest of the scoring formula, shared with the
// server (supabase/functions/_shared/score.ts), so the two can never disagree.
import { scoreMultiplierFor } from '../../supabase/functions/_shared/score'
export { scoreMultiplierFor }

// ── Reroll allowance + hidden ratings (replaces engine/draft.ts helpers) ─────
// Both just read the resolved knobs — the chaos/cursed override lives ONLY in
// resolveDifficulty now, so there's exactly one place that says "0 rerolls,
// ratings hidden" for those modes instead of three copies drifting apart.
export function rerollLimitFor(difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode: GameMode | null): number {
  return resolveDifficulty(difficulty, custom, mode).rerolls
}

export function ratingsHiddenFor(difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode: GameMode | null): boolean {
  return !resolveDifficulty(difficulty, custom, mode).ratingsShown
}

// Short label for the run summary / achievements / run-history cards. Chaos and
// Cursed get their own mode-flavoured label (not "Custom · Brutal" — the mode
// name already says which one) since the level is fixed, not a player choice.
const FIXED_MODE_LABEL: Partial<Record<GameMode, string>> = { chaos: 'Chaos', cursed: 'Cursed' }

export function difficultyLabel(difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode?: GameMode | null): string {
  const fixed = mode ? FIXED_MODE_LABEL[mode] : undefined
  if (fixed) return fixed
  if (!difficulty) return '—'
  if (difficulty !== 'custom') return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
  const info = screwLevelInfo(custom?.screwLevel ?? DEFAULT_CUSTOM.screwLevel)
  return `Custom · ${info.name}`
}

// ── small local helpers ──────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }
function clampInt(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(v))) }
