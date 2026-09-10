# Tools

Utility scripts for the grants-ui project.

## grants-tui.js (`gt`)

Interactive TUI / CLI wrapper for the local dev stack (compose up/down, tests, journeys, sonar, snyk). Run `gt --help` for the full flag list.

Choose **checks ⇢** for format, lint, unit tests, contract tests, acceptance tests, all tests, Sonar, Snyk and pre-PR check. Each check runs directly from this submenu. **All tests** runs all three suites, continues after failures, and includes their output and a summary in one log; it reports the first failing exit code. **Pre-PR check** additionally runs Snyk and a PR-scoped Sonar scan. **Lint** runs `npm run lint`. **Format** runs `npm run format`, updating code and docs with Prettier.

In interactive mode, actions run with a white shimmering status message and a disabled menu. Full stdout and stderr are captured to a separate private `grants-tui-*.log` file in the system temporary directory for each run. Completion shows success or failure, including the action's exit code on failure.

The footer has two separate status lines: command progress or its latest result (with **l → output**) above a subtle divider, and the runtime summary below it, for example `Running: Core, Land Grants │ GAS: RECEIVED`. Before running a command, the command line shows `Ready`. The runtime line stays visible in menus and during actions, without a success/failure icon; it refreshes when returning to the main or checks menu.

Press **l** to inspect the latest output, or choose **output ⇢** to browse earlier runs from the current session. The viewer opens at the end of the log: use arrow keys and Page Up/Down to scroll, Left/Right for long lines, Home/End to jump, **/** to search, **n** for the next match, and **q** or Escape to return. The file path is a clickable link in terminals that support file links. Logs remain available after quitting; `gt` removes logs older than seven days on startup (the OS may clear temporary files sooner).

Press **Ctrl+C** during an action to cancel it and return to the menu. Cancellation stops the command and its child processes; it does not undo changes already made or stop detached Docker services. Set `NO_COLOR=1` to use a static status message without shimmer. Non-interactive commands continue to print their output directly.

The shimmering status follows progress reported by long-running commands: Docker setup/pulls/health checks, completed unit and contract test files, acceptance setup/browser tests/cleanup, and the current suite or scanner in all-tests and pre-PR runs. These are observed milestones, not estimated percentages. Unrecognised output leaves the current message in place; full output is always retained in the log.

The checks submenu stays open after each run, showing its result so you can run another check immediately. Press **l** there to view the latest output, then return to checks when you close the viewer. Press **Escape** in checks to return to the main menu.

Choose **tools ⇢** for **audit logs** (`npm run audit:logs`, audit entries from grants-ui container logs), **audit queue** (`npm run audit:queue`, the 10 most recent local audit messages), and **clear audit** (`npm run audit:clear`, purge the local audit queue and restart grants-ui). Audit logs and audit queue open the output viewer automatically on completion; close the viewer to return to Tools. The submenu stays open after each run; press **l** to view output or **Escape** to return to the main menu. The runtime footer refreshes when returning to Tools.

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
`x-api-key`, `defraIdToken`) as empty strings. The `local` `serviceToken` is an
exception: it is pre-filled from `GAS_API_AUTH_TOKEN` in `compose.gas.yml` so it
matches the token the local GAS backend accepts. Within each environment the
secrets are grouped by the `.http` file that uses them, with each group separated
by a blank line for readability.

A present-but-empty (or whitespace-only) `http-client.private.env.json` is handled
gracefully -- it is treated the same as a missing file and (re)initialised rather
than failing to parse.

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
