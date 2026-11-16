# Offline place-name data

These JSON files are **generated** by [`scripts/build-cities.mjs`](../../../../scripts/build-cities.mjs) from [GeoNames](https://www.geonames.org/) and committed to the repo (like `world-atlas` ships its one JSON). They power offline-first reverse geocoding (pin readout) and the birthplace typeahead, so the online geocoder is hit only on a miss.

| File | Source table | Shape |
|---|---|---|
| `cities15000.json` | `cities15000` (places ≥ 15,000 pop, ~31k after dropping sub-city `PPLX` records, plus a short hand-additions list in the script) | `[name, asciiname, lat, lng, countryCode, admin1Code, population, geonameid, capital][]`, sorted by population desc |
| `admin1.json` | `admin1CodesASCII` | `{ "US.CA": "California", … }` |
| `countries.json` | `countryInfo` | `{ "US": "United States", … }` |
| `names/<lang>.json` (es, pt, tr, de, ru, pl) | `alternateNamesV2`, with `admin1CodesASCII` for the regions' ids | `{ "cities": { "<geonameid>": "Viyana", … }, "admin1": { "AT.09": "…", … } }` — only names that differ from the English |

The `names/` files hold the atlas's cities and regions in the other interface languages, read by `src/lib/atlas/placeNames.ts`, which loads only the file for the language on screen (none in English). A place missing from a file reads in English. Countries are not there: the runtime names them (`countryName.ts`, `Intl.DisplayNames`). The selection: no historic, colloquial or ended names; the language's own script only (Latin, or Cyrillic for Russian); a Brazilian Portuguese name before a plain Portuguese one; a preferred name before any other; a short name only when nothing else is there; nothing that is just the English name with its accents taken off; and a short list of corrections in the script.

## Regenerate

```sh
node scripts/build-cities.mjs
node scripts/build-city-names.mjs                # after build-cities, so new cities get their names
node scripts/build-city-names.mjs --zip <path>   # keep the ~200 MB download at <path> (outside the repo) for a rerun
```

`build-cities` downloads the three GeoNames tables, trims them, and rewrites the files in place. `build-city-names` streams `alternateNamesV2.zip` (one download, deleted afterwards unless `--zip` names where to keep it), fetches `admin1CodesASCII` once, and rewrites `names/`; it prints each language's counts and sizes.

## License / attribution

GeoNames data is licensed **CC BY 4.0** — commercial use is permitted with attribution. The app surfaces the required credit in the map's attribution control (see `src/components/Map/Map.tsx`):

> Places © GeoNames (CC BY 4.0)

Source: <https://www.geonames.org/> · License: <https://creativecommons.org/licenses/by/4.0/>
