// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Click-a-line interpretation cards (lib/lineCard.ts). Original short readings:
// one bespoke text per traditional planet x angle; the other bodies compose a
// generic card from their planets.*.theme line plus the angle essence below.
// House style: short sentences, second person, no em dashes, ~2 sentences each.
export const lineMeanings = {
  // Card titles per angle ({planet} is the localized display name).
  title: {
    MC: '{planet} on the Midheaven',
    IC: '{planet} on the IC',
    ASC: '{planet} rising',
    DSC: '{planet} setting',
  },
  aspectTitle: '{planet} {aspect} {angle}',
  midpointTitle: '{a}/{b} on the {angle}',
  paranTitle: 'Paran: {a} × {b}',
  localSpaceTitle: 'Local space: {planet}',
  eclipticTitle: 'The ecliptic',

  // What each angle is "about", used by the generic card and the aspect/midpoint
  // templates.
  angleEssence: {
    MC: 'career, calling, and public reputation',
    IC: 'home, family, roots, and private life',
    ASC: 'your body, presence, and how you meet the world',
    DSC: 'partnership and the people you draw close',
  },

  // Generic card for bodies without bespoke texts (nodes, Lilith, Chiron,
  // asteroids): their one-line theme plus the angle essence.
  generic: '{theme} Along this line that theme colors {essence}.',
  // Extra line on a merged node line: the same geometry is both nodes.
  nodePair: 'This line is the North Node on one angle and the South Node on the opposite one.',

  // Bespoke planet-on-angle readings, the ten traditional planets.
  meanings: {
    Sun: {
      MC: 'Identity and life direction step into the spotlight. Recognition, leadership, and being seen for who you are come naturally here, and career carries your personal stamp.',
      IC: 'Vitality turns inward, toward home, roots, and self-knowledge. A strong place to build a private foundation, though public ambition tends to run quieter.',
      ASC: 'You come across with warmth, confidence, and presence. Energy runs high, and life here keeps inviting you to show up unmistakably as yourself.',
      DSC: 'Your light shines through the people you meet. Strong personalities are drawn to you, and partnership becomes a stage where you define who you are.',
    },
    Moon: {
      MC: 'Your public role takes a caring, responsive tone. Work with the public, with families, or with feelings can shape your reputation here.',
      IC: 'One of the most settled placements there is. Home, belonging, and emotional security come first, and nesting feels natural.',
      ASC: 'Feelings sit close to the surface and people read you easily. Intuition sharpens, moods move freely, and daily life feels more personal.',
      DSC: 'You attract emotionally attuned, nurturing company. Bonds deepen quickly, with feeling rather than planning setting the pace.',
    },
    Mercury: {
      MC: 'Career runs on words, ideas, and connections. Writing, teaching, trade, and media thrive, and your name travels through what you say.',
      IC: 'The mind turns homeward. Study, writing, and lively conversation flourish in private, and the household fills with books and ideas.',
      ASC: 'You meet the world curious and quick. Conversation comes easily, days fill with errands and exchanges, and wit becomes your calling card.',
      DSC: 'You draw talkers, thinkers, and dealmakers. Relationships here live on conversation, and partners sharpen your thinking.',
    },
    Venus: {
      MC: 'Charm works in your favor professionally. Art, beauty, diplomacy, and pleasant dealings lift your standing, and people enjoy working with you.',
      IC: 'Home becomes beautiful and harmonious. Comfort, taste, and affection gather in private life, and the household feels like a refuge.',
      ASC: 'You appear more attractive, graceful, and easy to like. Social life sweetens, and pleasure and beauty find you without much effort.',
      DSC: 'The classic line for love. Affection, romance, and agreeable partners come toward you, and relationships carry unusual sweetness.',
    },
    Mars: {
      MC: 'Ambition fires up. You compete, push, and take initiative in public, which can build an impressive career or a combative reputation.',
      IC: 'Energy pours into the home: renovating, defending, or wrestling with your roots. Watch for friction in the household.',
      ASC: 'You act faster, train harder, and assert yourself more directly. Courage rises here, and so does impatience.',
      DSC: 'You attract bold, driven, sometimes confrontational partners. Relationships run hot, with passion and argument close together.',
    },
    Jupiter: {
      MC: 'Doors open professionally. Opportunity, growth, and good reputation come more easily, and optimism reads as leadership.',
      IC: 'Abundance settles into private life. Homes grow larger and more generous, and family life carries faith and good humor.',
      ASC: 'Confidence and luck travel with you. Life feels more expansive here, with appetite, optimism, and opportunity all enlarged.',
      DSC: 'Generous, fortunate, often well-traveled people enter your life. Partnerships broaden your world and tend to bring benefit.',
    },
    Saturn: {
      MC: 'Career becomes serious business. Discipline and persistence can build lasting authority here, but recognition is earned slowly.',
      IC: 'Duty gathers at home: responsibility for family, property, or the past. A sobering place that builds deep, slow roots.',
      ASC: 'You read as older, steadier, more reserved. Life asks for structure and effort here, and rewards it with endurance.',
      DSC: 'Partners arrive serious, older, or duty-bound. Relationships demand commitment and patience, and the durable ones last.',
    },
    Uranus: {
      MC: 'Your path turns unconventional. Sudden career changes, original work, and a reputation for independence follow this line.',
      IC: 'Home life refuses routine. Moves, unusual households, and the urge to break with the past keep private life electric.',
      ASC: 'You feel freer, stranger, and more experimental. Restlessness and sudden changes of direction come with the territory.',
      DSC: 'Unusual, independent people arrive abruptly. Relationships form and change fast, and they need room to breathe.',
    },
    Neptune: {
      MC: 'Career blurs toward imagination: art, healing, spirituality, or service. Inspiring, though goals can dissolve and refocus.',
      IC: 'Home becomes a dream space, ideal for retreat, art, or contemplation. Boundaries and practical footing need attention.',
      ASC: 'You soften, idealize, and absorb the atmosphere around you. Imagination and compassion rise; clarity about yourself can fade.',
      DSC: 'You idealize the people you meet, and they may idealize you. Romantic and inspiring, with a real risk of seeing what you wish.',
    },
    Pluto: {
      MC: 'Power themes enter your public life. Influence, intensity, and transformation mark the career, and so can power struggles.',
      IC: 'Deep renovation of your foundations: family patterns surface to be reworked. Intense, private, and ultimately regenerative.',
      ASC: 'Presence intensifies. You affect people more strongly, and life here keeps pressing you to transform yourself.',
      DSC: 'Magnetic, consuming bonds form here. Relationships transform you, and questions of power and trust run through them.',
    },
  },

  // Aspect lines: frame + per-kind flavor, then the pointer back to the
  // conjunction line's meaning.
  aspect: {
    frame: '{planet} {aspect} the {angle} along this line.',
    kind: {
      trine: 'A trine works smoothly: the planet supports this angle with little effort.',
      sextile: 'A sextile offers friendly openings: its gifts arrive when you act on them.',
      square: 'A square works through friction: energizing and productive, but it asks for effort.',
    },
    pointer: 'Read it as a milder, more conditional echo of the {planet} {angle} line.',
  },

  // Midpoint lines: the pair's blend is angular, not either planet alone.
  midpoint:
    'The {a}/{b} midpoint sits on the {angle} here. The blend of both planets, rather than either alone, colors {essence}.',

  // Parans: two bodies exactly angular at once, valid along a latitude band.
  paran:
    '{a} and {b} are both exactly angular at this latitude, {a} on the {angleA} while {b} is on the {angleB}. The two themes work as one pair all along this latitude, within a band of a degree or two.',

  // Local space lines: a compass bearing from the origin, not a world line.
  localSpace:
    'The compass direction of {planet} from this chart’s location. Rooms, routes, and journeys along this bearing carry the planet’s theme; it speaks loudest near the origin.',

  // Fixed-star lines: one shared template (per-star readings are a content
  // project for later).
  starTitle: '{star} on the {angle}',
  star:
    'The fixed star {star} is exactly angular here. Star lines read narrowly: a tight, specific signature coloring {essence}, strongest within a degree or so of the line.',

  // The ecliptic reference circle.
  ecliptic:
    'The ecliptic: the zodiac’s circle traced onto the Earth. A reference line for the whole sky, not a personal line.',

  // One-line note keyed by the overlay tag prefix on a tagged (overlay) line.
  overlayNote: {
    Tr: 'A transit line: a temporary influence, tied to the overlay date.',
    Sp: 'A progressed line: a slowly unfolding influence for the overlay date.',
    Sa: 'A solar-arc line: a directed influence for the overlay date.',
    Pd: 'A primary-directions line: a directed influence for the overlay date.',
    // Only mixed-source CCG parans carry 'Cy' — cyclo lines tag their actual
    // source (Sp/Tr) and pick up those notes instead.
    Cy: 'A cyclo·carto·graphy paran pairing a progressed planet with a transiting one, read for the overlay date.',
    Sy: 'A synastry line: the partner chart’s line laid over this map.',
  },

  // Footer on every card.
  footer: 'A starting point, not a verdict: strength fades with distance, and the whole chart has a say.',
} as const;
