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

  /* The Kit scrollbar (P8-29): a hairline track and a square, solid thumb,
     cotton on nylon and ink on cotton. KitScreen writes the focused screen's
     ground to <html data-ground>, so every scroller on it follows.
     Chrome 121+ drops all ::-webkit-scrollbar styling the moment the standard
     scrollbar-color is set anywhere (that's why this used to show Chrome's own
     rounded bar), so the standard properties are only a fallback for browsers
     without the webkit pseudo-elements (Firefox), which can't draw it square. */
  :root { --kit-thumb: #F3F3F0; --kit-track: #34343A; }
  :root[data-ground="cotton"] { --kit-thumb: #0C0C0D; --kit-track: #CFCFCA; }
  *::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  *::-webkit-scrollbar-button { display: none; }
  *::-webkit-scrollbar-corner { background: transparent; }
  *::-webkit-scrollbar-track:vertical { background: linear-gradient(to right, transparent 2.5px, var(--kit-track) 2.5px, var(--kit-track) 3.5px, transparent 3.5px); }
  *::-webkit-scrollbar-track:horizontal { background: linear-gradient(to bottom, transparent 2.5px, var(--kit-track) 2.5px, var(--kit-track) 3.5px, transparent 3.5px); }
  *::-webkit-scrollbar-thumb { background: var(--kit-thumb); border-radius: 0; }
  @supports not selector(::-webkit-scrollbar) {
    * { scrollbar-width: thin; scrollbar-color: var(--kit-thumb) transparent; }
  }

  ::selection { background: #FF5A00; color: #0C0C0D; }

  :focus { outline: none; }
  :focus-visible { outline: 2px solid #FF5A00; outline-offset: 2px; }

  [role="button"], [role="link"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [tabindex="0"], a { cursor: pointer; }
  [role="button"] { transition: opacity 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 90ms ease; }
`
