# Contributing to AstroLina

Thanks for your interest in contributing! AstroLina is open-source software
licensed under the GNU AGPL-3.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).

## Getting set up

Requires Node 24 LTS (see [`.nvmrc`](.nvmrc)). Node 22.12+ also works; Node 20
is end-of-life.

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # type-check + production build
```

See the [README](README.md) for the project layout, and
[docs/about.md](docs/about.md) / [docs/calculation-methods.md](docs/calculation-methods.md)
for what the app does and how the calculations work.

## Contributor License Agreement (required)

Before we can merge your contribution, you must agree to the
[Contributor License Agreement](CLA.md). In short: you keep the copyright to your
work, and you grant AstroLina a broad, irrevocable license to use it, **including
the right to relicense the project (for example, to offer a commercial license)
in the future**. This is what lets the project stay sustainable while remaining
open-source.

How to accept:

- **Recommended:** the project uses
  [CLA assistant](https://github.com/cla-assistant/cla-assistant) (or an
  equivalent bot) on pull requests. The first time you open a PR, the bot asks
  you to confirm agreement with a single click and records it.
- If the bot is not yet wired up, state in your pull request that you have read
  and agree to the CLA, and add your name, email, and GitHub handle to the
  signature block.

Contributing on behalf of a company? See "Entity / Corporate contributions" in
[CLA.md](CLA.md).

## Submitting changes

1. Fork and create a feature branch.
2. Keep changes focused, and match the surrounding code style.
3. Run `npm run build` and confirm it passes before opening a PR.
4. Open a pull request describing what changed and why.

## Reporting issues

Use the issue tracker for bugs and feature requests. For anything related to
data accuracy (ephemeris or atlas correctness), please include the exact birth
data / inputs and the expected vs. actual result.
