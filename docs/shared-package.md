# Sharing logic with design_preview: the plan

The Samsung module and `design_preview/` (in [hometv-launcher](https://github.com/rebeccamcfadden/hometv-launcher))
are both TypeScript web pages for the same launcher. The plan (BACKLOG › Tizen port) is to share their logic as a
package, not to copy it. The Android launcher's Java stays the reference for behaviour. Nothing here is done yet:
it needs the lead's go-ahead, because it changes hometv-launcher.

## What moves, first

Only pure logic: no DOM, no storage, no network. Each one is small.

| Today in `design_preview/src/` | In the package | Change needed |
|---|---|---|
| `types.ts` | `types.ts` | none |
| `data/services.ts` (`SERVICES`, `appName`, the services and stores to tick, `HOME_APPS` wordmarks) | `services.ts` | none |
| `data/offers.ts` (`bestOffer`, `offersByService`, `cardLine`, `priceLines`, `cheapestStore`) | `offers.ts` | It reads the ticked services from `core/settings.ts` (localStorage). It takes them as an argument instead; design_preview passes `settings.get()`. |
| `core/fuzzy.ts` (search matching) | `fuzzy.ts` | It reads the mock catalogue directly. It takes the titles and genres as arguments. |
| `core/keys.ts`: `KEY_INFO`, the status wording, the pairing code's alphabet | `keys.ts` | Split from the localStorage store, which stays in design_preview. The Tizen service keeps keys in its own file. |
| `styles/tokens.css` (colours, sizes) | `tokens.css` | none (CSS variables work on Chromium 49+) |

**Later, ported from the Java** (design_preview only mocks these today): `DeepLinks` (title links, with
`DeepLinksTest`'s cases as fixtures), `TmdbParse`, `WatchProviders`, the offer and price rules (`Offers`,
`OfferMerge`, `PriceBook`). The Java stays; the TypeScript copy is checked against the same test cases, so the two
can't drift silently.

**Stays where it is:** screens, styles other than the tokens, focus handling, anything that touches the page or
storage. Samsung's old engine needs its own CSS (no grid, no flex `gap`) anyway.

## Where it lives, and how each side gets it

1. **A folder in hometv-launcher: `packages/core/`**, TypeScript source with no build step and no dependencies.
2. **design_preview** imports it as `@hometv/core/...` through a path alias (`tsconfig.json` `paths` and Vite's
   `resolve.alias`) pointing at `../packages/core/src`. No workspace, no new install step: `npm install` and
   `npm run build` in `design_preview/` work as today, and the Pages workflow (which builds `design_preview/`) needs no
   change because the folder is in the same checkout.
3. **hometv-tizen**, now: a git submodule of hometv-launcher pinned to a commit (shallow and sparse, only
   `packages/core/`, so it doesn't pull the 110 MB repo), with the same alias. Updating is a deliberate bump of the
   pinned commit. No npm account needed.
4. **hometv-tizen**, once there is an npm account: hometv-launcher publishes `packages/core` (for example as
   `@rebeccamcfadden/hometv-core`), and hometv-tizen depends on a version. The module has to be on npm anyway for
   TizenBrew, so this adds no new account.

## Rules for the package

- **Runs on Chromium 56** (2018 Samsungs): no APIs newer than that in the source, such as `padStart` (57),
  `Object.fromEntries` (73), `Array.prototype.flat` (69) or `replaceAll` (85). A test in the package checks for
  them by name; hometv-tizen's build also parses its output as ES2017.
- **No DOM, no storage, no network, no dependencies.** Callers pass what the logic needs.
- **Tests travel with it** (Node's own test runner), so both repos run the same cases.

## Order, and what it costs

1. One PR in hometv-launcher (`design_preview: shared logic in packages/core`): move the six items above, the two
   small refactors, the alias, the tests. design_preview behaves exactly as before; `npm run build` passes. About
   half a day. Needs the lead's go-ahead (it touches design_preview and adds a top-level folder).
2. hometv-tizen adds the submodule and uses `services.ts` and `tokens.css` for Home's row (replacing the stand-ins
   in `app/src/apps.ts`). An hour.
3. The Java ports, one at a time, when the Samsung module needs them (title cards, prices).
