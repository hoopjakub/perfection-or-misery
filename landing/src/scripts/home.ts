// The landing page's only script (docs/website/09 §4, §3.2, 08 §2): the spin,
// the live counter, this week's top five, the copy button. Everything works
// without it: the page is built with a real landed tag, the counter as of the
// build with its date, and no top five.
import { readCounters, readTopFive, renameText, liveConfigured } from '../lib/live'
import { weekStart } from '../../../src/lib/week'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

// ── The spin ────────────────────────────────────────────────────────────────
type Club = { name: string; season: string; a: string; b: string }
const reelEl = document.querySelector<HTMLElement>('[data-reel]')
const reelData = JSON.parse(document.getElementById('reel-data')?.textContent ?? '[]') as Club[]
const track = reelEl?.querySelector<HTMLElement>('.reel-track')
const edges = reelEl ? [...reelEl.querySelectorAll<HTMLElement>('.reel-edge')] : []
const flapper = reelEl?.querySelector<HTMLElement>('.flapper')
const nameOut = document.querySelector('[data-landed-name]')
const seasonOut = document.querySelector('[data-landed-season]')
const again = document.querySelector<HTMLButtonElement>('[data-spin]')

const pick = () => reelData[Math.floor(Math.random() * reelData.length)]
const tagEl = (c: Club) => {
  const el = document.createElement('div')
  el.className = 'reel-tag'
  el.style.setProperty('--a', c.a)
  el.style.setProperty('--b', c.b)
  el.innerHTML = '<span class="reel-name"></span><span class="reel-season"></span>'
  el.children[0].textContent = c.name
  el.children[1].textContent = c.season
  return el
}
const announce = (c: Club) => { if (nameOut) nameOut.textContent = c.name; if (seasonOut) seasonOut.textContent = c.season }

let spinning = false
function spin() {
  if (!reelEl || !track || !reelData.length || spinning) return
  const landing = pick()
  if (reduced) {
    // No spin: the next club-season cuts in.
    track.replaceChildren(...[pick(), pick(), pick(), landing, pick(), pick(), pick()].map(tagEl))
    track.children[3].classList.add('is-landed')
    track.style.transform = ''
    announce(landing)
    return
  }
  spinning = true
  // Twenty-four tags to pass, the landing one, and a tail so it brakes inside
  // the reel, not at its end (the app's reel does the same, P8-05).
  const items = [...Array.from({ length: 24 }, pick), landing, ...Array.from({ length: 4 }, pick)]
  track.replaceChildren(...items.map(tagEl))
  const tag = track.children[0] as HTMLElement
  const step = tag.offsetWidth + parseFloat(getComputedStyle(tag).marginLeft) * 2
  const centre = (reelEl.clientWidth - tag.offsetWidth) / 2 - parseFloat(getComputedStyle(tag).marginLeft)
  const from = centre, to = centre - 24 * step
  const dur = 1800
  const ease = (x: number) => 1 - Math.pow(1 - x, 3)   // out-cubic, as the app's
  let last = -1, t0 = 0
  const frame = (now: number) => {
    if (!t0) t0 = now
    const p = Math.min(1, (now - t0) / dur)
    const x = from + (to - from) * ease(p)
    track.style.transform = `translateX(${x}px)`
    const under = Math.max(0, Math.min(items.length - 1, Math.round((centre - x) / step)))
    if (under !== last) {
      last = under
      edges.forEach(e => (e.style.background = items[under].a))
      flapper?.animate([{ transform: 'rotate(-22deg)' }, { transform: 'rotate(0deg)' }], { duration: 160, easing: 'cubic-bezier(.2,1.6,.4,1)' })
    }
    if (p < 1) requestAnimationFrame(frame)
    else {
      spinning = false
      track.children[24].classList.add('is-landed')
      announce(landing)
    }
  }
  requestAnimationFrame(frame)
}

if (reelEl && reelData.length) {
  if (again) { again.hidden = false; again.addEventListener('click', spin) }
  reelEl.addEventListener('click', spin)
  // Spin once when the poster is on screen and the page has painted.
  if (!reduced) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); requestAnimationFrame(() => setTimeout(spin, 250)) }
    }, { threshold: 0.4 })
    io.observe(reelEl)
  }
}

// ── The counter ─────────────────────────────────────────────────────────────
const counterEl = document.querySelector<HTMLElement>('[data-counter]')
if (counterEl && liveConfigured) {
  const lang = counterEl.dataset.lang === 'sk' ? 'sk-SK' : 'en-GB'
  const flaps = counterEl.querySelector<HTMLElement>('[data-flaps]')
  const text = counterEl.querySelector<HTMLElement>('[data-counter-text]')
  const asOf = counterEl.querySelector<HTMLElement>('[data-as-of]')
  const label = counterEl.querySelector('.counter-label')?.textContent ?? ''
  let shown = (flaps?.textContent ?? '').replace(/\D/g, '')
  const draw = (n: number) => {
    const s = n.toLocaleString(lang).replace(/\s/g, ' ')
    const digits = s.replace(/\D/g, '')
    if (!flaps || digits === shown) return
    // Only the digits that changed flip (09 §3.2); separators stay.
    const old = shown.padStart(digits.length, ' ')
    let d = 0
    flaps.replaceChildren(...[...s].map(ch => {
      const span = document.createElement('span')
      if (/\d/.test(ch)) {
        span.className = 'flap' + (!reduced && old[d] !== ch ? ' is-flipping' : '')
        d++
      } else span.className = 'sep'
      span.textContent = ch
      return span
    }))
    shown = digits
    if (text) text.textContent = `${s} ${label}`
    if (asOf) asOf.hidden = true   // live now, so no "as of"
  }
  const poll = async () => {
    if (document.visibilityState !== 'visible') return
    const c = await readCounters()
    if (c) draw(c.runs)
  }
  poll()
  setInterval(poll, 30_000)
  document.addEventListener('visibilitychange', poll)
}

// ── This week's top five ────────────────────────────────────────────────────
const topSection = document.querySelector<HTMLElement>('[data-top]')
const topList = document.querySelector<HTMLElement>('[data-top-list]')
if (topSection && topList && liveConfigured) {
  const tiers = JSON.parse(document.getElementById('tier-names')?.textContent ?? '{}') as Record<string, string>
  const pts = document.querySelector<HTMLElement>('[data-points]')?.dataset.points ?? 'pts'
  readTopFive(weekStart()).then(rows => {
    // Fewer than five is fine; none, or a failed read, leaves the section out.
    if (!rows || !rows.length) return
    topList.replaceChildren(...rows.map((r, i) => {
      const li = document.createElement('li')
      li.className = 'top-row'
      const cells: [string, string][] = [
        ['top-place super', String(i + 1)],
        ['top-who', r.profiles?.username ?? '—'],
        ['top-what tag', [tiers[r.tier] ?? '', renameText(r.league_name)].filter(Boolean).join(' · ')],
        ['top-score', `${r.score.toLocaleString()} ${pts}`],
      ]
      for (const [cls, txt] of cells) { const s = document.createElement('span'); s.className = cls; s.textContent = txt; li.append(s) }
      return li
    }))
    topSection.hidden = false
  })
}
