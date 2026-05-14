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

| Type            | Description                            | Extra fields                                                                   |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `submitOnly`    | Clicks the submit button               | None                                                                           |
| `yesNo`         | Selects a radio button and submits     | `fieldName`, `value` (default `"true"`)                                        |
| `radios`        | Selects the first radio option         | `fieldName`                                                                    |
| `checkboxes`    | Selects the first checkbox             | `fieldName`, `selectAll` (optional; `true` ticks every checkbox for the field) |
| `numberField`   | Fills a number/text input              | `fieldName`, `value`                                                           |
| `selectField`   | Selects the first non-empty option     | `fieldName`                                                                    |
| `multilineText` | Fills a textarea                       | `fieldName`, `value`                                                           |
| `dateParts`     | Fills day/month/year inputs with today | `fieldName`, `offsetDays` (optional, shifts date)                              |
| `monthYear`     | Fills month/year inputs with current   | `fieldName`                                                                    |
| `textFields`    | Fills multiple text inputs at once     | `fields` (object of `{ name: value }` pairs)                                   |
| `clickLink`     | Clicks a link by its href suffix       | `linkSlug`                                                                     |

### Existing journeys

| File                                | Grant                     |
| ----------------------------------- | ------------------------- |
| `example-grant-with-auth.json`      | Example grant (with auth) |
| `example-grant-with-task-list.json` | Example grant (task list) |
| `farm-payments.json`                | Farm payments             |
| `pigs-might-fly.json`               | Flying pigs               |
| `methane.json`                      | Methane                   |
| `woodland.json`                     | Woodland Management Plan  |

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

Navigate to `http://localhost:3000/woodland/start` and open the browser console.

Sign in with CRN `1102838829` — this CRN has selectable land parcels, which the woodland journey requires.

The `total-area-of-woodland` page POSTs to the land-grants-api `/api/v1/wmp/validate` endpoint. To keep the journey runner reliable regardless of which compose stack is running, point `LAND_GRANTS_API_URL` at mockserver — which has a mock success response in `mockserver/expectations.json`. If you're running with `compose.land-grants.yml` (real backend), layer in `compose.journey-runner.yml` to override the URL back to mockserver:

```sh
npm run docker:landgrants:journey-runner:up
# tear down with: npm run docker:landgrants:journey-runner:down
```

Without `compose.land-grants.yml`, the default in `compose.yml` already points at mockserver, so no override is needed.

If you change `mockserver/expectations.json` mid-session and the journey still shows the old values:

1. `docker compose restart mockserver` — reload expectations
2. Visit `http://localhost:3000/woodland/clear-application-state` — flushes Redis session state and the in-memory parcel cache in one hit
3. Re-run `runJourney()` from `/woodland/start`

A full grants-ui restart is _not_ needed thanks to step 2.

```js
// Run from /woodland/start or /woodland/tasks
runJourney() // Run all remaining sections from the current page

// Run from /woodland/start
runJourney('start') // Submit start and check details pages to reach task list

// Run from /woodland/tasks
runJourney('eligibility') // Complete the eligibility section
runJourney('about-woodland') // Complete the about your woodland section
```

Available sections:

| Section          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `start`          | Start and check details pages (reaches task list) |
| `eligibility`    | Eligibility questions (land, tenancy, WMP, etc.)  |
| `about-woodland` | Woodland details (area, grid ref, FC team)        |
