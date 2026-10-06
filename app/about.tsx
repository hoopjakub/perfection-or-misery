import { t } from '@/i18n'
import { enableDebugLog } from '@/diag/log'
import React, { useRef, useState } from 'react'
import { KitScreen, KitText, SectionTag, BackControl, RoundFlag, ListRow } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { View, Text, StyleSheet, Pressable, Linking, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { router } from 'expo-router'
import { VersionButton } from '@/components/VersionButton'
import { SpinningGlobe } from '@/components/GlobeReveal'
import { ROLES, space, border, font } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// About on the kit (P8-65: it and the guide were the last full screens still on
// the old dark cards). Reading happens on cotton, like the You tab it opens from.
const roles = ROLES[EVERYDAY]



// P8.5-34: the globe and the scroll share the UI thread, and the maintainer's
// phone lagged scrolling this page. The globe holds still while the page
// moves, and stays still once it's scrolled out of sight (its bottom edge is
// about 260 points down the page). Drag and momentum both count: a fling
// keeps scrolling after the finger lifts. The web scrolls by wheel without
// these events, so the globe there simply keeps turning.
const GLOBE_GONE_AT = 260
function useGlobePause() {
  const [scrolling, setScrolling] = useState(false)
  const [gone, setGone] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ended = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setGone(e.nativeEvent.contentOffset.y > GLOBE_GONE_AT)
    setScrolling(false)
  }
  const scrollProps = {
    onScrollBeginDrag: () => { if (settle.current) clearTimeout(settle.current); setScrolling(true) },
    // A momentum phase may follow the drag; give it a moment to start.
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const ev = { nativeEvent: { contentOffset: { y: e.nativeEvent.contentOffset.y } } } as NativeSyntheticEvent<NativeScrollEvent>
      settle.current = setTimeout(() => ended(ev), 120)
    },
    onMomentumScrollBegin: () => { if (settle.current) clearTimeout(settle.current); setScrolling(true) },
    onMomentumScrollEnd: ended,
  }
  return { paused: scrolling || gone, scrollProps }
}


export default function AboutScreen() {
  const [taps, setTaps] = useState(0)
  const globe = useGlobePause()

  // P8-73: the secret door is "Made in Slovakia"; the version is a real
  // button (it opens the version history), so it can't be the secret door too.
  // Phase 9: the eighth tap opens Diagnostics, in every build (it only reads),
  // and switches on the debug lines for the session. The Quick Sim Tester
  // lives under it now (app/diagnostics/tools.tsx), in developer builds only.
  function tapMadeIn() {
    const n = taps + 1
    setTaps(n)
    if (n === 8) {
      enableDebugLog()
      router.push('/diagnostics')
    }
  }


  return (
    <KitScreen ground={EVERYDAY} {...globe.scrollProps}>
      <PageMeta title={t('about.pageTitle')} path="/about" />
      <BackControl roles={roles} title={t('about.heading')} />

      {/* The globe is always spinning, Slovakia always lit up. */}
      <View style={styles.hero}>
        <SpinningGlobe accent={roles.text} size={180} paused={globe.paused} />
        {/* Eight taps here open Diagnostics (and its tester, in dev builds). */}
        <Pressable onPress={tapMadeIn} style={styles.madeIn} accessibilityRole="text">
          <KitText t="title" color={roles.text}>{t('about.madeIn')}</KitText>
          {/* P8-58: the real flag, not the emoji. */}
          <RoundFlag emoji="🇸🇰" code="SVK" size={24} roles={roles} />
        </Pressable>
        <KitText t="tag" color={roles.textMuted} style={styles.centre}>{t('about.tagline')}</KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>{t('about.whoTitle')}</SectionTag>
        <KitText t="bodyL" color={roles.text}>{t('about.who')}</KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>{t('about.whyTitle')}</SectionTag>
        <KitText t="bodyL" color={roles.text}>
          {t('about.whyA')}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL('https://38-0.app/')}>38-0.app ↗</Text>
          {t('about.whyB')}
        </KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>{t('about.hoodTitle')}</SectionTag>
        <KitText t="bodyL" color={roles.text}>{t('about.hood')}</KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>{t('about.builtTitle')}</SectionTag>
        <KitText t="bodyL" color={roles.text}>{t('about.built')}</KitText>
      </View>

      {/* P8.5-32: the attribution the data's licences ask for (Wikipedia's text is
          CC BY-SA 4.0; Wikidata is CC0 and asks nothing, but it's credited too). */}
      <View style={styles.section}>
        <SectionTag roles={roles}>{t('about.dataTitle')}</SectionTag>
        <KitText t="bodyL" color={roles.text}>
          {t('about.dataA')}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL('https://en.wikipedia.org/')}>Wikipedia ↗</Text>
          {t('about.dataB')}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL('https://www.wikidata.org/')}>Wikidata ↗</Text>
          {t('about.dataC')}
        </KitText>
      </View>

      <View style={styles.section}>
        <SectionTag roles={roles}>{t('about.versionTitle')}</SectionTag>
        <VersionButton roles={roles} />
        {/* Phase 9: always there. A read-only screen protects nothing by hiding. */}
        <ListRow roles={roles} icon="stats" label={t('diag.open')} sub={t('diag.openSub')} onPress={() => router.push('/diagnostics')} />
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  // A 44pt target: it's tapped eight times in a row.
  madeIn: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  title: { marginTop: space[2], marginBottom: space[3] },
  hero: { alignItems: 'center', paddingVertical: space[4], gap: space[2] },
  centre: { textAlign: 'center' },
  section: { gap: space[2], paddingVertical: space[4], borderTopWidth: border.hair, borderTopColor: roles.rule },
  link: { fontFamily: font.bodyBold, color: roles.text, textDecorationLine: 'underline' },
})
