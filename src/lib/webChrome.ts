// Web-only page chrome, shared by app/+html.tsx (first paint, static render)
// and app/_layout.tsx (re-injected at runtime, because +html is only re-read
// on a dev-server restart). It used to be two hand-kept copies.
//
// Kit Drop: flat grounds, no glows. The page behind the app column is nylon.
// The focus ring is safety orange with square corners: it's a 2px outline
// (not text), so it reads on both cotton and nylon.
export const WEB_CHROME_CSS = `
  html, body, #root { height: 100%; margin: 0; padding: 0; background-color: #141416; }
  body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  /* Flag emoji: the country-flag polyfill (app/_layout.tsx) only registers the
     @font-face; it's unicode-range scoped to flag codepoints, so it's safe first
     in the stack for everyone. Moved here from the old public/index.html. */
  html { font-family: "Twemoji Country Flags", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  * { scrollbar-width: thin; scrollbar-color: #5A5A60 transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: #5A5A60; }
  *::-webkit-scrollbar-thumb:hover { background: #8A8A90; }

  ::selection { background: #FF5A00; color: #0C0C0D; }

  :focus { outline: none; }
  :focus-visible { outline: 2px solid #FF5A00; outline-offset: 2px; }

  [role="button"], [role="link"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [tabindex="0"], a { cursor: pointer; }
  [role="button"] { transition: opacity 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 90ms ease; }
`
