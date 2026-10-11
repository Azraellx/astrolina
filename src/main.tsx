// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider, initI18n, installTranslateGuard } from './i18n'
import { initEphemeris } from './lib/ephemeris'

// First, before anything renders: a browser translating the page must not be able to blank
// it (i18n/translateGuard.ts says why it is unconditional). Idempotent — a host build that
// installed it already loses nothing.
installTranslateGuard()

// The reader's language loads alongside the engine and is awaited just before the first
// render, so the app comes up in it rather than flashing English. It never rejects, and a
// catalog that stalls gives up to English on its own (i18n/runtime.ts), so the loading
// screen below is unchanged.
const i18nReady = initI18n()

// The index.html inline script starts the progress bar at page load (so it moves
// during the JS-bundle download too) and exposes window.__load. Here we drive the
// status text through the real load stages and nudge a floor under the bar at each
// one, then snap to 100% when the engine is ready.
interface LoadState {
  start: number
  done: boolean
  floor: number
  /** True while the engine's download is in flight. A host page's boot watchdog reads it (Pro's
   *  index.html): the engine and its tables are the boot's one long request, and on a slow link
   *  nothing else visibly lands while they stream, so without this a boot that is working looks
   *  stalled. */
  busy?: boolean
}
const w = window as unknown as { __load?: LoadState; __loadTaken?: () => void }
const load: LoadState = w.__load ?? { start: performance.now(), done: false, floor: 0 }
const bar = document.getElementById('ls-bar')
const statusEl = document.getElementById('ls-status')
const screen = document.getElementById('loading-screen')
const setStatus = (s: string) => {
  if (statusEl) statusEl.textContent = s
}

w.__loadTaken?.() // the JS bundle is in — stop the early generic status hint
setStatus('Starting the engine…')

// DEPLOY-SKEW SELF-HEAL: a page from a previous build can outlive a deploy (the
// service-worker swap purges the old precache mid-session), so a lazy chunk's
// preload of an old hashed asset 404s — or worse, the SPA fallback answers it
// with index.html and the import dies on a MIME error. Vite reports exactly
// this as `vite:preloadError`; one reload lands on the fresh build. The
// session flag stops a reload loop if the failure is something persistent
// (a genuinely broken deploy) rather than skew.
//
// Only when the app's own server answers, though (2026-09-30). With no service
// worker in this build, a chunk can't be fetched during an outage either — the
// world outline a theme change asks for while offline, say — and the reload then
// lands on the browser's own offline page in place of the app the reader was
// using. So the failure is no longer swallowed: it surfaces to the code that
// asked for the chunk, which has its own way to carry on without it (the outline
// leaves the plain background), and the reload follows only once a request no
// cache can answer has reached the server — skew, not an outage. Swallowing it
// while that is decided isn't an option: a swallowed failure resolves the
// import with nothing, which no caller is written for.
const PRELOAD_RELOAD_KEY = 'astro:preload-error-reloaded:v1'
const SERVER_PROBE_MS = 5000
let preloadProbe: Promise<boolean> | null = null
async function serverAnswers(): Promise<boolean> {
  if (navigator.onLine === false) return false
  const ac = new AbortController()
  const cut = window.setTimeout(() => ac.abort(), SERVER_PROBE_MS)
  try {
    // Any answer at all is the server; only a request that never gets one is an outage.
    await fetch(import.meta.env.BASE_URL, { method: 'HEAD', cache: 'no-store', signal: ac.signal })
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(cut)
  }
}
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY) === '1') return // second failure — let it surface
  } catch {
    return // no storage, no loop guard: surfacing the error beats a possible reload loop
  }
  // One chunk's failure usually arrives as several events (each preload, then the import): one probe.
  if (preloadProbe) return
  preloadProbe = serverAnswers()
  void preloadProbe.then((up) => {
    preloadProbe = null
    if (!up) return // an outage: the app carries on as it is
    try {
      sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
    } catch {
      return
    }
    window.location.reload()
  })
})

// If the engine (WASM) download runs long, reassure that it's a one-time fetch.
let reachedData = false
const slowTimer = window.setTimeout(() => {
  if (!reachedData) setStatus('Downloading the engine (one-time)…')
}, 6000)

load.busy = true
try {
  // Two stages now: the asteroid tables no longer load at startup — they fetch on
  // demand the first time an asteroid body is enabled (see ensureAsteroidEphemeris).
  await initEphemeris((stage) => {
    reachedData = true
    if (stage === 'planets') {
      setStatus('Loading planetary positions…')
      load.floor = Math.max(load.floor, 55)
    } else if (stage === 'moon') {
      setStatus('Loading lunar tables…')
      load.floor = Math.max(load.floor, 80)
    }
  })
} catch (err) {
  window.clearTimeout(slowTimer)
  load.busy = false
  load.done = true
  if (bar) {
    bar.style.width = '100%'
    bar.style.background = '#e85a4f'
  }
  setStatus('Could not load the astronomical engine. Please reload.')
  throw err
}

// Almost always settled already: a catalog chunk is far smaller than the engine.
await i18nReady

window.clearTimeout(slowTimer)
load.busy = false
load.done = true
if (bar) bar.style.width = '100%'
// Let the bar visibly reach 100%, then fade the screen out before mounting.
if (screen) screen.style.opacity = '0'
await new Promise((resolve) => setTimeout(resolve, 240))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)

// The fake page translator (i18n/fakeTranslate.ts), a development test tool: behind the DEV
// constant so a production build drops the chunk entirely.
if (import.meta.env.DEV && location.search.includes('fake-translate')) {
  void import('./i18n/fakeTranslate').then((m) => m.maybeStartFakeTranslate())
}
