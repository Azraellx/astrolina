# Bundled font

The astrological glyphs (planets, zodiac signs, Black Moon Lilith, lunar nodes,
the four element triangles, aspect shapes) are drawn with a **subset of Noto Sans
Symbols** — pinned to Regular (400) and reduced to only the codepoints the app
renders (see `scripts/subset-font.sh`). A handful of glyphs exist only in **Noto
Sans Symbols 2** — Pluto Form Two (U+2BD3), the square/trine aspect shapes, and
the modality-bar icons (heavy cross, diamond, medium square) — so the subset
script also pulls those from it. Two more — the **Sun** (U+2609) and the **Part of
Fortune** (U+2297, "circled times" — an X inside the circle) — are in neither
Symbols font, so they come from **Noto Sans Math**. The subset merges all three into one `.woff2`
(all are 1000 units-per-em, so they stay metrically consistent).
The subset `.woff2` lives in `src/fonts/` and is inlined into the built
stylesheet, so there is no separate font file at runtime; this directory ships
the font's license alongside the deployed site at `/fonts/OFL.txt`.

## Source & license

- **Fonts:** Noto Sans Symbols and Noto Sans Symbols 2
  (<https://github.com/notofonts/symbols>) and Noto Sans Math
  (<https://github.com/notofonts/math>)
- **Copyright:** Copyright 2022 The Noto Project Authors
- **License:** SIL Open Font License, Version 1.1 — full text in
  [`OFL.txt`](./OFL.txt) (and at <https://openfontlicense.org>)

The merged subset is a "Modified Version" under the OFL. This is permitted: it
stays under the OFL only, and the copyright notice + license travel with the
distribution (this folder / `OFL.txt`, which `vite build` copies verbatim into
`dist/fonts/`). All three Noto families declare **no Reserved Font Name**, so the
subset keeps the `Noto Sans Symbols` family name.
