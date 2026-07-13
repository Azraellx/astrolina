// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
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
// seam) followed by the plan tag.
//
// Open core: there is no identity, so the strip is just the tag; clicking it
// auto-flips Advanced reading mode (a role=switch toggle, tip on the tag).
//
// Gated build (an onPlanTag handler is installed — e.g. opens a plan/account
// screen): the WHOLE strip becomes one click + hover-tip target, so the avatar and
// name are part of the affordance, not just the tag. The tag keeps its hover
// animation (now also cued by hovering the strip).
export function ProfileWindow({
  advancedWheel,
  setAdvancedWheel,
}: ProfileWindowProps) {
  const { t } = useT();
  const { renderIdentity, onPlanTag } = getProfileSection();
  // The tag shows the user's rung on the shared ladder (the core reaches new ↔ adv
  // on its own; a downstream resolver can reach 'gated'). Its text comes from the
  // tier-NAME table (the plan-pill channel), NOT the compact tier-label table that
  // marks a feature's required tier — so the plan a user is ON never borrows the
  // ADV/PRO feature-badge vocabulary, and this pill stays in lockstep with the
  // wheel-sidebar plan pill. Clicking flips Advanced in the open core, or runs the
  // installed onPlanTag handler (e.g. open a plan screen).
  const tier = planTierFor(advancedWheel);
  const handlePlanTag = () =>
    onPlanTag
      ? onPlanTag({ advanced: advancedWheel, setAdvanced: setAdvancedWheel })
      : setAdvancedWheel(!advancedWheel);

  const interactive = !!onPlanTag;
  const { ref, pos, show, hide } = useHoverTip<HTMLDivElement>('bottom');

  if (interactive) {
    // The whole strip opens the plan/account screen. The tip still tracks the current rung
    // so it stays in lockstep with the wheel-sidebar tag: the account nudge from Basic, or a
    // pointer to the account screen once on Advanced.
    const tip = t(advancedWheel ? 'profile.planTag.tipBasic' : 'profile.planTag.tip');
    const hint = t(advancedWheel ? 'profile.planTag.hintBasic' : 'profile.planTag.hint');
    return (
      <>
        <div
          ref={ref}
          className="profile-window profile-window--interactive"
          role="button"
          tabIndex={0}
          aria-label={typeof tip === 'string' ? tip : undefined}
          onClick={handlePlanTag}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePlanTag();
            }
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
        >
          {renderIdentity?.()}
          <span className={`pw-plan-tag tier-${tier}`}>{tierName(tier)}</span>
        </div>
        <HoverTip pos={pos} placement="bottom" title={tip} hint={hint} />
      </>
    );
  }

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
