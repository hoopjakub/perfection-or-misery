// The LEGAL flavour's logo map (P8.5-30, docs/release/01-NAMES-MARKS-AND-THE-LAW.md
// §5.2): no club crest and no competition logo. metro.config.js resolves
// brand.ts's `./logoMap` to this file whenever EXPO_PUBLIC_BRAND_MODE isn't
// `real`, so the crest images are never `require`d and never enter the APK or
// the web bundle. Hiding them wasn't enough: the brand switch (P8-12) decided
// what was SHOWN, while logoMap.ts's 900 requires still shipped every crest.
// Same exports as logoMap.ts, so nothing else changes.

export const LOGO_MAP: Record<string, number> = {}
export const COMPETITION_MAP: Record<string, number> = {}

export function getLogo(_key: string | null | undefined): number | null {
  return null
}

export function getCompetitionLogo(_key: string | null | undefined): number | null {
  return null
}
