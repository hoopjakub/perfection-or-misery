import { create } from 'zustand'

// Phase 10 (step 1a, the maintainer, 9 Oct 2026): the opening logo is the
// app's loading zone. It plays once in full, then loops until start-up is
// done, then clears. "Done" is the bundled database open (native): the slow
// part of a cold start, and what the first run needs. Not the guest session:
// Home doesn't need it, and on a dead network the sign-in can hang for a long
// time (P9.75-23), which would hold the logo up for nothing.
export const useBootReady = create<{ ready: boolean }>(() => ({ ready: false }))
export const markBootReady = () => { if (!useBootReady.getState().ready) useBootReady.setState({ ready: true }) }
