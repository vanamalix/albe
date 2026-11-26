# CLAUDE.md: albe

An interactive visualiser of curved spacetime, public at `https://albe.vananomad.com` (no login, `noindex`). README.md has
the physics, stack and scene notes.

## Shape
- Vite + React 19 + TypeScript, three.js through @react-three/fiber. Physics in `src/physics` with Vitest tests.
- The Worker `vananomad-albe` is static-assets-only: no `main`, no bindings, no storage.

## Rules
- Strict CSP: no inline script or style, no CDNs. `public/_headers` is generated: edit `headers.config.ts`, then
  `pnpm run headers` (a test catches drift).
- "How it works" (and the no-WebGL page) ends with the vananomad credit and Shielded button (hub `docs/platform/SITE-CREDIT.md`), and nothing goes
  to Shielded until the button is pressed.
- Shared packages (`@vanamalix`, exact pins): which and why are in `docs/governance/DEPENDENCIES.md`.
- Governance (`@vanamalix/governance`): `docs/governance/`, config `governance.config.json`. After `pnpm install`, once per
  clone: `git config core.hooksPath .githooks`. Tier a change with `pnpm exec vn-tier`; run gates with `pnpm exec vn-compliance`.
- pnpm only (`pnpm-lock.yaml`, `pnpm@10.18.0` pinned in `package.json`). This folder sits inside the hub repo, so the
  repo's own `pnpm-workspace.yaml` (`packages: [.]`) must stay: without it pnpm walks up and acts on the hub workspace.
- The owner's OK, in the conversation, every time: production deploy, secret, Access, DNS or route change.

## Commands
`pnpm run check` (typecheck + test + build + JS budget) · `pnpm run test:e2e` · `pnpm run headers` · `pnpm exec wrangler dev` ·
`pnpm run deploy` (owner).

Backup: private GitHub repo `vanamalix/albe`.
