import { useReducedMotion as useSystemReducedMotion } from 'react-native-reanimated'
import { useSettingsStore } from '@/store/settingsStore'

// P8-45: less motion is the phone's setting OR the app's own switch in
// Settings. Screens that choose between a moving and a still version read this
// instead of Reanimated's hook, which only knows the phone. (The animations
// themselves — springs, entering and layout transitions — follow the same
// switch through the ReducedMotionConfig at the root, app/_layout.tsx.)
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion()
  const app = useSettingsStore(s => s.reduceMotion)
  return system || app
}
