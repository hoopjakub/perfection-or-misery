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
  { level: 1,  name: 'Baby Mode',       tagline: 'Trophies made of foam. You literally cannot lose.' },
  { level: 2,  name: 'Easy',            tagline: 'Training wheels bolted on. Minimal shame.' },
  { level: 3,  name: 'Casual',          tagline: "You're 'not really trying.' Sure you aren't." },
  { level: 4,  name: 'Medium',          tagline: "The honest gamer's choice. Allegedly." },
  { level: 5,  name: 'Sweaty',          tagline: 'Palms are sweaty, knees weak, arms heavy.' },
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
}

export function resolveDifficulty(
  difficulty: Difficulty | null,
  custom: CustomDifficulty | null | undefined,
): ResolvedDifficulty {
  const knobs = difficulty === 'custom'
    ? { level: custom?.screwLevel ?? DEFAULT_CUSTOM.screwLevel,
        rerolls: custom?.rerolls ?? DEFAULT_CUSTOM.rerolls,
        ratingsShown: custom?.ratingsShown ?? DEFAULT_CUSTOM.ratingsShown }
    // No difficulty set (chaos/cursed, or legacy) resolves to medium's knobs so
    // the tilt is sane; those modes handle rerolls/ratings/score their own way.
    : { level: PRESET_LEVEL[difficulty ?? 'medium'],
        rerolls: PRESET_REROLLS[difficulty ?? 'medium'],
        ratingsShown: PRESET_RATINGS_SHOWN[difficulty ?? 'medium'] }

  const hardness = hardnessOf(knobs.level, knobs.rerolls, !knobs.ratingsShown)
  return {
    screwLevel: knobs.level,
    rerolls: knobs.rerolls,
    ratingsShown: knobs.ratingsShown,
    tilt: tiltForLevel(knobs.level),
    hardness,
    scoreMultiplier: scoreMultiplierFor(hardness),
  }
}

// ── Hardness: one 0–11 number that captures how brutal a run's SETTINGS were ──
// Used both for the score multiplier and the achievements "how hard was it" rating.
// Endpoints (by design): Baby + 10 rerolls + ratings shown = 0.0 (easiest possible),
// Absolute Misery + 0 rerolls + ratings hidden = 11.0 (the 11/10 run). Level is the
// dominant axis (0–9); hidden ratings and zero rerolls each add up to a full point.
export function hardnessOf(screwLevel: number, rerolls: number, ratingsHidden: boolean): number {
  const level = clampInt(screwLevel, 1, 10)
  const rr    = clampInt(rerolls, 0, 10)
  const h = (level - 1) + (ratingsHidden ? 1 : 0) + (10 - rr) / 10
  return Math.round(h * 10) / 10
}

// Harder settings are worth more points. Anchored so a "medium" run (hardness
// ~3.9) is neutral (1.0×); easier runs are penalised, harder ones rewarded. The
// reroll slider therefore has real bite: going from 0 → 10 rerolls drops hardness
// by a full point ≈ a 12% score cut, so extra rerolls are a genuine trade.
export function scoreMultiplierFor(hardness: number): number {
  const MEDIUM_HARDNESS = 3.9
  return clamp(1 + (hardness - MEDIUM_HARDNESS) * 0.12, 0.45, 1.9)
}

// ── Reroll allowance + hidden ratings (replaces engine/draft.ts helpers) ─────
// Chaos/Cursed override: they always play blind with no rerolls, whatever the
// difficulty knob says (they're a separate flavour of pain).
export function rerollLimitFor(difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode: GameMode | null): number {
  if (mode === 'chaos' || mode === 'cursed') return 0
  return resolveDifficulty(difficulty, custom).rerolls
}

export function ratingsHiddenFor(difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode: GameMode | null): boolean {
  if (mode === 'chaos' || mode === 'cursed') return true
  return !resolveDifficulty(difficulty, custom).ratingsShown
}

// Short label for the run summary / achievements ("Easy", "Custom · Nightmare 7/10").
export function difficultyLabel(difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined): string {
  if (!difficulty) return '—'
  if (difficulty !== 'custom') return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
  const info = screwLevelInfo(custom?.screwLevel ?? DEFAULT_CUSTOM.screwLevel)
  return `Custom · ${info.name}`
}

// ── small local helpers ──────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }
function clampInt(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(v))) }
