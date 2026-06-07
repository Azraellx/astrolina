// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Pure, framework-agnostic catalog helpers. resolvePath walks a dot-path into the
// active catalog; interpolate substitutes {name} tokens. Both are consumed by the
// I18nProvider's t(); kept here so they can be unit-tested without React.
import type { Messages, TVars } from './types';

// Walk a dot-path ('a.b.c') into the catalog and return the string leaf, or undefined
// if the path is missing or lands on a non-string node.
export function resolvePath(catalog: Messages, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (node !== null && typeof node === 'object' && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

// Replace {name} tokens with vars[name]. Unknown tokens are left intact (visible in
// the UI), which makes a missing variable obvious during development.
export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}
