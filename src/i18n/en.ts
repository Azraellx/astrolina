// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// English catalog — the single source of truth for the app's user-facing text and for
// the typed key system (see types.ts). It is composed from one fragment per feature
// under ./en/, so each component owns its own slice. Language-neutral content (glyphs,
// abbreviations like MC/IC/As/Ds, 3-letter sign codes, proper nouns, license ids) is
// intentionally NOT in this catalog. `{name}` tokens are interpolated at runtime;
// `{n, plural, …}` uses Intl.PluralRules. A future locale mirrors this shape and is
// checked with `… satisfies Messages`.
//
// To add a feature namespace: create ./en/<name>.ts (`export const <name> = {…} as const`)
// and add it to the import + composition below. (InfoBar has no fragment — it reuses the
// shared settings.* enum maps via makeEnumLabels.)
import { common } from './en/common';
import { planets } from './en/planets';
import { signs } from './en/signs';
import { settings } from './en/settings';
import { timeline } from './en/timeline';
import { topNav } from './en/topNav';
import { chartForm } from './en/chartForm';
import { chartInfoPanel } from './en/chartInfoPanel';
import { chartManager } from './en/chartManager';
import { chartSwitcher } from './en/chartSwitcher';
import { chartWheel } from './en/chartWheel';
import { coordReadout } from './en/coordReadout';
import { creditsModal } from './en/creditsModal';
import { eclipseHud } from './en/eclipseHud';
import { expandedSidebar } from './en/expandedSidebar';
import { importChartModal } from './en/importChartModal';
import { lineMeanings } from './en/lineMeanings';
import { map } from './en/map';
import { missions } from './en/missions';
import { profile } from './en/profile';
import { teleportHud } from './en/teleportHud';
import { localSpaceHud } from './en/localSpaceHud';
import { captureHud } from './en/captureHud';
import { synastryHud } from './en/synastryHud';
import { wheel } from './en/wheel';

export const en = {
  common,
  planets,
  signs,
  settings,
  timeline,
  topNav,
  chartForm,
  chartInfoPanel,
  chartManager,
  chartSwitcher,
  chartWheel,
  coordReadout,
  creditsModal,
  eclipseHud,
  expandedSidebar,
  importChartModal,
  lineMeanings,
  map,
  missions,
  profile,
  teleportHud,
  localSpaceHud,
  captureHud,
  synastryHud,
  wheel,
} as const;
