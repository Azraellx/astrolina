// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Two rate limits for a value that changes at input rate (2026-10-06, for the Custom theme's
// live preview: the interface repaints per input through CSS, the map at most every ~100 ms,
// and the consumers that rebuild something per colour — the line set's plugins — once the
// gesture is over).
//
// Both pass straight through while `ms <= 0`, and both re-seed their copy at the render the
// limit switches ON (the editor opening). Without that the copy would still hold whatever it
// held when the hook mounted, and the first limited render would hand back a stale value.
import { useEffect, useRef, useState } from 'react';

/** The copy a limiter shows, re-seeded from `value` whenever `live` (no limit) switches off. */
function useLimitedCopy<T>(value: T, live: boolean): [T, (v: T) => void] {
  const [copy, setCopy] = useState(value);
  const [wasLive, setWasLive] = useState(live);
  // React's "adjust state when an input changes" pattern: a state update during render,
  // only on the transition, which React applies before committing this render.
  if (live !== wasLive) {
    setWasLive(live);
    if (!live) setCopy(value);
  }
  return [live || wasLive ? value : copy, setCopy];
}

/**
 * `value`, at most once per `ms`, with both edges: the first change after a quiet spell lands
 * at once (on the next tick), and the last change of a burst always lands, `ms` after the one
 * before it. `ms <= 0` passes every value straight through.
 */
export function useThrottledValue<T>(value: T, ms: number): T {
  const [shown, setShown] = useLimitedCopy(value, ms <= 0);
  const latest = useRef(value);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = value;
  });

  useEffect(() => {
    if (ms <= 0 || Object.is(value, shown) || timer.current !== null) return;
    timer.current = setTimeout(
      () => {
        timer.current = null;
        last.current = Date.now();
        setShown(latest.current);
      },
      Math.max(0, last.current + ms - Date.now()),
    );
  }, [value, ms, shown, setShown]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return shown;
}

/**
 * `value` once it has stopped changing for `ms` (a debounce): the settled value, for work
 * that should run once per finished gesture. `ms <= 0` passes every value straight through.
 */
export function useSettledValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useLimitedCopy(value, ms <= 0);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms, setSettled]);
  return settled;
}

/** A callback throttle (createThrottle). */
export interface Throttle<T> {
  /** Publish `value` now after a quiet spell, else as the trailing value of the burst. */
  push(value: T): void;
  /** Cancel what is waiting, and hand it back (null when nothing was). */
  take(): T | null;
  /** Cancel what is waiting. */
  cancel(): void;
}

/**
 * The callback form of useThrottledValue's rate, with the same two edges: the first push after a
 * quiet spell is published at once, and the last of a burst always is, `ms` after the one before
 * it. For a stream that has somewhere to go other than a render — the Custom theme editor's map
 * draft (2026-10-06), whose publish is App's state setter. Its state lives in this closure, so a
 * holder keeps the object (useState's initializer) rather than a ref.
 */
export function createThrottle<T>(ms: number, publish: (value: T) => void): Throttle<T> {
  let next: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const flush = () => {
    timer = null;
    last = Date.now();
    const v = next;
    next = null;
    if (v !== null) publish(v);
  };
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    push(value) {
      next = value;
      if (timer !== null) return;
      const wait = last + ms - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    take() {
      cancel();
      const v = next;
      next = null;
      return v;
    },
    cancel,
  };
}
