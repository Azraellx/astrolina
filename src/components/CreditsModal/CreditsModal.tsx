// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect } from 'react';
import { useT } from '../../i18n';
import './CreditsModal.css';

// Sub-key into creditsModal.notes / creditsModal.groups. Kept as literal unions so the
// `creditsModal.notes.${noteKey}` template still resolves to a valid typed MsgKey.
type NoteKey =
  | 'astrolina'
  | 'sourceCode'
  | 'openstreetmap'
  | 'openfreemap'
  | 'maptiler'
  | 'geonames'
  | 'swisseph'
  | 'nasaEclipse'
  | 'noto'
  | 'maplibre'
  | 'other';
type GroupKey = 'astrolina' | 'mapsPlaces' | 'astronomy' | 'typeSoftware';

interface CreditItem {
  name: string;
  href?: string;
  license: string;
  // Key into the creditsModal.notes namespace, resolved via t() at render time.
  noteKey: NoteKey;
}
interface CreditGroup {
  // Key into the creditsModal.groups namespace, resolved via t() at render time.
  titleKey: GroupKey;
  items: CreditItem[];
}

// The secondary attribution / license disclosures — everything that doesn't need
// to sit on the map at all times. (OpenStreetMap DOES, so it stays in the always-on
// MapLibre attribution control; it's listed here too for completeness.) Opened from
// the "AstroLina" entry in that attribution bar.
const CREDIT_GROUPS: CreditGroup[] = [
  {
    titleKey: 'astrolina',
    items: [
      {
        name: 'AstroLina',
        href: 'https://astrolina.org',
        license: 'AGPL-3.0',
        noteKey: 'astrolina',
      },
      {
        name: 'Source code',
        href: 'https://git.astrolina.org',
        license: 'AGPL-3.0',
        noteKey: 'sourceCode',
      },
    ],
  },
  {
    titleKey: 'mapsPlaces',
    items: [
      {
        name: 'OpenStreetMap contributors',
        href: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL',
        noteKey: 'openstreetmap',
      },
      {
        name: 'OpenFreeMap',
        href: 'https://openfreemap.org',
        license: 'OpenMapTiles',
        noteKey: 'openfreemap',
      },
      {
        name: 'MapTiler Basic style',
        href: 'https://github.com/openmaptiles/maptiler-basic-gl-style',
        license: 'BSD-3-Clause',
        noteKey: 'maptiler',
      },
      {
        name: 'GeoNames',
        href: 'https://www.geonames.org',
        license: 'CC BY 4.0',
        noteKey: 'geonames',
      },
    ],
  },
  {
    titleKey: 'astronomy',
    items: [
      {
        name: 'Swiss Ephemeris',
        href: 'https://www.astro.com/swisseph/',
        license: 'AGPL-3.0',
        noteKey: 'swisseph',
      },
      {
        name: 'NASA GSFC Eclipse Catalog',
        href: 'https://eclipse.gsfc.nasa.gov',
        license: 'NASA',
        noteKey: 'nasaEclipse',
      },
    ],
  },
  {
    titleKey: 'typeSoftware',
    items: [
      {
        name: 'Noto Sans Symbols & Symbols 2',
        href: 'https://github.com/notofonts/symbols',
        license: 'SIL OFL 1.1',
        noteKey: 'noto',
      },
      {
        name: 'MapLibre GL JS',
        href: 'https://maplibre.org',
        license: 'BSD-3-Clause',
        noteKey: 'maplibre',
      },
      {
        name: 'React, Turf.js, Luxon, and more',
        license: 'open-source',
        noteKey: 'other',
      },
    ],
  },
];

// A scrollable dialog of secondary copyright / license disclosures, plus
// AstroLina's own copyright. Reuses the shared .modal-backdrop chrome.
export function CreditsModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
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
          <h2 id="credits-title">{t('creditsModal.title')}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </header>

        <p className="credits-intro">{t('creditsModal.intro')}</p>

        {/* TEMP: accuracy disclaimer. Remove once outputs are corroborated against other tools. */}
        <p className="credits-disclaimer">
          <strong>{t('creditsModal.disclaimer.label')}</strong>
          {t('creditsModal.disclaimer.body')}
        </p>

        <div className="credits-groups">
        {CREDIT_GROUPS.map((group) => (
          <section key={group.titleKey} className="credits-group">
            <h3>{t(`creditsModal.groups.${group.titleKey}`)}</h3>
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
                  <span className="credits-note">{t(`creditsModal.notes.${item.noteKey}`)}</span>
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
          {t('creditsModal.footer')}
        </footer>
      </div>
    </div>
  );
}
