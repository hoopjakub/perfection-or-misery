// Run link previews (Phase 6). A pasted run link is `/r/<run id>` (vercel.json
// rewrites it here). The app itself is a static export, so no pre-built page
// can know which run a link means; this small function looks the run up and
// answers with a page whose preview tags carry the run's verdict, then sends
// the visitor on to the run's page in the app.
//
// It reads through Supabase's REST API with the public anon key; `runs` and
// `profiles` are public-read under supabase/policies.sql, so nothing here
// needs a secret.
import { formatTier } from '../src/data/tiers'

const RESULT_ROUTE: Record<string, string> = {
  world_cup: '/game/wc-result',
  champions_league_custom: '/game/custom-ucl-result',
  champions_league: '/game/cl-result',
}
const MODE_NAME: Record<string, string> = {
  world_cup: 'FIFA World Cup', champions_league: 'UEFA Champions League',
  champions_league_custom: 'Champions League, the full path', all_time: 'All Time',
  chaos: 'Chaos', cursed: 'Cursed', league: 'League',
}
// app.json's android.package: Android's intent link names the app to open.
const ANDROID_PACKAGE = 'com.yolotime4564.perfectionormisery'
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

type Run = {
  id: string; mode: string; tier: string; score: number; league_name: string | null; year_start: number | null
  final_position: number | null; teams_in_league: number | null; wins: number; draws: number; losses: number
  profiles: { username: string | null } | null
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  const site = `${url.protocol}//${url.host}`
  // Run ids are UUIDs; anything else never reaches the database.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.redirect(`${site}/`, 302)

  let run: Run | null = null
  try {
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL, key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    const res = await fetch(
      `${base}/rest/v1/runs?id=eq.${id}&select=id,mode,tier,score,league_name,year_start,final_position,teams_in_league,wins,draws,losses,profiles(username)`,
      { headers: { apikey: key!, Authorization: `Bearer ${key}` } },
    )
    if (res.ok) run = ((await res.json()) as Run[])[0] ?? null
  } catch { /* fall through to the plain page */ }

  if (!run) return Response.redirect(`${site}/`, 302)

  const target = `${site}${RESULT_ROUTE[run.mode] ?? '/game/result'}?runId=${encodeURIComponent(run.id)}`
  // P8-121: on a phone the run opens in the app (app/r/[id].tsx, the app's
  // pom:// scheme). Android's intent link carries its own fallback to the web
  // page when the app isn't installed; iOS gets the scheme and, if nothing
  // answers in a moment, the web page. A computer goes straight to the web.
  const appUrl = `pom://r/${run.id}`
  const intentUrl = `intent://r/${run.id}#Intent;scheme=pom;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(target)};end`
  const who = run.profiles?.username ?? 'Someone'
  const verdict = formatTier(run.tier).toUpperCase()
  const season = run.year_start ? ` ${run.year_start}/${String(run.year_start + 1).slice(-2)}` : ''
  const where = RESULT_ROUTE[run.mode] ? MODE_NAME[run.mode] : `${run.league_name ?? 'A league'}${season}`
  const place = run.final_position && run.teams_in_league && !RESULT_ROUTE[run.mode] ? `, ${run.final_position} of ${run.teams_in_league}` : ''
  const title = `${who}: "${verdict}"`
  const description = `${where}${place} · W${run.wins} D${run.draws} L${run.losses} · ${run.score.toLocaleString('en-US')} points. Perfection or Misery.`

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)} · Perfection or Misery</title>
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="Perfection or Misery">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(`${site}/r/${run.id}`)}">
<meta property="og:image" content="${esc(`${site}/icon-512.png`)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#141416">
<link rel="canonical" href="${esc(target)}">
<noscript><meta http-equiv="refresh" content="0; url=${esc(target)}"></noscript>
<style>body{margin:0;background:#141416;color:#F3F3F0;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}a{color:#F3F3F0}</style>
<script>
(function () {
  var ua = navigator.userAgent, web = ${JSON.stringify(target)};
  if (/Android/i.test(ua)) { location.replace(${JSON.stringify(intentUrl)}); return }
  if (/iPhone|iPad|iPod/i.test(ua)) { setTimeout(function () { location.replace(web) }, 1500); location.href = ${JSON.stringify(appUrl)}; return }
  location.replace(web);
})();
</script>
</head><body><p>${esc(title)}</p><p><a href="${esc(appUrl)}">Open in the app</a> · <a href="${esc(target)}">Open on the web</a></p></body></html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A saved run never changes, so previews can be cached hard at the edge.
      'Cache-Control': 'public, max-age=300, s-maxage=86400',
    },
  })
}
