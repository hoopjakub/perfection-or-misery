// The public pages only; the admin route is in neither this nor the sitemap,
// and not named here either (03 §4: listing it would tell the world it exists).
import type { APIRoute } from 'astro'
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site)}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
