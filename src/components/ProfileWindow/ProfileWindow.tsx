// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { TipButton } from '../ui/HoverTip';
import { useT } from '../../i18n';
import { getProfileSection } from '../../lib/extensions/profileSection';
import { planTierFor, tierName } from '../../lib/plan';
import './ProfileWindow.css';

interface ProfileWindowProps {
  /** Advanced reading mode. The plan tag is its toggle: NEW off, ADV on. */
  advancedWheel: boolean;
  setAdvancedWheel: (v: boolean) => void;
}

// The permanent top-left profile strip. It hosts an optional identity element
// (avatar / username, supplied by a downstream build through the profile-section
// seam) followed by the plan tag. In the open core there is no identity, so the
// strip is just the tag; clicking it auto-flips Advanced reading mode. A gated
// build can swap the click for its own action (e.g. open a plan screen).
export function ProfileWindow({
  advancedWheel,
  setAdvancedWheel,
}: ProfileWindowProps) {
  const { t } = useT();
  const { renderIdentity, onPlanTag } = getProfileSection();
  // The tag shows the user's rung on the shared ladder (the core reaches new ↔ adv
  // on its own; a downstream resolver can reach 'gated'). Its text comes from the
  // tier-label table, so a downstream build names each rung without the core knowing
  // those names. Clicking flips Advanced in the open core, or runs the installed
  // onPlanTag handler (e.g. open a plan screen).
  const tier = planTierFor(advancedWheel);
  const handlePlanTag = () =>
    onPlanTag
      ? onPlanTag({ advanced: advancedWheel, setAdvanced: setAdvancedWheel })
      : setAdvancedWheel(!advancedWheel);
  return (
    <div className="profile-window">
      {renderIdentity?.()}
      <TipButton
        type="button"
        className={`pw-plan-tag tier-${tier}`}
        onClick={handlePlanTag}
        role="switch"
        aria-checked={advancedWheel}
        placement="bottom"
        tip={t(advancedWheel ? 'profile.planTag.tipBasic' : 'profile.planTag.tip')}
        hint={t(advancedWheel ? 'profile.planTag.hintBasic' : 'profile.planTag.hint')}
      >
        {tierName(tier)}
      </TipButton>
    </div>
  );
}
