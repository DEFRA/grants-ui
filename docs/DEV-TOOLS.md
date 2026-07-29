# Dev Tools

Development-only tools and routes for testing and debugging. Automatically enabled in development mode and disabled in production.

## Configuration

Development tools are controlled by the `DEV_TOOLS_ENABLED` environment variable (default: `true` in development, `false` in production).

Implementation lives in `src/server/dev-tools/` and is only registered when `DEV_TOOLS_ENABLED=true`.

## Available Dev Routes

All development routes are prefixed with `/dev/`:

### Demo Confirmation Pages

**Route:** `/dev/demo-confirmation/{form-slug}`

Preview confirmation pages with mock data for any form in the system. Useful for:

- Testing confirmation page templates
- Validating dynamic content insertion
- Previewing new grant confirmation pages

**Example:** `http://localhost:3000/dev/demo-confirmation/example-grant-with-auth`

When running in development mode, the demo confirmation handler:

- Shows warning messages when no confirmation config is found
- Provides fallback demonstration content
- Displays form metadata (title, slug, ID) for debugging
- Includes error details when configuration issues occur
- Uses mock data for testing dynamic content insertion

### Demo Print Application Pages

**Route:** `/dev/demo-print-application/{form-slug}`

Preview the print submitted application page with auto-generated mock answers for any form in the system.

**Example:** `http://localhost:3000/dev/demo-print-application/example-grant-with-auth`

### Error Page Testing

Test error page rendering at the following routes:

| Route           | Error Code | Description           |
| --------------- | ---------- | --------------------- |
| `/dev/test-400` | 400        | Bad Request           |
| `/dev/test-401` | 401        | Unauthorized          |
| `/dev/test-403` | 403        | Forbidden             |
| `/dev/test-404` | 404        | Not Found             |
| `/dev/test-429` | 429        | Too Many Requests     |
| `/dev/test-500` | 500        | Internal Server Error |
| `/dev/test-503` | 503        | Service Unavailable   |

These routes trigger the corresponding HTTP errors to verify error page templates render correctly.

## Demo Data Configuration

Configure demo data for development tools:

```bash
DEV_DEMO_REF_NUMBER=DEV2024001
DEV_DEMO_BUSINESS_NAME=Demo Test Farm Ltd
DEV_DEMO_SBI=999888777
DEV_DEMO_CONTACT_NAME=Demo Test User
```

## Local config & form-definition overrides

The `gt up` flow runs `tools/setup-local-config.sh` first, which rebuilds `localstack/config-broker-local` by pulling the `DEFRA/grants-config-*` repos from GitHub.

### Offline-safe config pull

The config tree is built into a temporary staging folder and only swapped into `config-broker-local` after a **fully successful** pull. If GitHub is unreachable (e.g. you're offline), the staging folder is discarded and the existing `config-broker-local` folder is left untouched as a working "cached" copy. As long as that folder already holds config files, the script prints a clear "keeping existing cached config … continuing offline" message and exits **successfully**, so `up` completes and the config broker keeps working without internet. Only when there is no cached config to fall back to (the folder is missing or empty — typically a first run that has never pulled) does the script exit non-zero with a useful error explaining that an internet connection is required to download the config at least once.

### Skip re-downloading when already at the latest version

Each grant is stored under a version-named folder (e.g. `grasslands@0.4.0`), so the existing `config-broker-local` folder itself tells the script which versions are already present. On each run the script resolves every `DEFRA/grants-config-*` repo's latest tag (a cheap API call), then for each config file reuses the cached copy when `<grant>@<version>/<service>/<file>` already exists on disk, downloading only what is missing. So when a repo's latest tag is unchanged nothing is re-downloaded, and a new/changed version (or an empty cache, or a missing grant folder) is pulled fresh automatically.

### Local form-definition overrides

For editing and testing a local WIP grant's **form definition** (not yet ready to push to the config repo), drop the definition into `localstack/config-broker/local-form-definitions/`, mirroring the repo layout `<grant>/<service>/<file>` (e.g. `woodland/grants-ui/woodland.yaml`). A single **Local form-definition overrides (all grants)** toggle in the `gt` TUI `local` menu enables/disables these local overrides.

- Each enabled override is published to grants-ui-backend as one patch above the repo version (repo `1.2.3` -> override `1.2.4`), becoming the active version the frontend serves. The override document is stamped with a fresh `updatedAt` so grants-ui's forms-engine model cache (invalidated only when the definition's `updatedAt` changes) rebuilds and serves the new content rather than a stale compiled model.
- Toggling **on** before `up` applies overrides automatically once the stack is healthy; toggling **on/off** while the stack is running applies/removes them immediately (no restart).
- While the override is active, a `↳ refresh overrides` item appears directly below `local` in the `gt` main menu. Selecting it re-publishes the local YAML into Mongo on demand, so you can iterate on the definition and pull in your latest edits without toggling the override off and on again (containers must be running).
- The injected definition's `name` gets a ` (local override active)` suffix so an overridden form is easy to tell apart from the real repo version.
- Toggling **off** deletes the bumped document and purges the dependent `state__grant_application_state`, `state__grant_application_locks` and submissions for that version, so the frontend cleanly reverts to the repo version with no orphaned drafts.
- A plain `down` keeps the Mongo volume, so a bumped override document survives a stop/start. To keep the DB in sync with the toggle even when it was flipped **off while the stack was stopped**, the next `up` reconciles once the stack is healthy: with the toggle on it re-applies the overrides, and with the toggle off (but override files still present) it purges any leftover override so the frontend always matches the toggle state.

See [Local form-definition overrides](DOCKER.md#local-form-definition-overrides) in the Docker docs for full details.

## Journey Runner

Automates clicking through grant application forms in the browser. Useful for quickly reaching a specific page during development without manually filling in every field.

### How it works

1. A Hapi plugin (`journey-runner-plugin.js`) serves a script at `/dev/journey-runner/{journey}.js`
2. The page layout template (`page.njk`) includes this script on every page
3. The script reads a JSON journey definition, matches the current page URL to a step, fills in the form fields, submits, repeating on each page load until it reaches the target step

### Usage

Navigate to the grant's normal start page (e.g. `http://localhost:3000/methane/start`), not a `/dev/` route. The journey runner script is automatically loaded on every page via the layout template.

Open the browser console and run:

```js
runJourney() // Run through all steps
runJourney(5) // Stop before step 5
runJourney('sectionName') // Run only the named section
stopJourney() // Cancel a running journey
```

Sections allow you to complete one task list section at a time. The section name must match the `section` property in the journey JSON steps.

### Run from the CLI

The same journeys can be driven headlessly from the terminal with `gt journey <slug>`, without opening a browser or the devtools console:

```sh
gt journey woodland                                   # walk the whole journey headlessly
gt journey example-grant-with-auth --stop 8           # stop before step 8
gt journey woodland --stop eligibility                # run only the "eligibility" section
gt journey example-grant-with-auth --headed           # watch a real browser drive it
```

#### Or pick from the interactive menu

Prefer not to remember slugs and flags? Run `gt` with no arguments to open the interactive TUI, then choose **`journey ⇢`** from the main menu. It walks you through the same options as prompts — no flags needed:

1. **Journey** — pick from the discovered journey definitions (each annotated with the CRN it uses, or a ⚠ warning if it can't complete on a standard local stack).
2. **CRN** — only asked when a journey has more than one known-good CRN (e.g. woodland); otherwise the right CRN is chosen automatically.
3. **Headed or headless** — headless runs in the background (bundled Chromium); headed watches it in your installed Google Chrome.
4. **Clear state?** — keep the saved application state (resume where it left off) or reset to step 1, matching the footer "Clear application state" link.
5. **Stop on which page?** — headed runs only: halt the browser on a chosen page for inspection, or run to the end.

Journeys flagged as won't-complete (e.g. **farm-payments**, **methane**) make you acknowledge why before running. The `journey ⇢` item is disabled until the Docker stack is up; for a plain `npm run dev` server use the `gt journey <slug>` form above instead.

Under the hood this launches a Chromium browser (reusing the acceptance suite's Playwright install in `acceptance/`), signs in through the DefraID stub, then calls `runJourney()` on the page and streams the `[journey-runner]` console output to your terminal. It exits non-zero if the journey gets stuck, and prints the final page heading and any error summary to help diagnose the stall.

| Flag               | Default                   | Purpose                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--crn <crn>`      | journey's allowlisted CRN | DefraID CRN to sign in as. Defaults per journey to a CRN on that grant's allowlist — most grants are `allowAll` (uses `1102838829`), but **woodland** needs `1100943757`/`1100943838`, and **farm-payments** uses `1102838829`. The interactive menu lets you pick when a journey has more than one. |
| `--stop <n\|sect>` | run to the end            | Stop before step `n` (1-indexed), or run only section `sect`                                                                                                                                                                                                                                         |
| `--headed`         | headless                  | Watch the run in your installed Google Chrome (headless uses bundled Chromium)                                                                                                                                                                                                                       |
| `--clear`          | keeps state               | Flush saved application state first, so `--stop` starts from step 1                                                                                                                                                                                                                                  |
| `--base-url <url>` | auto-detected             | App base URL — defaults to `https://localhost:4000` when the HA addon is running, otherwise `http://localhost:3000`                                                                                                                                                                                  |
| `--skip-install`   | installs chromium         | Skip `playwright install chromium`                                                                                                                                                                                                                                                                   |

The app must already be running (`gt up` or `npm run dev`), and the same land-grants/mockserver setup described below is needed for journeys that reach `/select-land-parcel` or `/total-area-of-woodland`. The stub password comes from `DEFRA_ID_USER_PASSWORD` (defaults to `x`, matching `acceptance/run-local.sh`).

The base URL is auto-detected from the running stack: `http://localhost:3000` normally, or `https://localhost:4000` when the **High Availability** addon (`gt up --ha`) fronts the app with its HTTPS nginx proxy (the self-signed cert is accepted automatically). Override with `--base-url` for a non-standard setup.

The journey must be allowlisted for the signed-in user, or the app redirects to `/auth/journey-unauthorised` and the run reports as stuck. Locally the allowlist lives in the `config__allowlist_entries` collection in the `grants-ui-backend` Mongo database; `example-grant-with-auth` is seeded `allowAll`, so it's the most reliable journey to smoke-test with.

### Adding a new journey

Create a JSON file in `journey-runner/journeys/` named after the grant's URL slug (e.g. `methane.json`).

The file is an array of step objects, executed in order:

```json
[
  { "slug": "start", "name": "Start", "type": "submitOnly" },
  { "slug": "are-you-eligible", "name": "Eligibility", "type": "yesNo", "fieldName": "isEligible" }
]
```

Each step requires:

| Field       | Required | Description                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`      | Yes      | The page URL slug to match against                                                                                                                                                                                                                                                                                                             |
| `name`      | Yes      | Human-readable label (for console logs)                                                                                                                                                                                                                                                                                                        |
| `type`      | Yes      | The handler to use (see below)                                                                                                                                                                                                                                                                                                                 |
| `section`   | No       | Section name, used for section-based `runJourney()` calls                                                                                                                                                                                                                                                                                      |
| `matchMode` | No       | Set to `"prefix"` to match `/{slug}/{itemId}` URLs where `itemId` is a UUID (used for `RepeatPageController` item-entry pages). Default match compares the page path (URL with the form slug stripped) for exact equality with `"/" + slug`, so multi-segment slugs like `"repeat-page/summary"` match the literal `/repeat-page/summary` URL. |

### Step types

| Type            | Description                                                                                             | Extra fields                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `submitOnly`    | Clicks the submit button                                                                                | None                                                                                                    |
| `yesNo`         | Selects a radio button and submits                                                                      | `fieldName`, `value` (default `"true"`)                                                                 |
| `radios`        | Selects a radio option                                                                                  | `fieldName`, `value` (optional; selects that specific option, e.g. a land parcel, instead of the first) |
| `checkboxes`    | Selects the first checkbox                                                                              | `fieldName`, `selectAll` (optional; `true` ticks every checkbox for the field)                          |
| `landActions`   | Ticks a land-grants action checkbox and fills its revealed quantity input (`landActionQuantity_<code>`) | `fieldName`, `value` (optional quantity, default `1`)                                                   |
| `numberField`   | Fills a number/text input                                                                               | `fieldName`, `value`                                                                                    |
| `selectField`   | Selects the first non-empty option                                                                      | `fieldName`                                                                                             |
| `multilineText` | Fills a textarea                                                                                        | `fieldName`, `value`                                                                                    |
| `dateParts`     | Fills day/month/year inputs with today                                                                  | `fieldName`, `offsetDays` (optional, shifts date)                                                       |
| `monthYear`     | Fills month/year inputs with current                                                                    | `fieldName`                                                                                             |
| `textFields`    | Fills multiple text inputs at once                                                                      | `fields` (object of `{ name: value }` pairs)                                                            |
| `clickLink`     | Clicks a link by its href suffix                                                                        | `linkSlug`                                                                                              |

### Existing journeys

| File                                | Grant                     |
| ----------------------------------- | ------------------------- |
| `example-grant-with-auth.json`      | Example grant (with auth) |
| `example-grant-with-task-list.json` | Example grant (task list) |
| `farm-payments.json`                | Farm payments (see note)  |
| `pigs-might-fly.json`               | Flying pigs               |
| `methane.json`                      | Methane                   |
| `woodland.json`                     | Woodland Management Plan  |

> **farm-payments note:** the journey enters at `/confirm-farm-details` (this grant has no `/start` page) and runs cleanly up to `/select-actions-for-land-parcel`. Completing `select-actions` needs a land parcel that the land-grants backend accepts for the offered actions — the seeded actions are moorland-only (`CMOR1`, `UPL1`–`UPL3`), so a **majority-moorland parcel** is required. If the local land-grants seed has no moorland parcel, every parcel is rejected with _"This parcel is not majority on the moorland"_ and the runner stops there. That is a backend seed-data condition, not a journey-spec problem. Once such a parcel exists, add its ID as the `value` on the `select-land-parcel` step to target it.

### Example grant with auth

The `example-grant-with-auth` journey is the canonical demo of every form component. Use the step numbers below with `runJourney(N)` to stop on a specific page. For example, `runJourney(8)` fills in and submits steps 1–7, then lands on the `number-field-validation` page without filling it in. Handy when iterating on a single component.

There are two `NumberField` demos because the engine treats validation and conditional routing as separate concerns: step 8 (`/number-field-validation`) demonstrates schema-level `min`/`max` rejection (you cannot leave the page until the value is in range), while step 9 (`/number-field-routing`) demonstrates an `is more than` condition that diverts the journey when the value exceeds £100,000 (the value is accepted; only the next page changes).

Steps 20 and 21 traverse a `RepeatPageController`: the engine renders one URL per item (`/repeat-page/{itemId}`, where `{itemId}` is a UUID) plus a list-summary URL (`/repeat-page/summary`), so the runner needs two steps — the first uses `matchMode: "prefix"` to match the per-item URL by UUID, the second uses the literal slug `"repeat-page/summary"` to match the summary URL exactly. See the `matchMode` row above.

Step 17 (`/location-components`) groups five location field types on a single page (`EastingNorthingField`, `OsGridRefField`, `NationalGridFieldNumberField`, `LatLongField`, `GeospatialField`); the runner submits valid values for all five (the `GeospatialField` textarea is filled with a single-feature GeoJSON example). Step 18 (`/hidden-field`) demonstrates a `HiddenField` rendered with no visible input — the runner just submits the page.

| Step | Page slug                 | Component / purpose                                                                                                           |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `start`                   | Start page (guidance components)                                                                                              |
| 2    | `check-details`           | Authenticated details check (DefraID)                                                                                         |
| 3    | `yes-no-field`            | `YesNoField`                                                                                                                  |
| 4    | `autocomplete-field`      | `AutocompleteField`                                                                                                           |
| 5    | `radios-field`            | `RadiosField`                                                                                                                 |
| 6    | `conditional-page`        | Conditional page (reached when radios option one is chosen)                                                                   |
| 7    | `checkboxes-field`        | `CheckboxesField`                                                                                                             |
| 8    | `number-field-validation` | `NumberField` with schema `min`/`max` validation                                                                              |
| 9    | `number-field-routing`    | `NumberField` driving an `is more than` condition (routing demo)                                                              |
| 10   | `date-parts-field`        | `DatePartsField`                                                                                                              |
| 11   | `month-year-field`        | `MonthYearField`                                                                                                              |
| 12   | `select-field`            | `SelectField`                                                                                                                 |
| 13   | `multiline-text-field`    | `MultilineTextField`                                                                                                          |
| 14   | `email-address-field`     | `EmailAddressField`                                                                                                           |
| 15   | `telephone-number-field`  | `TelephoneNumberField`                                                                                                        |
| 16   | `uk-address-field`        | `UkAddressField` (compound)                                                                                                   |
| 17   | `location-components`     | `EastingNorthingField`, `OsGridRefField`, `NationalGridFieldNumberField`, `LatLongField`, `GeospatialField` (all on one page) |
| 18   | `hidden-field`            | `HiddenField` (rendered as `<input type="hidden">`; no visible control)                                                       |
| 19   | `multi-field-form`        | Multiple components on one page (`TextField` + others)                                                                        |
| 20   | `repeat-page/{itemId}`    | `RepeatPageController` item entry (one item filled in)                                                                        |
| 21   | `repeat-page/summary`     | `RepeatPageController` list summary — submit to continue                                                                      |
| 22   | `select-land-parcel`      | `CommonSelectLandParcelPageController` + `CheckboxesField`                                                                    |
| 23   | `summary`                 | Check answers (`CheckResponsesPageController`)                                                                                |
| 24   | `declaration`             | Declaration / submit (`DeclarationPageController`)                                                                            |

A few pages are reached only when their conditions match and are skipped by `runJourney()` during a normal traversal. Each one demonstrates a different condition operator:

| Page                    | Operator       | Value type     | Trigger                                                                | Runner default    |
| ----------------------- | -------------- | -------------- | ---------------------------------------------------------------------- | ----------------- |
| `/terminal-page`        | `is`           | `BooleanValue` | Answer "No" on `/yes-no-field`                                         | "Yes"             |
| `/number-too-high`      | `is more than` | `NumberValue`  | Enter any value over £100,000 on `/number-field-routing` (e.g. 200000) | £50,000           |
| `/checkboxes-follow-up` | `contains`     | `ListItemRef`  | Tick "Option three" on `/checkboxes-field`                             | First option only |

To exercise these pages, run `runJourney(N)` to land on the trigger page (`runJourney(3)` for terminal, `runJourney(9)` for number routing, `runJourney(7)` for checkboxes), then enter a triggering value manually and submit.

#### Environment setup for `runJourney()` to reach `/declaration`

Step 22 (`/select-land-parcel`) renders parcels fetched from the DAL stub for the signed-in SBI and runs `performAuthCheck` against the same source on submit. For the journey runner to clear the page, three things have to line up — the same conditions that the woodland journey relies on:

1. **Sign in with CRN `1102838829`.** The DAL stub (`grants-ui-dal-stub`) returns parcels for this CRN; signing in with another CRN renders no checkboxes (or ones that fail the auth check).
2. **Run with mockserver in front of the land-grants API.** The default `compose.yml` already points `LAND_GRANTS_API_URL` at mockserver. If you're running `compose.land-grants.yml` (real backend), layer in `compose.journey-runner.yml`:

   ```sh
   npm run docker:landgrants:journey-runner:up
   # tear down with: npm run docker:landgrants:journey-runner:down
   ```

3. **Clear stale state between runs.** Visit `http://localhost:3000/example-grant-with-auth/clear-application-state` to flush both the Redis-backed form state and the in-memory parcel cache.

The `select-land-parcel` step in `example-grant-with-auth.json` uses `"selectAll": true`, so the runner ticks every rendered parcel checkbox before submitting (mirroring the `land-parcels` step in `woodland.json`).

If `runJourney()` reports `Stuck on "SelectLandParcel"`, the most likely cause is the signed-in CRN. Re-check step 1, hit the clear-state route in step 3, and re-run.

### Woodland Management Plan

Navigate to `http://localhost:3000/woodland/check-details` (woodland's first page — it has no `/start`) and open the browser console.

Sign in with CRN `1100943757` (or `1100943838`) — woodland's allowlist only admits these CRNs, **not** `1102838829`. (`gt journey woodland` picks the right CRN automatically.)

The `total-area-of-woodland` page POSTs to the land-grants-api `/api/v1/wmp/validate` endpoint. To keep the journey runner reliable regardless of which compose stack is running, point `LAND_GRANTS_API_URL` at mockserver — which has a mock success response in `mockserver/expectations.json`. If you're running with `compose.land-grants.yml` (real backend), layer in `compose.journey-runner.yml` to override the URL back to mockserver:

```sh
npm run docker:landgrants:journey-runner:up
# tear down with: npm run docker:landgrants:journey-runner:down
```

Without `compose.land-grants.yml`, the default in `compose.yml` already points at mockserver, so no override is needed.

If you change `mockserver/expectations.json` mid-session and the journey still shows the old values:

1. `docker compose restart mockserver` — reload expectations
2. Visit `http://localhost:3000/woodland/clear-application-state` — flushes Redis session state and the in-memory parcel cache in one hit
3. Re-run `runJourney()` from `/woodland/check-details`

A full grants-ui restart is _not_ needed thanks to step 2.

```js
// Run from /woodland/check-details or /woodland/tasks
runJourney() // Run all remaining sections from the current page

// Run from /woodland/tasks
runJourney('eligibility') // Complete the eligibility section
runJourney('about-woodland') // Complete the about your woodland section
runJourney('check-and-submit') // Summary, potential funding and declaration
```

Available sections:

| Section            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `eligibility`      | Eligibility questions (land, tenancy, WMP, etc.) |
| `about-woodland`   | Woodland details (area, grid ref, FC team)       |
| `check-and-submit` | Summary, potential funding and declaration       |

Steps (use with `runJourney(N)` to stop before step `N`):

| Step | Page slug                        | Section            | Purpose                                                         |
| ---- | -------------------------------- | ------------------ | --------------------------------------------------------------- |
| 1    | `check-details`                  | —                  | Confirm business details (DefraID) — answers "Yes" (entry page) |
| 2    | `tasks`                          | `eligibility`      | Task list — clicks the "eligibility-land-registered" link       |
| 3    | `eligibility-land-registered`    | `eligibility`      | Land registered with RPA — "Yes"                                |
| 4    | `eligibility-management-control` | `eligibility`      | Management control of the land — "Yes"                          |
| 5    | `eligibility-tenant`             | `eligibility`      | Public body tenant — "No"                                       |
| 6    | `eligibility-grazing-rights`     | `eligibility`      | Land has grazing rights — "No"                                  |
| 7    | `eligibility-valid-wmp`          | `eligibility`      | Existing valid WMP — "No"                                       |
| 8    | `eligibility-higher-tier`        | `eligibility`      | Intent to apply for Higher Tier — "No"                          |
| 9    | `tasks`                          | `about-woodland`   | Task list — clicks the "land-parcels" link                      |
| 10   | `land-parcels`                   | `about-woodland`   | Select land parcels (`selectAll: true` ticks every checkbox)    |
| 11   | `total-area-of-woodland`         | `about-woodland`   | Hectares ≥10 years old (30) and <10 years old (20)              |
| 12   | `centre-of-woodland`             | `about-woodland`   | Centre-of-woodland OS grid reference (`SP 4178 2432`)           |
| 13   | `woodland-name`                  | `about-woodland`   | Woodland name (`Test Woodland`)                                 |
| 14   | `which-forestry-commission-team` | `about-woodland`   | Forestry Commission team — selects the first radio option       |
| 15   | `tasks`                          | `check-and-submit` | Task list — clicks the "summary" link                           |
| 16   | `summary`                        | `check-and-submit` | Check your answers — submit                                     |
| 17   | `potential-funding`              | `check-and-submit` | Potential funding — submit                                      |
| 18   | `declaration`                    | `check-and-submit` | Confirm and send — submits the application                      |
