import React from 'react'
import { LegalPage } from '@/components/LegalPage'

// The words are in src/data/legal.ts (P8.5-29: one file, the app's and the website's).
export default function PrivacyScreen() {
  return <LegalPage page="privacy" path="/privacy" />
}
