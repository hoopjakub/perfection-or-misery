import { defineConfig } from 'astro/config'

// The landing page (docs/website/09-LANDING-SHAPE.md). Static: every page is
// HTML at build time; the only scripts are the spin and the live numbers.
//
// Astro 5, not 7: Astro 7 needs Node 22.12+, and the maintainer's machine runs
// Node 20.17 (07-FACT-CHECK F9). Vercel builds on Node 24 either way; moving to
// Astro 7 is this one version once the machine has Node 24.
export default defineConfig({
  // The site's own address (06 §1): canonical links, hreflang, the sitemap,
  // robots.txt and the preview card are all built from it. PUBLIC_SITE_URL
  // when set (a custom domain); otherwise Vercel's own production address
  // (a system variable, VERCEL_PROJECT_PRODUCTION_URL). The audit found every
  // canonical pointing at perfectionormisery.vercel.app, an address that
  // doesn't exist (10 Oct 2026): a guessed default is worse than none.
  site: process.env.PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://perfection-or-misery-website.vercel.app'),
  trailingSlash: 'never',
  build: {
    format: 'directory',
    // Every stylesheet as a file, never inline: the content security policy
    // (vercel.json) then needs no 'unsafe-inline' for <style> blocks.
    inlineStylesheets: 'never',
  },
  compressHTML: true,
  // The game's modules the site uses are copied into src/lib/game by
  // scripts/build-landing-data.cjs: the site never imports from outside
  // landing/ (its Vercel build has only landing/'s dependencies).
  // assetsInlineLimit 0: Vite inlines small scripts into the HTML, and an
  // inline script is exactly what the CSP's script-src 'self' blocks. It also
  // put the rename table's real names into the page (check-dist caught both).
  vite: { build: { assetsInlineLimit: 0 } },
})
