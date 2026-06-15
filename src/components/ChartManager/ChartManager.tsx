// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartRecency,
  chartTag,
  displayName,
  type ChartTag,
  type StoredChart,
} from '../../lib/chartLibrary';
import { BirthDataFields } from '../BirthDataForm/BirthDataForm';
import { TipButton } from '../ui/HoverTip';
import { TagIcon } from '../ui/TagIcon';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import './ChartManager.css';

function fmtBirth(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthAbbr(c.month)} ${c.year}`;
}

// The tag-filter chips shown under the search box; 'all' clears the filter.
const FILTER_CHIPS = [
  { value: 'all', labelKey: 'chartManager.filter.all' },
  { value: 'star', labelKey: 'chartManager.filter.starred' },
  { value: 'space', labelKey: 'chartManager.filter.space' },
] as const;

interface ChartManagerProps {
  charts: StoredChart[];
  currentId: string | null;
  /** When set, opens with this chart loaded in the form for editing. */
  initialEditId?: string | null;
  /** Select-only ("pick a chart") mode: hide the add/edit form pane, the "Add <query>"
   *  row and the per-row edit/delete actions — leaving just search + the list to choose
   *  from (used by the synastry partner picker). */
  selectOnly?: boolean;
  /** A chart id to omit from the list — e.g. the active chart, which can't be its own
   *  synastry partner. */
  excludeId?: string | null;
  /** Make a chart the active one — or, in selectOnly mode, the picked chart (the
   *  manager then closes). */
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
  selectOnly = false,
  excludeId = null,
  onSelect,
  onSave,
  onDelete,
  onImport,
  onClose,
}: ChartManagerProps) {
  const { t, fmt } = useT();
  const [query, setQuery] = useState('');
  // Tag filter for the list; 'all' shows everything. Independent of the search box.
  const [tagFilter, setTagFilter] = useState<'all' | ChartTag>('all');
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
    let result = [...charts].sort((a, b) => chartRecency(b) - chartRecency(a));
    if (excludeId) result = result.filter((c) => c.id !== excludeId);
    if (tagFilter !== 'all')
      result = result.filter((c) => chartTag(c) === tagFilter);
    if (q)
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.birthplace.label.toLowerCase().includes(q),
      );
    return result;
  }, [charts, q, tagFilter, excludeId]);

  // Offer "Add <query>" unless the query already names an existing chart exactly — and
  // never in selectOnly mode (no form to add into).
  const exactNameExists = useMemo(
    () => charts.some((c) => c.name.trim().toLowerCase() === q),
    [charts, q],
  );
  const showAddRow = !selectOnly && q !== '' && !exactNameExists;
  // The Space filter chip appears only once at least one chart carries that (system) tag.
  const hasSpace = useMemo(
    () => charts.some((c) => chartTag(c) === 'space'),
    [charts],
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
    if (!confirm(t('chartManager.deleteConfirm', { name: c.name }))) return;
    onDelete(c.id);
    if (editing?.id === c.id) editNew('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`chart-manager${selectOnly ? ' select-only' : ''}`}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('chartManager.dialogLabel')}
      >
        <header className="cm-header">
          <h2>{t('chartManager.title')}</h2>
          <button
            type="button"
            className="cm-close"
            onClick={onClose}
            aria-label={t('common.close')}
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
                placeholder={t('chartManager.searchPlaceholder')}
                autoFocus
                aria-label={t('chartManager.searchLabel')}
              />
              {query && (
                <button
                  type="button"
                  className="cm-search-clear"
                  onClick={() => setQuery('')}
                  aria-label={t('chartManager.clearSearch')}
                >
                  ×
                </button>
              )}
            </div>

            <div
              className="cm-filter-row"
              role="group"
              aria-label={t('chartManager.filter.label')}
            >
              {FILTER_CHIPS.filter(
                (c) => c.value !== 'space' || hasSpace,
              ).map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  className="cm-filter-chip"
                  aria-pressed={tagFilter === value}
                  onClick={() =>
                    setTagFilter((prev) => (prev === value ? 'all' : value))
                  }
                >
                  {value !== 'all' && <TagIcon tag={value} />}
                  {t(labelKey)}
                </button>
              ))}
            </div>

            <div className="cm-list-scroll">
            <ul className="cm-list" ref={listRef}>
              {matches.length === 0 && !showAddRow && (
                <li className="cm-list-empty">
                  {charts.length === 0
                    ? t('chartManager.empty')
                    : t('chartManager.noMatches')}
                </li>
              )}
              {showAddRow && (
                <li>
                  <button
                    type="button"
                    className="cm-add-row"
                    onClick={() => editNew(query.trim())}
                  >
                    <span className="cm-add-plus">＋</span>
                    {t('chartManager.addQuery', { name: query.trim() })}
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
                  >
                    <span className="cm-row-name">
                      <TagIcon tag={chartTag(c)} className="tag-icon" />
                      {/* In selectOnly (pick) mode there's no edit/delete column, so let
                          the name fill the row — .cm-row-name's max-width:100% + ellipsis
                          clamps it dynamically instead of the shorter 25-char cap. */}
                      {selectOnly ? c.name : displayName(c.name)}
                    </span>
                    <span className="cm-row-meta">
                      {fmtBirth(c, fmt)} · {c.birthplace.label.split(',')[0]}
                    </span>
                  </button>
                  {!selectOnly && (
                    <div className="cm-row-actions">
                      <TipButton
                        type="button"
                        className="cm-act"
                        onClick={() => editExisting(c)}
                        placement="top"
                        tip={t('common.edit')}
                      >
                        ✎
                      </TipButton>
                      <TipButton
                        type="button"
                        className="cm-act danger"
                        onClick={() => handleDelete(c)}
                        placement="top"
                        tip={t('common.delete')}
                      >
                        ×
                      </TipButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {/* Hint that more names lie below; fades out at the end of the scroll. */}
            <div ref={fadeRef} className="cm-list-fade" aria-hidden="true" />
            </div>
          </div>

          {/* Right: add / edit the birth details. Omitted in selectOnly (pick) mode. */}
          {!selectOnly && (
          <div className="cm-form-pane">
            {editing && (
              <div className="cm-form-head">
                {t('chartManager.editingHeader', {
                  name: displayName(editing.name),
                })}
              </div>
            )}
            <BirthDataFields
              key={formKey}
              initial={editing}
              nameSeed={editing ? undefined : seed}
              submitLabel={
                editing
                  ? t('chartManager.saveChanges')
                  : t('chartManager.addChart')
              }
              onSubmit={handleSave}
              onImport={editing ? undefined : onImport}
            />
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
