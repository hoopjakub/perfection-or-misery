export const colors = {
  // base
  bg:           '#0A0E1A',
  bgCard:       '#111827',
  bgElevated:   '#1C2333',
  border:       '#1F2937',
  borderLight:  '#374151',

  // text — muted must stay ≥4.5:1 on bgCard (#111827); the old #4B5563 sat
  // around 3:1 and made every meta line borderline unreadable on real screens.
  textPrimary:   '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted:     '#6B7280',

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
}
// The custom UCL path shares the classic UCL identity.
MODE_THEMES.champions_league_custom = MODE_THEMES.champions_league

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
// SquadSummary.tsx and MatchDetailModal.tsx — single source now.
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