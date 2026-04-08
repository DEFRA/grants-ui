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

| Field     | Required | Description                                               |
| --------- | -------- | --------------------------------------------------------- |
| `slug`    | Yes      | The page URL slug to match against                        |
| `name`    | Yes      | Human-readable label (for console logs)                   |
| `type`    | Yes      | The handler to use (see below)                            |
| `section` | No       | Section name, used for section-based `runJourney()` calls |

### Step types

| Type            | Description                            | Extra fields                                      |
| --------------- | -------------------------------------- | ------------------------------------------------- |
| `submitOnly`    | Clicks the submit button               | None                                              |
| `yesNo`         | Selects a radio button and submits     | `fieldName`, `value` (default `"true"`)           |
| `radios`        | Selects the first radio option         | `fieldName`                                       |
| `checkboxes`    | Selects the first checkbox             | `fieldName`                                       |
| `numberField`   | Fills a number/text input              | `fieldName`, `value`                              |
| `selectField`   | Selects the first non-empty option     | `fieldName`                                       |
| `multilineText` | Fills a textarea                       | `fieldName`, `value`                              |
| `dateParts`     | Fills day/month/year inputs with today | `fieldName`, `offsetDays` (optional, shifts date) |
| `monthYear`     | Fills month/year inputs with current   | `fieldName`                                       |
| `textFields`    | Fills multiple text inputs at once     | `fields` (object of `{ name: value }` pairs)      |
| `clickLink`     | Clicks a link by its href suffix       | `linkSlug`                                        |

### Existing journeys

| File                                | Grant                     |
| ----------------------------------- | ------------------------- |
| `example-grant-with-auth.json`      | Example grant (with auth) |
| `example-grant-with-task-list.json` | Example grant (task list) |
| `farm-payments.json`                | Farm payments             |
| `pigs-might-fly.json`               | Flying pigs               |
| `methane.json`                      | Methane                   |
| `woodland.json`                     | Woodland Management Plan  |

### Woodland Management Plan

Navigate to `http://localhost:3000/woodland/start` and open the browser console.

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
