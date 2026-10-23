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
//
// A home no search finds (2026-10-23, Salvatore: an address missing from the street
// index, though the reader can zoom in and pin the very house). The pickers offer the
// placed map pin and the reader's own places before anything is typed, and say so
// under a search's answer. The pin is offered, never taken: a home is only ever set
// by a pick.

import { useState, type ReactNode } from 'react';
import type { ChartHome } from '../../lib/chartLibrary';
import { maskText } from '../../lib/discreet';
import type { PlaceSearchHit } from '../../lib/extensions/placeSearchProviders';
import { HoverTip } from './HoverTip';
import {
  PlaceSearchField,
  type PlaceSearchSection,
  type PlaceSearchStrings,
} from './PlaceSearchField';
import { useHoverTip } from './useHoverTip';
import './ChartHomeEditor.css';

export interface ChartHomeStrings {
  unset: string;
  set: string;
  change: string;
  cancel: string;
  clear: string;
  placeholder: string;
  searchAria: string;
  /** The tag on the map pin's row. */
  mapPinTag: string;
  /** Under a search's answer, while the host offers the map pin. */
  missHint: string;
}

const EN: ChartHomeStrings = {
  unset: 'Same as birthplace',
  set: 'Set…',
  change: 'Change',
  cancel: 'Cancel',
  clear: 'Clear',
  placeholder: 'Search for a place…',
  searchAria: 'Search for a home place',
  mapPinTag: 'Map pin',
  missHint: 'Not finding it? Drop a pin on the spot on the map, then pick it here.',
};

/** The placed map pin as a home picker offers it — a standing row named by the pin's place,
 *  shared by this editor and the chart form's Lives now box so the two offer it alike. The field
 *  drops the row where a saved pin stands on the same spot, or where it is the value already. */
export function mapPinSection(
  pin: { lat: number; lng: number; label: string } | null | undefined,
  tag: string,
  onPick: (home: { label: string; lat: number; lng: number }) => void,
): PlaceSearchSection[] | undefined {
  if (!pin) return undefined;
  return [
    {
      id: 'map-pin',
      items: [
        {
          id: 'map-pin',
          label: pin.label,
          tag,
          at: { lat: pin.lat, lng: pin.lng },
          onPick: () => onPick({ label: pin.label, lat: pin.lat, lng: pin.lng }),
        },
      ],
    },
  ];
}

/** The name a home takes from a pick: the place's own, where the row's label is a name the
 *  reader gave the spot (a saved pin's title). Salvatore, 2026-10-23: a home is a place. */
export const homeLabelOf = (hit: PlaceSearchHit) => hit.place ?? hit.label;

interface ChartHomeEditorProps {
  /** The place shown — a chart's Home, or any place with a name and coordinates (only those are
   *  read). */
  value: Pick<ChartHome, 'label' | 'lat' | 'lng'> | null;
  onChange: (home: { label: string; lat: number; lng: number } | null) => void;
  /** Optional row prefix (an icon, a field label) before the value. */
  label?: ReactNode;
  /** Host hook for scoped style overrides. */
  className?: string;
  strings?: Partial<ChartHomeStrings>;
  /** Passed through to the search field (its own internal copy). */
  searchStrings?: Partial<PlaceSearchStrings>;
  /** Blank the set value under discreet mode (lib/discreet). OFF by default, and the
   *  host decides rather than this component: the same editor sits in the chart FORM,
   *  where you are editing that record and blanking it from you would be a bug, and in
   *  a working window, where where-someone-lives is exactly what the mode is for. Only
   *  the value blanks — set, change and clear all keep working. */
  maskValue?: boolean;
  /** Offer Clear. On by default; off for a place that is always somewhere (a viewport owner's
   *  origin row in the Local Space window), where only Change makes sense. (2026-10-13) */
  clearable?: boolean;
  /** A tip on Change (Set), for a host whose pick does more than the value shows — disclosed on
   *  the trigger. Absent, no tip. */
  changeTip?: { title: string; hint: string };
  /** Offer the reader's own places (the registered standing list) before anything is typed. */
  library?: boolean;
  /** The placed map pin, offered as a row before anything is typed: the way in for a place no
   *  search finds. Null while there is no pin (or it stands on the birthplace); absent for a host
   *  that offers no pin at all, which also leaves out the hint that points to it. `label` is the
   *  pin's place, its coordinates until that settles. (2026-10-23) */
  mapPin?: { lat: number; lng: number; label: string } | null;
}

export function ChartHomeEditor({
  value,
  onChange,
  label,
  className,
  strings,
  searchStrings,
  maskValue,
  clearable = true,
  changeTip,
  library = false,
  mapPin,
}: ChartHomeEditorProps) {
  const S = { ...EN, ...strings };
  const [picking, setPicking] = useState(false);
  const pick = (home: { label: string; lat: number; lng: number }) => {
    onChange(home);
    setPicking(false);
  };

  return (
    <div className={`che${className ? ` ${className}` : ''}`}>
      <p className="che-row">
        {label && <span className="che-label">{label}</span>}
        {/* A place name is the reader's own data: kept from page translators. */}
        <span
          className={`che-value${value ? '' : ' che-value-unset'}`}
          translate={value ? 'no' : undefined}
        >
          {value ? (maskValue ? maskText(value.label) : value.label) : S.unset}
        </span>
        {clearable && value && !picking && (
          <button type="button" className="che-btn" onClick={() => onChange(null)}>
            {S.clear}
          </button>
        )}
        {changeTip && !picking ? (
          <TipButton tip={changeTip} onClick={() => setPicking(true)}>
            {value ? S.change : S.set}
          </TipButton>
        ) : (
          <button type="button" className="che-btn" onClick={() => setPicking((v) => !v)}>
            {picking ? S.cancel : value ? S.change : S.set}
          </button>
        )}
      </p>
      {picking && (
        <PlaceSearchField
          className="che-search"
          bias={value ? { lat: value.lat, lng: value.lng } : undefined}
          onPick={(hit) => pick({ label: homeLabelOf(hit), lat: hit.lat, lng: hit.lng })}
          library={library}
          sections={mapPinSection(mapPin, S.mapPinTag, pick)}
          omitAt={value}
          missHint={mapPin !== undefined ? S.missHint : undefined}
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

// Change with its tip — its own component so the tip's touch handling binds only where a host
// asked for a tip, and the editor's plain buttons elsewhere behave as they always have.
function TipButton({
  tip,
  onClick,
  children,
}: {
  tip: { title: string; hint: string };
  onClick: () => void;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="che-btn"
        onClick={() => {
          hide();
          onClick();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip pos={pos} placement="top" title={tip.title} hint={tip.hint} />
    </>
  );
}
