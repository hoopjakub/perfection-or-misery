import { router } from 'expo-router'

// ConfirmScreen handoff (docs/ui-overhaul/08-COMPONENTS.md §2.14). Decisions
// that must interrupt are a full-screen ROUTE, not a modal: back works (it
// means "stay"), it can't stack, and it can't clip its own buttons. The
// callback isn't serialisable, so the request rides in module scope — the
// same pattern as src/lib/deepMatch.ts.

export type ConfirmRequest = {
  /** The question, shown in the super: "Sign out?" */
  question: string
  /** What's lost, in plain words with numbers: "There's no password recovery." */
  consequence: string
  /** Verb label for the destructive choice: "Sign out" */
  confirmLabel: string
  /** Verb label for staying: "Stay signed in" */
  stayLabel: string
  /** Runs before the screen closes. Throwing keeps the screen open. */
  onConfirm: () => Promise<void> | void
  /** Where to go once confirmed; defaults to back. */
  thenRoute?: string
}

let pending: ConfirmRequest | null = null

export function openConfirm(request: ConfirmRequest) {
  pending = request
  router.push('/confirm')
}

export function takeConfirmRequest(): ConfirmRequest | null {
  return pending
}
