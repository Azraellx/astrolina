// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The crash guard for browser page translation (React issue #11538, open since 2017).
// Chrome and Edge translate a page by REPLACING its text nodes with <font> elements; React
// still holds the originals, now detached, and the next time it removes one or inserts
// beside one the DOM throws NotFoundError — which unmounts the whole root and leaves the
// reader a blank page. This turns exactly those calls into no-ops:
//   • removeChild(child) where child is no longer this node's child → returns child;
//   • insertBefore(node, ref) where ref is no longer this node's child → returns node,
//     inserting nothing.
//
// It is installed unconditionally, first thing at boot (2026-10-09). Translation can start
// before anything could detect it — the browser offers it on load, and a reader who chose
// "always translate" never sees the offer at all — and the patch only changes calls that
// would otherwise throw, so a page nobody translates behaves exactly as before.
//
// Its limit: it stops the crash, not the drift. A node React meant to remove can survive as
// a stray translated "ghost", and text React writes into a detached node never shows. The
// structural rule is the real fix — an element whose text changes while visible has exactly
// one string child or carries translate="no"; content that swaps wholesale remounts under a
// key — and this guard is the net under whatever that rule has not reached yet.

const FLAG = '__astroTranslateGuard';

export function installTranslateGuard(): void {
  if (typeof Node === 'undefined') return;
  const proto = Node.prototype as Node & { [FLAG]?: true };
  if (proto[FLAG]) return;
  Object.defineProperty(proto, FLAG, { value: true });
  const dev = Boolean(import.meta.env?.DEV);

  const removeChild = proto.removeChild;
  proto.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (dev) console.warn('[translateGuard] removeChild: not a child of this node (page translated?)', child, this);
      return child;
    }
    return removeChild.call(this, child) as T;
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function guardedInsertBefore<T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      if (dev) console.warn('[translateGuard] insertBefore: reference is not a child of this node (page translated?)', ref, this);
      return node;
    }
    return insertBefore.call(this, node, ref) as T;
  };
}
