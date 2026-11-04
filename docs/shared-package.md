# Sharing logic with design_preview: the plan

The Samsung module and `design_preview/` (in [hometv-launcher](https://github.com/rebeccamcfadden/hometv-launcher))
are both TypeScript web pages for the same launcher. The plan is to share their logic as a
package, not to copy it. The Android launcher's Java stays the reference for behaviour. **Step 1 is under way**
(decided 2026-11-04): one PR in hometv-launcher with everything below except `offers.ts`, which follows once
the Two regions work on it has merged. On Samsung there is one region (decided 2026-11-04): it uses the
single-region path of the offers.

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
3. **hometv-tizen** takes it as a git submodule of hometv-launcher pinned to a commit (shallow and sparse, only
   `packages/core/`, so it doesn't pull the 110 MB repo), with the same alias. Updating is a deliberate bump of the
   pinned commit. That's the route for good: HomeTV on Samsung is its own app (decided 2026-11-04), so nothing is
   published to npm.

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
2. hometv-tizen adds the submodule and uses `services.ts` for Home's row (`app/src/apps.ts` adapts it: Samsung's
   name for each app, brand colours) and `keys.ts` for the API keys screen. **Done 2026-11-04**, pinned to 2bf3c2d
   (#158's merge). `tokens.css` comes in with the first ported screens (W3/W4).
   To move to a newer packages/core: `git -C vendor/hometv-launcher fetch --depth 1 origin main`, check out the
   commit, `npm run build && npm test`, then commit the new pin.
3. The Java ports, one at a time, when the Samsung module needs them (title cards, prices).
