import React from 'react'
import { View, StyleProp, TextStyle, ViewStyle } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { getFlag } from '@/lib/flagMap'
import { Crest, ROLES } from '@/components/kit'

/**
 * Renders a team's crest + name.
 *
 * A national side shows its flag. A club shows its crest, which `Crest` reads
 * through the one brand lookup (P8-12): a real badge only in `real` brand mode
 * and only when one is bundled, otherwise our own drawn mark. Because an
 * <Image> can't live inside a <Text>, this is a small flex row — pass the text
 * style you'd have used on the old inline label.
 */
export function TeamLabel({
  clubId,
  name,
  textStyle,
  containerStyle,
  size = 14,
  gap = 5,
  numberOfLines = 1,
}: {
  clubId: string | null | undefined
  name: string
  textStyle?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
  size?: number
  gap?: number
  numberOfLines?: number
}) {
  const flag = getFlag(clubId)

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, containerStyle]}>
      {flag ? (
        <Text style={textStyle}>{flag}</Text>
      ) : (
        // These labels live on the dark screens; the crest reads in cotton there.
        <Crest roles={ROLES.nylon} clubId={clubId} name={name} size={size + 4} />
      )}
      <Text style={[textStyle, { flexShrink: 1 }]} numberOfLines={numberOfLines}>
        {name}
      </Text>
    </View>
  )
}
