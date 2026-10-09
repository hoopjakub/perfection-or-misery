import type { APIRoute } from 'astro'
// Both languages, each pointing at its pair (09 §7).
export const GET: APIRoute = ({ site }) => {
  const u = (p: string) => new URL(p, site).toString().replace(/\/$/, '') || new URL('/', site).toString()
  const pair = `<xhtml:link rel="alternate" hreflang="en" href="${u('/')}"/><xhtml:link rel="alternate" hreflang="sk" href="${u('/sk')}"/>`
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${u('/')}</loc>${pair}</url>
  <url><loc>${u('/sk')}</loc>${pair}</url>
</urlset>
`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
