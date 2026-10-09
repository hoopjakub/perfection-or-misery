import type { APIRoute } from 'astro'
// Both languages, each pointing at its pair (09 §7).
export const GET: APIRoute = ({ site }) => {
  const u = (p: string) => new URL(p, site).toString().replace(/\/$/, '') || new URL('/', site).toString()
  // The front page and the community's two public pages (step 4); the rest
  // of the community is a signed-in player's and stays out.
  const urls = ['', 'community', 'community/questions'].flatMap(p => {
    const en = u(`/${p}`), sk = u(`/sk/${p}`)
    const pair = `<xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="sk" href="${sk}"/>`
    return [`  <url><loc>${en}</loc>${pair}</url>`, `  <url><loc>${sk}</loc>${pair}</url>`]
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
