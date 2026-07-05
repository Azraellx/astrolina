// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Capture" window (Tools ▸ Capture). Opening it arms the capture
// frame on the map (App sets mapTool='capture'); this window picks the frame's aspect
// ratio and which caption fields appear, then renders the framed view to a PNG —
// downloaded or copied to the clipboard — entirely client-side via captureFrame. The
// pin, edge labels and watermark are always included; the caption fields live in App
// (the Map reserves a footer band for the caption), so this window is a controlled view.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { captureExportGate } from '../../lib/captureGate';
import { getCaptureSink } from '../../lib/extensions/captureSink';
import { getMapOverlays, isOverlayEntitled } from '../../lib/extensions/mapOverlays';
import { useTouchLayout, usePhone } from '../../lib/touch';
import { useHoverTip } from '../ui/useHoverTip';
import { HoverTip } from '../ui/HoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { HudHeader } from '../ui/HudHeader';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles,
// so the window frosts/recolors with the theme for free; CaptureHud.css adds the rest.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import './CaptureHud.css';

// Its own saved position, independent of the other floating windows.
const POS_KEY = 'astro:capture-pos:v1';

// The capture-frame aspect presets (width / height). Kept as exact constants so the
// active-state comparison against App's stored ratio is a near-equality check.
const ASPECTS = [
  { key: 'square', ratio: 1 },
  { key: 'portrait', ratio: 4 / 5 },
  { key: 'landscape', ratio: 16 / 9 },
] as const;

export interface CaptionFields {
  name: boolean;
  date: boolean;
  time: boolean;
  location: boolean;
  calculations: boolean;
}
const CAPTION_KEYS = ['name', 'date', 'time', 'location', 'calculations'] as const;

// Whether this device/browser can share an image FILE via the OS share sheet (Web Share
// Level 2). Fully client-side — no upload, no server. True on iOS/Android and capable
// desktops (macOS Safari, Chrome on Win/ChromeOS); false elsewhere (we then hide the button).
function canShareImageFiles(): boolean {
  try {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function'
    )
      return false;
    const probe = new File([new Uint8Array(1)], 'astrolina.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}

function FilePlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// The circled-"i" shown IN PLACE of the wheel/list control on phones (where a phone-sized frame
// can't render either legibly): a tap/hover reveals a .ui-tip explaining the omission. tapReveal →
// a single tap shows it on touch (no long-press, which iOS would turn into a text-selection).
function DetailsInfo({ title, hint }: { title: string; hint: string }) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top', { tapReveal: true });
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="capture-hud-info"
        aria-label={title}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <InfoIcon />
      </button>
      <HoverTip pos={pos} placement="top" title={title} hint={hint} />
    </>
  );
}

// A button that reveals a shared .ui-tip (title + hint) on hover/focus — the same
// affordance the Local Space window uses for its segmented control and toggles.
function TipBtn({
  className,
  onClick,
  ariaPressed,
  ariaLabel,
  disabled,
  title,
  hint,
  advanced,
  gated,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  /** For icon-only buttons whose children carry no text — gives the button an accessible name. */
  ariaLabel?: string;
  disabled?: boolean;
  title: string;
  hint: string;
  /** Show the "ADV" tag on the tip headline — marks the action as Advanced-only. */
  advanced?: boolean;
  /** Show the gated-tier tag on the tip headline — marks a gated-rung control (lib/plan). */
  gated?: boolean;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={ariaPressed}
        aria-label={ariaLabel}
        disabled={disabled}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip pos={pos} placement="top" title={title} hint={hint} advanced={advanced} gated={gated} />
    </>
  );
}

interface CaptureHudProps {
  /** Close the tool entirely (exit Capture) — wired to the header's X. */
  onClose: () => void;
  /** Current capture-frame aspect ratio (width / height); drives the map's frame. */
  captureAspect: number;
  /** Pick an aspect preset (persisted by App). */
  setCaptureAspect: (ratio: number) => void;
  /** Controlled caption-field toggles (owned by App; the Map renders the caption band). */
  captionFields: CaptionFields;
  onToggleCaptionField: (key: keyof CaptionFields) => void;
  /** Controlled Details view (owned by App): none (no panel) / the wheel chart / the position
   *  list. 'none' is the default; picking wheel or list shows at least the planets. */
  view: 'none' | 'wheel' | 'list';
  onSetView: (view: 'none' | 'wheel' | 'list') => void;
  /** Controlled optional-group toggles (owned by App). Planets are the baseline of any view
   *  (no toggle); these add the chart angles and the element·modality balance on top. */
  extras: { angles: boolean; balance: boolean };
  onToggleExtra: (key: 'angles' | 'balance') => void;
  /** Registered-overlay ids currently hidden from captures (MapOverlay.captureToggle);
   *  owned by App, which withholds them from the map only while the tool is armed. */
  hiddenOverlays: ReadonlySet<string>;
  onToggleOverlay: (id: string) => void;
  /** The download / share filename (App derives it from the shown caption fields). */
  fileName: string;
  /** Composite + rasterise the framed view to a PNG Blob (MapHandle.captureFrame). */
  onCapture: () => Promise<Blob | null>;
  /** Build a shareable ?c= URL of the current chart + camera (lib/shareState) —
   *  read lazily on click so it always carries the freshest view. Null hides the
   *  "Copy link" button (e.g. a composite chart, which a link can't recast). */
  shareLink?: (() => string) | null;
}

export function CaptureHud({
  onClose,
  captureAspect,
  setCaptureAspect,
  captionFields,
  onToggleCaptionField,
  view,
  onSetView,
  extras,
  onToggleExtra,
  hiddenOverlays,
  onToggleOverlay,
  fileName,
  onCapture,
  shareLink,
}: CaptureHudProps) {
  const { t } = useT();
  // The header eye collapses the window to just its title bar (like the overlay nubs) to clear
  // screen clutter — WITHOUT exiting Capture (close it from the top nav / Esc). Local UI state.
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    initial: () => ({ x: Math.round(effectiveCenterX() - 130), y: 144 }),
  });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sinkDone, setSinkDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // Show the native Share button only on touch devices that can share image files — on
  // desktop the Download / Copy buttons cover it, so Share is just clutter there.
  const touchLayout = useTouchLayout();
  const [canShareFiles] = useState(canShareImageFiles);
  const supportsShare = touchLayout && canShareFiles;
  // Phones can't fit the wheel/list details in a phone-sized frame, so the picker is replaced by
  // an explanatory "i" and the view is forced to 'none' upstream (App passes view='none' here).
  const phone = usePhone();

  // Optional downstream gate (e.g. a build makes export an account-only feature). While the user is
  // locked the three actions divert to the gate's upsell (the account takeover, see divertIfLocked).
  // Whenever a gate is installed AT ALL, their tips carry the ADV tag — so export reads as advanced-
  // gated even once the user is entitled, matching the timeline/overlay toggles and the
  // sync badge. Ungated builds (open core) get null → no tag, export free, behaving as before.
  const exportGated = captureExportGate() != null;
  // Funnel every export through this first: if locked, run the gate's action and tell the caller
  // to stop. Reads the gate fresh so it can't go stale inside the memoised handlers.
  const divertIfLocked = useCallback(() => {
    const gate = captureExportGate();
    if (gate?.isLocked()) {
      gate.onLocked();
      return true;
    }
    return false;
  }, []);

  // Warm the html2canvas-pro chunk on open so the first capture is quick enough to stay
  // within the tap's transient activation — required for Web Share / clipboard on mobile.
  useEffect(() => {
    void import('html2canvas-pro').catch(() => {});
  }, []);

  const onDownload = useCallback(async () => {
    if (divertIfLocked()) return;
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setCopied(false);
    try {
      const blob = await onCapture();
      if (!blob) {
        setFailed(true);
        return;
      }
      downloadBlob(blob, fileName);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture, fileName, divertIfLocked]);

  const onCopy = useCallback(async () => {
    if (divertIfLocked()) return;
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setCopied(false);
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        // Hand ClipboardItem the capture PROMISE (not an awaited blob): Safari resolves it
        // INSIDE the tap's activation, so the write isn't rejected — awaiting first loses
        // the gesture and throws NotAllowedError. Chromium supports the promise form too.
        const png = onCapture().then((b) => {
          if (!b) throw new Error('capture failed');
          return b;
        });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } else {
        // No image-clipboard support → fall back to a download.
        const blob = await onCapture();
        if (!blob) {
          setFailed(true);
          return;
        }
        downloadBlob(blob, fileName);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture, fileName, divertIfLocked]);

  // Copy the shareable chart URL (plain text — no capture involved). The link is
  // built lazily so it carries the camera as it is at the click.
  const onCopyLink = useCallback(async () => {
    if (divertIfLocked()) return;
    if (!shareLink) return;
    setFailed(false);
    try {
      await navigator.clipboard.writeText(shareLink());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }, [shareLink, divertIfLocked]);

  const onShare = useCallback(async () => {
    if (divertIfLocked()) return;
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setCopied(false);
    try {
      const blob = await onCapture();
      if (!blob) {
        setFailed(true);
        return;
      }
      const file = new File([blob], fileName, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        // Opens the native OS share sheet (Save Image / Messages / Mail / …) — entirely
        // client-side, no upload or server. The blob never leaves the device until the
        // user picks a target.
        // The accompanying text + app URL ride along with the image in the share sheet. The URL is
        // read from the page's canonical <link> (so it stays the public app URL even from a preview
        // build, and brand-neutral for forks), falling back to the current origin.
        const shareUrl =
          document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ||
          `${location.origin}/`;
        await navigator.share({
          files: [file],
          title: t('captureHud.share.sheetTitle'),
          text: t('captureHud.share.sheetText'),
          url: shareUrl,
        });
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (e) {
      // Dismissing the share sheet rejects with AbortError — that's a cancel, not a failure.
      if ((e as { name?: string } | null)?.name !== 'AbortError') setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture, fileName, divertIfLocked, t]);

  // Optional registered destination (lib/extensions/captureSink) — a fourth action
  // that hands the frame to whatever surface registered it. Deliberately NOT diverted
  // through the capture-export gate: a sink only offers itself while its own (already
  // entitlement-gated) surface is active, whereas the gate covers the generic export
  // actions, whose availability is otherwise universal. Read fresh each render so the
  // button tracks the sink's own activity (e.g. it withdraws once its target is full).
  const sink = getCaptureSink();
  const sinkActive = sink != null && sink.isActive();
  const onSendToSink = useCallback(async () => {
    const s = getCaptureSink();
    if (!s || busy) return;
    setBusy(true);
    setFailed(false);
    setSinkDone(false);
    try {
      const blob = await onCapture();
      if (!blob) {
        setFailed(true);
        return;
      }
      await s.onCapture(blob);
      setSinkDone(true);
      setTimeout(() => setSinkDone(false), 1800);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture]);

  // How many action buttons render this frame — download + copy are always in;
  // share, copy-link and the sink each add one when present. Drives the row
  // layout (CSS keys off data-actions): ≤3 stay one row; 4 splits 2+2, 5 → 3+2,
  // 6 → 3+3 (the grid fills top row first at 3 columns).
  const actionCount =
    2 + (supportsShare ? 1 : 0) + (shareLink ? 1 : 0) + (sinkActive ? 1 : 0);

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud capture-hud${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <HudHeader
        title={t('captureHud.title')}
        handleProps={handleProps}
        dragging={dragging}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onClose={onClose}
        closeLabel={t('captureHud.closeAria')}
        closeHint={t('captureHud.closeHint')}
      />

      <div className="location-ls capture-hud-body">
        <div className="capture-hud-label">{t('captureHud.aspect.label')}</div>
        <div className="location-ls-seg capture-hud-seg" role="group">
          {ASPECTS.map((a) => {
            const active = Math.abs(captureAspect - a.ratio) < 0.001;
            return (
              <TipBtn
                key={a.key}
                className={`location-ls-seg-btn ${active ? 'active' : ''}`}
                onClick={() => setCaptureAspect(a.ratio)}
                ariaPressed={active}
                title={t(`captureHud.aspect.${a.key}`)}
                hint={t(`captureHud.aspect.${a.key}Hint`)}
              >
                {t(`captureHud.aspect.${a.key}`)}
              </TipBtn>
            );
          })}
        </div>

        <div className={`capture-hud-label${phone ? ' capture-hud-label-info' : ''}`}>
          <span>{t('captureHud.extras.label')}</span>
          {phone && (
            <DetailsInfo
              title={t('captureHud.view.phoneTitle')}
              hint={t('captureHud.view.phoneHint')}
            />
          )}
        </div>
        {/* Phones can't fit the wheel/list in a phone-sized frame, so the picker is dropped there
            (view is forced to 'none' upstream); the "i" beside the heading explains it instead. */}
        {!phone && (
          <div className="location-ls-seg capture-hud-seg" role="group">
            {(['none', 'wheel', 'list'] as const).map((v) => (
              <TipBtn
                key={v}
                className={`location-ls-seg-btn ${view === v ? 'active' : ''}`}
                onClick={() => onSetView(v)}
                ariaPressed={view === v}
                title={t(`captureHud.view.${v}`)}
                hint={t(`captureHud.view.${v}Hint`)}
              >
                {t(`captureHud.view.${v}`)}
              </TipBtn>
            ))}
          </div>
        )}
        {/* Optional groups, meaningful only once a view is chosen ('none' draws nothing). Planets
            aren't here — they're the always-on baseline of any view; these add on top of them.
            Laid out two-up (see the caption grid below). */}
        {view !== 'none' && (
          <div className="capture-hud-toggle-grid">
            {(['angles', 'balance'] as const).map((k) => (
              <TipBtn
                key={k}
                className={`location-ls-toggle ${extras[k] ? 'on' : 'off'}`}
                onClick={() => onToggleExtra(k)}
                ariaPressed={extras[k]}
                title={t(`captureHud.extras.${k}`)}
                hint={t(`captureHud.extras.${k}Hint`)}
              >
                <EyeIcon open={extras[k]} className="location-ls-eye" size={14} />
                <span className="location-ls-name">{t(`captureHud.extras.${k}`)}</span>
              </TipBtn>
            ))}
          </div>
        )}
        {/* Per-overlay visibility — one toggle per registered map overlay that opts in
            (MapOverlay.captureToggle), entitlement-gated like the overlay itself. The
            hide applies only WHILE the tool is armed: App reverts the map to every
            overlay the moment Capture closes, so nothing set here can stick. Labels
            arrive from the registration, already localized. */}
        {(() => {
          const overlayToggles = getMapOverlays().filter(
            (o) => o.captureToggle && isOverlayEntitled(o),
          );
          if (overlayToggles.length === 0) return null;
          return (
            <div className="capture-hud-toggle-grid">
              {overlayToggles.map((o) => {
                const shown = !hiddenOverlays.has(o.id);
                return (
                  <TipBtn
                    key={o.id}
                    className={`location-ls-toggle ${shown ? 'on' : 'off'}`}
                    onClick={() => onToggleOverlay(o.id)}
                    ariaPressed={shown}
                    gated={o.tier === 'gated'}
                    title={o.captureToggle!.title}
                    hint={o.captureToggle!.hint}
                  >
                    <EyeIcon open={shown} className="location-ls-eye" size={14} />
                    <span className="location-ls-name">{o.captureToggle!.title}</span>
                  </TipBtn>
                );
              })}
            </div>
          );
        })()}

        <div className="capture-hud-label">{t('captureHud.caption.label')}</div>
        <div className="capture-hud-toggle-grid">
          {CAPTION_KEYS.map((k) => (
            <TipBtn
              key={k}
              className={`location-ls-toggle ${captionFields[k] ? 'on' : 'off'}`}
              onClick={() => onToggleCaptionField(k)}
              ariaPressed={captionFields[k]}
              title={t(`captureHud.caption.${k}`)}
              hint={t(`captureHud.caption.${k}Hint`)}
            >
              <EyeIcon open={captionFields[k]} className="location-ls-eye" size={14} />
              <span className="location-ls-name">{t(`captureHud.caption.${k}`)}</span>
            </TipBtn>
          ))}
        </div>

        <div className="capture-hud-actions" data-actions={actionCount}>
          <TipBtn
            className="location-ls-fly capture-hud-btn"
            onClick={onDownload}
            disabled={busy}
            advanced={exportGated}
            title={t('captureHud.download.title')}
            hint={t('captureHud.download.hint')}
          >
            <DownloadIcon />
            <span>{t('captureHud.download.title')}</span>
          </TipBtn>
          <TipBtn
            className="location-ls-fly capture-hud-btn"
            onClick={onCopy}
            disabled={busy}
            advanced={exportGated}
            title={t('captureHud.copy.title')}
            hint={t('captureHud.copy.hint')}
          >
            <CopyIcon />
            <span>{copied ? t('captureHud.copy.done') : t('captureHud.copy.title')}</span>
          </TipBtn>
          {/* Native share — touch devices only (desktop has Download/Copy). */}
          {supportsShare && (
            <TipBtn
              className="location-ls-fly capture-hud-btn"
              onClick={onShare}
              disabled={busy}
              advanced={exportGated}
              title={t('captureHud.share.title')}
              hint={t('captureHud.share.hint')}
            >
              <ShareIcon />
              <span>{t('captureHud.share.title')}</span>
            </TipBtn>
          )}
          {/* Copy a shareable ?c= URL of this chart + view (no image involved). */}
          {shareLink && (
            <TipBtn
              className="location-ls-fly capture-hud-btn"
              onClick={onCopyLink}
              disabled={busy}
              advanced={exportGated}
              title={t('captureHud.link.title')}
              hint={t('captureHud.link.hint')}
            >
              <LinkIcon />
              <span>{linkCopied ? t('captureHud.link.done') : t('captureHud.link.title')}</span>
            </TipBtn>
          )}
          {/* Registered destination (captureSink) — labels arrive from the registration,
              already localized; failures share the generic status line below. */}
          {sink != null && sinkActive && (
            <TipBtn
              className="location-ls-fly capture-hud-btn"
              onClick={onSendToSink}
              disabled={busy}
              title={sink.label}
              hint={sink.hint}
            >
              <FilePlusIcon />
              <span>{sinkDone ? sink.doneLabel : sink.label}</span>
            </TipBtn>
          )}
        </div>
        {(busy || failed) && (
          <div className="capture-hud-status" role="status">
            {busy ? t('captureHud.busy') : t('captureHud.failed')}
          </div>
        )}
      </div>
    </div>
  );
}
