// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// THE editor for a chart's home place — where its subject lives NOW, as opposed
// to where they were born. Every LIVE surface that can set it renders this one
// component (the local-space origin row, and any extension window that offers
// it), so the flow is identical everywhere: the current value, Set/Change, and
// the shared place-search field with whatever scopes are registered. (The
// chart form sets the same value through its own tabbed place box — it edits a
// chart that isn't saved yet, and its box already IS the shared search field.)
// It belongs beside a CHART — an account-level mount would be claiming the
// account has a home, which is exactly the confusion this field exists to undo.
//
// Controlled on purpose: hosts edit the active chart through useChartHome().
// Hosts re-skin by scoping overrides under `className` rather than forking.
// Strings arrive as props — like the search field, this mounts in React roots
// outside the i18n provider.

import { useState, type ReactNode } from 'react';
import type { ChartHome } from '../../lib/chartLibrary';
import { PlaceSearchField, type PlaceSearchStrings } from './PlaceSearchField';
import './ChartHomeEditor.css';

export interface ChartHomeStrings {
  unset: string;
  set: string;
  change: string;
  cancel: string;
  clear: string;
  placeholder: string;
  searchAria: string;
}

const EN: ChartHomeStrings = {
  unset: 'Same as birthplace',
  set: 'Set…',
  change: 'Change',
  cancel: 'Cancel',
  clear: 'Clear',
  placeholder: 'Search for a place…',
  searchAria: 'Search for a home place',
};

interface ChartHomeEditorProps {
  value: ChartHome | null;
  onChange: (home: { label: string; lat: number; lng: number } | null) => void;
  /** Optional row prefix (an icon, a field label) before the value. */
  label?: ReactNode;
  /** Host hook for scoped style overrides. */
  className?: string;
  strings?: Partial<ChartHomeStrings>;
  /** Passed through to the search field (its own internal copy). */
  searchStrings?: Partial<PlaceSearchStrings>;
}

export function ChartHomeEditor({
  value,
  onChange,
  label,
  className,
  strings,
  searchStrings,
}: ChartHomeEditorProps) {
  const S = { ...EN, ...strings };
  const [picking, setPicking] = useState(false);

  return (
    <div className={`che${className ? ` ${className}` : ''}`}>
      <p className="che-row">
        {label && <span className="che-label">{label}</span>}
        <span className={`che-value${value ? '' : ' che-value-unset'}`}>
          {value ? value.label : S.unset}
        </span>
        {value && !picking && (
          <button type="button" className="che-btn" onClick={() => onChange(null)}>
            {S.clear}
          </button>
        )}
        <button type="button" className="che-btn" onClick={() => setPicking((v) => !v)}>
          {picking ? S.cancel : value ? S.change : S.set}
        </button>
      </p>
      {picking && (
        <PlaceSearchField
          className="che-search"
          bias={value ? { lat: value.lat, lng: value.lng } : undefined}
          onPick={(hit) => {
            onChange({ label: hit.label, lat: hit.lat, lng: hit.lng });
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
          placeholder={S.placeholder}
          ariaLabel={S.searchAria}
          strings={searchStrings}
          autoFocus
        />
      )}
    </div>
  );
}
