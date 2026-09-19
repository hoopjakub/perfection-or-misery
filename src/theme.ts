import { StyleSheet, type TextStyle } from 'react-native'

export const colors = {
  // base
  bg:           '#0A0E1A',
  bgCard:       '#111827',
  bgElevated:   '#1C2333',
  border:       '#1F2937',
  borderLight:  '#374151',

  // text — muted must stay ≥4.5:1 on every dark surface. #6B7280 claimed to
  // and didn't (3.67:1 on bgCard, 3.25 on bgElevated). #8A92A0 measures
  // bg 6.14 · bgCard 5.66 · bgElevated 5.01 · hover 5.09.
  textPrimary:   '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted:     '#8A92A0',

  // shared accents that were hardcoded ad hoc around the app
  gold: '#FFD700',

  // accent — changes per league at runtime, this is default
  accent:        '#3B82F6',
  accentDim:     '#1D4ED8',

  // league accents
  leagueAccents: {
    premier_league: '#7C3AED',
    la_liga:        '#EA580C',
    bundesliga:     '#DC2626',
    serie_a:        '#2563EB',
    ligue_1:        '#059669',
  },

  // tiers
  tiers: {
    perfection:            '#F59E0B',
    almost_perfection:     '#FBBF24',
    champions:             '#10B981',
    title_contender:       '#3B82F6',
    champions_league:      '#0EA5E9',
    europa_glory:          '#8B5CF6',
    almost_matters:        '#6B7280',
    respectful_mediocrity: '#4B5563',
    absolute_misery:       '#EF4444',
  },

  // status — `danger` is the ONE red for "loss/eliminated/error" everywhere.
  // (Several screens used to hardcode a second red, #DC2626, for the same
  // meaning — that was never a deliberate second shade, just drift.)
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
  info:    '#3B82F6',

  // draft-pot badges (UCL seeding, 1–4) — was duplicated as a local
  // `POT_COLORS`/`potColors` object in 3+ separate screens.
  pots: { 1: '#F59E0B', 2: '#A78BFA', 3: '#34D399', 4: '#60A5FA' } as Record<number, string>,

  // modal/overlay scrim — was hardcoded 'rgba(0,0,0,0.7|0.75)' inline in every modal.
  overlay: 'rgba(0, 0, 0, 0.72)',

  // positions
  positions: {
    GK:  '#F59E0B',
    CB:  '#3B82F6',
    LB:  '#60A5FA',
    RB:  '#60A5FA',
    CDM: '#10B981',
    CM:  '#34D399',
    CAM: '#A78BFA',
    LW:  '#F87171',
    RW:  '#F87171',
    ST:  '#EF4444',
  },
}

// Per-mode palettes. WC/UCL/Chaos/Cursed each get a distinct identity instead
// of the default blue accent. Applied via useModeTheme() at high-impact
// touchpoints (headers, CTAs, hero banners, brackets, highlights).
export type ModeTheme = {
  accent:    string   // primary — CTAs, highlights, player rows
  accentDim: string   // pressed/secondary shade of accent
  secondary: string   // supporting hue (emerald, silver, amber, toxic green)
  highlight: string   // brighter pop for winners / emphasis
  bgTint:    string   // subtle mode-tinted background (used in Tier 3)
  banner:    string   // hero/banner backdrop
}

export const MODE_THEMES: Record<string, ModeTheme> = {
  world_cup: {
    accent:    '#F5C518',
    accentDim: '#B8910F',
    secondary: '#0E9F6E',
    highlight: '#FACC15',
    bgTint:    '#0A1410',
    banner:    '#0E2A1F',
  },
  champions_league: {
    accent:    '#4FA9FF',
    accentDim: '#1A237E',
    secondary: '#C7D2FE',
    highlight: '#8AB4F8',
    bgTint:    '#070B1E',
    banner:    '#0C153A',
  },
  chaos: {
    accent:    '#FF3B30',
    accentDim: '#B91C1C',
    secondary: '#F59E0B',
    highlight: '#FF7849',
    bgTint:    '#160606',
    banner:    '#2A0A06',
  },
  cursed: {
    accent:    '#A855F7',
    accentDim: '#7C2D91',
    secondary: '#84CC16',
    highlight: '#C084FC',
    bgTint:    '#0E0614',
    banner:    '#1E0A2E',
  },
  champions_league_custom: {
    accent:    '#0232FF',
    accentDim: '#010056',
    secondary: '#B2BEBE',
    highlight: '#00EEFF',
    bgTint:    '#070B1E',
    banner:    '#010056',
  } 
}
// The custom UCL path shares the classic UCL identity.


// Single source for the full official competition names (Big Fixes §5.5) —
// every screen/label that names these competitions should read from here
// instead of hardcoding "Champions League" / "World Cup" (the internal mode
// ids stay short; this is a display-string-only rename).
export const MODE_LABELS: Record<string, string> = {
  world_cup:                'FIFA World Cup',
  champions_league_custom:  'UEFA Champions League',
  champions_league:         'UEFA Champions League',
}

// Resolve the active palette: mode-specific theme, else the league accent (or
// the default blue) wrapped in a neutral ModeTheme so callers are uniform.
export function getModeTheme(mode: string | null | undefined, leagueAccent?: string | null): ModeTheme {
  if (mode && MODE_THEMES[mode]) return MODE_THEMES[mode]
  const accent = leagueAccent ?? colors.accent
  return {
    accent,
    accentDim: colors.accentDim,
    secondary: colors.success,
    highlight: accent,
    bgTint:    colors.bg,
    banner:    colors.bgElevated,
  }
}

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
}

export const radius = {
  sm:   6,
  md:   12,
  lg:   18,
  full: 9999,
}

export const typography = {
  // sizes
  xs:   11,
  sm:   13,
  md:   15,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 38,

  // weights
  regular: '400' as const,
  medium:  '500' as const,
  bold:    '700' as const,
  black:   '900' as const,
}

// Append an alpha suffix to a 6-digit hex color — e.g. withAlpha(colors.accent, 0x33)
// for ~20% opacity. Replaces the `color + '33'` / `color + '22'` pattern that
// was repeated ad hoc (15+ call sites) across draft/mode-select/result screens.
// `pct` is 0–100; converted to a 2-digit hex alpha suffix.
export function withAlpha(hex: string, pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const alpha = Math.round((clamped / 100) * 255).toString(16).padStart(2, '0')
  return `${hex}${alpha}`
}

// Match-rating 0–10 → band color. Was implemented identically in both
// SquadSummary.tsx and MatchStatsParts.tsx — single source now.
export function ratingColor(r: number): string {
  if (r >= 8) return '#9F5BFF'
  if (r >= 7) return colors.success
  if (r >= 6) return colors.warning
  return colors.danger
}

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
}
// ════════════════════════════════════════════════════════════════════════════
// KIT DROP — the redesign's system (docs/ui-overhaul/05-STYLE-GUIDE.md, DESIGN.md)
//
// Everything above this line is the old dark palette, kept only so screens
// that haven't been rebuilt yet still render. New and rebuilt screens read
// from here and never from `colors`.
//
// Three layers: PRIMITIVES (raw values with material names) → ROLES (what a
// value means, resolved per ground) → components. A screen declares which
// ground it stands on and asks for roles; it never picks a primitive itself.
// ════════════════════════════════════════════════════════════════════════════

export const prim = {
  cotton:      '#F3F3F0',  // white cotton twill, a touch cool of cream on purpose
  label:       '#E2E2DE',  // a printed care label; the sunken surface on cotton
  ruleCotton:  '#CFCFCA',
  ink:         '#0C0C0D',  // screen-print ink
  inkMuted:    '#5A5A60',
  inkFaint:    '#8A8A90',
  nylon:       '#141416',  // black nylon; the floodlight ground
  nylonRaised: '#1F1F22',
  nylonSunken: '#0B0B0C',
  ruleNylon:   '#34343A',
  cottonMuted: '#A4A4AB',
  nylonFaint:  '#6C6C73',
  orange:      '#FF5A00',  // safety orange — the zip-tie tag, always "you"
  volt:        '#D5FF3F',  // boot volt — the good end, Perfection
  draw:        '#6E6E74',
  black:       '#000000',
} as const

export type Ground = 'cotton' | 'nylon'

export type Roles = {
  ground: Ground
  bg: string
  surface: string
  sunken: string
  text: string          // body text
  textMuted: string     // secondary text
  textFaint: string     // placeholders, disabled; large text only on cotton
  rule: string          // hairlines between rows (decorative)
  line: string          // 1–2px borders that must be seen: tags, plates, fields
  offset: string        // the 2px pressed-label depth
  onFill: string        // text on orange / volt fills (always ink)
  you: string           // orange FILL
  youText: string | null     // orange as TEXT — null on cotton (2.81:1 fails)
  perfection: string    // volt FILL
  perfectionText: string | null  // volt as TEXT — null on cotton (1.04:1)
  draw: string
  stripe: [string, string]  // hazard stripe bands
  focus: string
}

// Contrast (computed): text 17.59 / 16.55 · textMuted 6.16 / 7.43 ·
// ink on orange 6.25 · ink on volt 16.95 · orange on nylon 5.88 ·
// volt on nylon 15.95 · draw 4.56 on cotton.
export const ROLES: Record<Ground, Roles> = {
  cotton: {
    ground: 'cotton',
    bg: prim.cotton, surface: prim.cotton, sunken: prim.label,
    text: prim.ink, textMuted: prim.inkMuted, textFaint: prim.inkFaint,
    rule: prim.ruleCotton, line: prim.ink, offset: prim.ink, onFill: prim.ink,
    you: prim.orange, youText: null,
    perfection: prim.volt, perfectionText: null,
    draw: prim.draw,
    stripe: [prim.ink, prim.cotton],
    focus: prim.ink,
  },
  nylon: {
    ground: 'nylon',
    bg: prim.nylon, surface: prim.nylonRaised, sunken: prim.nylonSunken,
    text: prim.cotton, textMuted: prim.cottonMuted, textFaint: prim.nylonFaint,
    rule: prim.ruleNylon, line: prim.cotton, offset: prim.black, onFill: prim.ink,
    you: prim.orange, youText: prim.orange,
    perfection: prim.volt, perfectionText: prim.volt,
    draw: prim.cottonMuted,
    stripe: [prim.cotton, prim.nylon],
    focus: prim.cotton,
  },
}

// Colourways: the woven tape that says WHERE you are. Location, never meaning.
// League runs use the replaced club's colour instead (see colourwayFor).
export const COLOURWAYS: Record<string, string[]> = {
  world_cup:               ['#3CAC3B', '#2A398D', '#E61D25'],  // set by the maintainer
  world_cup_full:          ['#3CAC3B', '#2A398D', '#E61D25'],
  champions_league:        ['#2F4BFF'],
  champions_league_custom: ['#2F4BFF'],
  chaos:                   ['#C8261B'],  // darkened from #FF3B30 so cotton text passes
  cursed:                  ['#7234F0'],  // darkened from #A855F7 for the same reason
}

export function colourwayFor(mode: string | null | undefined, clubColour?: string | null): string[] {
  if (mode && COLOURWAYS[mode]) return COLOURWAYS[mode]
  return [clubColour ?? prim.ink]
}

// Font family keys, registered once in app/_layout.tsx. Each weight/style is
// its own family and `fontWeight` is never set on kit text: Android resolves
// custom fonts by family name and silently falls back when a weight is asked for.
//
// SUPER: the plan named Archivo ExtraCondensed Black Italic, but the static
// Google Fonts builds only ship Archivo at normal width. The style guide's
// fallback rule ("an extra-condensed grotesque with a true italic") picks
// Barlow Condensed Black Italic — a real drawn italic, not a slanted roman.
export const font = {
  super:       'Kit-Super',        // Barlow Condensed 900 Italic
  superPlain:  'Kit-SuperPlain',   // Barlow Condensed 800 (upright; tags on plates)
  tag:         'Kit-Tag',          // Martian Mono 500
  tagBold:     'Kit-TagBold',      // Martian Mono 700
  body:        'Kit-Body',         // Archivo 400
  bodyMedium:  'Kit-BodyMedium',   // Archivo 500
  bodyBold:    'Kit-BodyBold',     // Archivo 700
  bodyBlack:   'Kit-BodyBlack',    // Archivo 800
} as const

// Type scale (style guide §3.2). Supers use lineHeight = size: the guide's
// tighter 72/64 clips the italic's ascenders on Android.
export const type = {
  superXl:  { fontFamily: font.super, fontSize: 72, lineHeight: 72 },
  superL:   { fontFamily: font.super, fontSize: 48, lineHeight: 48 },
  superM:   { fontFamily: font.super, fontSize: 32, lineHeight: 32 },
  superS:   { fontFamily: font.super, fontSize: 22, lineHeight: 24 },
  title:    { fontFamily: font.bodyBold, fontSize: 18, lineHeight: 24 },
  bodyL:    { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  body:     { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  figureL:  { fontFamily: font.bodyBold, fontSize: 28, lineHeight: 30, fontVariant: ['tabular-nums' as const] },
  figure:   { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums' as const] },
  tag:      { fontFamily: font.tag, fontSize: 11, lineHeight: 14, letterSpacing: 0.44, textTransform: 'uppercase' as const },
  button:   { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 18, letterSpacing: 0.3, textTransform: 'uppercase' as const },
} satisfies Record<string, TextStyle>

export type TypeToken = keyof typeof type

// Spacing and density (style guide §4).
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const
export const density = {
  t1: { row: 56 },
  t2: { row: 48 },
  t3: { row: 36, hit: 48 },
} as const

// Borders and depth (style guide §5). Radius is 0 everywhere except the short
// list in the guide (rivets, flags, the zip tag's head).
export const border = { hair: StyleSheet.hairlineWidth, thin: 1, plate: 2, tape: 4 } as const
export const OFFSET = 2
