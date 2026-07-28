// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Bringing charts in, in three steps: paste or drop, say which column is which,
// then look at what we made of it and commit.
//
// The middle step only appears when the file needs it — an exchange-format file
// describes itself, and a pasted block has no columns. Everything else needs a
// person to say what the columns hold, because no amount of inspection can tell
// a latitude column from a longitude one when both are bare decimals.
//
// The last step is the point of the whole dialog and the only way through it.
// A chart whose longitude was read with the wrong sign still draws a perfectly
// convincing map — just of the opposite side of the world — and no automated
// check can catch that, because nothing about the number is wrong. So the last
// check is a person, looking at a table, before anything is saved.

import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '../../lib/downloadBlob';
import type { StoredChart } from '../../lib/chartLibrary';
import {
  chartsFrom,
  contentLines,
  DEFAULT_CONTROLS,
  defaultControlsFor,
  FIELD_TARGETS,
  findMapping,
  formatOffset,
  importableRows,
  initialMapping,
  mappingIsUsable,
  newMappingId,
  parseImport,
  previewCells,
  rejectedReport,
  rowSeverity,
  saveMapping,
  signatureOf,
  sliceFixed,
  sourceFromBytes,
  sourceFromText,
  type ColumnMapping,
  type ColumnSpec,
  type DateFormat,
  type FieldTarget,
  type ImportControls,
  type ImportReport,
  type ImportRow,
  type ImportSource,
  type Issue,
} from '../../lib/import';
import { useT } from '../../i18n';
import type { TFn } from '../../i18n';
import './ImportChartModal.css';

interface ImportChartModalProps {
  onCancel: () => void;
  onImport: (charts: StoredChart[]) => void;
  /** The library, so a chart already saved can be recognised as a duplicate. */
  existing?: readonly StoredChart[];
  /** Folder paths already in use, offered as import destinations. */
  folderOptions?: readonly string[];
}

const TEXT_EXAMPLE = `Mary Decker - Natal Chart
4 Aug 1958, 2:59 am, EDT +4:00
Raritan New Jersey, 40N34'10", 074W38'00"`;

const CSV_EXAMPLE = `"Name","Date","Time","Zone","City","Region","Latitude","Longitude"
"Mary Decker","04 Aug 1958","02:59:00","-04:00","Raritan","New Jersey","40N34","074W38"`;

const DATE_FORMATS: DateFormat[] = ['auto', 'dmy', 'mdy', 'ymd', 'yyyymmdd', 'mmddyyyy', 'ddmmyyyy'];

/** How long to sit still before re-reading pasted text. Long enough that typing
 *  never re-parses mid-word, short enough to feel immediate. */
const PARSE_DEBOUNCE_MS = 150;

type Step = 'input' | 'map' | 'preview';

/** Everything about HOW a given source is being read — all of it derivable from
 *  the source alone, and all of it adjustable afterwards. */
interface Plan {
  mapping: ColumnMapping | null;
  controls: ImportControls;
  step: Step;
  /** Name of the saved layout that was recognised and applied, if any. */
  appliedName: string | null;
  /** Rows the user has overridden, by index: true = import it, false = skip it. */
  overrides: Record<number, boolean>;
}

/**
 * Where a source starts.
 *
 * A file that describes itself goes straight to the preview. One that does not
 * needs its columns named — unless a header row already names them, or this
 * shape has been described before and saved, in which case the work is already
 * done and there is nothing to ask.
 */
function planFor(source: ImportSource | null): Plan {
  const base: Plan = {
    mapping: null,
    controls: DEFAULT_CONTROLS,
    step: 'input',
    appliedName: null,
    overrides: {},
  };
  if (!source) return base;

  const controls = defaultControlsFor(source.shape);
  if (source.shape.format === 'aaf' || source.shape.format === 'block') {
    return { ...base, controls, step: 'preview' };
  }

  const fresh = initialMapping(source);
  const saved = findMapping(signatureOf(fresh, fresh.columns.length));
  if (saved && mappingIsUsable(saved.columns)) {
    return { ...base, controls, mapping: { ...saved }, appliedName: saved.name, step: 'preview' };
  }
  return {
    ...base,
    controls,
    mapping: fresh,
    step: mappingIsUsable(fresh.columns) ? 'preview' : 'map',
  };
}

function issueText(issue: Issue, t: TFn): string {
  // Every code has a message; the union is closed, so a missing one is a build
  // error rather than a blank row.
  return t(`importChartModal.issue.${issue.code}` as 'importChartModal.issue.noDate', issue.vars);
}

export function ImportChartModal({
  onCancel,
  onImport,
  existing = [],
  folderOptions = [],
}: ImportChartModalProps) {
  const { t } = useT();
  const [raw, setRaw] = useState('');
  const [debounced, setDebounced] = useState('');
  // A dropped file arrives through the reader's callback, so it is plain state.
  const [dropped, setDropped] = useState<ImportSource | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [layoutName, setLayoutName] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Typing re-reads, but not on every keystroke: a thousand-row paste re-read
  // per character is what makes a dialog feel broken.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(raw), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  const pasted = useMemo(
    () => (debounced.trim() ? sourceFromText(debounced) : null),
    [debounced],
  );
  const source = dropped ?? pasted;

  // Where this source starts: which step, what mapping, which controls. Derived
  // rather than pushed into state by an effect, so there is never a render
  // where the source and the plan for it disagree.
  const initial = useMemo(() => planFor(source), [source]);
  // …and the user's changes on top, remembered against the source they were
  // made for. A new source therefore starts from its own plan without anything
  // having to reset it.
  const [edited, setEdited] = useState<{ for: ImportSource | null; plan: Plan } | null>(null);
  const plan = edited && edited.for === source ? edited.plan : initial;
  const patch = (p: Partial<Plan>) => setEdited({ for: source, plan: { ...plan, ...p } });

  const { mapping, controls, step, appliedName, overrides } = plan;

  const loadFile = (file: File) => {
    setFileError(null);
    const ok = /\.(txt|csv|tsv|aaf|dat)$/i.test(file.name) || file.type.startsWith('text');
    if (!ok) {
      setFileError(t('importChartModal.fileTypeError'));
      return;
    }
    const reader = new FileReader();
    // Read the BYTES, not text: the encoding has to be sniffed, and asking for
    // text here would decode as UTF-8 and mangle anything that is not.
    reader.onload = () => {
      const buf = reader.result;
      if (buf instanceof ArrayBuffer) {
        // Clear the paste box so the dropped file is unambiguously the source.
        setRaw('');
        setDebounced('');
        setDropped(sourceFromBytes(buf));
      }
    };
    reader.onerror = () => setFileError(t('importChartModal.fileReadError'));
    reader.readAsArrayBuffer(file);
  };

  const report: ImportReport | null = useMemo(() => {
    if (!source) return null;
    return parseImport(source, { controls, mapping: mapping ?? undefined, existing });
  }, [source, controls, mapping, existing]);

  /** The report with the user's per-row overrides folded in. */
  const rows: ImportRow[] = useMemo(() => {
    if (!report) return [];
    return report.rows.map((r) =>
      r.index in overrides ? { ...r, skipped: !overrides[r.index] } : r,
    );
  }, [report, overrides]);

  const effective: ImportReport | null = report ? { ...report, rows } : null;
  const willImport = effective ? importableRows(effective) : [];
  const counts = useMemo(() => {
    let ready = 0;
    let warned = 0;
    let skipped = 0;
    for (const r of rows) {
      if (rowSeverity(r) === 'reject') skipped++;
      else if (r.skipped) skipped++;
      else if (rowSeverity(r) === 'warn') warned++;
      else ready++;
    }
    return { ready, warned, skipped };
  }, [rows]);

  const rejectedCount = rows.filter((r) => rowSeverity(r) === 'reject').length;

  const handleImport = () => {
    if (!effective || !willImport.length) return;
    onImport(chartsFrom(effective));
  };

  const handleDownloadRejected = () => {
    if (!effective) return;
    const text = rejectedReport(effective, (row) =>
      row.issues
        .filter((i) => i.severity === 'reject')
        .map((i) => issueText(i, t))
        .join(' '),
    );
    if (!text) return;
    downloadBlob(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
      t('importChartModal.rejectedFilename'),
    );
  };

  const rememberLayout = () => {
    if (!mapping || !source) return;
    const name = layoutName.trim();
    if (!name) return;
    saveMapping({
      ...mapping,
      id: newMappingId(),
      name,
      signature: signatureOf(mapping, mapping.columns.length),
      updatedAt: Date.now(),
    });
    setSavedNote(true);
    setLayoutName('');
  };

  const setColumn = (i: number, spec: Partial<ColumnSpec>) => {
    if (!mapping) return;
    patch({
      mapping: {
        ...mapping,
        columns: mapping.columns.map((c, j) => (j === i ? { ...c, ...spec } : c)),
      },
    });
  };

  const toggleBoundary = (at: number) => {
    if (!mapping || mapping.kind !== 'fixed') return;
    const current = mapping.boundaries ?? [];
    const boundaries = current.includes(at)
      ? current.filter((b) => b !== at)
      : [...current, at].sort((a, b) => a - b);
    // Columns are positional, so changing the cuts changes how many there are.
    // Keep the targets that still line up and blank the rest, rather than
    // leaving stale ones pointing at text they no longer describe.
    const columns: ColumnSpec[] = Array.from(
      { length: boundaries.length + 1 },
      (_, i) => mapping.columns[i] ?? { target: 'ignore' as const },
    );
    patch({ mapping: { ...mapping, boundaries, columns } });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('importChartModal.title')}</h2>
          {source && (
            <span className="im-shape">
              {t(`importChartModal.shape.${source.shape.format}` as 'importChartModal.shape.aaf')}
              {source.encoding !== 'utf-8' && (
                <span className="im-encoding">
                  {' '}
                  {t('importChartModal.encodingNote', { encoding: source.encoding })}
                </span>
              )}
            </span>
          )}
          <button type="button" className="close" onClick={onCancel} aria-label={t('common.close')}>
            ×
          </button>
        </header>

        {step === 'input' && (
          <div className="im-step im-input">
            <p className="import-intro">{t('importChartModal.intro')}</p>
            <textarea
              className="import-textarea"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={`${TEXT_EXAMPLE}\n\n${t('importChartModal.orSeparator')}\n\n${CSV_EXAMPLE}`}
              spellCheck={false}
              autoFocus
            />
            <Dropzone t={t} fileRef={fileRef} onFile={loadFile} />
            {fileError && <p className="import-file-error">{fileError}</p>}
          </div>
        )}

        {step === 'map' && source && mapping && (
          <MappingStep
            t={t}
            source={source}
            mapping={mapping}
            onToggleBoundary={toggleBoundary}
            onSetColumn={setColumn}
            onSetHeader={(has) => patch({ mapping: { ...mapping, hasHeader: has } })}
            onBack={() => patch({ step: 'input' })}
            onContinue={() => patch({ step: 'preview' })}
          />
        )}

        {step === 'preview' && effective && (
          <div className="im-step im-preview">
            <div className="im-controls">
              <Control label={t('importChartModal.controls.longitude')}>
                <select
                  value={controls.longitudeSign}
                  onChange={(e) =>
                    patch({ controls: { ...controls, longitudeSign: e.target.value as never } })
                  }
                >
                  <option value="east-positive">{t('importChartModal.controls.eastPositive')}</option>
                  <option value="west-positive">{t('importChartModal.controls.westPositive')}</option>
                </select>
              </Control>
              <Control label={t('importChartModal.controls.offset')}>
                <select
                  value={controls.offsetSign}
                  onChange={(e) =>
                    patch({ controls: { ...controls, offsetSign: e.target.value as never } })
                  }
                >
                  <option value="east-positive">{t('importChartModal.controls.eastPositive')}</option>
                  <option value="west-positive">{t('importChartModal.controls.westPositive')}</option>
                </select>
              </Control>
              <Control label={t('importChartModal.controls.dateOrder')}>
                <select
                  value={controls.dateOrder}
                  onChange={(e) => patch({ controls: { ...controls, dateOrder: e.target.value as never } })}
                >
                  {(['auto', 'dmy', 'mdy', 'ymd'] as const).map((o) => (
                    <option key={o} value={o}>
                      {t(`importChartModal.dateFormat.${o}` as 'importChartModal.dateFormat.auto')}
                    </option>
                  ))}
                </select>
              </Control>
              <Control label={t('importChartModal.controls.zone')}>
                <select
                  value={controls.zonePreference}
                  onChange={(e) =>
                    patch({ controls: { ...controls, zonePreference: e.target.value as never } })
                  }
                >
                  <option value="file">{t('importChartModal.controls.zoneFile')}</option>
                  <option value="app">{t('importChartModal.controls.zoneApp')}</option>
                </select>
              </Control>
              <Control label={t('importChartModal.controls.folder')}>
                <input
                  type="text"
                  list="im-folder-list"
                  value={controls.folder}
                  onChange={(e) => patch({ controls: { ...controls, folder: e.target.value } })}
                  placeholder={t('importChartModal.controls.folderPlaceholder')}
                />
                <datalist id="im-folder-list">
                  {folderOptions.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </Control>
              <label className="im-check">
                <input
                  type="checkbox"
                  checked={controls.skipDuplicates}
                  onChange={(e) =>
                    patch({ controls: { ...controls, skipDuplicates: e.target.checked } })
                  }
                />
                <span>{t('importChartModal.controls.duplicates')}</span>
              </label>
            </div>

            <p className="im-counts">
              {t('importChartModal.preview.counts', counts)}
              {appliedName && (
                <span className="im-applied">
                  {' '}
                  {t('importChartModal.map.savedApplied', { name: appliedName })}
                </span>
              )}
            </p>

            <div className="im-table-scroll">
              {rows.length === 0 ? (
                <p className="im-empty">{t('importChartModal.preview.empty')}</p>
              ) : (
                <table className="im-table">
                  <tbody>
                    {rows.map((row) => (
                      <PreviewRow
                        key={row.index}
                        row={row}
                        t={t}
                        onToggle={() =>
                          patch({ overrides: { ...overrides, [row.index]: row.skipped } })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {mapping && !appliedName && (
              <div className="im-remember">
                {savedNote ? (
                  <span className="im-saved">{t('importChartModal.map.saved')}</span>
                ) : (
                  <>
                    <input
                      type="text"
                      value={layoutName}
                      onChange={(e) => setLayoutName(e.target.value)}
                      placeholder={t('importChartModal.map.savePlaceholder')}
                      aria-label={t('importChartModal.map.saveName')}
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={!layoutName.trim()}
                      onClick={rememberLayout}
                    >
                      {t('importChartModal.map.saveThis')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <footer>
          <div className="im-footer-left">
            <button type="button" className="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            {step === 'preview' && mapping && (
              <button type="button" className="secondary" onClick={() => patch({ step: 'map' })}>
                {t('importChartModal.map.back')}
              </button>
            )}
            {step === 'preview' && rejectedCount > 0 && (
              <button type="button" className="secondary" onClick={handleDownloadRejected}>
                {t('importChartModal.downloadRejected', { count: rejectedCount })}
              </button>
            )}
          </div>
          {step === 'preview' && (
            <button
              type="button"
              className="primary"
              onClick={handleImport}
              disabled={willImport.length === 0}
            >
              {willImport.length > 0
                ? t('importChartModal.importButton', { count: willImport.length })
                : t('importChartModal.importEmpty')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="im-control">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Dropzone({
  t,
  fileRef,
  onFile,
}: {
  t: TFn;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`import-dropzone ${over ? 'over' : ''}`}
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      role="button"
      tabIndex={0}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.csv,.tsv,.aaf,.dat,text/plain,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
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
  );
}

/**
 * The column-mapping step.
 *
 * Aligned-column files get a ruler over a sample of their own lines: clicking a
 * position adds or removes a divider. Both kinds then list their columns down
 * the page — one row each, showing what is actually in it beside a dropdown —
 * rather than trying to put the dropdowns above the columns, which stops
 * working the moment a column is narrower than the word "Longitude".
 */
function MappingStep({
  t,
  source,
  mapping,
  onToggleBoundary,
  onSetColumn,
  onSetHeader,
  onBack,
  onContinue,
}: {
  t: TFn;
  source: ImportSource;
  mapping: ColumnMapping;
  onToggleBoundary: (at: number) => void;
  onSetColumn: (i: number, patch: Partial<ColumnSpec>) => void;
  onSetHeader: (has: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const fixed = mapping.kind === 'fixed';
  const sample = useMemo(() => contentLines(source.text).slice(0, 6), [source.text]);
  const width = useMemo(() => Math.max(...sample.map((l) => l.length), 1), [sample]);
  const cells = useMemo(() => previewCells(source, mapping, 6), [source, mapping]);
  const usable = mappingIsUsable(mapping.columns);
  const boundaries = mapping.boundaries ?? [];

  return (
    <div className="im-step im-map">
      <h3>{t('importChartModal.map.title')}</h3>
      <p className="im-hint">
        {t(fixed ? 'importChartModal.map.hintFixed' : 'importChartModal.map.hintDelimited')}
      </p>

      {fixed && (
        <div className="im-ruler-scroll">
          <div className="im-ruler" style={{ width: `${width}ch` }}>
            {Array.from({ length: width }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`im-tick ${boundaries.includes(i) ? 'is-cut' : ''}`}
                onClick={() => onToggleBoundary(i)}
                aria-label={String(i)}
              />
            ))}
          </div>
          <pre className="im-sample" style={{ width: `${width}ch` }}>
            {sample.map((line, i) => (
              <span key={i} className="im-sample-line">
                {line.padEnd(width)}
              </span>
            ))}
          </pre>
        </div>
      )}

      {!fixed && (
        <label className="im-check">
          <input
            type="checkbox"
            checked={!!mapping.hasHeader}
            onChange={(e) => onSetHeader(e.target.checked)}
          />
          <span>{t('importChartModal.map.firstRowIsHeader')}</span>
        </label>
      )}

      <ul className="im-columns">
        {mapping.columns.map((spec, i) => {
          const values = cells
            .map((r) => r[i])
            .filter((v) => v != null && v !== '')
            .slice(0, 2);
          return (
            <li key={i} className={spec.target === 'ignore' ? 'is-ignored' : ''}>
              <span className="im-col-n">{t('importChartModal.map.column', { n: i + 1 })}</span>
              <span className="im-col-sample">
                {values.length ? values.join(' · ') : t('importChartModal.map.empty')}
              </span>
              <select
                value={spec.target}
                onChange={(e) => onSetColumn(i, { target: e.target.value as FieldTarget })}
              >
                {FIELD_TARGETS.map((target) => (
                  <option key={target} value={target}>
                    {t(`importChartModal.target.${target}` as 'importChartModal.target.name')}
                  </option>
                ))}
              </select>
              {spec.target === 'date' && (
                <select
                  className="im-col-format"
                  value={spec.dateFormat ?? 'auto'}
                  onChange={(e) => onSetColumn(i, { dateFormat: e.target.value as DateFormat })}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {t(`importChartModal.dateFormat.${f}` as 'importChartModal.dateFormat.auto')}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      {!usable && <p className="im-need">{t('importChartModal.map.needMore')}</p>}

      <div className="im-map-actions">
        <button type="button" className="secondary" onClick={onBack}>
          {t('importChartModal.map.back')}
        </button>
        <button type="button" className="primary" disabled={!usable} onClick={onContinue}>
          {t('importChartModal.map.continue')}
        </button>
      </div>
    </div>
  );
}

/** One row of the preview: a status dot, what we read, and why if anything. */
function PreviewRow({ row, t, onToggle }: { row: ImportRow; t: TFn; onToggle: () => void }) {
  const severity = rowSeverity(row);
  const c = row.chart;
  const when = c
    ? `${String(c.local.day).padStart(2, '0')}/${String(c.local.month).padStart(2, '0')}/${c.local.year}`
    : '';
  const time =
    c && c.timeKnown
      ? `${String(c.local.hour).padStart(2, '0')}:${String(c.local.minute).padStart(2, '0')}`
      : t('importChartModal.preview.noTime');

  return (
    <tr className={`im-row is-${severity} ${row.skipped ? 'is-skipped' : ''}`}>
      <td className="im-cell-status">
        <span className={`im-dot is-${severity}`} aria-hidden="true" />
      </td>
      <td className="im-cell-main">
        <span className="im-name">{c ? c.name : row.sourceRef}</span>
        {c && (
          <span className="im-meta">
            {when} · {time} · {formatOffset(c.offsetSeconds)} ·{' '}
            {[c.placeName, c.countryState].filter(Boolean).join(', ')}
          </span>
        )}
        {row.issues.length > 0 && (
          <ul className="im-issues">
            {row.issues.map((issue, i) => (
              <li key={i} className={`is-${issue.severity}`}>
                {issueText(issue, t)}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="im-cell-act">
        {severity !== 'reject' && (
          <button type="button" className="im-toggle" onClick={onToggle}>
            {t(row.skipped ? 'importChartModal.preview.include' : 'importChartModal.preview.exclude')}
          </button>
        )}
      </td>
    </tr>
  );
}

// Re-exported only so the fixed-width sample and the parser cannot drift apart
// on how a line is cut; the modal itself renders whole lines.
export { sliceFixed };
