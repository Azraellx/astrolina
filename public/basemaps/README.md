# Basemap styles

## `maptiler-basic.json` — the **Vintage** theme's basemap

A self-hosted MapLibre GL style used by the Vintage theme (`BASEMAP_STYLE_URLS.vintage`
in `src/lib/theme.ts`).

It is the **MapTiler Basic** style
([openmaptiles/maptiler-basic-gl-style](https://github.com/openmaptiles/maptiler-basic-gl-style),
**BSD-3-Clause**), with its `sources`, `glyphs`, and `sprite` repointed from the
MapTiler API (which needs a key) to **[OpenFreeMap](https://openfreemap.org/)** —
the same free, no-key OpenMapTiles-schema vector tiles, fonts, and sprite the app's
other themes already use. Only the 48 style `layers` are taken from MapTiler Basic;
the underlying data and rendering infra are OpenFreeMap / OpenMapTiles / OSM.

To regenerate (e.g. to pull upstream layer tweaks):

```sh
curl -fsSL https://raw.githubusercontent.com/openmaptiles/maptiler-basic-gl-style/master/style.json -o src.json
node -e 'const fs=require("fs"),s=JSON.parse(fs.readFileSync("src.json","utf8"));fs.writeFileSync("maptiler-basic.json",JSON.stringify({version:8,name:"Basic (OpenFreeMap)",glyphs:"https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",sprite:"https://tiles.openfreemap.org/sprites/ofm_f384/ofm",sources:{openmaptiles:{type:"vector",url:"https://tiles.openfreemap.org/planet"}},layers:s.layers}))'
```

### Licensing

- **Style** (`maptiler-basic.json` layers): BSD-3-Clause — see
  `MAPTILER-BASIC-LICENSE.md` (© MapTiler.com & OpenMapTiles contributors; © Mapbox).
  BSD-3-Clause is compatible with this repository's AGPL-3.0 license.
- **Tiles / fonts / sprite**: served by OpenFreeMap from OpenMapTiles + OpenStreetMap
  data (ODbL). OSM attribution is shown by the map's attribution control.
