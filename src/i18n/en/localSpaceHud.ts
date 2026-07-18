// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Local Space" window (View ▸ Local Space): directional lines radiating
// from an origin point, each pointing to a planet's compass bearing in the local sky.
// The window being open IS the on switch — opening it draws the lines, closing hides
// them — so there's no separate show/hide toggle inside.
export const localSpaceHud = {
  title: 'Local Space',
  closeAria: 'Close Local Space',
  closeHint: 'Turn off the local-space view.',
  lsOrigin: {
    pin: 'From the pin',
    pinHint:
      'Relocated local space: the lines radiate from the active pin (the birthplace when nothing is pinned).',
    birthplace: 'Birthplace',
    birthplaceHint:
      'The lines stay anchored to the birthplace even while a pin is down.',
  },
  // The eye toggles are named for the THING they show (noun + eye, like the Capture
  // window's caption fields): eye open = drawn, eye closed = hidden. The key names
  // keep their storage polarity ("hide…") — renaming them would orphan saved prefs.
  hideInbound: {
    title: 'Inbound lines',
    hint: 'The inbound continuation of each local-space line — the dashed half pointing to the body’s antipode, opposite its outgoing (solid) bearing. Toggle off to keep only the outgoing halves.',
  },
  hideCompass: {
    title: 'Compass',
    hint: 'The local-horizon compass wheel that fades in at the origin once you zoom in.',
  },
  flyToOrigin: {
    title: 'Fly to origin',
    hint: 'Drop into the local horizon: fly the camera to the origin the lines radiate from.',
  },
} as const;
