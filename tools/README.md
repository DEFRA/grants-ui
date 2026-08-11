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

## generate-tokens.js

Generates the encrypted (AES-256-GCM + base64) bearer tokens the HTTP client
needs to authenticate with the config broker (`brokerAuthToken`) and Land
Grants API (`landGrantsAuthToken`), using the same `encryptToken` helper the
app uses. Raw tokens and encryption keys are read from your `.env` file,
defaulting to the compose development values when unset.

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#http-clientprivateenvjson-secrets----do-not-commit)
for how these fit into `http-client.private.env.json`.

### Usage

```bash
npm run generate:tokens           # Prints both tokens to the console
npm run generate:tokens:save      # Writes both into http-client.private.env.json (local)
node ./tools/generate-tokens.js --save --env dev   # Target another environment
```
