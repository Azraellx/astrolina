// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { TipButton } from '../ui/HoverTip';
import { InfoIcon } from '../ui/InfoIcon';
import { getCreditsFooter, getCreditsItems } from '../../lib/extensions/creditsFooter';
import type { CreditsNoticeActions } from '../../lib/extensions/creditsFooter';
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
  | 'photon'
  | 'swisseph'
  | 'nasaEclipse'
  | 'noto'
  | 'maplibre'
  | 'other';
type GroupKey = 'astrolina' | 'mapsPlaces' | 'astronomy' | 'typeSoftware';

// Where a problem report goes — the same address the project's LICENSE and README
// give. An address reads the same in every language, so it stays out of the catalog.
const CONTACT_EMAIL = 'contact@astrolina.org';

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
      {
        name: 'Photon (komoot)',
        href: 'https://photon.komoot.io',
        license: 'Apache-2.0',
        noteKey: 'photon',
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
        name: 'NASA GSFC Eclipse Catalogs',
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
        name: 'Noto Sans Symbols & Math',
        href: 'https://github.com/notofonts',
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

// The people credited in the acknowledgements sub-dialog, with the contact details
// they asked to be reachable at. Names, addresses, and site labels are proper nouns —
// they read the same in every language, so they are not in the message catalog.
interface Person {
  name: string;
  email: string;
  site: string;
  siteLabel: string;
}

// The astrologer whose practice the app is built on. Billed on her own, above the
// thanks — a first credit rather than the first of a list.
const THANKS_LEAD: Person = {
  name: 'Lina Grosso',
  email: 'lina@linagrosso.com',
  site: 'https://linagrosso.com',
  siteLabel: 'linagrosso.com',
};

const THANKS_PEOPLE: Person[] = [
  {
    name: 'Shae Freeman',
    email: 'shaeastrology@gmail.com',
    site: 'https://astroshae.com',
    siteLabel: 'astroshae.com',
  },
  {
    name: 'Cindy McKean',
    email: 'cindy@cindymckean.com',
    site: 'https://cindymckean.com',
    siteLabel: 'CindyMcKean.com',
  },
];

// email | website, as a pair of links. Shared by the lead credit and the thanks list
// so the two never drift apart in punctuation or link behaviour.
function ContactLinks({ person }: { person: Person }) {
  return (
    <span className="thanks-contact">
      <a href={`mailto:${person.email}`}>{person.email}</a>
      <span className="thanks-sep" aria-hidden="true">
        |
      </span>
      <a href={person.site} target="_blank" rel="noopener noreferrer">
        {person.siteLabel}
      </a>
    </span>
  );
}

// The acknowledgements, opened from the heart in the credits header. A dialog of its
// own rather than a tooltip, so the thank-you can be read at leisure and the contact
// details can be clicked. Escape is handled by the parent, which owns the "innermost
// dialog first" ordering.
function ThanksDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="modal-backdrop thanks-backdrop" onClick={onClose}>
      <div
        className="thanks-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="thanks-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id="thanks-title">{t('creditsModal.thanks.title')}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </header>

        {/* The first credit, given its own card: name, what she is to the app, why. */}
        <section className="thanks-lead">
          <span className="thanks-lead-name">{THANKS_LEAD.name}</span>
          <span className="thanks-role">{t('creditsModal.thanks.leadRole')}</span>
          <p className="thanks-lead-body">{t('creditsModal.thanks.leadBody')}</p>
          <ContactLinks person={THANKS_LEAD} />
        </section>

        {/* Grouped so the heading, its sentence, and the names keep their own tighter
            rhythm instead of inheriting the dialog's section-sized gap. */}
        <section className="thanks-others">
          <h3 className="thanks-heading">{t('creditsModal.thanks.othersHeading')}</h3>
          <p className="thanks-body">{t('creditsModal.thanks.body')}</p>
          <ul className="thanks-list">
            {THANKS_PEOPLE.map((person) => (
              <li key={person.email}>
                <span className="thanks-name">{person.name}</span>
                <span className="thanks-role">{t('creditsModal.thanks.role')}</span>
                <ContactLinks person={person} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// A scrollable dialog of secondary copyright / license disclosures, plus
// AstroLina's own copyright. Reuses the shared .modal-backdrop chrome.
export function CreditsModal({
  onClose,
  noticeActions,
}: {
  onClose: () => void;
  /** What a downstream notice tail is allowed to do (see creditsFooter). Absent when
   *  the host has no extension context to lend, which also hides the tail. */
  noticeActions?: CreditsNoticeActions;
}) {
  const { t } = useT();
  const [thanksOpen, setThanksOpen] = useState(false);
  // The downstream link that stands in for the contact address. Only worth asking for
  // when the host lent us the actions it needs — otherwise the address stays.
  const noticeTail = noticeActions ? getCreditsFooter().renderNotice?.(noticeActions) : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Innermost first: Escape dismisses the acknowledgements and leaves the credits
      // up. One listener for both, since two window listeners would fire on the same
      // press and close the pair together.
      if (thanksOpen) setThanksOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, thanksOpen]);

  return (
    // The sub-dialog is a SIBLING of this backdrop, never a child — a nested one would
    // hand its own backdrop clicks up to this onClose and dismiss the pair together.
    // Same parent, so the later sibling simply paints over it (see .thanks-backdrop).
    <>
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
          <div className="credits-header-actions">
            {/* A thank-you that keeps to itself until asked: the heart opens the
                acknowledgements. It sits in the credits because that is what this
                dialog is for — naming the work behind the work. */}
            <TipButton
              type="button"
              className="credits-thanks"
              tip={t('creditsModal.thanks.tip')}
              hint={t('creditsModal.thanks.hint')}
              onClick={() => setThanksOpen(true)}
              aria-label={t('creditsModal.thanks.title')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 21s-7.5-4.7-9.6-9.2A5.4 5.4 0 0 1 12 6.3a5.4 5.4 0 0 1 9.6 5.5C19.5 16.3 12 21 12 21Z" />
              </svg>
            </TipButton>
            <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>
              ×
            </button>
          </div>
        </header>

        <p className="credits-intro">{t('creditsModal.intro')}</p>

        {/* The invitation to report a problem, ending in the one thing to act on — so
            the closing sentence is the only link in it. A downstream build REPLACES that
            link (see creditsFooter's notice tail) when it has somewhere better to send a
            reader than a mail client: a help page that carries these same words and can
            afford to say what a useful report contains. With no tail registered — and in
            any build that renders the dialog without a context to lend one — the sentence
            links to the contact address instead, so the route is never missing. */}
        <p className="credits-notice">
          <InfoIcon className="credits-notice-mark" size={12} />
          <strong>{t('creditsModal.notice.lead')}</strong> {t('creditsModal.notice.body')}{' '}
          {noticeTail ?? (
            <a href={`mailto:${CONTACT_EMAIL}`}>{t('creditsModal.notice.report')}</a>
          )}
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
              {/* Rows a downstream build registered for this group (data/deps it
                  bundles that the open core doesn't ship) — same chrome; strings
                  arrive pre-localized. Empty in the open core. */}
              {getCreditsItems(group.titleKey).map((item) => (
                <li key={`registered-${item.name}`}>
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
          {t('creditsModal.footer')}
          {/* Optional downstream footer content (e.g. Privacy / Terms links); empty in core. */}
          {getCreditsFooter().render?.()}
        </footer>
      </div>
    </div>

    {thanksOpen && <ThanksDialog onClose={() => setThanksOpen(false)} />}
    </>
  );
}
