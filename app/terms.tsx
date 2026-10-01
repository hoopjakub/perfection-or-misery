import React from 'react'
import { LegalPage } from '@/components/LegalPage'

// The words are in src/data/legal.ts (P8.5-29: one file, the app's and the website's).
export default function TermsScreen() {
  return <LegalPage page="terms" path="/terms" />
}
