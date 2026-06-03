import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHoverTip, type TipPlacement, type TipPos } from './useHoverTip';
import './HoverTip.css';

// The shared .ui-tip card (chrome from index.css), portaled to <body> so no
// panel overflow can clip it. A hotkey, if given, renders as a distinct yellow
// "Hotkey: x" pill below the text. aria-hidden — a sighted convenience; the
// trigger keeps its own accessible name.
export function HoverTip({
  pos,
  placement = 'left',
  title,
  hint,
  hotkey,
}: {
  pos: TipPos | null;
  placement?: TipPlacement;
  title: ReactNode;
  hint?: ReactNode;
  hotkey?: string;
}) {
  if (!pos) return null;
  const hasHint = hint != null && hint !== '';
  const hasHotkey = hotkey != null && hotkey !== '';
  return createPortal(
    <span
      className={`ui-tip-box ui-tip hover-tip hover-tip-${placement}`}
      style={{ left: pos.left, top: pos.top }}
      aria-hidden="true"
    >
      <span className="ui-tip-headline">
        <span className={`ui-tip-title${hasHint ? '' : ' ui-tip-title-plain'}`}>
          {title}
        </span>
        {hasHotkey && <span className="ui-tip-hotkey">{hotkey}</span>}
      </span>
      {hasHint && <span className="ui-tip-sub">{hint}</span>}
    </span>,
    document.body,
  );
}

// A button that reveals its description (and optional hotkey) as the shared
// HoverTip on hover/focus — a drop-in for a native title= tooltip. Defaults to a
// 'bottom' tip, since these are mostly top-bar controls.
export function TipButton({
  tip,
  hint,
  hotkey,
  placement = 'bottom',
  children,
  ...rest
}: {
  tip: ReactNode;
  hint?: ReactNode;
  hotkey?: string;
  placement?: TipPlacement;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>(placement);
  return (
    <>
      <button
        {...rest}
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip
        pos={pos}
        placement={placement}
        title={tip}
        hint={hint}
        hotkey={hotkey}
      />
    </>
  );
}
