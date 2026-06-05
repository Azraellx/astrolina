// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect } from 'react';
import './CreditsModal.css';

interface CreditItem {
  name: string;
  href?: string;
  license: string;
  note: string;
}
interface CreditGroup {
  title: string;
  items: CreditItem[];
}

// The secondary attribution / license disclosures — everything that doesn't need
// to sit on the map at all times. (OpenStreetMap DOES, so it stays in the always-on
// MapLibre attribution control; it's listed here too for completeness.) Opened from
// the "AstroLina" entry in that attribution bar.
const CREDIT_GROUPS: CreditGroup[] = [
  {
    title: 'AstroLina',
    items: [
      {
        name: 'AstroLina',
        href: 'https://astrolina.org',
        license: 'AGPL-3.0',
        note: '© 2026 AstroLina. Free, open-source software under the GNU Affero General Public License v3.0.',
      },
      {
        name: 'Source code',
        href: 'https://git.astrolina.org',
        license: 'AGPL-3.0',
        note: 'Full source code, available per the AGPL. Contributions welcome.',
      },
    ],
  },
  {
    title: 'Maps & places',
    items: [
      {
        name: 'OpenStreetMap contributors',
        href: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL',
        note: 'Base map data (also credited on the map itself).',
      },
      {
        name: 'OpenFreeMap',
        href: 'https://openfreemap.org',
        license: 'OpenMapTiles',
        note: 'Free vector tiles, label fonts, and sprites.',
      },
      {
        name: 'MapTiler Basic style',
        href: 'https://github.com/openmaptiles/maptiler-basic-gl-style',
        license: 'BSD-3-Clause',
        note: 'Basemap styling for the Earth theme. © MapTiler.com & OpenMapTiles contributors; © Mapbox.',
      },
      {
        name: 'GeoNames',
        href: 'https://www.geonames.org',
        license: 'CC BY 4.0',
        note: 'Offline place-name search and city lookup.',
      },
    ],
  },
  {
    title: 'Astronomy',
    items: [
      {
        name: 'Swiss Ephemeris',
        href: 'https://www.astro.com/swisseph/',
        license: 'AGPL-3.0',
        note: 'Planetary positions (JPL DE441). © Astrodienst AG, via @swisseph/browser.',
      },
    ],
  },
  {
    title: 'Type & software',
    items: [
      {
        name: 'Noto Sans Symbols & Symbols 2',
        href: 'https://github.com/notofonts/symbols',
        license: 'SIL OFL 1.1',
        note: 'Astrological glyphs. © 2022 The Noto Project Authors.',
      },
      {
        name: 'MapLibre GL JS',
        href: 'https://maplibre.org',
        license: 'BSD-3-Clause',
        note: 'Interactive map rendering.',
      },
      {
        name: 'React, Turf.js, Luxon, and more',
        license: 'open-source',
        note: 'Plus other MIT-licensed libraries listed in the project repository.',
      },
    ],
  },
];

// A scrollable dialog of secondary copyright / license disclosures, plus
// AstroLina's own copyright. Reuses the shared .modal-backdrop chrome.
export function CreditsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="credits-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id="credits-title">Credits &amp; licenses</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="credits-intro">
          AstroLina is built on open data and open-source software. The full
          license texts are available in the project repository.
        </p>

        {/* TEMP: accuracy disclaimer. Remove once outputs are corroborated against other tools. */}
        <p className="credits-disclaimer">
          <strong>⚠️ Early access:</strong> accuracy is still being verified.
          AstroLina uses the same datasets as the professional tools, but its
          output is still being cross-checked, and display bugs could currently
          misplace a line. Please treat results as provisional for now.
        </p>

        <div className="credits-groups">
        {CREDIT_GROUPS.map((group) => (
          <section key={group.title} className="credits-group">
            <h3>{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <span className="credits-line">
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer">
                        {item.name}
                      </a>
                    ) : (
                      <span className="credits-name">{item.name}</span>
                    )}
                    <span className="credits-license">{item.license}</span>
                  </span>
                  <span className="credits-note">{item.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        </div>

        <footer>
          ©&nbsp;2026{' '}
          <a href="https://astrolina.org" target="_blank" rel="noopener noreferrer">
            astrolina.org
          </a>
          {' '}· The astrocartography calculations and interface design are
          AstroLina's own; the underlying ephemeris and map data are credited
          above.
        </footer>
      </div>
    </div>
  );
}
