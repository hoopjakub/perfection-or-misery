// /download in the browser: read the release record again, so a release
// published after the site was built shows at once (docs/website/11 §3). If
// the read fails, the page as built stays, with its date.
import { readRelease, megabytes } from '../lib/release'

const root = document.querySelector<HTMLElement>('[data-download]')
const S = JSON.parse(document.getElementById('download-strings')?.textContent ?? '{}') as { version: string }
const q = <T extends HTMLElement>(sel: string) => root?.querySelector<T>(sel) ?? null

if (root) {
  const r = await readRelease()
  if (r !== 'unreachable' && String(r?.build ?? '') !== root.dataset.build) {
    const lang = root.dataset.lang === 'sk' ? 'sk-SK' : 'en-GB'
    q('[data-has-release]')!.hidden = !r
    q('[data-no-release]')!.hidden = !!r
    if (r) {
      const day = r.released ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(r.released)) : ''
      q('[data-meta]')!.textContent = [`${S.version} ${r.version}`, r.size ? megabytes(r.size) : '', day].filter(Boolean).join(' · ')
      q<HTMLAnchorElement>('[data-apk]')!.href = r.url
      q('[data-sha]')!.textContent = r.sha256
      q('[data-copy]')!.dataset.copy = r.sha256
      q('[data-notes]')!.textContent = r.notes ?? ''
      q('[data-notes-block]')!.hidden = !r.notes
    }
    root.dataset.build = String(r?.build ?? '')
  }
  if (r !== 'unreachable') q('[data-stale]')?.remove()
}
