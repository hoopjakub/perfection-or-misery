import React from 'react'
import { View, Text, Image, StyleProp, TextStyle, ViewStyle } from 'react-native'
import { getFlag } from '@/lib/flagMap'
import { getLogo } from '@/lib/logoMap'

/**
 * Renders a team's crest + name.
 *
 * Prefers a real logo PNG (from logoMap) when one exists for the club id;
 * otherwise falls back to the flag emoji (from flagMap); otherwise just
 * the name. Because an <Image> can't live inside a <Text>, this is a small
 * flex row — pass the text style you'd have used on the old inline label.
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
  const logo = getLogo(clubId)
  const flag = getFlag(clubId)

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, containerStyle]}>
      {logo != null ? (
        <Image source={logo} resizeMode="contain" style={{ width: size, height: size }} />
      ) : flag ? (
        <Text style={textStyle}>{flag}</Text>
      ) : null}
      <Text style={[textStyle, { flexShrink: 1 }]} numberOfLines={numberOfLines}>
        {name}
      </Text>
    </View>
  )
}
