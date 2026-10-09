// Building the page's live parts by hand: everything a player or the database
// wrote goes in as text (append of a string is a text node), never as HTML.
export type Kid = Node | string | null | undefined | false
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string | boolean | undefined> = {}, ...kids: Kid[]) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue
    if (k === 'class') el.className = String(v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const k of kids) if (k) el.append(k)
  return el
}
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
