# Extended forms engine

Reusable form components live here, separate from grants-ui journeys, controllers, services and form state.
This is a source module, not a separately published npm package.

This is the initial reusable-components slice of
[LDR-003: Modular Structure by Reuse and Lifecycle Phase](https://github.com/DEFRA/farming-grants-docs/blob/5338bbb070b245e0861603216e2b2bd313c0169f/docs/projects/grants-ui/decision-records/ldr-003-modular-structure-by-reuse-and-lifecycle-phase.md).
It contains no grant, GAS, application configuration or service-route knowledge. The wider `grants/` and `service/`
reorganisation is separate work; existing application-owned code stays in its current locations.

## Components

Each directory under `components/` retains its existing `macro.njk` and `template.njk` interface:

| Directory           | Public macro         |
| ------------------- | -------------------- |
| `heading`           | `appHeading`         |
| `two-thirds-column` | `appTwoThirdsColumn` |
| `help-panel`        | `appHelpPanel`       |
| `section-list`      | `appSectionList`     |
| `format-duration`   | `appFormatDuration`  |
| `demo-aware-button` | `appDemoAwareButton` |
| `dev-mode-banner`   | `appDevModeBanner`   |
| `cookie-table`      | `appCookieTable`     |

Application JavaScript imports only `src/extended-forms-engine/index.js`. Its public exports are:

- `templatePaths`: Nunjucks search paths for the component macros listed above.
- `sassPaths`: Sass load paths for `heading/heading` and `help-panel/contact-panel`.

Register these paths without changing their position relative to application search paths. Template imports such as
`heading/macro.njk` remain unchanged; component implementations and test helpers are private to the module.
Components must not depend on application templates, globals or filters.

The cookie banner remains in `src/server/common/components/cookie-banner`, because its `/cookies` action and hidden
fields belong to the service's cookie-consent protocol. Its macro and rendered output are unchanged.

## Styles and tests

Component styles live beside their templates. The help-panel styles are in `components/help-panel/_contact-panel.scss`.
The application owns GOV.UK asset paths, branding and global-style configuration in
`src/client/stylesheets/_govuk-frontend.scss`; reusable components depend directly on the GOV.UK npm package.
Webpack registers the module's exported `sassPaths` after the application's stylesheet path.

Component tests are colocated as `template.test.js`. `test-helpers/component-helpers.js` provides
`createComponentRenderer(import.meta.url, macroName)`, returning a renderer that accepts parameters and an optional
caller block. Its private Nunjucks environment resolves only module components and GOV.UK templates, without application
configuration, globals, filters or fixtures. Application page integration tests remain outside this module.

## Dependency direction

Application code may use this module. This module, including its tests and helpers, may use its own files, Node built-ins
and installed npm packages, but must not import grants-ui sources or repository-root configuration. Template dependencies
must resolve within this module or the installed GOV.UK templates; Sass dependencies must remain within this module or
installed packages. Isolation enables later extraction without introducing compatibility copies or re-export shims.

The local ESLint rule `grants-ui/extended-forms-engine-boundaries` enforces this module's dependency direction and public `index.js`
interface, including tests and helpers. The rest of the LDR dependency matrix will be introduced with those modules;
this slice has no existing violations to baseline. Use ESM imports with literal paths; grants-ui aliases,
application/root-file imports, computed imports, CommonJS loaders, loader factories and URL imports are prohibited
inside the module.

`tools/extended-forms-engine-isolation.test.js` checks the real ESLint policy and recursively validates Nunjucks
dependencies, including conditional imports and `ignore missing`. Template names must be literal strings naming existing
files within the approved roots, with no traversal or symlink escape. It checks that module template names do not collide
with application templates, so lookup order cannot silently replace a reusable component. It also compiles every module
Sass entry, checks its loaded dependencies and rejects residual CSS `@import` rules. Positive and negative fixtures guard
the dependency policies. These checks enforce source dependencies; they are not a sandbox for hostile code.

## Verification

From the repository root:

```sh
npx vitest run --coverage.enabled=false \
  src/extended-forms-engine \
  src/server/common/components \
  src/server/common/templates \
  src/server/details-page/views \
  src/server/home/views/home.test.js \
  src/server/common/map/views/map-select-parcel.template.test.js \
  src/client/javascripts/land-grants/select-actions-page.template.test.js \
  src/client/javascripts/parcel-map/parcel-view-toggle.test.js
```

Run the dependency-policy checks with:

```sh
npx vitest run --coverage.enabled=false tools/extended-forms-engine-isolation.test.js
npx eslint src/extended-forms-engine
npm run lint:types
```

The policy test also runs through the existing `tools/**/*.test.js` discovery in `npm test`; no separate test
configuration is needed.

The existing Vitest configuration discovers the colocated tests. This extraction preserves component implementations
and public template names; rendering and application CSS must remain unchanged.
