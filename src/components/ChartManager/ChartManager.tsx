// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  chartRecency,
  chartTag,
  displayName,
  type ChartTag,
  type StoredChart,
} from '../../lib/chartLibrary';
import {
  buildFolderTree,
  chartFolder,
  declareFolder,
  deleteFolder,
  flattenFolders,
  folderDepth,
  folderName,
  isValidFolderName,
  joinFolder,
  loadDeclaredFolders,
  loadOpenFolders,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  moveCharts,
  normalizeFolderPath,
  parentPath,
  renameFolder,
  setFolderOpen,
  undeclareFolder,
  UNFILED,
  type FolderNode,
} from '../../lib/chartFolders';
import { timeUnknown } from '../../lib/birthData';
import { setDiscreet, useIdentity } from '../../lib/discreet';
import { BirthDataFields } from '../BirthDataForm/BirthDataForm';
import { TipButton } from '../ui/HoverTip';
import { SpyIcon } from '../ui/SpyIcon';
import { TagIcon } from '../ui/TagIcon';
import { getChartsSection } from '../../lib/extensions/chartsSection';
import { useTouchLayout } from '../../lib/touch';
import { useT } from '../../i18n';
import type { Formatters } from '../../i18n';
import './ChartManager.css';

function fmtBirth(c: StoredChart, fmt: Formatters): string {
  return `${c.day} ${fmt.monthAbbr(c.month)} ${c.year}`;
}

// The tag-filter chips shown under the search box; 'all' clears the filter.
// 'unknown' filters by the DERIVED time-unknown mark (timeKnown === false), not
// the stored tag — a chart can be starred AND time-unknown.
const FILTER_CHIPS = [
  { value: 'all', labelKey: 'chartManager.filter.all' },
  { value: 'star', labelKey: 'chartManager.filter.starred' },
  { value: 'space', labelKey: 'chartManager.filter.space' },
  { value: 'unknown', labelKey: 'chartManager.filter.unknown' },
  { value: 'shared', labelKey: 'chartManager.filter.shared' },
] as const;

/** How close to an edge of the list a drag has to be before it scrolls, and how
 *  fast at the very edge (pixels per frame). Generous on purpose: the point is
 *  to be reachable while holding something, not to be precise. */
const EDGE_ZONE = 52;
const EDGE_SPEED = 11;

/** One rendered line of the list: a folder heading, or a chart under one. */
type ListItem =
  | { kind: 'folder'; node: FolderNode }
  | { kind: 'chart'; chart: StoredChart; depth: number; crumb?: string };

interface ChartManagerProps {
  charts: StoredChart[];
  currentId: string | null;
  /** Header + dialog label override (e.g. "Synastry with X" when the synastry
   *  overlay opens the browser to pick a partner). Used as the accessible label;
   *  defaults to "My Charts". */
  title?: string;
  /** Optional rich heading shown in place of the `title` text (e.g. a synastry
   *  icon + the compared chart's name). `title` is still the accessible label. */
  heading?: ReactNode;
  /** When set, opens with this chart loaded in the form for editing. */
  initialEditId?: string | null;
  /** A chart id to omit from the list — e.g. the active chart, which can't be its own
   *  synastry partner. */
  excludeId?: string | null;
  /** Make a chart the active one — or, from the synastry picker, the comparison
   *  partner (App decides). The manager then closes. */
  onSelect: (id: string) => void;
  /** Create a new chart or save an edited one (the manager then closes). */
  onSave: (chart: StoredChart) => void;
  /**
   * Save several charts at once, without closing.
   *
   * Filing is a bulk operation — renaming a folder rewrites every chart under
   * it — and doing that one save at a time would be one render and one write
   * per chart. Folder edits go through here; single-chart edits still use
   * onSave.
   */
  onSaveMany: (charts: StoredChart[]) => void;
  onDelete: (id: string) => void;
  /** Open the import flow (the manager then closes). */
  onImport: () => void;
  onClose: () => void;
}

/**
 * One view for everything about charts: search/browse on the left (handles
 * hundreds of saved names, in folders, with a live filter), add or edit on the
 * right. The chart switcher's "Search + Add Name" button opens it; the ✎ action
 * opens it on a specific chart.
 */
export function ChartManager({
  charts,
  currentId,
  title,
  heading,
  initialEditId,
  excludeId = null,
  onSelect,
  onSave,
  onSaveMany,
  onDelete,
  onImport,
  onClose,
}: ChartManagerProps) {
  const { t, fmt } = useT();
  // On touch, don't autofocus the search box: it forces the keyboard up the moment My Charts
  // opens, but the user is usually tapping an existing name or the "add" button, not searching.
  // Desktop keeps the autofocus — a focused search box there is quick, non-intrusive access.
  const touch = useTouchLayout();
  const id = useIdentity();
  const [query, setQuery] = useState('');
  // Tag filter for the list; 'all' shows everything. Independent of the search box.
  const [tagFilter, setTagFilter] = useState<'all' | ChartTag | 'unknown'>('all');
  // The chart loaded in the right-hand form (null = adding a new one).
  const [editing, setEditing] = useState<StoredChart | null>(
    () => charts.find((c) => c.id === initialEditId) ?? null,
  );
  // Name carried into a new chart from the search box ("Add <query>").
  const [seed, setSeed] = useState('');
  // Bumped to remount the form (re-seeding its fields) when the target switches.
  const [formKey, setFormKey] = useState(0);

  // ── Folder state ──────────────────────────────────────────────────────────
  // Which folders are open, and which exist while still empty. Both are
  // per-device view state rather than anything the charts carry.
  const [openFolders, setOpenFolders] = useState<string[]>(() => loadOpenFolders());
  const [declared, setDeclared] = useState<string[]>(() => loadDeclaredFolders());
  // The folder a new chart lands in, and the target of "new subfolder".
  const [activeFolder, setActiveFolder] = useState<string>(UNFILED);
  // The folder being renamed, or '' while creating one under `newFolderParent`.
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  // The chart currently under the pointer's finger, and the one that just
  // landed somewhere — the first dims at its old place, the second pops in at
  // its new one, so a move is something you watch rather than infer.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  // Right-click, desktop only (a long-press menu would fight the scroll). A
  // chart offers somewhere to put it; a folder offers a folder inside it.
  const [ctxMenu, setCtxMenu] = useState<
    | { kind: 'chart'; id: string; x: number; y: number }
    | { kind: 'folder'; path: string; x: number; y: number }
    | null
  >(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (renamingPath !== null || newFolderParent !== null) folderInputRef.current?.focus();
  }, [renamingPath, newFolderParent]);

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
  const filtering = q !== '' || tagFilter !== 'all';

  const visible = useMemo(() => {
    let result = [...charts].sort((a, b) => chartRecency(b) - chartRecency(a));
    if (excludeId) result = result.filter((c) => c.id !== excludeId);
    if (tagFilter === 'unknown') result = result.filter((c) => timeUnknown(c));
    else if (tagFilter !== 'all') result = result.filter((c) => chartTag(c) === tagFilter);
    if (q)
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.birthplace.label.toLowerCase().includes(q) ||
          chartFolder(c).toLowerCase().includes(q),
      );
    return result;
  }, [charts, q, tagFilter, excludeId]);

  const tree = useMemo(() => buildFolderTree(visible, declared), [visible, declared]);
  const allFolderPaths = useMemo(
    () => flattenFolders(buildFolderTree(charts, declared)).map((n) => n.path),
    [charts, declared],
  );
  const isOpen = (path: string) => openFolders.includes(path);

  /**
   * The list, flattened for rendering.
   *
   * While a search or a tag filter is on, folders step out of the way: results
   * come back flat with a folder crumb on each, because someone searching wants
   * the person, not the drawer they are in. With no filter, the tree stands.
   */
  const items = useMemo((): ListItem[] => {
    if (filtering) {
      return visible.map((c) => ({
        kind: 'chart' as const,
        chart: c,
        depth: 0,
        crumb: chartFolder(c) || undefined,
      }));
    }

    const out: ListItem[] = [];
    const byFolder = new Map<string, StoredChart[]>();
    for (const c of visible) {
      const path = chartFolder(c);
      const list = byFolder.get(path) ?? [];
      list.push(c);
      byFolder.set(path, list);
    }

    const walk = (nodes: readonly FolderNode[]) => {
      for (const node of nodes) {
        out.push({ kind: 'folder', node });
        if (!openFolders.includes(node.path)) continue;
        walk(node.children);
        for (const c of byFolder.get(node.path) ?? []) {
          out.push({ kind: 'chart', chart: c, depth: node.depth });
        }
      }
    };
    walk(tree);

    // Unfiled charts are simply listed, with no heading of their own. They are
    // the ones you have not sorted yet, which is exactly when you most want to
    // see them — putting them behind a collapsed heading hides the pile that
    // needs the attention.
    for (const c of byFolder.get(UNFILED) ?? []) {
      out.push({ kind: 'chart', chart: c, depth: 0 });
    }
    return out;
  }, [filtering, visible, tree, openFolders]);

  // Offer "Add <query>" unless the query already names an existing chart exactly.
  const exactNameExists = useMemo(
    () => charts.some((c) => c.name.trim().toLowerCase() === q),
    [charts, q],
  );
  const showAddRow = q !== '' && !exactNameExists;
  // The Space / Unknown / Shared filter chips appear only once at least one chart
  // carries that (system) mark — nobody filters by a mark none of their charts have.
  const hasSpace = useMemo(() => charts.some((c) => chartTag(c) === 'space'), [charts]);
  const hasUnknown = useMemo(() => charts.some((c) => timeUnknown(c)), [charts]);
  const hasShared = useMemo(() => charts.some((c) => chartTag(c) === 'shared'), [charts]);

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

  // The row whose delete is mid-confirm (its icons swapped for Delete/Keep) —
  // the inline two-step that replaced the native confirm() dialog.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const handleDelete = (c: StoredChart) => {
    setConfirmId(null);
    onDelete(c.id);
    if (editing?.id === c.id) editNew('');
  };

  // ── Folder actions ────────────────────────────────────────────────────────

  const toggleFolder = (path: string) => {
    const next = !isOpen(path);
    setOpenFolders(setFolderOpen(path, next));
  };

  const startNewFolder = (parent: string) => {
    setRenamingPath(null);
    setNewFolderParent(parent);
    setFolderDraft('');
  };

  const startRename = (path: string) => {
    setNewFolderParent(null);
    setRenamingPath(path);
    setFolderDraft(path.split('/').pop() ?? '');
  };

  const cancelFolderEdit = () => {
    setRenamingPath(null);
    setNewFolderParent(null);
    setFolderDraft('');
  };

  const commitFolderEdit = () => {
    const name = folderDraft.trim();
    if (!isValidFolderName(name)) return cancelFolderEdit();

    if (newFolderParent !== null) {
      const path = joinFolder(newFolderParent, name);
      setDeclared(declareFolder(path));
      setOpenFolders(setFolderOpen(newFolderParent, true));
      setActiveFolder(path);
    } else if (renamingPath !== null) {
      const to = joinFolder(parentPath(renamingPath), name);
      if (to !== renamingPath) {
        const changed = renameFolder(charts, renamingPath, to);
        if (changed.length) onSaveMany(changed);
        undeclareFolder(renamingPath);
        setDeclared(declareFolder(to));
        setOpenFolders(setFolderOpen(to, isOpen(renamingPath)));
        if (activeFolder === renamingPath) setActiveFolder(to);
      }
    }
    cancelFolderEdit();
  };

  const removeFolder = (path: string) => {
    const changed = deleteFolder(charts, path);
    if (changed.length) onSaveMany(changed);
    setDeclared(undeclareFolder(path));
    if (activeFolder === path) setActiveFolder(parentPath(path));
    setConfirmFolder(null);
  };

  const [confirmFolder, setConfirmFolder] = useState<string | null>(null);

  const dropOnto = (path: string, chartId: string) => {
    setDragOverPath(null);
    stopEdgeScroll();
    if (!chartId) return;
    const changed = moveCharts(charts, [chartId], path);
    if (!changed.length) return;
    onSaveMany(changed);
    // Open the destination, or the chart would vanish into a shut folder and
    // read as deleted rather than moved.
    if (path) setOpenFolders(setFolderOpen(path, true));
    setLandedId(chartId);
  };

  // Clear the landed mark once its animation has played, so the row does not
  // pop again on the next unrelated render.
  useEffect(() => {
    if (!landedId) return;
    const id = setTimeout(() => setLandedId(null), 600);
    return () => clearTimeout(id);
  }, [landedId]);

  // ── Scrolling while dragging ──────────────────────────────────────────────
  // A native drag does not scroll a custom container reliably, so a chart bound
  // for a folder off-screen would be unreachable. Holding near either edge
  // scrolls, faster the closer to the edge, which also gives a shaky hand room
  // to hover without the list jumping away.
  const edgeScroll = useRef<number | null>(null);
  const stopEdgeScroll = () => {
    if (edgeScroll.current != null) cancelAnimationFrame(edgeScroll.current);
    edgeScroll.current = null;
  };
  const edgeScrollFrom = (clientY: number) => {
    const el = listRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const into = Math.max(EDGE_ZONE - (clientY - box.top), EDGE_ZONE - (box.bottom - clientY), 0);
    const up = clientY - box.top < EDGE_ZONE;
    if (into <= 0) {
      stopEdgeScroll();
      return;
    }
    const step = (into / EDGE_ZONE) * EDGE_SPEED * (up ? -1 : 1);
    stopEdgeScroll();
    const tick = () => {
      el.scrollTop += step;
      edgeScroll.current = requestAnimationFrame(tick);
    };
    edgeScroll.current = requestAnimationFrame(tick);
  };
  useEffect(() => stopEdgeScroll, []);

  const folderEditor = (
    <div className="cm-folder-editor">
      <input
        ref={folderInputRef}
        type="text"
        value={folderDraft}
        maxLength={MAX_FOLDER_NAME}
        onChange={(e) => setFolderDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitFolderEdit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelFolderEdit();
          }
        }}
        onBlur={commitFolderEdit}
        placeholder={t('chartManager.folders.namePlaceholder')}
        aria-label={t('chartManager.folders.nameLabel')}
      />
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="chart-manager"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title ?? t('chartManager.dialogLabel')}
      >
        <header className="cm-header">
          <div className="cm-title">
            <h2>{heading ?? title ?? t('chartManager.title')}</h2>
            {/* Optional downstream adornment (e.g. a sync-status badge), only on the default
                "My Charts" view — not when a custom title/heading (synastry picker) is shown. */}
            {!heading && !title && getChartsSection().renderHeaderStatus?.()}
          </div>
          <div className="cm-header-actions">
            {/* Blanks every name, date and place on screen without touching the
                map. Here because this is the screen most worth blanking. */}
            <TipButton
              type="button"
              className={`cm-discreet ${id.on ? 'is-on' : ''}`}
              onClick={() => setDiscreet(!id.on)}
              placement="bottom"
              aria-pressed={id.on}
              tip={t(id.on ? 'chartManager.discreet.show' : 'chartManager.discreet.hide')}
              // The key works everywhere, not just here, so the chip is worth
              // showing on the button that teaches the mode exists. It hides
              // itself on a touch device with no keyboard (see HoverTip.css).
              hotkey="P"
            >
              <SpyIcon />
            </TipButton>
            <button
              type="button"
              className="cm-close"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>
        </header>

        <div className="cm-body">
          {/* Left: search + the saved-chart list, in folders. */}
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
                onChange={(e) => {
                  setQuery(e.target.value);
                  setConfirmId(null);
                }}
                placeholder={t('chartManager.searchPlaceholder')}
                autoFocus={!touch}
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

            <div className="cm-filter-row" role="group" aria-label={t('chartManager.filter.label')}>
              {FILTER_CHIPS.filter(
                (c) =>
                  (c.value !== 'space' || hasSpace) &&
                  (c.value !== 'unknown' || hasUnknown) &&
                  (c.value !== 'shared' || hasShared),
              ).map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  className="cm-filter-chip"
                  aria-pressed={tagFilter === value}
                  onClick={() => setTagFilter((prev) => (prev === value ? 'all' : value))}
                >
                  {value !== 'all' && <TagIcon tag={value} />}
                  {t(labelKey)}
                </button>
              ))}
              <TipButton
                type="button"
                className="cm-new-folder"
                onClick={() => startNewFolder(UNFILED)}
                placement="top"
                tip={t('chartManager.folders.new')}
              >
                <FolderPlusIcon />
              </TipButton>
            </div>

            <div
              className="cm-list-scroll"
              // The whole scroll area watches the drag, not just the drop
              // targets, so the list keeps scrolling while the pointer is over
              // a gap between rows.
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                edgeScrollFrom(e.clientY);
              }}
              // dragleave bubbles from every row the pointer crosses, so only
              // a departure from the scroll area ITSELF should stop the scroll
              // — otherwise it stutters to a halt on each row boundary.
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stopEdgeScroll();
              }}
              onDrop={stopEdgeScroll}
            >
              <ul className="cm-list" ref={listRef}>
                {items.length === 0 && !showAddRow && newFolderParent === null && (
                  <li className="cm-list-empty">
                    {charts.length === 0 ? t('chartManager.empty') : t('chartManager.noMatches')}
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

                {items.map((item) => {
                  if (item.kind === 'folder') {
                    const { node } = item;
                    return (
                      <Fragment key={`f:${node.path}`}>
                      <li
                        className={[
                          'cm-folder-li',
                          activeFolder === node.path ? 'active' : '',
                          dragOverPath === node.path ? 'drag-over' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ '--depth': node.depth - 1 } as CSSProperties}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverPath(node.path);
                        }}
                        onDragLeave={() => setDragOverPath(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          dropOnto(node.path, e.dataTransfer.getData('text/plain'));
                        }}
                        // Right-click a folder to make one inside it, without
                        // having to find the ＋ that only appears on hover.
                        onContextMenu={
                          touch
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                setCtxMenu({
                                  kind: 'folder',
                                  path: node.path,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }
                        }
                      >
                        {renamingPath === node.path ? (
                          folderEditor
                        ) : (
                          <>
                            <button
                              type="button"
                              className="cm-folder-row"
                              onClick={() => {
                                toggleFolder(node.path);
                                setActiveFolder(node.path);
                              }}
                              aria-expanded={isOpen(node.path)}
                            >
                              <Caret open={isOpen(node.path)} />
                              <span className="cm-folder-name">{id.text(node.name)}</span>
                              <span className="cm-folder-count">({node.totalCount})</span>
                            </button>
                            {confirmFolder === node.path ? (
                              <div className="cm-row-actions is-confirm">
                                <button
                                  type="button"
                                  className="cm-row-confirm"
                                  onClick={() => removeFolder(node.path)}
                                >
                                  {t('chartManager.folders.remove')}
                                </button>
                                <button
                                  type="button"
                                  className="cm-row-keep"
                                  onClick={() => setConfirmFolder(null)}
                                >
                                  {t('common.keep')}
                                </button>
                              </div>
                            ) : (
                              <div className="cm-row-actions">
                                {node.depth < MAX_FOLDER_DEPTH && (
                                  <TipButton
                                    type="button"
                                    className="cm-act"
                                    onClick={() => startNewFolder(node.path)}
                                    placement="top"
                                    tip={t('chartManager.folders.newChild')}
                                  >
                                    <FolderPlusIcon size={12} />
                                  </TipButton>
                                )}
                                <TipButton
                                  type="button"
                                  className="cm-act"
                                  onClick={() => startRename(node.path)}
                                  placement="top"
                                  tip={t('chartManager.folders.rename')}
                                >
                                  <PencilIcon />
                                </TipButton>
                                <TipButton
                                  type="button"
                                  className="cm-act danger"
                                  onClick={() => setConfirmFolder(node.path)}
                                  placement="top"
                                  tip={t('chartManager.folders.remove')}
                                >
                                  <CrossIcon />
                                </TipButton>
                              </div>
                            )}
                          </>
                        )}
                      </li>
                      {/* Naming a subfolder gets a row of its own, one level in
                          — the same full width renaming gets. Sharing the
                          parent's row left the input squeezed between the
                          folder name and its actions, too narrow to read what
                          you were typing. */}
                      {newFolderParent === node.path && (
                        <li
                          className="cm-folder-li"
                          style={{ '--depth': node.depth } as CSSProperties}
                        >
                          {folderEditor}
                        </li>
                      )}
                      </Fragment>
                    );
                  }

                  const c = item.chart;
                  return (
                    <li
                      key={c.id}
                      className={[
                        c.id === currentId ? 'current' : '',
                        c.id === editing?.id ? 'editing' : '',
                        'cm-chart-li',
                        c.id === draggingId ? 'is-dragging' : '',
                        c.id === landedId ? 'has-landed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ '--depth': item.depth } as CSSProperties}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', c.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingId(c.id);
                        setConfirmId(null);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverPath(null);
                        stopEdgeScroll();
                      }}
                      // Right-click files a chart without dragging it anywhere
                      // — quicker when the destination is off-screen, and the
                      // only route at all for anyone who cannot drag. Touch
                      // keeps its context menu; a long-press menu here would
                      // fight scrolling the list.
                      onContextMenu={
                        touch
                          ? undefined
                          : (e) => {
                              e.preventDefault();
                              setCtxMenu({ kind: 'chart', id: c.id, x: e.clientX, y: e.clientY });
                            }
                      }
                    >
                      <button type="button" className="cm-row" onClick={() => onSelect(c.id)}>
                        <span className="cm-row-name">
                          <TagIcon tag={chartTag(c)} className="tag-icon" />
                          {timeUnknown(c) && <TagIcon tag="unknown" className="tag-icon" />}
                          {id.on ? id.name(c.name) : displayName(c.name)}
                        </span>
                        <span className="cm-row-meta">
                          {id.date(fmtBirth(c, fmt))} ·{' '}
                          {id.text(c.birthplace.label.split(',')[0])}
                          {item.crumb && (
                            <span className="cm-row-crumb"> · {id.text(item.crumb)}</span>
                          )}
                        </span>
                      </button>
                      {/* In-row actions, inside the same row pill (the li carries
                          the hover surface). The × arms an inline Delete/Keep
                          confirm — no native dialog. */}
                      {confirmId === c.id ? (
                        <div className="cm-row-actions is-confirm">
                          <button
                            type="button"
                            className="cm-row-confirm"
                            onClick={() => handleDelete(c)}
                          >
                            {t('common.delete')}
                          </button>
                          <button
                            type="button"
                            className="cm-row-keep"
                            onClick={() => setConfirmId(null)}
                          >
                            {t('common.keep')}
                          </button>
                        </div>
                      ) : (
                        <div className="cm-row-actions">
                          <TipButton
                            type="button"
                            className="cm-act"
                            onClick={() => editExisting(c)}
                            placement="top"
                            tip={t('common.edit')}
                          >
                            <PencilIcon />
                          </TipButton>
                          <TipButton
                            type="button"
                            className="cm-act danger"
                            onClick={() => setConfirmId(c.id)}
                            placement="top"
                            tip={t('common.delete')}
                          >
                            <CrossIcon />
                          </TipButton>
                        </div>
                      )}
                    </li>
                  );
                })}

                {/* A brand-new top-level folder is typed at the end of the list. */}
                {newFolderParent === UNFILED && <li className="cm-folder-li">{folderEditor}</li>}
              </ul>
              {/* Hint that more names lie below; fades out at the end of the scroll. */}
              <div ref={fadeRef} className="cm-list-fade" aria-hidden="true" />
            </div>
          </div>

          {/* Right-click. Deliberately plain: a chart offers the folders that
              exist plus a new one; a folder offers one inside it. Anything more
              belongs in the chart form, which is a click further on and has
              room for it. */}
          {ctxMenu?.kind === 'chart' && (
            <ContextMenu at={ctxMenu} onClose={() => setCtxMenu(null)}>
              <MoveMenuBody
                current={(() => {
                  const c = charts.find((x) => x.id === ctxMenu.id);
                  return c ? chartFolder(c) : UNFILED;
                })()}
                folders={allFolderPaths}
                label={t('chartManager.folders.moveTo')}
                unfiledLabel={t('chartManager.folders.unfiled')}
                newLabel={t('chartManager.folders.new')}
                newPlaceholder={t('chartManager.folders.namePlaceholder')}
                onPick={(path) => {
                  dropOnto(path, ctxMenu.id);
                  setCtxMenu(null);
                }}
              />
            </ContextMenu>
          )}
          {ctxMenu?.kind === 'folder' && (
            <ContextMenu at={ctxMenu} onClose={() => setCtxMenu(null)}>
              <div className="cm-move-head">{id.text(folderName(ctxMenu.path))}</div>
              <button
                type="button"
                className="cm-move-item is-new"
                disabled={folderDepth(ctxMenu.path) >= MAX_FOLDER_DEPTH}
                onClick={() => {
                  startNewFolder(ctxMenu.path);
                  setOpenFolders(setFolderOpen(ctxMenu.path, true));
                  setCtxMenu(null);
                }}
              >
                ＋ {t('chartManager.folders.newChild')}
              </button>
            </ContextMenu>
          )}

          {/* Right: add / edit the birth details. */}
          <div className="cm-form-pane">
            {editing && (
              <div className="cm-form-head">
                {t('chartManager.editingHeader', {
                  name: id.on ? id.name(editing.name) : displayName(editing.name),
                })}
              </div>
            )}
            <BirthDataFields
              key={formKey}
              initial={editing}
              nameSeed={editing ? undefined : seed}
              folderOptions={allFolderPaths}
              folderSeed={editing ? undefined : activeFolder}
              submitLabel={editing ? t('chartManager.saveChanges') : t('chartManager.addChart')}
              onSubmit={handleSave}
              onImport={editing ? undefined : onImport}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The shell every right-click menu shares: positioned at the pointer, clamped
 * back inside the window — a right-click near the bottom edge would otherwise
 * open a menu nobody can reach — and dismissed on Escape or any press outside.
 *
 * Escape is caught in the CAPTURE phase and stopped there, so it closes the
 * menu without also closing the whole browser behind it.
 */
function ContextMenu({
  at,
  onClose,
  children,
}: {
  at: { x: number; y: number };
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8)),
    });
  }, [at.x, at.y]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  return (
    <div className="cm-move-menu" ref={ref} style={{ left: pos.left, top: pos.top }} role="menu">
      {children}
    </div>
  );
}

/**
 * Somewhere to put a chart: the folders that exist, plus one that does not yet.
 *
 * Making a folder from here matters more than it looks — filing a chart is
 * exactly the moment you discover you want a folder for it, and having to
 * abandon the gesture, make one elsewhere, and come back is how libraries end
 * up unsorted.
 */
function MoveMenuBody({
  current,
  folders,
  label,
  unfiledLabel,
  newLabel,
  newPlaceholder,
  onPick,
}: {
  current: string;
  folders: readonly string[];
  label: string;
  unfiledLabel: string;
  newLabel: string;
  newPlaceholder: string;
  onPick: (path: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const commit = () => {
    // A slash makes a subfolder, so the typed text is a PATH — validate the
    // last segment, which is the part actually being named.
    const path = normalizeFolderPath(draft);
    if (path && isValidFolderName(folderName(path))) onPick(path);
    else setCreating(false);
  };

  return (
    <>
      <div className="cm-move-head">{label}</div>
      <button
        type="button"
        className={`cm-move-item ${current ? '' : 'is-current'}`}
        onClick={() => onPick(UNFILED)}
      >
        {unfiledLabel}
      </button>
      {folders.map((path) => (
        <button
          key={path}
          type="button"
          className={`cm-move-item ${path === current ? 'is-current' : ''}`}
          style={{ '--depth': path.split('/').length - 1 } as CSSProperties}
          onClick={() => onPick(path)}
        >
          {folderName(path)}
        </button>
      ))}
      <div className="cm-move-new">
        {creating ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={MAX_FOLDER_NAME * MAX_FOLDER_DEPTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setCreating(false);
              }
            }}
            onBlur={commit}
            placeholder={newPlaceholder}
            aria-label={newLabel}
          />
        ) : (
          <button
            type="button"
            className="cm-move-item is-new"
            onClick={() => {
              setDraft(current ? `${current}/` : '');
              setCreating(true);
            }}
          >
            ＋ {newLabel}
          </button>
        )}
      </div>
    </>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`cm-caret ${open ? 'open' : ''}`}
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function FolderPlusIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

