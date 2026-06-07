// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getIanaTimezone } from '../../lib/atlas/timezone';
import { displayName, newChartId, type StoredChart } from '../../lib/chartLibrary';
import { parseImport, type ParsedChart } from '../../lib/importCharts';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import { TipSpan } from '../ui/HoverTip';
import './ImportChartModal.css';

interface ImportChartModalProps {
  onCancel: () => void;
  onImport: (charts: StoredChart[]) => void;
}

const TEXT_EXAMPLE = `Mary Decker - Natal Chart
4 Aug 1958, 2:59 am, EDT +4:00
Raritan New Jersey, 40N34'10", 074W38'00"
Geocentric Tropical Zodiac`;

const CSV_EXAMPLE = `"Name","Chart Type","Date","Time","Zone","City","Region","Latitude","Longitude","Zodiac"
"Mary Decker","Natal","04 Aug 1958","02:59:00","-04:00","Raritan","New Jersey","40N34","074W38","Tropical"`;

function fmtSummary(c: ParsedChart, fmt: Formatters): string {
  const date = `${c.day} ${fmt.monthAbbr(c.month)} ${c.year}`;
  const time = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
  const off = c.tzOffset >= 0 ? `+${c.tzOffset}` : `${c.tzOffset}`;
  return `${date} · ${time} (UTC${off}) · ${c.birthplace.label}`;
}

function toStoredChart(c: ParsedChart, i: number): StoredChart {
  let tzIana: string | undefined;
  try {
    tzIana = getIanaTimezone(c.birthplace.lat, c.birthplace.lng);
  } catch {
    tzIana = undefined;
  }
  return {
    id: `${newChartId()}_${i}`,
    createdAt: Date.now(),
    name: c.name,
    year: c.year,
    month: c.month,
    day: c.day,
    hour: c.hour,
    minute: c.minute,
    tzOffset: c.tzOffset,
    tzIana,
    tzUncertain: false,
    birthplace: c.birthplace,
  };
}

export function ImportChartModal({ onCancel, onImport }: ImportChartModalProps) {
  const { t, fmt } = useT();
  const [raw, setRaw] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { charts, errors } = useMemo(() => parseImport(raw), [raw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const loadFile = (file: File) => {
    setFileError(null);
    const ok = /\.(txt|csv)$/i.test(file.name) || file.type.startsWith('text');
    if (!ok) {
      setFileError(t('importChartModal.fileTypeError'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ''));
    reader.onerror = () => setFileError(t('importChartModal.fileReadError'));
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!charts.length) return;
    onImport(charts.map(toStoredChart));
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="import-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{t('importChartModal.title')}</h2>
          <button
            type="button"
            className="close"
            onClick={onCancel}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </header>

        <p className="import-intro">{t('importChartModal.intro')}</p>

        <textarea
          className="import-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`${TEXT_EXAMPLE}\n\n${t('importChartModal.orSeparator')}\n\n${CSV_EXAMPLE}`}
          spellCheck={false}
          autoFocus
        />

        <div
          className={`import-dropzone ${dragOver ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) loadFile(file);
          }}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
              e.target.value = '';
            }}
          />
          <span>
            {t('importChartModal.dropzonePrefix')}
            <strong>.txt</strong>
            {t('importChartModal.dropzoneOr')}
            <strong>.csv</strong>
            {t('importChartModal.dropzoneSuffix')}
          </span>
        </div>
        {fileError && <p className="import-file-error">{fileError}</p>}

        {raw.trim() && (
          <div className="import-preview">
            {charts.length > 0 && (
              <ul className="import-list">
                {charts.map((c, i) => (
                  <li key={i}>
                    <TipSpan className="import-name" placement="top" tip={c.name}>
                      {displayName(c.name)}
                    </TipSpan>
                    <span className="import-detail">{fmtSummary(c, fmt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {errors.length > 0 && (
              <ul className="import-errors">
                {errors.map((er, i) => (
                  <li key={i}>{t('importChartModal.parseError', { er })}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <footer>
          <button type="button" className="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleImport}
            disabled={charts.length === 0}
          >
            {charts.length > 0
              ? t('importChartModal.importButton', { count: charts.length })
              : t('importChartModal.importEmpty')}
          </button>
        </footer>
      </div>
    </div>
  );
}
