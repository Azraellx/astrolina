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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { captureExportGate } from '../../lib/captureGate';
import { lastCaptureFailure } from '../../lib/captureFailure';
import { useDiscreet } from '../../lib/discreet';
import { downloadBlob } from '../../lib/downloadBlob';
import { getCaptureSink } from '../../lib/extensions/captureSink';
import { getMapOverlays, isOverlayEntitled } from '../../lib/extensions/mapOverlays';
import { tierMet, shouldShowNudge, type PlanTier } from '../../lib/plan';
import { useTouchLayout, usePhone, usePhonePortrait, isPhonePortrait } from '../../lib/touch';
import { useHoverTip } from '../ui/useHoverTip';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { InfoIcon } from '../ui/InfoIcon';
import { WarningIcon } from '../ui/WarningIcon';
import { HudHeader } from '../ui/HudHeader';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles,
// so the window frosts/recolors with the theme for free; CaptureHud.css adds the rest.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import './CaptureHud.css';

// Its own saved position, independent of the other floating windows.
const POS_KEY = 'astro:capture-pos:v1';
// The least room under the frame (px) that a phone sheet is worth capping to: the title bar
// (about 42) plus one row of controls with the body's padding round it. Less than that and a
// capped window would be a title bar over a sliver that scrolls one half-row at a time, so it
// folds to its title bar instead (see `tight` below).
const SHEET_MIN_ROOM = 92;

// Where a phone sheet has to stay below: the Capture frame's bottom edge, caption band and
// attribution included — on a phone held upright, where the frame sits under the top bars and
// the window docks beneath it (Map.tsx's frame geometry). Null elsewhere, and null until the
// geometry has placed the frame: before that it still fills the map, and there is no frame edge
// to stay under — reading the screen's bottom then would fold the window for the one frame it
// takes the inset to land.
function frameCeiling(): number | null {
  if (!isPhonePortrait()) return null;
  const frame = document.querySelector<HTMLElement>('.map-frame.framed');
  if (!frame || frame.style.top === '') return null;
  const r = frame.getBoundingClientRect();
  return r.height > 0 ? r.bottom : null;
}
// '1' once the share-link privacy notice has been acknowledged with "don't
// remind me again" — the first-use heads-up stands down from then on.
const LINK_WARN_KEY = 'astro:share-link-notice:v1';

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
  coordinates: boolean;
  calculations: boolean;
}
const CAPTION_KEYS = ['name', 'date', 'time', 'location', 'coordinates', 'calculations'] as const;

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

/** Report why an export failed. The banner can only say "try again"; the reason
 *  belongs somewhere it can be read, because every one of these actions runs
 *  async off a click and there is no other trace of it. A swallowed catch here
 *  has already once made a missing dependency look like a mysterious dud
 *  button. `which` names the action so a report says which of the four. */
function reportCaptureFailure(which: string, cause: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[capture] ${which} failed`, cause, { reason: lastCaptureFailure() });
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
  ariaDisabled,
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
  /** Soft-disable: greyed + non-actioning (the onClick is guarded) but still focusable/hoverable,
   *  so its tip can explain WHY it's unavailable — unlike native `disabled`, which suppresses tips. */
  ariaDisabled?: boolean;
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
        onClick={ariaDisabled ? undefined : onClick}
        aria-pressed={ariaPressed}
        aria-label={ariaLabel}
        aria-disabled={ariaDisabled || undefined}
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
  /** What the frame is a picture OF (owned by App, persisted): 'map' — the framed map,
   *  with the details as an optional note docked beside it; 'chart' — the details alone,
   *  filling the frame. Both keep the same ratios, caption and export actions. */
  subject: 'map' | 'chart';
  setSubject: (s: 'map' | 'chart') => void;
  /** Whether this frame has room to draw the wheel legibly (computed by the Map from the
   *  frame box). False soft-disables the Wheel view — the point being to decline before
   *  the export, not to hand back a picture with the wheel cut off. */
  canWheel: boolean;
  /** True when the view the user actually chose is the one being declined, so the notice
   *  (and its way out) appears for someone who asked for it, not for everyone who happens
   *  to be on a small frame. */
  viewBlocked: boolean;
  /** The details panel's own report that it is cutting content off. Covers the position
   *  list too, which the wheel's fit arithmetic says nothing about. */
  detailsClipped: boolean;
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
  /** Build a shareable #c= URL of the current chart + camera (lib/shareState) —
   *  read lazily on click so it always carries the freshest view. Null hides the
   *  "Copy link" button (e.g. a composite chart, which a link can't recast). */
  shareLink?: (() => string) | null;
  /** Whether the Local Space view is active — the "Transparent (Local Space)" toggle in the
   *  Frame section is scoped to it (its export treatment only applies while LS is on), so it
   *  appears only then. */
  localSpaceActive: boolean;
  /** The "Transparent (Local Space)" preset (gated tier): hides the LS line arrows, switches
   *  them to standard frame-edge labels, and blanks the basemap for a transparent export.
   *  App applies it only with LS on + Capture armed + the plan reaching the gated rung. */
  transparentMode: boolean;
  setTransparentMode: (v: boolean) => void;
  /** Fly the map to the local-space origin (at the compass's full zoom) — App calls this when
   *  Transparent turns on, so the always-on circle mask has the horizon rose to frame. */
  onFlyToOrigin: () => void;
  /** Transparent-export badge labels — the Details section swaps the wheel/list picker for these
   *  two toggles while Transparent is on: print each LS planet's name after its glyph, and print
   *  the line's bearing along the line toward the compass centre. */
  lsLabelName: boolean;
  setLsLabelName: (v: boolean) => void;
  lsLineDeg: boolean;
  setLsLineDeg: (v: boolean) => void;
  /** The user's plan tier (lib/plan) — gates the Transparent toggle to the gated rung. */
  planTier: PlanTier;
}

export function CaptureHud({
  onClose,
  captureAspect,
  setCaptureAspect,
  subject,
  setSubject,
  canWheel,
  viewBlocked,
  detailsClipped,
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
  localSpaceActive,
  transparentMode,
  setTransparentMode,
  onFlyToOrigin,
  lsLabelName,
  setLsLabelName,
  lsLineDeg,
  setLsLineDeg,
  planTier,
}: CaptureHudProps) {
  const { t } = useT();
  // The header eye collapses the window to just its title bar (like the overlay nubs) to clear
  // screen clutter — WITHOUT exiting Capture (close it from the top nav / Esc). Local UI state:
  // the reader's own choice, or null while they haven't made one (see `collapsed` below).
  const [collapsedChoice, setCollapsedChoice] = useState<boolean | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, phoneRoom, draggedOffHome, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    initial: () => ({ x: Math.round(effectiveCenterX() - 130), y: 144 }),
    // On a phone held upright the window is a full-width sheet docked UNDER the frame, so the
    // frame, its caption and these controls are all on screen at once. The sheet keeps its
    // bottom edge on the chrome, where the thumb is; the frame bounds its height.
    phoneCeiling: frameCeiling,
  });
  // A phone held upright: the sheet layout (CaptureHud.css `.is-phone-sheet`) — full width,
  // the short sections side by side, so the window is as short as its content allows.
  const phoneSheet = usePhonePortrait();
  // Too little room under the frame to be worth capping the sheet to (SHEET_MIN_ROOM): a 4:5
  // frame on a short phone leaves a sliver. Shrinking the frame to make room was the other
  // way out, and it was turned down — the export is the frame's own size, so the picture
  // would come out smaller and show less map whenever the window happened to need the room.
  // So the frame keeps its size and the window gives way: it starts folded to its title bar,
  // under the frame, and the eye opens it — over the frame, at its full height, uncapped,
  // because the reader asked for it there. A standing condition, so it is DERIVED (CLAUDE.md
  // rule 2), never written into the choice: switch to a ratio with room and the window is
  // open again by itself, unless the reader has set it either way since.
  const tight = phoneRoom !== null && phoneRoom < SHEET_MIN_ROOM;
  const collapsed = collapsedChoice ?? tight;
  // Capped only where the cap leaves something usable; folded or opened over the frame, the
  // window takes its own height (`.is-tight` lifts the cap the hook's room var applies).
  const capped = phoneRoom !== null && !tight;
  // A reader who drags the sheet off its home has taken it over, and the room goes with the
  // home (the hook drops it on release): what the window was showing then is theirs from then
  // on. Without this, dragging a folded sheet away would lift its "too little room" and open it
  // the moment the finger came off. Keyed on the room going away rather than on `dragging`,
  // which is also up for a tap on the title bar — not a choice about anything. And only when
  // the room went with a DRAG (`draggedOffHome`, set in the same update): turning the phone on
  // its side drops the room too, because the ceiling only applies upright, and freezing then
  // would write the derived fold into the choice — rotate a folded 4:5 sheet and back, pick
  // 1:1, and it would stay folded, as if the reader had folded it. A layout effect, so the
  // frozen state is in place before the frame that would have shown it open.
  // `sheetCollapsed` is what the sheet showed the last time it had a room — read before it is
  // updated, so the pass in which the room goes away still sees the state from before.
  const sheetCollapsed = useRef(collapsed);
  const lastRoom = useRef(phoneRoom);
  useLayoutEffect(() => {
    if (lastRoom.current !== null && phoneRoom === null && draggedOffHome) {
      setCollapsedChoice((c) => c ?? sheetCollapsed.current);
    }
    lastRoom.current = phoneRoom;
    if (phoneRoom !== null) sheetCollapsed.current = collapsed;
  }, [phoneRoom, collapsed, draggedOffHome]);
  // A capped sheet scrolls, and a phone shows no scrollbar until a scroll has started — so a
  // window cut off after its first row would read as a window with one row. While there is
  // more below, the body's foot fades out (CaptureHud.css `.has-more`), the way a list that
  // runs on looks. Checked on scroll, when the cap moves, and after every render (a notice or
  // the link heads-up appearing lengthens the content without resizing the capped body).
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMore = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !capped) {
      checkMore.current = () => {};
      setMoreBelow(false);
      return;
    }
    const check = () =>
      setMoreBelow(body.scrollTop + body.clientHeight < body.scrollHeight - 2);
    checkMore.current = check;
    check();
    body.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(body);
    return () => {
      body.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [capped]);
  useLayoutEffect(() => checkMore.current());
  // The frame moving or resizing — a ratio picked here, the caption growing a line, the top
  // bars changing height — moves the ceiling, and nothing the hook watches would notice. Say
  // so the way every moved surface does (useMovableHud's `phoneCeiling`): `astro:hud-moved`
  // re-homes the sheet against the frame where it now is. Map.tsx sets the frame's insets
  // inline, so a change of its style attribute is exactly a change of its box.
  //
  // Flushed synchronously: the observer reports in the microtask right after the frame's
  // commit, before the screen paints, and a re-home left to an ordinary update would land a
  // frame later — one frame of the sheet still standing where a taller frame now reaches
  // (measured: picking 1:1 from 16:9 on a 432×768 phone put the sheet over the new caption
  // for exactly one frame). Safe here because a MutationObserver callback is never inside a
  // React render or effect.
  useEffect(() => {
    if (!phoneSheet) return;
    const frame = document.querySelector('.map-frame');
    if (!frame) return;
    const moved = () => flushSync(() => window.dispatchEvent(new Event('astro:hud-moved')));
    const mo = new MutationObserver(moved);
    mo.observe(frame, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => mo.disconnect();
  }, [phoneSheet]);
  // Which export is rendering, or null. The pressed button says "Rendering…" in place of its
  // label (the way Copy says "Copied") and every action holds off until it's done. It used to
  // be a boolean behind a status row that mounted only while busy, so the panel grew for the
  // few frames a render takes and snapped back — the whole window jumping under the finger
  // that had just pressed it. A failure still gets the row: that message has to stay.
  const [busy, setBusy] = useState<'download' | 'copy' | 'share' | 'sink' | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sinkDone, setSinkDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // The frame's own account of why it gave back nothing (lib/captureFailure). Held in
  // state beside `failed` because the banner is the only place the person having the
  // problem ever sees it — the console line goes to everyone who is not.
  const [failReason, setFailReason] =
    useState<ReturnType<typeof lastCaptureFailure>>(null);
  // Raise the banner for an action that went through the FRAME, carrying whatever reason
  // it left behind. Read and set together so the banner can never pair this attempt's
  // failure with the last one's reason.
  const markFailed = useCallback(() => {
    setFailReason(lastCaptureFailure());
    setFailed(true);
  }, []);
  // Raise it for an action that did NOT — the share link is plain text and never touches
  // captureFrame, so whatever reason is sitting in that module belongs to some earlier
  // export and would be a confident, wrong explanation of a clipboard refusal.
  const markFailedNoReason = useCallback(() => {
    setFailReason(null);
    setFailed(true);
  }, []);
  // Show the native Share button only on touch devices that can share image files — on
  // desktop the Download / Copy buttons cover it, so Share is just clutter there.
  const touchLayout = useTouchLayout();
  const [canShareFiles] = useState(canShareImageFiles);
  const supportsShare = touchLayout && canShareFiles;
  // Phones can't fit the wheel/list details in a phone-sized frame, so the picker is replaced by
  // an explanatory "i" and the view is forced to 'none' upstream (App passes view='none' here).
  // The rule is about a map WITH details beside it — a chart card is legible at phone size,
  // so it keeps its picker (and is what the "i" sends a phone user to).
  const phone = usePhone();
  const chartSubject = subject === 'chart';
  // Discreet mode blanks the caption's identifying fields, and the export is the same
  // DOM as the preview — so the picture leaves the device blanked too. Announced in
  // the Caption section rather than left to be discovered in the finished file.
  const discreet = useDiscreet();

  // The Transparent (Local Space) toggle belongs to the GATED rung (lib/plan): live for an
  // entitled user (with the gated tip tag), a locked teaser when the build nudges that rung,
  // hidden otherwise — the open core never reaches the gated rung, so it ships hidden there.
  // The teaser explains in its tip when clicked or tapped and does NOT open the upgrade
  // flow: it's a switch in the middle of composing an export, and a tap on a switch that
  // won't flip asks why, not for the plans (TipButton's `locked`; seam L73, 2026-10-01).
  // The eye reads the EFFECTIVE state (App gates the applied value the same way) so a
  // teased/stale pref never shows it active with nothing applied.
  const transparentUnlocked = tierMet(planTier, 'gated');
  const transparentNudge = !transparentUnlocked && shouldShowNudge('gated');
  const effTransparent = transparentUnlocked && transparentMode;
  const transparentClick = () => {
    // Unreachable while locked (the locked TipButton never calls onClick); kept so a
    // locked switch can't write the preference even if that wiring changes.
    if (!transparentUnlocked) return;
    const next = !transparentMode;
    setTransparentMode(next);
    // Turning it on flies to the LS origin (compass full-size) so the always-on circle mask frames
    // the horizon rose; turning it off leaves the camera where it is.
    if (next) onFlyToOrigin();
  };
  // While Transparent mode is actually ON (LS up + entitled + set), the export is stripped to a
  // clean transparent image (App forces the view off, withholds overlays, drops the caption).
  // So the Details, per-overlay toggles and Caption sections hide; the frame ratio stays free
  // to pick, and the Transparent toggle + export actions remain.
  // It describes a MAP export, so a chart card stands it down — matching App, which drops its
  // effect there. Without this a preset left on from a previous session would swap the card's
  // own picker for the local-space label toggles.
  const transparentLocked = !chartSubject && localSpaceActive && effTransparent;
  // The phone-only "i" beside the Details heading, standing in for the picker it replaces.
  // Only the MAP picker is dropped on phones, so only that case needs the explanation.
  const phoneInfo = phone && !transparentLocked && !chartSubject;

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
    setBusy('download');
    setFailed(false);
    setCopied(false);
    try {
      const blob = await onCapture();
      if (!blob) {
        reportCaptureFailure('download', 'the frame produced no image');
        markFailed();
        return;
      }
      downloadBlob(blob, fileName);
    } catch (e) {
      reportCaptureFailure('download', e);
      markFailed();
    } finally {
      setBusy(null);
    }
  }, [busy, onCapture, fileName, divertIfLocked, markFailed]);

  const onCopy = useCallback(async () => {
    if (divertIfLocked()) return;
    if (busy) return;
    setBusy('copy');
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
          reportCaptureFailure('copy', 'the frame produced no image');
          markFailed();
          return;
        }
        downloadBlob(blob, fileName);
      }
    } catch (e) {
      reportCaptureFailure('copy', e);
      markFailed();
    } finally {
      setBusy(null);
    }
  }, [busy, onCapture, fileName, divertIfLocked, markFailed]);

  // Copy the shareable chart URL (plain text — no capture involved). The link is
  // built lazily so it carries the camera as it is at the click.
  const copyShareLink = useCallback(async () => {
    if (!shareLink) return;
    setFailed(false);
    try {
      await navigator.clipboard.writeText(shareLink());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      markFailedNoReason();
    }
  }, [shareLink, markFailedNoReason]);

  // First-use heads-up before the copy: the link carries the chart's FULL birth
  // details (that's what makes it reopenable), which the hover hint explains but
  // a first-time user may never have read. Shown until "don't remind me again"
  // is checked through a confirm; cancelling (or confirming unchecked) keeps the
  // reminder for next time. Per-device, like every other UI preference.
  const [linkWarnOpen, setLinkWarnOpen] = useState(false);
  const [linkWarnSuppress, setLinkWarnSuppress] = useState(false);
  const onCopyLink = useCallback(async () => {
    if (divertIfLocked()) return;
    if (!shareLink) return;
    let acknowledged = false;
    try {
      acknowledged = localStorage.getItem(LINK_WARN_KEY) === '1';
    } catch {
      /* storage blocked — treat as not acknowledged; the notice still works */
    }
    if (!acknowledged) {
      setLinkWarnOpen(true);
      return;
    }
    await copyShareLink();
  }, [shareLink, divertIfLocked, copyShareLink]);
  const onLinkWarnConfirm = useCallback(async () => {
    if (linkWarnSuppress) {
      try {
        localStorage.setItem(LINK_WARN_KEY, '1');
      } catch {
        /* storage blocked — the notice just shows again next session */
      }
    }
    setLinkWarnOpen(false);
    await copyShareLink();
  }, [linkWarnSuppress, copyShareLink]);

  const onShare = useCallback(async () => {
    if (divertIfLocked()) return;
    if (busy) return;
    setBusy('share');
    setFailed(false);
    setCopied(false);
    try {
      const blob = await onCapture();
      if (!blob) {
        reportCaptureFailure('share', 'the frame produced no image');
        markFailed();
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
      if ((e as { name?: string } | null)?.name !== 'AbortError') {
        reportCaptureFailure('share', e);
        markFailed();
      }
    } finally {
      setBusy(null);
    }
  }, [busy, onCapture, fileName, divertIfLocked, t, markFailed]);

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
    setBusy('sink');
    setFailed(false);
    setSinkDone(false);
    try {
      const blob = await onCapture();
      if (!blob) {
        // The frame itself produced nothing — the destination never saw it, and
        // saying so is the difference between debugging the map and debugging
        // whatever registered the sink.
        reportCaptureFailure(`sink:${s.id} (frame)`, 'the frame produced no image');
        markFailed();
        return;
      }
      await s.onCapture(blob);
      setSinkDone(true);
      setTimeout(() => setSinkDone(false), 1800);
    } catch (e) {
      reportCaptureFailure(`sink:${s.id}`, e);
      markFailed();
    } finally {
      setBusy(null);
    }
  }, [busy, onCapture, markFailed]);

  // How many action buttons render this frame — download + copy are always in;
  // share, copy-link and the sink each add one when present. Drives the row
  // layout (CSS keys off data-actions): ≤3 stay one row; 4 splits 2+2, 5 → 3+2,
  // 6 → 3+3 (the grid fills top row first at 3 columns).
  const actionCount =
    2 + (supportsShare ? 1 : 0) + (shareLink ? 1 : 0) + (sinkActive ? 1 : 0);

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud capture-hud${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}${phoneSheet ? ' is-phone-sheet' : ''}${tight ? ' is-tight' : ''}`}
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
        onToggleCollapse={() => setCollapsedChoice(!collapsed)}
        onClose={onClose}
        closeLabel={t('captureHud.closeAria')}
        closeHint={t('captureHud.closeHint')}
      />

      <div ref={bodyRef} className={`location-ls capture-hud-body${moreBelow ? ' has-more' : ''}`}>
        {/* Subject and Frame as one pair: stacked in the window as always (the wrappers lay
            out as if absent), side by side on a phone sheet, where the width is there and the
            height is what the frame above leaves. */}
        <div className="capture-hud-pair">
          {/* What the frame is a picture of. Its own axis rather than a fourth ratio preset:
              the ratios, the caption and every export action serve both subjects equally. */}
          <div className="capture-hud-group">
            <div className="capture-hud-label">{t('captureHud.subject.label')}</div>
            <div className="location-ls-seg capture-hud-seg" role="group">
              {(['map', 'chart'] as const).map((s) => (
                <TipBtn
                  key={s}
                  className={`location-ls-seg-btn ${subject === s ? 'active' : ''}`}
                  onClick={() => setSubject(s)}
                  ariaPressed={subject === s}
                  title={t(`captureHud.subject.${s}`)}
                  hint={t(`captureHud.subject.${s}Hint`)}
                >
                  {t(`captureHud.subject.${s}`)}
                </TipBtn>
              ))}
            </div>
          </div>

          <div className="capture-hud-group">
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
          </div>
        </div>

        {/* Transparent (Local Space): a gated-tier preset for Local-Space captures — hides
            the line arrows, uses standard frame-edge labels and blanks the basemap for a
            see-through export. Its effect only applies with Local Space on, so it's shown
            SOFT-DISABLED (greyed, non-clickable, tip explains) until LS is active; hidden
            below the gated rung unless the build nudges it. The shared TipButton rather
            than this window's TipBtn, for its `locked` form: the teaser's reason line,
            accessible description and tap-to-reveal live there, once, for every locked
            switch. */}
        {!chartSubject && (transparentUnlocked || transparentNudge) && (
          <TipButton
            type="button"
            // `locked` carries the same gated tint as the Activations and Paran Clock eyes
            // (CaptureHud.css), so the three locked switches look alike.
            className={`location-ls-toggle capture-hud-transparent ${
              effTransparent ? 'on' : 'off'
            }${localSpaceActive ? '' : ' disabled'}${transparentNudge ? ' locked' : ''}`}
            placement="top"
            locked={
              transparentNudge
                ? { tier: 'gated', feature: t('captureHud.transparent.title') }
                : undefined
            }
            onClick={localSpaceActive ? transparentClick : undefined}
            // Locked, it is not a toggle the reader can press (LockedTipButton makes it
            // aria-disabled with the reason as its description), so it reports no pressed state —
            // the same as the locked Activations and Paran Clock eyes.
            aria-pressed={transparentNudge ? undefined : effTransparent}
            aria-disabled={!localSpaceActive || undefined}
            gated
            tip={t('captureHud.transparent.title')}
            // Locked, the description stands whether Local Space is on or not: "turn on Local
            // Space first" is an instruction that can't unlock it, sitting over a reason line
            // that says it stays off. needLs is for a switch the reader CAN flip.
            hint={
              localSpaceActive || transparentNudge
                ? t('captureHud.transparent.hint')
                : t('captureHud.transparent.needLs')
            }
          >
            <EyeIcon open={effTransparent} className="location-ls-eye" size={14} />
            <span className="location-ls-name">{t('captureHud.transparent.title')}</span>
          </TipButton>
        )}

        {/* Details heading — shown in every mode. The phone "i" (why no wheel/list) belongs
            only to the map picker: the transparent branch has no picker, and a chart card
            keeps its own, which is legible at phone size. */}
        <div className={`capture-hud-label${phoneInfo ? ' capture-hud-label-info' : ''}`}>
          <span>{t('captureHud.extras.label')}</span>
          {phoneInfo && (
            <DetailsInfo
              title={t('captureHud.view.phoneTitle')}
              hint={t('captureHud.view.phoneHint')}
            />
          )}
        </div>
        {transparentLocked ? (
          /* Transparent export: the wheel/list picker is moot (the chart panel is forced off), so
             the Details section offers two badge-label toggles instead — what each local-space
             badge prints beyond its glyph: the planet's name, and the line's bearing. */
          <div className="capture-hud-toggle-grid">
            <TipBtn
              className={`location-ls-toggle ${lsLabelName ? 'on' : 'off'}`}
              onClick={() => setLsLabelName(!lsLabelName)}
              ariaPressed={lsLabelName}
              title={t('captureHud.lsLabels.name.title')}
              hint={t('captureHud.lsLabels.name.hint')}
            >
              <EyeIcon open={lsLabelName} className="location-ls-eye" size={14} />
              <span className="location-ls-name">{t('captureHud.lsLabels.name.title')}</span>
            </TipBtn>
            <TipBtn
              className={`location-ls-toggle ${lsLineDeg ? 'on' : 'off'}`}
              onClick={() => setLsLineDeg(!lsLineDeg)}
              ariaPressed={lsLineDeg}
              title={t('captureHud.lsLabels.degrees.title')}
              hint={t('captureHud.lsLabels.degrees.hint')}
            >
              <EyeIcon open={lsLineDeg} className="location-ls-eye" size={14} />
              <span className="location-ls-name">{t('captureHud.lsLabels.degrees.title')}</span>
            </TipBtn>
          </div>
        ) : (
          /* Phones can't fit the wheel/list BESIDE A MAP in a phone-sized frame, so the map
             picker is dropped there (view is forced to 'none' upstream) and the "i" beside
             the heading explains it. A chart card has no such problem, and drops 'none' the
             other way: the details are the picture, so there is nothing to turn off. */
          (chartSubject || !phone) && (
            <div className="location-ls-seg capture-hud-seg" role="group">
              {(chartSubject
                ? (['wheel', 'list'] as const)
                : (['none', 'wheel', 'list'] as const)
              ).map((v) => {
                // Soft-disabled rather than hidden: the tip is the whole explanation, and a
                // control that vanishes teaches nothing about why. A card is refused on the
                // same terms as a docked panel — the wheel is one drawing, and a frame with
                // no room for it has none whoever it belongs to.
                const blocked = v === 'wheel' && !canWheel;
                return (
                  <TipBtn
                    key={v}
                    className={`location-ls-seg-btn ${view === v ? 'active' : ''}${
                      blocked ? ' disabled' : ''
                    }`}
                    onClick={() => {
                      if (blocked) return;
                      onSetView(v);
                    }}
                    ariaPressed={view === v}
                    ariaDisabled={blocked}
                    title={t(`captureHud.view.${v}`)}
                    hint={
                      blocked
                        ? chartSubject
                          ? t('captureHud.view.tooSmallCardHint')
                          : t('captureHud.view.tooSmallHint')
                        : t(`captureHud.view.${v}Hint`)
                    }
                  >
                    {t(`captureHud.view.${v}`)}
                  </TipBtn>
                );
              })}
            </div>
          )
        )}
        {/* The frame declined the view the user picked. Say so here, where the choice was
            made, and — for a map frame — carry the export that will work at this size. On a
            card there is no subject left to offer, so the way out is a different ratio. */}
        {viewBlocked && (
          <div className="capture-hud-notice" role="status">
            <p className="capture-hud-notice-text">
              {chartSubject
                ? t('captureHud.view.tooSmallCardBody')
                : t('captureHud.view.tooSmallBody')}
            </p>
            {!chartSubject && (
              <button
                type="button"
                className="capture-hud-notice-btn"
                onClick={() => setSubject('chart')}
              >
                {t('captureHud.view.switchToChart')}
              </button>
            )}
          </div>
        )}
        {/* The panel measured itself overflowing — the arithmetic above reserves the balance
            grid's room by approximation, and the position list wraps on its own terms, so
            this is the only signal that catches either one running over. */}
        {!viewBlocked && detailsClipped && view !== 'none' && (
          <div className="capture-hud-notice" role="status">
            <p className="capture-hud-notice-text">{t('captureHud.view.clippedBody')}</p>
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
        {/* Each of these hides something drawn ON THE MAP, so a chart card has none of them
            to offer. */}
        {!transparentLocked && !chartSubject && (() => {
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

        {/* Caption section — shown in both modes. The normal export prints it as the footer band;
            the Transparent export stacks the same fields in the frame's top-left instead. */}
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
        {discreet && (
          <div className="capture-hud-notice" role="status">
            <p className="capture-hud-notice-text">{t('captureHud.caption.discreet')}</p>
          </div>
        )}

        <div className="capture-hud-actions" data-actions={actionCount}>
          {/* Each image action shows "Rendering…" in its own label while it renders (see
              `busy`), in the button's fixed cell, so nothing around it moves. */}
          <TipBtn
            className="location-ls-fly capture-hud-btn"
            onClick={onDownload}
            disabled={busy != null}
            advanced={exportGated}
            title={t('captureHud.download.title')}
            hint={t('captureHud.download.hint')}
          >
            <DownloadIcon />
            <span>
              {busy === 'download' ? t('captureHud.busy') : t('captureHud.download.title')}
            </span>
          </TipBtn>
          <TipBtn
            className={`location-ls-fly capture-hud-btn${copied ? ' is-copied' : ''}`}
            onClick={onCopy}
            disabled={busy != null}
            advanced={exportGated}
            title={t('captureHud.copy.title')}
            hint={t('captureHud.copy.hint')}
          >
            <CopyIcon />
            <span>
              {busy === 'copy'
                ? t('captureHud.busy')
                : copied
                  ? t('captureHud.copy.done')
                  : t('captureHud.copy.title')}
            </span>
          </TipBtn>
          {/* Native share — touch devices only (desktop has Download/Copy). */}
          {supportsShare && (
            <TipBtn
              className="location-ls-fly capture-hud-btn"
              onClick={onShare}
              disabled={busy != null}
              advanced={exportGated}
              title={t('captureHud.share.title')}
              hint={t('captureHud.share.hint')}
            >
              <ShareIcon />
              <span>
                {busy === 'share' ? t('captureHud.busy') : t('captureHud.share.title')}
              </span>
            </TipBtn>
          )}
          {/* Copy a shareable #c= URL of this chart + view (no image involved). */}
          {shareLink && (
            <TipBtn
              className={`location-ls-fly capture-hud-btn${linkCopied ? ' is-copied' : ''}`}
              onClick={onCopyLink}
              disabled={busy != null}
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
              className={`location-ls-fly capture-hud-btn${sinkDone ? ' is-copied' : ''}`}
              onClick={onSendToSink}
              disabled={busy != null}
              title={sink.label}
              hint={sink.hint}
            >
              <FilePlusIcon />
              <span>
                {busy === 'sink'
                  ? t('captureHud.busy')
                  : sinkDone
                    ? sink.doneLabel
                    : sink.label}
              </span>
            </TipBtn>
          )}
        </div>
        {/* First-use privacy heads-up for the share link (see onCopyLink). */}
        {linkWarnOpen && (
          <div
            className="capture-link-warn"
            role="alertdialog"
            aria-label={t('captureHud.link.warnAria')}
          >
            {/* The shared heads-up mark — same class of message as the map-side
                notices, so it is recognisable as one before it's read. */}
            <p className="capture-link-warn-text">
              <WarningIcon className="capture-link-warn-icon" />
              {t('captureHud.link.warnBody')}
            </p>
            <label className="capture-link-warn-suppress">
              <input
                type="checkbox"
                checked={linkWarnSuppress}
                onChange={() => setLinkWarnSuppress((v) => !v)}
              />
              {t('captureHud.link.warnSuppress')}
            </label>
            <div className="capture-link-warn-actions">
              <button
                type="button"
                className="capture-link-warn-btn is-primary"
                onClick={onLinkWarnConfirm}
              >
                {t('captureHud.link.warnConfirm')}
              </button>
              <button
                type="button"
                className="capture-link-warn-btn"
                onClick={() => setLinkWarnOpen(false)}
              >
                {t('captureHud.link.warnCancel')}
              </button>
            </div>
          </div>
        )}
        {/* Failure only: "Rendering…" lives in the pressed button now (see `busy`). A new
            attempt clears `failed` as it starts, so the row can't sit beside a busy label. */}
        {failed && !busy && (
          <div className="capture-hud-status" role="status">
            {t('captureHud.failed')}
            {/* The reason, when the frame gave one. On its own the banner can only say
                "try again", which is the wrong advice for every one of these. */}
            {failReason && (
              <span className="capture-hud-status-why">
                {t(`captureHud.failedReason.${failReason}`)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
