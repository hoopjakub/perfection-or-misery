// P8.5-25 · Dark mode and light mode (decided 1 Oct 2026: "all screens follow
// them").
//
// Two grounds, as before (DESIGN.md): cotton (light) and nylon (dark). What
// changed is who picks. A screen no longer names cotton for "everyday"; it asks
// for EVERYDAY, which is cotton in light mode and nylon in dark mode. FLOODLIT,
// nylon in both, is left for what is drawn as a place rather than a page: the
// live match's pitch, the trophy ceremony's stage, and the match sheet until
// it's rebuilt on the Kit. (First cut, same morning: the simulation, the
// reveal, the results and Awards Night stayed floodlit too, and the pundits'
// season-start frame until the next playtest. The maintainer had them follow.)
//
// WHY a value read once at start-up rather than a hook: 57 files fix their
// ground at module level (`const roles = ROLES.cotton`) and feed it to static
// StyleSheets, which a hook can't reach. A value decided before the first
// screen draws reaches all of them with a one-line change each. So a change of
// setting takes a reload: the web reloads the page, and since P8.5-31 the
// phone reloads its JavaScript too (reloadForAppearance), so it's instant
// there as well; a build from before expo-updates waits for the next launch.
import { createContext, useContext } from 'react'
import { Appearance, Platform } from 'react-native'
import { ROLES, type Ground, type Roles } from '@/theme'
import { useSettingsStore, type AppearanceChoice } from '@/store/settingsStore'

function resolve(choice: AppearanceChoice): Ground {
  if (choice === 'dark') return 'nylon'
  if (choice === 'light') return 'cotton'
  return Appearance.getColorScheme() === 'dark' ? 'nylon' : 'cotton'
}

/** The ground of every everyday screen: cotton in light mode, nylon in dark. */
export const EVERYDAY: Ground = resolve(useSettingsStore.getState().appearance)

/** The floodlit places' ground (the pitch, the ceremony): nylon whatever the mode. */
export const FLOODLIT: Ground = 'nylon'

/** True when a new choice would change the ground this launch is drawn in. */
export function appearanceChangesGround(next: AppearanceChoice): boolean {
  return resolve(next) !== EVERYDAY
}

/** A new appearance applies at once: the web reloads the page, the phone
 *  reloads its JavaScript (P8.5-31 brought expo-updates, whose reloadAsync
 *  does it; in a development build React Native's own reload). A build made
 *  before expo-updates was added (1 Oct 2026) has no native module, so the
 *  require is guarded and the change waits for the next launch, as it did.
 *  Returns whether it reloaded. */
export function reloadForAppearance(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined') { window.location.reload(); return true }
  try {
    if (__DEV__) { require('react-native').DevSettings.reload(); return true }
    require('expo-updates').reloadAsync().catch(() => {})
    return true
  } catch { return false }
}

// The ground of the screen a component sits in. KitScreen provides it, so a
// shared component (a bracket, the medical table) is dark inside a floodlit
// result and follows the setting on the run page. Before P8.5-25 those fixed
// nylon at module level and drew as a black box on every cotton page (N-12).
export const GroundContext = createContext<Ground>(EVERYDAY)
export const useScreenGround = (): Ground => useContext(GroundContext)
export const useScreenRoles = (): Roles => ROLES[useContext(GroundContext)]
