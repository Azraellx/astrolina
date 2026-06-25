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
import { useTouchLayout } from '../../lib/touch';
import { useHoverTip } from '../ui/useHoverTip';
import { HoverTip } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
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

// Show / hide eye for the caption-field toggles (mirrors the sidebar / Local Space affordance).
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="location-ls-eye"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
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

// A button that reveals a shared .ui-tip (title + hint) on hover/focus — the same
// affordance the Local Space window uses for its segmented control and toggles.
function TipBtn({
  className,
  onClick,
  ariaPressed,
  disabled,
  title,
  hint,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
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
        disabled={disabled}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip pos={pos} placement="top" title={title} hint={hint} />
    </>
  );
}

interface CaptureHudProps {
  onClose: () => void;
  /** Current capture-frame aspect ratio (width / height); drives the map's frame. */
  captureAspect: number;
  /** Pick an aspect preset (persisted by App). */
  setCaptureAspect: (ratio: number) => void;
  /** Controlled caption-field toggles (owned by App; the Map renders the caption band). */
  captionFields: CaptionFields;
  onToggleCaptionField: (key: keyof CaptionFields) => void;
  /** Controlled "Extras" toggles (owned by App): the planet / angle position panel. */
  extras: { planets: boolean; angles: boolean; balance: boolean };
  onToggleExtra: (key: 'planets' | 'angles' | 'balance') => void;
  /** The download / share filename (App derives it from the shown caption fields). */
  fileName: string;
  /** Composite + rasterise the framed view to a PNG Blob (MapHandle.captureFrame). */
  onCapture: () => Promise<Blob | null>;
}

export function CaptureHud({
  onClose,
  captureAspect,
  setCaptureAspect,
  captionFields,
  onToggleCaptionField,
  extras,
  onToggleExtra,
  fileName,
  onCapture,
}: CaptureHudProps) {
  const { t } = useT();
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    initial: () => ({ x: Math.round(effectiveCenterX() - 130), y: 144 }),
  });
  const {
    ref: gripRef,
    pos: gripTipPos,
    show: showGripTip,
    hide: hideGripTip,
  } = useHoverTip<HTMLDivElement>('top');

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  // Show the native Share button only on touch devices that can share image files — on
  // desktop the Download / Copy buttons cover it, so Share is just clutter there.
  const touchLayout = useTouchLayout();
  const [canShareFiles] = useState(canShareImageFiles);
  const supportsShare = touchLayout && canShareFiles;

  // Warm the html2canvas-pro chunk on open so the first capture is quick enough to stay
  // within the tap's transient activation — required for Web Share / clipboard on mobile.
  useEffect(() => {
    void import('html2canvas-pro').catch(() => {});
  }, []);

  const onDownload = useCallback(async () => {
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
  }, [busy, onCapture, fileName]);

  const onCopy = useCallback(async () => {
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
  }, [busy, onCapture, fileName]);

  const onShare = useCallback(async () => {
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
        await navigator.share({ files: [file], title: 'AstroLina' });
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (e) {
      // Dismissing the share sheet rejects with AbortError — that's a cancel, not a failure.
      if ((e as { name?: string } | null)?.name !== 'AbortError') setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture, fileName]);

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud capture-hud${dragging ? ' thud-dragging' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <div className="location-header">
        <div
          className="location-grip"
          {...handleProps}
          ref={gripRef}
          onMouseEnter={showGripTip}
          onMouseLeave={hideGripTip}
        >
          <span className="hud-grip" aria-hidden="true" />
          <span className="location-title">{t('captureHud.title')}</span>
        </div>
        <HoverTip
          pos={dragging ? null : gripTipPos}
          placement="top"
          title={t('common.hud.dragToMove')}
          hint={
            <span className="hud-dock-line">
              <span className="ui-tip-hotkey hud-dock-key">
                {t('common.hud.dockKey')}
                <ClickIcon className="hud-dock-icon" />
              </span>
              {t('common.hud.recentreHint')}
            </span>
          }
        />
        <button
          type="button"
          className="location-close"
          onClick={onClose}
          aria-label={t('captureHud.closeAria')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

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

        <div className="capture-hud-label">{t('captureHud.extras.label')}</div>
        {(['planets', 'angles', 'balance'] as const).map((k) => (
          <TipBtn
            key={k}
            className={`location-ls-toggle ${extras[k] ? 'on' : 'off'}`}
            onClick={() => onToggleExtra(k)}
            ariaPressed={extras[k]}
            title={t(`captureHud.extras.${k}`)}
            hint={t(`captureHud.extras.${k}Hint`)}
          >
            <EyeIcon open={extras[k]} />
            <span className="location-ls-name">{t(`captureHud.extras.${k}`)}</span>
          </TipBtn>
        ))}

        <div className="capture-hud-label">{t('captureHud.caption.label')}</div>
        {CAPTION_KEYS.map((k) => (
          <TipBtn
            key={k}
            className={`location-ls-toggle ${captionFields[k] ? 'on' : 'off'}`}
            onClick={() => onToggleCaptionField(k)}
            ariaPressed={captionFields[k]}
            title={t(`captureHud.caption.${k}`)}
            hint={t(`captureHud.caption.${k}Hint`)}
          >
            <EyeIcon open={captionFields[k]} />
            <span className="location-ls-name">{t(`captureHud.caption.${k}`)}</span>
          </TipBtn>
        ))}

        <div className="capture-hud-actions">
          <TipBtn
            className="location-ls-fly capture-hud-btn"
            onClick={onDownload}
            disabled={busy}
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
              title={t('captureHud.share.title')}
              hint={t('captureHud.share.hint')}
            >
              <ShareIcon />
              <span>{t('captureHud.share.title')}</span>
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
