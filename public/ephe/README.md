# Swiss Ephemeris data files

These are Swiss Ephemeris compressed ephemeris files (`.se1`), fetched into the
WebAssembly engine (`@swisseph/browser`) and used as the single source of truth
for all astronomical calculations in the app.

## Planets, Moon and main asteroids

| File          | Contents                                   | Coverage      |
| ------------- | ------------------------------------------ | ------------- |
| `sepl_18.se1` | Planets (Sun–Pluto)                        | 1800–2399 AD  |
| `semo_18.se1` | Moon                                        | 1800–2399 AD  |
| `seas_18.se1` | Main asteroids: Chiron, Ceres, Pallas, Juno, Vesta — and Pholus | 1800–2399 AD |

`sepl` and `semo` load at startup; `seas` loads the first time a body in it is
shown. To support dates outside 1800–2399, add the adjacent files (e.g. `*_12.se1`
for 1200–1799, `*_24.se1` for 2400–2999) here and load them beside the existing ones
in `src/lib/ephemeris.ts` — `CORE_EPHE_FILES` for the planets and Moon,
`SEAS_EPHE_FILE` for the main asteroids.

## Numbered minor planets

The other files here are **per-asteroid** files, one per numbered minor planet,
under the engine's own names: `se00433s.se1` (433 Eros), `s136199s.se1`
(136199 Eris) — `se` and five digits up to 99999, then `s` and six or more. The
trailing `s` marks the **short** span, roughly 1500–2100, which is the only span
the app loads (a long file covers ten times the span, 3000 BC–3000 AD; see
`docs/calculation-methods.md` for the reasoning). The naming rule lives in
`src/lib/minorBodies/ids.ts`, and nowhere else.

They sit **flat**, not in the `ast0/`, `ast136/` … subdirectories the upstream
distribution uses. That works with no binding change because the engine's own
lookup falls back to the main directory: asked for body 433, it tries
`ast0/se00433.se1`, `ast0/se00433s.se1`, then `se00433.se1` and `se00433s.se1` in
the ephemeris directory itself. So a file mounted under its bare name is found —
by the browser engine, the downstream WASM build and `@swisseph/node` alike.

Which bodies ship is a curated list: `src/lib/minorBodies/bundled.json`. After
adding, removing or updating a file here, run

```sh
npm run build:minor-manifest   # checks every file, records its build date as `v`
npm run verify:minor-bodies    # names, spans, lines, and the JPL Horizons goldens
```

`v` rides on the file's URL as `?v=`, so an updated file is never answered from a
long-lived cache holding the old one. The manifest script refuses to write while
any listed file is missing or unreadable.

**Keep long files out of this directory.** The app never mounts one, so it would
ship unused — and on disk (the verify harness, the manifest script) the engine
tries the long name first and reads it in place of the short file.

## `/ephe/cat/` is reserved

The path `ephe/cat/` is reserved for a downstream build that serves further
catalog files itself (through a registered minor-body source,
`src/lib/extensions/minorBodySources.ts`). Nothing in this repository uses it; don't
put files there.

## `seorbel.txt` lives in `src/lib/minorBodies/`, not here

The hypothetical points (Cupido … Poseidon, TransPluto, Selena) are computed from
the engine's elements file, `seorbel.txt`. It ships beside the code that loads it,
`src/lib/minorBodies/seorbel.txt`, and **must not be copied into this folder**:

- The app imports it as text (`?raw`), so it becomes one more hashed script chunk,
  fetched the first time a point is switched on and mounted into the engine from
  memory (`ensureHypotheticalElements` in `src/lib/ephemeris.ts`). A downstream
  build's service worker precaches that chunk with the rest of the app; the rule it
  applies to this folder stores binary ephemeris responses only.
- `public/_headers` marks this folder immutable for a year. A file that can be
  revised under the same name doesn't belong under that promise.
- The verify harness puts this folder on the engine's path. A copy here would let the
  suite pass with the mount broken, which is exactly the failure it has to catch:
  without the file the engine does not fail for bodies 40–54, it silently computes
  them from element sets compiled into it (Kronos 14–20″ off the file's). The app
  therefore computes nothing for a point until body 56, which has no built-in set,
  has computed from the mounted file.

## Source & license

Downloaded from Astrodienst's Swiss Ephemeris distribution: the planet, Moon and
main-asteroid files from <https://github.com/aloistr/swisseph/tree/master/ephe>, and
the per-asteroid files from its asteroid directories (`ast0/`, `ast1/`, …; see
<https://www.astro.com/swisseph/>).

Swiss Ephemeris is dual-licensed; this project uses it (and redistributes these
data files, the per-asteroid files included) under the **GNU Affero General Public
License v3.0 (AGPL-3.0)**, the same license as the rest of this repository.
Minor-planet numbers and names are those assigned by the Minor Planet Center and
the IAU, as carried in each file's header.

`seorbel.txt` (in `src/lib/minorBodies/`, see above) is the same distribution's
`ephe/seorbel.txt` for version 2.10.03, from the repository linked above: added there
on 2023-09-20 (commit `eecb996`), unchanged since, and identical at the
`v2.10.3final` tag, whose `sweph.h` reports version 2.10.03 (the `v2.10.03` tag
itself predates the file's arrival in the repository). Retrieved 2026-09-29 and
shipped under the same license, header included, with every element line unchanged;
some comment lines were removed or shortened, those naming people. A note in its
header says so, as the license asks of a modified file. The app normalises its line
endings to LF when it hands the file to the engine and changes nothing else.
`npm run verify:minor-bodies` (§9b) pins its element lines against the official
file's, and the shipped file as a whole separately. The copy inside
`@swisseph/node` is an older revision of the same file: its numbered element sets
1–25 are identical, but it lacks set 26 and carries older comments.
