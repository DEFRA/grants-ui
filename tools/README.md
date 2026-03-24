# Tools

Utility scripts for the grants-ui project.

## upload-forms-to-api.js

Upload form definitions from YAML files to the `grants-ui-config-api`.

### Prerequisites

The script automatically loads environment variables from `.env` file in the project root.

**For local development (connecting to CDP services):**

1. Get your CDP API key from the CDP portal:
   - Visit: https://portal.cdp-int.defra.cloud/user-profile
   - Copy your temporary API key

2. Add to your `.env` file:
   ```bash
   FORMS_CONFIG_JWT_SECRET=your-shared-secret-here
   CDP_API_KEY=your-cdp-api-key-from-portal
   FORMS_CONFIG_API_ENDPOINT=https://grants-ui-config-api.dev.cdp-int.defra.cloud
   ```

**For local API (no CDP connection):**

1. Add to your `.env` file:
   ```bash
   FORMS_CONFIG_JWT_SECRET=your-shared-secret-here
   # API endpoint defaults to http://localhost:3001
   ```

Alternatively, you can export environment variables directly:

```bash
export FORMS_CONFIG_JWT_SECRET=your-secret
npm run upload:forms -- --all
```

### Usage

**Upload all forms:**

```bash
npm run upload:forms -- --all
```

**Upload by slug (filename without .yaml):**

```bash
npm run upload:forms -- --slug farm-payments
```

**Update existing form (creates new version):**

```bash
npm run upload:forms -- --slug farm-payments --update
```

**Dry run (see what would be uploaded):**

```bash
npm run upload:forms -- --all --dry-run
```

### What it does

**Creating new forms (default):**

1. **Creates form** - Posts form metadata (title, organisation, team, slug) to `/forms`
2. **Uploads definition** - Posts the full form definition (pages, components, etc.) to `/forms/{id}/definition/draft`
3. **Publishes to live** - If `enabledInProd: true` in the YAML, publishes the draft to live via `/forms/{id}/create-live`

**Updating existing forms (`--update` flag):**

1. **Fetches existing form** - Gets the current form by slug from `/forms/slug/{slug}`
2. **Updates draft** - Replaces the draft definition via `/forms/{id}/definition/draft`
3. **Publishes new version** - Creates a new version and publishes to live via `/forms/{id}/create-live`

### Form YAML structure

The script expects YAML files in `src/server/common/forms/definitions/` with this structure:

```yaml
name: Farm payments
metadata:
  id: 5c67688f-3c61-4839-a6e1-d48b598257f1
  enabledInProd: true
  organisation: Defra
  teamName: Digital Delivery
  teamEmail: team@defra.gov.uk
  # ... other metadata
pages:
  - title: Page 1
    path: /page-1
    components: []
lists: []
sections: []
conditions: []
```

### Output

The script provides detailed progress for each form:

```
📤 Form Upload Tool
   API: http://localhost:3001
   Forms directory: /path/to/forms/definitions

📋 Found 6 form file(s)

📄 Processing: farm-payments
   Title: Farm payments
   Slug: farm-payments
   ID: 5c67688f-3c61-4839-a6e1-d48b598257f1
   Creating form...
   ✓ Form created with ID: 6984ae91c5de70e3c5d4401c
   Uploading definition...
   ✓ Draft definition uploaded
   Publishing to live...
   ✓ Published to live
   ✅ Successfully uploaded: farm-payments

============================================================
📊 Summary
============================================================
✅ Successful: 6
   - farm-payments
   - flying-pigs
   - methane
   - example-grant-with-auth
   - example-grant-with-task-list
   - example-whitelist
============================================================
```

## unseal-cookie.js

Unseal encrypted Hapi session cookies for debugging.

### Usage

```bash
npm run unseal:cookie -- <sealedCookie> <password>
```
