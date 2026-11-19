# Extended forms engine

Reusable form components live here, separate from grants-ui journeys, controllers, services and form state.
This is a source module, not a separately published npm package.

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
| `cookie-banner`     | `defraCookieBanner`  |
| `cookie-table`      | `appCookieTable`     |

Application templates continue importing names such as `heading/macro.njk`. Application-owned Nunjucks search paths
include this module's component root; components must not depend on application templates, globals or filters.

The cookie banner still posts to `/cookies`, with `crumb`, `async` and `returnUrl` hidden fields. The application owns
that route. Development-mode content, macro defaults and caller blocks retain their existing behavior.

## Styles and tests

Component styles live beside their templates. The help-panel styles are in `components/help-panel/_contact-panel.scss`.
The configured GOV.UK forwarding stylesheet lives in `stylesheets/_govuk-frontend.scss`; its asset path and global-style
settings are shared by the application build. Webpack includes both module roots in its Sass search paths.

Component tests are colocated as `template.test.js`. `test-helpers/component-helpers.js` provides
`createComponentRenderer(import.meta.url, macroName)`, returning a renderer that accepts parameters and an optional
caller block. Its private Nunjucks environment resolves only module components and GOV.UK templates, without application
configuration, globals, filters or fixtures. Application page integration tests remain outside this module.

## Dependency direction

Application code may use this module. This module, including its tests and helpers, may use its own files, Node built-ins
and installed npm packages, but must not import grants-ui sources or repository-root configuration. Template dependencies
must resolve within this module or the installed GOV.UK templates; Sass dependencies must remain within this module or
installed packages. Isolation enables later extraction without introducing compatibility copies or re-export shims.

## Verification

From the repository root:

```sh
npx vitest run --coverage.enabled=false \
  src/extended-forms-engine \
  src/server/common/components \
  src/server/common/templates \
  src/server/details-page/views \
  src/server/home/views/home.test.js \
  src/server/common/map/views/map-select-parcel.template.test.js
```

The existing Vitest configuration discovers the colocated tests. Production templates and styles were relocated without
implementation changes; rendering and application CSS must remain unchanged by relocation-only work.
