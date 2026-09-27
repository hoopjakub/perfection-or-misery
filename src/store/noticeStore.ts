import { create } from 'zustand'
import { unreadCount } from '@/lib/friends'
import { useUserStore } from './userStore'

// P8-90: how many notifications (friend requests, accepted requests) you
// haven't seen, for the badge on the You tab. Refreshed when the app comes
// back to the front, when the tabs mount, and after anything that changes it.
type NoticeStore = { unread: number; refresh: () => Promise<void>; clear: () => void }

export const useNoticeStore = create<NoticeStore>(set => ({
  unread: 0,
  refresh: async () => {
    const { user, isGuest } = useUserStore.getState()
    if (!user || isGuest) { set({ unread: 0 }); return }
    try { set({ unread: await unreadCount() }) }
    catch (e) { console.warn('[notices] count failed:', e) }   // the table may not allow it yet; no badge then
  },
  clear: () => set({ unread: 0 }),
}))
