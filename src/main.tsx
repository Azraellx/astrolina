// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import { initEphemeris } from './lib/ephemeris'

// The index.html inline script starts the progress bar at page load (so it moves
// during the JS-bundle download too) and exposes window.__load. Here we drive the
// status text through the real load stages and nudge a floor under the bar at each
// one, then snap to 100% when the engine is ready.
interface LoadState {
  start: number
  done: boolean
  floor: number
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

// If the engine (WASM) download runs long, reassure that it's a one-time fetch.
let reachedData = false
const slowTimer = window.setTimeout(() => {
  if (!reachedData) setStatus('Downloading the engine (one-time)…')
}, 6000)

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
  load.done = true
  if (bar) {
    bar.style.width = '100%'
    bar.style.background = '#e85a4f'
  }
  setStatus('Could not load the astronomical engine. Please reload.')
  throw err
}

window.clearTimeout(slowTimer)
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
