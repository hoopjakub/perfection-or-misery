import React from 'react'
import { Modal, View, Platform, StyleSheet } from 'react-native'

// react-native-web's <Modal> polyfill has a real web-only glitch: the portal
// content briefly renders at the wrong size/position before snapping into
// place a beat later. The hand-rolled overlay pattern used for the draft
// screen's slot-picker (a plain absolutely-positioned View, no <Modal>) never
// has this problem. So on web we skip RN's Modal primitive entirely and use
// the same plain-View approach; native keeps the real Modal, which is proven
// fine there. Every call site already renders its own full-bleed backdrop
// Pressable as the Modal's only child, so this is a drop-in swap — same
// props, same children, no per-call-site changes needed.
export function AppModal({ visible, onRequestClose, children }: {
  visible: boolean
  onRequestClose?: () => void
  children: React.ReactNode
}) {
  if (Platform.OS === 'web') {
    if (!visible) return null
    return <View style={styles.webOverlay}>{children}</View>
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  )
}

const styles = StyleSheet.create({
  webOverlay: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000,
  },
})
