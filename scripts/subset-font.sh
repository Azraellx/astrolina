#!/usr/bin/env bash
# Regenerate the astrological-glyph font subset. Most glyphs come from Noto Sans
# Symbols, but Pluto Form Two (U+2BD3) lives only in Noto Sans Symbols 2 — so we
# subset BOTH fonts and merge them into one woff2. Both are 1000 units-per-em, so
# the merge needs no rescaling and the glyphs stay metrically consistent.
# Run this after adding or removing a glyph in src/lib/astro/glyphChars.ts, then
# commit the updated .woff2.
#
# Prereq (one-time): python -m pip install fonttools brotli
#
# Output is woff2-only — woff2 is supported by ~98% of browsers, and anything
# older can't run this app's WebGL/WASM stack anyway.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The source TTFs aren't kept in the repo (~1.5 MB of binaries that only this
# script reads) — fetch them from the google/fonts mirror of the upstream Noto
# releases. The OFL.txt files under src/fonts/ stay committed: they license the
# shipped subset, not just the sources.
GF="https://raw.githubusercontent.com/google/fonts/main/ofl"
SYM="$TMP/NotoSansSymbols-VariableFont_wght.ttf"
SYM2="$TMP/NotoSansSymbols2-Regular.ttf"
curl -fsSL "$GF/notosanssymbols/NotoSansSymbols%5Bwght%5D.ttf" -o "$SYM"
curl -fsSL "$GF/notosanssymbols2/NotoSansSymbols2-Regular.ttf" -o "$SYM2"

OUT="src/fonts/subset-NotoSansSymbols-Regular.woff2"

# Codepoints drawn from Noto Sans Symbols: PLANET_GLYPHS (minus Pluto) + the 12
# SIGN_GLYPHS (U+2648–U+2653) + the four ELEMENT_GLYPHS (Alchemical Symbols
# U+1F701–U+1F704: air/fire/earth/water triangles). U+2609 (Sun ☉) and U+FE0E
# (text variation selector) are NOT in this font — the Sun falls back to the OS
# symbol font — so the subsetter silently ignores them; they're listed here for
# documentation. U+260C/260D are the conjunction/opposition aspects and U+26B9 the
# sextile (ASPECT_GLYPHS).
SYM_UNICODES="2609-260D,263D,263F,2640-2646,2648-2653,26B3-26B9,1F701-1F704,FE0E"
# From Noto Sans Symbols 2: Pluto Form Two (U+2BD3), the square (U+25A1) and trine
# (U+25B3) aspect shapes (ASPECT_GLYPHS), and the three MODALITY_GLYPHS — heavy
# cross (U+271A), black diamond (U+25C6), black medium square (U+25FC) — Geometric
# Shapes and Dingbats live only here.
SYM2_UNICODES="25A1,25B3,25C6,25FC,271A,2BD3"

# Pin the Symbols weight axis to Regular (400) → a small static font, then subset.
python -m fontTools.varLib.instancer "$SYM" wght=400 -o "$TMP/sym-reg.ttf" >/dev/null
python -m fontTools.subset "$TMP/sym-reg.ttf" \
  --unicodes="$SYM_UNICODES" \
  --name-IDs='*' \
  --output-file="$TMP/sym-sub.ttf"

# Noto Sans Symbols 2 is already a static Regular — subset to just Pluto Form Two.
python -m fontTools.subset "$SYM2" \
  --unicodes="$SYM2_UNICODES" \
  --name-IDs='*' \
  --output-file="$TMP/sym2-sub.ttf"

# Merge the two subsets (their cmaps are disjoint) into one font, then flavor as
# woff2. --name-IDs='*' retains the 'name' table records — copyright (ID 0),
# license (ID 13), license URL (ID 14) — so the OFL notice rides inside the woff2
# binary too (SIL OFL §2 / FAQ 2.4; belt-and-suspenders with public/fonts/OFL.txt).
python -m fontTools.merge \
  "$TMP/sym-sub.ttf" "$TMP/sym2-sub.ttf" \
  --output-file="$TMP/merged.ttf" >/dev/null
python -m fontTools.subset "$TMP/merged.ttf" \
  --unicodes='*' \
  --name-IDs='*' \
  --flavor=woff2 \
  --output-file="$OUT"

echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
