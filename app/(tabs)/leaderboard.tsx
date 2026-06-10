import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function LeaderboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.sub}>Coming once you have runs to show.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
    paddingTop:      64,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize:     typography.xxl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sub: {
    fontSize: typography.sm,
    color:    colors.textMuted,
  },
})