import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

// The haptics map (docs/ui-overhaul/06-MOTION.md §7). A run should produce a
// handful of these, not dozens. Web has no haptics, and a device without a
// motor rejects the call; neither is worth surfacing.
export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning') {
  if (Platform.OS === 'web') return
  const p = kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : kind === 'warning' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    : Haptics.impactAsync(
        kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy
        : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light)
  p.catch(() => {})
}
