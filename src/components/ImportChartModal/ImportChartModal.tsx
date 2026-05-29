import { useEffect, useMemo, useRef, useState } from 'react';
import { getIanaTimezone } from '../../lib/atlas/timezone';
import { newChartId, type StoredChart } from '../../lib/chartLibrary';
import { parseImport, type ParsedChart } from '../../lib/importCharts';
import './ImportChartModal.css';

interface ImportChartModalProps {
  onCancel: () => void;
  onImport: (charts: StoredChart[]) => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const TEXT_EXAMPLE = `Mary Decker - Natal Chart
4 Aug 1958, 2:59 am, EDT +4:00
Raritan New Jersey, 40N34'10", 074W38'00"
Geocentric Tropical Zodiac`;

const CSV_EXAMPLE = `"Name","Chart Type","Date","Time","Zone","City","Region","Latitude","Longitude","Zodiac"
"Mary Decker","Natal","04 Aug 1958","02:59:00","-04:00","Raritan","New Jersey","40N34","074W38","Tropical"`;

function fmtSummary(c: ParsedChart): string {
  const date = `${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
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
      setFileError('Please drop a .txt or .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ''));
    reader.onerror = () => setFileError('Could not read that file.');
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
          <h2>Import charts</h2>
          <button
            type="button"
            className="close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <p className="import-intro">
          Paste a chart or drop in a file (multiple charts are supported).
        </p>

        <textarea
          className="import-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`${TEXT_EXAMPLE}\n\n— or —\n\n${CSV_EXAMPLE}`}
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
            Drag &amp; drop a <strong>.txt</strong> or <strong>.csv</strong>, or
            click to choose a file
          </span>
        </div>
        {fileError && <p className="import-file-error">{fileError}</p>}

        {raw.trim() && (
          <div className="import-preview">
            {charts.length > 0 && (
              <ul className="import-list">
                {charts.map((c, i) => (
                  <li key={i}>
                    <span className="import-name">{c.name}</span>
                    <span className="import-detail">{fmtSummary(c)}</span>
                  </li>
                ))}
              </ul>
            )}
            {errors.length > 0 && (
              <ul className="import-errors">
                {errors.map((er, i) => (
                  <li key={i}>⚠ {er}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <footer>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleImport}
            disabled={charts.length === 0}
          >
            {charts.length > 0
              ? `Import ${charts.length} chart${charts.length > 1 ? 's' : ''}`
              : 'Import'}
          </button>
        </footer>
      </div>
    </div>
  );
}
