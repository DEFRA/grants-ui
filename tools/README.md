# Tools

Utility scripts for the grants-ui project.

## grants-tui.js (`gt`)

Interactive TUI / CLI wrapper for the local dev stack (compose up/down, tests, journeys, sonar, snyk). Run `gt --help` for the full flag list.

See [docs/DEV-TOOLS.md](../docs/DEV-TOOLS.md) for the dev-tooling reference, including the headless Journey Runner (`gt journey <slug>`).

## unseal-cookie.js

Unseal encrypted Hapi session cookies for debugging.

### Usage

```bash
npm run unseal:cookie -- <sealedCookie> <password>
```

## init-http-client-secrets.js

Creates (or updates) a skeleton `http-client.private.env.json` so the
collections in `http-client/` (`broker.http`, `dal.http`, `gas.http`,
`land-grants.http`) work with minimal manual setup. For every environment listed
in the committed `http-client.env.json`, it ensures the full set of secret keys
the `.http` requests reference is present, leaving hand-populated secrets
(`entraClientId`, `entraClientSecret`, `entraTenantId`, `serviceToken`,
`x-api-key`, `defraIdToken`) as empty strings. Within each environment the
secrets are grouped by the `.http` file that uses them, with each group separated
by a blank line for readability.

It also generates the encrypted (AES-256-GCM + base64) bearer tokens the HTTP
client needs for the config broker (`brokerAuthToken`) and Land Grants API
(`landGrantsAuthToken`), using the same `encryptToken` helper the app uses. Raw
tokens and encryption keys are read from your `.env` file, defaulting to the
compose development values when unset. Existing values are preserved and
obsolete keys are dropped.

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#http-clientprivateenvjson-secrets----do-not-commit)
for how these fit into `http-client.private.env.json`.

### Usage

```bash
npm run http-client:init                              # Skeleton for all envs, tokens under "local"
node ./tools/init-http-client-secrets.js --env dev   # Generate the encrypted tokens under another environment
```
