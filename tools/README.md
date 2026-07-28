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
