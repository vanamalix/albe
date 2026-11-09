# Dependencies

Every dependency is code we ship without having written it. Changes to them are deliberate,
reviewable and reproducible.

## Rules

- **One package manager**: pnpm, pinned in the root `package.json` `packageManager` field, as a workspace
  (`pnpm-workspace.yaml`). No npm or yarn lockfiles alongside it.
- **Exact pins** in every `package.json` (`"1.2.3"`, not `^1.2.3` or `~1.2.3`). The lockfile is
  committed.
- **Frozen lockfile everywhere**: CI, release worktrees and agents install with
  `npm ci`. An install that wants to change the lockfile is a failure, not a
  prompt to regenerate it.
- **No silent upgrades.** A dependency is added, removed or upgraded only in a commit that says so
  (what, why, from which version to which), with the lockfile diff, and is at least tier T2.
  Dependency changes are never folded into an unrelated commit.
- **Monthly update PR.** A scheduled workflow opens one pull request a month with available updates,
  runs the gates, and never merges or deploys by itself; a human reviews the changelog of each bump.
  Security fixes may go out between those PRs, with the advisory linked in the commit.
- **Audit**: `npm audit --omit=dev` is reviewed with each update PR and before a release. Each finding is
  fixed, or recorded as not applicable with the reason (unreachable code path, dev-only), in the PR.
- **Install scripts are denied by default.** pnpm runs dependency lifecycle scripts only for packages
  on the allow-list (`onlyBuiltDependencies` in `pnpm-workspace.yaml`). Adding a package to it is a T3
  change: say what the script does and why the package cannot work without it.
- New dependencies: prefer the platform (Web APIs, WebCrypto, the standard library) and existing
  packages; check maintenance, licence and transitive size before adding one.

## App rules

**npm, not pnpm, overriding the shared pnpm rules above.** This repo has one static site and no workspace, and it sits inside
the hub repo, so pnpm would walk up and act on the hub workspace: never run pnpm here. `package-lock.json` is the lockfile,
and `npm ci` the install.

Reviewed 2026-11-09. Its older direct dependencies keep
their caret ranges and the lockfile pins them; `@vanamalix` packages use exact pins.

| Package | Used here? | Where or why not |
| --- | --- | --- |
| `ui` 0.2.0 | yes | `SiteCredit` and `ShieldedSite` in the "How it works" panel and the no-WebGL page (`src/ui/SiteFoot.tsx`). Its stylesheet is a whole-page design, so `src/ui/credit.css` copies only the credit rules and `scripts/credit-css.test.ts` catches drift. albe keeps its own branded 404 |
| `edge` 0.5.0 | yes | generates `public/_headers` (`headers.config.ts`, `scripts/headers.ts`) |
| `testing` 0.1.0 | yes | network guard in vitest, `vn-js-budget`, axe and screenshots in `tests/e2e` |
| `config` 0.2.1 | yes | strict tsconfig base. Log redaction unused: there are no logs |
| `governance` 0.4.0 | yes | tiers, gates, privacy scan, git hooks. No CI yet: it needs a registry token secret (owner) |
| `tokens` | no | albe has its own look (CONTRACT §1.3) and sets only the five variables the credit reads |
| `crypto`, `e2ee` | no | no ids, tokens, passwords or stored data |
| `mail` | no | the site sends nothing |
| `backup` | no | no data outside git; the private GitHub repo is the backup |
| `throttle` | no | no form, API or Worker code to limit |
| `secrets` | no | no secrets or bindings |
| `safe-fetch`, `cf-api` | no | no outbound calls; deploys go through wrangler |
| `features` | no | no feature tracker |
| `ai-vdh`, `scrape` | no | no AI and no crawling |
