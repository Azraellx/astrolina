// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Click-a-line interpretation cards (lib/lineCard.ts). Original short readings:
// one bespoke text per body x angle for all eighteen bodies, a one-line
// signature per fixed star, and theme-woven templates for parans and local
// space (the generic theme + essence card remains as a fallback).
// House style: short sentences, second person, no em dashes, ~2 sentences each.
export const lineMeanings = {
  // Card titles per angle ({planet} is the localized display name).
  title: {
    MC: '{planet} on the Midheaven',
    IC: '{planet} on the IC',
    ASC: '{planet} rising',
    DSC: '{planet} setting',
    VX: '{planet} on the Vertex',
    AVX: '{planet} on the Anti-Vertex',
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
    VX: 'fated meetings, turning points, and what life brings unbidden',
    AVX: 'the familiar ground you act from when fate comes calling',
  },

  // Generic card for bodies without bespoke texts (nodes, Lilith, Chiron,
  // asteroids): their one-line theme plus the angle essence.
  generic: '{theme} Along this line that theme colors {essence}.',
  // Extra line on a merged node line: the same geometry is both nodes.
  nodePair: 'This line is the North Node on one angle and the South Node on the opposite one.',

  // Bespoke body-on-angle readings, every computed body.
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
    NorthNode: {
      MC: 'Your growth path points at public life. Vocation here keeps pulling you into unfamiliar territory that turns out to fit, and reputation builds by stretching.',
      IC: 'Growth runs through roots. Building a home, a base, or a family here moves your life forward, even when it feels like starting over.',
      ASC: 'Life here asks you to become more fully yourself. New habits, a new presence, and a sense of heading somewhere come with the place.',
      DSC: 'The people you meet carry your next lessons. Partnership here is less about comfort than about who you are becoming.',
    },
    SouthNode: {
      MC: 'Public life runs on old, well-worn skills. Success can come easily here, but it tends to repeat the past rather than grow it.',
      IC: 'Home feels instantly familiar, like somewhere you have already lived. Comforting and deep, with a pull toward old patterns.',
      ASC: 'You slip into an old version of yourself here. Effortless, familiar, and worth watching: ease is not the same as growth.',
      DSC: 'Relationships feel fated and familiar from the start. Old dynamics resurface through partners, to be enjoyed or finally outgrown.',
    },
    Chiron: {
      MC: 'Your wound becomes your work. Careers in healing, teaching, or mentoring flourish here, with authority earned through what once hurt.',
      IC: 'Old family pain surfaces at home, asking to be tended. A healing place once faced, and a tender one until then.',
      ASC: 'You wear your vulnerability closer to the surface. People here see it, and trust you more for it; the healer in you steps forward.',
      DSC: 'You attract people who need mending, or who mend you. Relationships here touch the sore spot first and the medicine second.',
    },
    Ceres: {
      MC: 'Care becomes the career. Feeding, growing, teaching, or looking after others builds your public standing here.',
      IC: 'A nourishing place to live. The household centers on food, comfort, and looking after one another, and it shows.',
      ASC: 'You come across warmer and more protective. Looking after people, animals, or gardens comes naturally here.',
      DSC: 'Nurturing people come toward you. Relationships here run on care given and received, with mothering themes close by.',
    },
    Pallas: {
      MC: 'Strategy earns the reputation. Pattern-seeing, planning, design, and advocacy thrive in public here.',
      IC: 'The home becomes a workshop for ideas. Plans, crafts, and quiet problem-solving fill private life.',
      ASC: 'You read situations faster here. Perception sharpens, and people seek your take before they act.',
      DSC: 'You draw clever allies and tacticians. Partnerships here work best as meetings of minds.',
    },
    Juno: {
      MC: 'Partnership shapes the public story. Marriage, contracts, and loyal alliances become visible themes of life here.',
      IC: 'Commitment gathers at home. A place that favors settling down, shared property, and promises kept in private.',
      ASC: 'You present as someone ready to commit, and the question of partnership follows you. Loyalty becomes part of your presence.',
      DSC: 'The marriage angle for the marriage asteroid. Serious, binding partnership themes concentrate here, for better and for worse.',
    },
    Vesta: {
      MC: 'Work becomes devotion. A career pursued like a calling, with focus and integrity your public signature.',
      IC: 'The home turns inward and sacred, a hearth more than a social hub. Solitude here restores you.',
      ASC: 'You carry a contained, dedicated intensity. Focus comes easily, at the price of letting fewer things in.',
      DSC: 'You attract devoted, self-contained people. Relationships here need a shared purpose more than constant company.',
    },
    Lilith: {
      MC: 'The untamed self goes public. A reputation for independence, and for refusing the script, follows this line.',
      IC: 'Private life refuses to be domesticated. Home here must leave room for the wild parts of you.',
      ASC: 'Raw instinct comes to the surface. Magnetic and unapologetic, you are harder to ignore and harder to manage here.',
      DSC: 'You draw intense outsiders and the fiercely independent. Relationships here run on attraction, not obligation.',
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
  // The two theme lines (planets.*.theme) are woven in so the pair reads as a
  // blend, in the same high-level style as the planet cards.
  paran:
    '{a} and {b} are both exactly angular at this latitude, {a} on the {angleA} while {b} is on the {angleB}. {themeA} {themeB} Here the two work as one pair, within a band of a degree or two of this latitude.',

  // Local space lines: a compass bearing from the origin, not a world line.
  localSpace:
    '{theme} This is the compass direction of {planet} from this chart’s location: rooms, routes, and journeys along this bearing carry that theme, loudest near the origin.',

  // Fixed-star lines: the star's one-line signature woven into a shared frame.
  starTitle: '{star} on the {angle}',
  star:
    'The fixed star {star} is exactly angular here. {theme} Star lines read narrowly: that signature colors {essence}, strongest within a degree or so of the line.',

  // One-line signatures for the bundled star catalog, in the classical
  // tradition's keywords, written in our own words. Standalone sentences, so
  // they drop into the star template (and stay reusable for future reports).
  starThemes: {
    Algol: 'The most notorious star: raw, primal intensity that demands conscious handling.',
    Alcyone: 'The Pleiades’ chief star: vision and inner sight, with a note of sorrow to transmute.',
    Aldebaran: 'The Bull’s eye, a royal star: success through unbending integrity.',
    Rigel: 'The teacher and builder: knowledge spread, projects raised, progress made.',
    Capella: 'The charioteer’s goat star: restless curiosity and love of freedom.',
    Betelgeuse: 'Unhindered success and strength that does not need permission.',
    Canopus: 'The navigator’s star: long journeys, leadership, and finding the way.',
    Sirius: 'The brightest star: brilliance, fame, and the sacred becoming visible.',
    Procyon: 'Quick chances that must be seized: success that comes fast and asks for follow-through.',
    Pollux: 'The boxer twin: toughness of mind, sharp words, and contest.',
    Regulus: 'The royal star of kings: success and command, kept only by renouncing revenge.',
    Spica: 'The gift of the harvest: brilliance, protection, and talent that flows outward.',
    Arcturus: 'The pathfinder: prosperity through bold first steps into new ground.',
    Antares: 'The Scorpion’s heart, a royal star: all-or-nothing intensity and the courage it demands.',
    Vega: 'The harpist’s star: charisma, artistry, and a touch of magic in the voice.',
    Altair: 'The eagle: boldness, swift action, and daring that pays.',
    'Deneb Algedi': 'The law-giving sea-goat: wise counsel and justice over sentiment.',
    Fomalhaut: 'The royal star of ideals: success that lasts only while the dream stays clean.',
    Alpheratz: 'Freedom of movement: independence, speed, and doors that open.',
    Mirach: 'Receptive grace: beauty, sympathy, and easy connection.',
    Achernar: 'The river’s end: rapid resolution, for better or worse.',
    Hamal: 'The ram’s head: willful drive that needs a worthy aim.',
    Menkar: 'The whale’s jaw: forces from the collective deep, surfacing suddenly.',
    Mirfak: 'The hero’s side: youthful boldness and the love of the challenge itself.',
    Bellatrix: 'The Amazon star: victory through struggle, won the hard way.',
    Alnilam: 'The belt’s center: brief brilliance and public attention.',
    Castor: 'The storyteller twin: wit, letters, and the double-edged word.',
    Alphard: 'The serpent’s heart: passion with an undertow, asking for clean motives.',
    Denebola: 'The lion’s tail: the maverick who succeeds out of step with the mainstream.',
    Acrux: 'The Southern Cross’ anchor: ceremony, depth, and matters of the spirit.',
    Algorab: 'The crow’s wing: the scavenger’s cunning, and the cost of shortcuts.',
    Toliman: 'The neighboring sun: relationships between unequals, and learning from them.',
    'Zuben Elgenubi': 'The southern scale: reform won through personal cost.',
    'Zuben Eschamali': 'The northern scale: reform that brings honor and reward.',
    Alphecca: 'The northern crown: quiet achievement that earns a lasting crown.',
    Unukalhai: 'The serpent’s neck: healing power entwined with poison; handling decides which.',
    Rasalhague: 'The healer’s head: medicine, teaching, and the urge to mend what is broken.',
    Deneb: 'The swan’s tail: idealism in flight and far-carrying vision.',
    Scheat: 'The spring of ideas: independent thought, with practical footing to keep.',
    Markab: 'The saddle of Pegasus: steadiness under speed; honors that ask for composure.',
  },

  // The ecliptic reference circle.
  ecliptic:
    'The ecliptic: the zodiac’s circle traced onto the Earth. A reference line for the whole sky, not a personal line.',

  // One-line note keyed by the overlay tag prefix on a tagged (overlay) line.
  overlayNote: {
    Tr: 'A transit line: a temporary influence, tied to the overlay date.',
    Sp: 'A progressed line: a slowly unfolding influence for the overlay date.',
    Tp: 'A tertiary-progressed line: a faster progressed hand (a day for a lunar month) for the overlay date.',
    Sa: 'A solar-arc line: a directed influence for the overlay date.',
    Pd: 'A primary-directions line: a directed influence for the overlay date.',
    // Only mixed-source CCG parans carry 'Cy' — cyclo lines tag their actual
    // source (Sp/Tr) and pick up those notes instead.
    Cy: 'A cyclo·carto·graphy paran pairing a progressed planet with a transiting one, read for the overlay date.',
    Sy: 'A synastry line: the partner chart’s line laid over this map.',
  },

  // Closest-approach row at the bottom of every card: how near the line passes to the pin (or
  // the natal location by default). {icon} is the inline pin glyph; the "NN km / NN mi" value
  // is appended after the label in lineCard.ts.
  distance: {
    fromPin: 'Closest distance to {icon} pin:',
    fromNatal: 'Closest distance to natal:',
  },

  // Footer on every card.
  footer: 'A starting point, not a verdict: strength fades with distance, and the whole chart has a say.',
} as const;
