// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The auto-flip notice — shown when an action rewrote a setting the user hadn't
// asked about. Short on purpose: the full reasoning belongs on the setting's own hover
// tip, which is still there tomorrow, whereas this card is gone in two seconds. Say
// what moved and the one fact that makes it follow, then stop.
//
// Where the control LIVES is a separate question, and the answer depends on whether the
// card can point at it. When a kind's target is on screen the card anchors beside it and
// rings it — so a sentence describing where it sits is spent narrating something the
// reader is already looking at. Those kinds name the control in its OWN words instead
// (the segment labels, the option names), which still locates it for a screen reader,
// where the ring is no help at all. The kinds that CANNOT anchor — no target, or one
// behind a panel that may well be shut — keep the plain "it lives in X", because for
// them it is the only route back.
//
// So the copy is coupled to AUTO_FLIP_META[kind].target: give a kind a target that is
// only sometimes rendered and its body needs the location clause back.
export const autoFlip = {
  suppress: 'Don’t show me again',
  ok: 'Got it',

  // Always anchored (the snap that fires this is two controls away from the frame segments),
  // so no location clause: the title already names both the setting and the value it moved
  // to, which is what a screen reader needs, and the ring does the rest for everyone else.
  //
  // Both sentences describe the frame the reader is NOW in. An earlier draft opened on the
  // one they are NOT in ("on My angles its lines would…") and read as a non-sequitur — the
  // card announces a move to Sky now and then talks about somewhere else, so the reader has
  // to hold a counterfactual before they have been told what they actually got. The reason
  // still turns on the alternative, so it is IMPLIED ("the only frame its lines move in")
  // rather than narrated; the comparison itself belongs on the two segments' own tips.
  'overlay-frame': {
    title: 'Overlay frame set to Sky now',
    body: 'This frame reads the sky as it actually stood at the return’s own moment. The returning body is back on its birth degree, so this is the only frame its lines move in.',
  },
  // Fires from several tools, so the trigger stays unnamed — but the old "has no meaning
  // under the Mundane mapping" asserted the conclusion without the fact behind it. The
  // location stays: this points into the Calculation panel, which is often shut.
  'line-system': {
    title: 'Line system set to Celestial',
    body: 'Mundane maps the tropical zodiac onto Earth’s longitudes, so it carries no sidereal time — and what you just opened needs it. The line system lives in Calculation.',
  },
  // The map changes exactly as it does above, but nothing was taken — so the sentence
  // that matters here is the one about getting it back, not the one about what moved.
  'line-system-held': {
    title: 'Mundane is on hold',
    body: 'Mundane maps the tropical zodiac onto Earth’s longitudes, so there is no sidereal version of it to draw. Your choice is held, not cleared — set the zodiac back to Tropical and it returns.',
  },
  // No target at all — it is reopened from a menu — so this card never anchors and never
  // rings anything. The last sentence is the reader's only route back; don't strip it by
  // analogy with 'overlay-frame' above, which can afford to drop it precisely because it
  // is pointing at the thing.
  'local-space-off': {
    title: 'Local space closed',
    body: 'The Mundane mapping is time-independent, and local space is built from the birth moment. Reopen it from the View menu.',
  },
  // Not a change — a difference. Worth saying plainly, because the reader's first
  // encounter with it is usually a set of lines that don't match the program they came
  // from, and "this app is wrong" is the reasonable conclusion from that evidence.
  // Kept short: it lands unasked-for, and the reader is here to look at their map. It
  // does say what the two readings DO differently, though — without that the sentence
  // asks to be taken on trust, which is exactly what the reader is already unwilling to
  // do. How far they diverge (Pluto ~17°, the Moon ~5°) still belongs in the control's
  // own hint and in Help, not in a card that will be gone in five seconds.
  //
  // Framed as two ways of answering one question rather than as us-versus-them. The
  // earlier draft opened "Most other programs default to In Zodiaco", which puts the
  // reader's own software on one side of a disagreement in the first four words — and
  // the words available for the other side ("true", "actual") all imply the program
  // they trust is wrong. It isn't; it answers a different question. Nothing here ranks
  // the two, which also leaves the reader free to switch without conceding anything.
  //
  // The two branches get one short sentence each, both NAMED. An earlier draft ran them
  // together and named only In Zodiaco, which left the reader holding two options and one
  // label and no way to tell which was which — while the title, the only place In Mundo
  // appeared, says which is ON without saying what it means. And "latitude and all" is
  // load-bearing rather than decorative: it is what "flattens" flattens, so the pair only
  // clicks if the first sentence has already put the latitude there.
  //
  // The control is named rather than pointed at even though this one always anchors,
  // because the ring beside it is no help to a screen reader.
  'line-projection': {
    title: 'These lines are drawn In Mundo',
    body: 'Every program has to decide where a body “is” before it can draw its line. In Mundo places it where it sits in the sky, latitude and all. In Zodiaco flattens that latitude onto the ecliptic first — the usual default elsewhere, and usually why lines here differ from a map you already know. Line projection switches between them.',
  },
} as const;
