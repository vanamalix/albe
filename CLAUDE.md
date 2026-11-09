# CLAUDE.md: albe

An interactive visualiser of curved spacetime, public at `https://albe.vananomad.com` (no login, `noindex`). README.md has
the physics, stack and scene notes.

## Shape
- Vite + React 19 + TypeScript, three.js through @react-three/fiber. Physics in `src/physics` with Vitest tests.
- The Worker `vananomad-albe` is static-assets-only: no `main`, no bindings, no storage.

## Rules
- Strict CSP: no inline script or style, no CDNs. `public/_headers` is generated: edit `headers.config.ts`, then
  `npm run headers` (a test catches drift).
- "How it works" (and the no-WebGL page) ends with the vananomad credit and Shielded button (hub `docs/platform/SITE-CREDIT.md`), and nothing goes
  to Shielded until the button is pressed.
- Shared packages (`@vanamalix`, exact pins): which and why are in `docs/governance/DEPENDENCIES.md`.
- Governance (`@vanamalix/governance`): `docs/governance/`, config `governance.config.json`. After `npm install`, once per
  clone: `git config core.hooksPath .githooks`. Tier a change with `npx vn-tier`; run gates with `npx vn-compliance`.
- npm only (`package-lock.json`). Never run pnpm here: this folder sits inside the hub repo, so pnpm walks up and acts on the
  hub workspace.
- The owner's OK, in the conversation, every time: production deploy, secret, Access, DNS or route change.

## Commands
`npm run check` (typecheck + test + build + JS budget) · `npm run test:e2e` · `npm run headers` · `npx wrangler dev` ·
`npm run deploy` (owner).

Backup: private GitHub repo `vanamalix/albe`.
