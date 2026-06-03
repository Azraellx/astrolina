import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartRecency,
  displayName,
  type StoredChart,
} from '../../lib/chartLibrary';
import { BirthDataFields } from '../BirthDataForm/BirthDataForm';
import './ChartManager.css';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function fmtBirth(c: StoredChart): string {
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
}

interface ChartManagerProps {
  charts: StoredChart[];
  currentId: string | null;
  /** When set, opens with this chart loaded in the form for editing. */
  initialEditId?: string | null;
  /** Make a chart the active one (the manager then closes). */
  onSelect: (id: string) => void;
  /** Create a new chart or save an edited one (the manager then closes). */
  onSave: (chart: StoredChart) => void;
  onDelete: (id: string) => void;
  /** Open the import flow (the manager then closes). */
  onImport: () => void;
  onClose: () => void;
}

/**
 * One view for everything about charts: search/browse on the left (handles
 * hundreds of saved names with a live filter), add or edit on the right. Replaces
 * the old switcher-dropdown + separate add/edit modal. The chart switcher's
 * "Search + Add Name" button opens it; the ✎ action opens it on a specific chart.
 */
export function ChartManager({
  charts,
  currentId,
  initialEditId,
  onSelect,
  onSave,
  onDelete,
  onImport,
  onClose,
}: ChartManagerProps) {
  const [query, setQuery] = useState('');
  // The chart loaded in the right-hand form (null = adding a new one).
  const [editing, setEditing] = useState<StoredChart | null>(
    () => charts.find((c) => c.id === initialEditId) ?? null,
  );
  // Name carried into a new chart from the search box ("Add <query>").
  const [seed, setSeed] = useState('');
  // Bumped to remount the form (re-seeding its fields) when the target switches.
  const [formKey, setFormKey] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Show the bottom fade only while the list can still scroll down. We write the
  // fade's opacity straight to the DOM (no state) so scroll events don't re-render,
  // and watch scroll + size + row add/remove. The full list scrolls — no cap.
  useEffect(() => {
    const el = listRef.current;
    const fade = fadeRef.current;
    if (!el || !fade) return;
    const update = () => {
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
      fade.style.opacity = more ? '1' : '0';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const sorted = [...charts].sort((a, b) => chartRecency(b) - chartRecency(a));
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.birthplace.label.toLowerCase().includes(q),
    );
  }, [charts, q]);

  // Offer "Add <query>" unless the query already names an existing chart exactly.
  const exactNameExists = useMemo(
    () => charts.some((c) => c.name.trim().toLowerCase() === q),
    [charts, q],
  );

  const editNew = (name: string) => {
    setEditing(null);
    setSeed(name);
    setFormKey((k) => k + 1);
  };
  const editExisting = (c: StoredChart) => {
    setEditing(c);
    setSeed('');
    setFormKey((k) => k + 1);
  };

  const handleSave = (chart: StoredChart) => {
    onSave(chart);
  };

  const handleDelete = (c: StoredChart) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    onDelete(c.id);
    if (editing?.id === c.id) editNew('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="chart-manager"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Charts"
      >
        <header className="cm-header">
          <h2>Charts</h2>
          <button
            type="button"
            className="cm-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="cm-body">
          {/* Left: search + the saved-chart list (recent first). */}
          <div className="cm-list-pane">
            <div className="cm-search">
              <svg
                className="cm-search-icon"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="cm-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names or places…"
                autoFocus
                aria-label="Search charts"
              />
              {query && (
                <button
                  type="button"
                  className="cm-search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="cm-list-scroll">
            <ul className="cm-list" ref={listRef}>
              {matches.length === 0 && !query && (
                <li className="cm-list-empty">No saved charts yet.</li>
              )}
              {q && !exactNameExists && (
                <li>
                  <button
                    type="button"
                    className="cm-add-row"
                    onClick={() => editNew(query.trim())}
                  >
                    <span className="cm-add-plus">＋</span>
                    Add “{query.trim()}”
                  </button>
                </li>
              )}
              {matches.map((c) => (
                <li
                  key={c.id}
                  className={[
                    c.id === currentId ? 'current' : '',
                    c.id === editing?.id ? 'editing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="cm-row"
                    onClick={() => onSelect(c.id)}
                    title={`Use ${c.name}`}
                  >
                    <span className="cm-row-name">{displayName(c.name)}</span>
                    <span className="cm-row-meta">
                      {fmtBirth(c)} · {c.birthplace.label.split(',')[0]}
                    </span>
                  </button>
                  <div className="cm-row-actions">
                    <button
                      type="button"
                      className="cm-act"
                      onClick={() => editExisting(c)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="cm-act danger"
                      onClick={() => handleDelete(c)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {/* Hint that more names lie below; fades out at the end of the scroll. */}
            <div ref={fadeRef} className="cm-list-fade" aria-hidden="true" />
            </div>
          </div>

          {/* Right: add / edit the birth details. */}
          <div className="cm-form-pane">
            {editing && (
              <div className="cm-form-head" title={editing.name}>
                Editing {displayName(editing.name)}
              </div>
            )}
            <BirthDataFields
              key={formKey}
              initial={editing}
              nameSeed={editing ? undefined : seed}
              submitLabel={editing ? 'Save changes' : 'Add chart'}
              onSubmit={handleSave}
              onImport={editing ? undefined : onImport}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
