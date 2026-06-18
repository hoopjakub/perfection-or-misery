// Logo registry for club badges and national team crests.
//
// How to add a logo:
//  1. Drop the image into assets/logos/ (e.g. assets/logos/arsenal.png)
//  2. Add an entry here: arsenal: require('../../assets/logos/arsenal.png')
//
// NOTE: use a RELATIVE path, not the "@/" alias. Metro doesn't resolve the
// alias for static assets, and "@/" points at src/ — but assets/ lives at the
// project root, two levels up from this file (src/lib/).
//
// The key must match the club's id in the seed JSON (e.g. "arsenal", "brazil_nt").
// If no entry exists for a key the UI silently hides the logo slot.

export const LOGO_MAP: Record<string, number> = {
  // Add entries as you download images:
  // arsenal:       require('../../assets/logos/arsenal.png'),
  // chelsea:       require('../../assets/logos/chelsea.png'),
  brazil_nt:     require('../../assets/logos/brazil_nt.png'),
  // real_madrid:   require('../../assets/logos/real_madrid.png'),
}

export function getLogo(key: string | null | undefined): number | null {
  if (!key) return null
  return LOGO_MAP[key] ?? null
}
