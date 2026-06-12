# scratch/

Local-only workspace for throwaway scripts: one-off math probes, ephemeris
spot-checks, debugging harnesses, screenshot drivers — anything written to
answer a question once and not meant to ship. Everything here except this
README is gitignored, so experiments never clutter `git status` or risk being
committed.

Conventions:

- Run scripts from the repo root (`node scratch/whatever.mjs` or `npx tsx …`)
  so relative paths like `public/ephe` resolve; `@swisseph/node` and `tsx`
  are available as devDependencies.
- If an experiment proves something worth keeping, graduate it into
  `scripts/` as a documented `verify-*` script (see `scripts/verify-eclipses.ts`
  and `scripts/verify-angle-aspects.mjs` for the shape) — the scratch original
  can then be deleted.
- Files here are disposable by definition. Delete freely.
