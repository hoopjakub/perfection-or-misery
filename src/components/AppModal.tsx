import React, { useEffect, useRef } from 'react'
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
//
// Big Fixes §5.6 (PC-only "can't click any modal" bug): a result screen can
// have several of these mounted as siblings (team/tie/group modal + the
// shared match-stats modal), and a couple of call sites opened the match-stats
// modal from a tap *inside* an already-open one without closing the parent —
// leaving two full-screen fixed overlays live at once. Every prior overlay
// used the SAME hardcoded zIndex, so which one painted (and could be clicked)
// on top depended on JSX declaration order, not open order — the wrong one
// could end up on top, or end up permanently covering the page once the
// visible one was closed. Fixed at the leak (each call site now closes its
// parent modal before opening the nested one), but this is the belt-and-braces
// fix: every mounted instance claims its own incrementing zIndex, so whichever
// modal opened MOST RECENTLY is always the one on top and clickable.
let zIndexCounter = 1000

// §10.5 — the long-running "scrolling is glitchy" complaint traced back here.
// A web modal is a fixed overlay painted OVER a page that is itself scrollable,
// and the document behind it never stopped scrolling: a wheel or drag that
// started on the modal, or simply continued past the end of its inner list,
// went to the page underneath instead. It reads as the modal fighting you.
// (The match-stats screen stopped exhibiting it the moment §10 turned it from
// a modal into a real route — which is what pinned the cause down.)
//
// So: while ANY modal is open, the document behind is frozen. Reference-counted
// because modals legitimately stack, and only the last one out restores scroll.
let openModals = 0
function lockBodyScroll(lock: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  openModals = Math.max(0, openModals + (lock ? 1 : -1))
  const frozen = openModals > 0
  document.body.style.overflow = frozen ? 'hidden' : ''
  document.documentElement.style.overflow = frozen ? 'hidden' : ''
}

export function AppModal({ visible, onRequestClose, children }: {
  visible: boolean
  onRequestClose?: () => void
  children: React.ReactNode
}) {
  const zIndexRef = useRef<number | null>(null)
  if (visible && zIndexRef.current === null) zIndexRef.current = ++zIndexCounter
  if (!visible) zIndexRef.current = null

  useEffect(() => {
    if (!visible) return
    lockBodyScroll(true)
    return () => lockBodyScroll(false)
  }, [visible])

  if (Platform.OS === 'web') {
    if (!visible) return null
    return <View style={[styles.webOverlay, { zIndex: zIndexRef.current! }]}>{children}</View>
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
  },
})
