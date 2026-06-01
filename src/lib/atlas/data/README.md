# Offline place-name data

These JSON files are **generated** by [`scripts/build-cities.mjs`](../../../../scripts/build-cities.mjs) from [GeoNames](https://www.geonames.org/) and committed to the repo (like `world-atlas` ships its one JSON). They power offline-first reverse geocoding (pin readout) and the birthplace typeahead, so the online geocoder is hit only on a miss.

| File | Source table | Shape |
|---|---|---|
| `cities15000.json` | `cities15000` (places ≥ 15,000 pop, ~31k after dropping sub-city `PPLX` records) | `[name, asciiname, lat, lng, countryCode, admin1Code, population][]`, sorted by population desc |
| `admin1.json` | `admin1CodesASCII` | `{ "US.CA": "California", … }` |
| `countries.json` | `countryInfo` | `{ "US": "United States", … }` |

## Regenerate

```sh
node scripts/build-cities.mjs
```

Downloads the three GeoNames tables, trims them, and rewrites the files in place.

## License / attribution

GeoNames data is licensed **CC BY 4.0** — commercial use is permitted with attribution. The app surfaces the required credit in the map's attribution control (see `src/components/Map/Map.tsx`):

> Places © GeoNames (CC BY 4.0)

Source: <https://www.geonames.org/> · License: <https://creativecommons.org/licenses/by/4.0/>
