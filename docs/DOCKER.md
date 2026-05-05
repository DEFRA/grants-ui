# Docker

- [GAE CLI](#gae-cli)
  - [Interactive mode](#interactive-mode)
  - [Non-interactive mode](#non-interactive-mode)
  - [Adding new addon services](#adding-new-addon-services)
  - [Adding new local-image overrides](#adding-new-local-image-overrides)
- [Development Image](#development-image)
- [Production Image](#production-image)
- [Docker Compose](#docker-compose)
- [GAS Compose (`compose.gas.yml`)](#gas-compose-composegasyml)
- [High-Availability (HA) Local Proxy](#high-availability-ha-local-proxy)
- [Debugging with Docker](#debugging-with-docker)

## GAE CLI

`tools/grants-ui-cli.js` is an interactive Docker Compose launcher registered as the `gae` bin entry in `package.json`. Run `npm link` once to make `gae` available globally; after that you can use `gae` or `npx gae` from anywhere inside the repo.

### Interactive mode

Running `gae` with no arguments opens a menu-driven interface where you can toggle addon services (Land Grants, GAS, HA proxy), set a replica scale, and choose which `defradigital/*` images to replace with a locally-built `<service>:local` image. Selections are persisted in `.grants-ui-cli-state.json` (git-ignored) so the next run pre-selects the same options.

```
↑ ↓     navigate
space   toggle selection
a       select / deselect all in current list
enter   confirm
esc     go back / quit
```

### Non-interactive mode

```bash
# Start the stack (optionally with addons)
npx gae up
npx gae up --gas                        # include GAS (fg-gas-backend + localstack)
npx gae up --land-grants                # include Land Grants API + Postgres
npx gae up --gas --land-grants --ha     # all addons + HA proxy
npx gae up --scale 2                    # run 2 replicas of grants-ui / grants-ui-backend
npx gae up --local-grants-ui-backend    # use locally-built grants-ui-backend:local

# Stop the stack (uses saved state automatically)
npx gae down

# Restart grants-ui in debug mode (detached, inspector on port 9229)
npx gae debug

# Full teardown including volumes
npx gae reset

# Show running compose containers
npx gae status

npx gae --help
npx gae --version
```

### Adding new addon services

Append an entry to the `ADDONS` array in `tools/grants-ui-cli.js`. Each entry needs a `key`, `label`, `description`, and `composeFile`.

### Adding new local-image overrides

Append an entry to the `LOCAL_SERVICES` array in `tools/grants-ui-cli.js` with `key`, `composeService`, and `image`.

## Development Image

Build:

```bash
docker build --target development --no-cache --tag grants-ui:development .
```

Run:

```bash
docker run -p 3000:3000 grants-ui:development
```

## Production Image

Build:

```bash
docker build --no-cache --tag grants-ui .
```

Run:

```bash
docker run -p 3000:3000 grants-ui
```

## Docker Compose

A local environment with:

- Redis
- MongoDB
- FCP Defra ID Stub
- This service
- Grants UI Backend
- MockServer, providing a stub for [fg-gas-backend](http://github.com/DEFRA/fg-gas-backend)

The recommended way to start the stack is via the [GAE CLI](#gae-cli), which handles addon selection and local-image overrides interactively. For a plain start without the CLI:

```bash
npm run docker:up
```

And optionally:

- **GAS** (Grants Application Service) via `compose.gas.yml` — see [GAS Compose](#gas-compose-composegasyml)

```bash
docker compose -f compose.yml -f compose.gas.yml up -d
```

- **Land Grants API and Postgres** via `compose.land-grants.yml`

```bash
npm run docker:landgrants:up
```

Note: The Land Grants Postgres image contains preseeded data that enables immediate local development and testing
and is kept up-to-date automatically with changes to the [land-grants-api](http://github.com/DEFRA/land-grants-api) repo.

If you require local data or newer data not yet merged, you can use the compose scripts in the [land-grants-api](http://github.com/DEFRA/land-grants-api) repository to seed the database.

Once that repository is cloned locally, `compose.migrations.yml` provides `database-up` and `database-down` services to run migrations against the Postgres database.

Convenient npm scripts have been added in that repository for this workflow:

```bash
# Apply migrations to the grants-ui database
npm run docker:migrate:ext:up

# Roll back all migrations to the base tag v0.0.0
npm run docker:migrate:ext:down
```

## GAS Compose (`compose.gas.yml`)

`compose.gas.yml` is an overlay that adds the **Grants Application Service** to the local stack. It is applied automatically when you select the GAS addon via `gae` (or pass `--gas`).

What it provides:

- **`fg-gas-backend`** — the GAS API service (`defradigital/fg-gas-backend:latest`) exposed on port `3102`, connected to MongoDB and LocalStack.
- **LocalStack init script** — mounts `localstack/start-localstack-gas.sh` to provision the required SNS/SQS FIFO queues on startup.
- **Automatic token seeding** — the `mongo-ready` service waits for `fg-gas-backend` to become healthy, then upserts a pre-hashed access token into MongoDB so `grants-ui` can authenticate against GAS immediately.
- **`grants-ui` environment** — sets `GAS_API_URL` and `GAS_API_AUTH_TOKEN` on the `grants-ui` container so no manual `.env` changes are needed.

To start the stack with GAS manually (without the CLI):

```bash
docker compose -f compose.yml -f compose.gas.yml up -d
```

## High-Availability (HA) Local Proxy

For local testing behind HTTPS and to simulate an HA entry point, there is an optional Nginx reverse proxy defined in `compose.ha.yml`.

What it provides:

- Scalability of `grants-ui` and `grants-ui-backend` using `docker compose --scale`
- TLS termination using the self-signed certs in `nginx/certs`
- A single HTTPS entry point for the UI at `https://localhost:4000`
- HTTPS access to the DEFRA ID Stub at `https://localhost:4007`
- Environment overrides so the UI talks to the proxy over HTTPS (see `compose.ha.yml` and `nginx/nginx.conf`)

Start the stack with the HA proxy:

```bash
npm run docker:ha:up
```

Stop the HA stack:

```bash
npm run docker:ha:down
```

You can also run the HA stack with the Land Grants API and Postgres via npm scripts:

Start the stack with Land Grants API and the HA proxy:

```bash
npm run docker:landgrants:ha:up
```

Stop the HA stack:

```bash
npm run docker:landgrants:ha:down
```

Notes:

- The proxy container is `grants-ui-proxy` and uses `nginx/nginx.conf`.
- Certificates are mounted from `nginx/certs` (`nginx.crt` and `nginx.key`). Your browser may require trusting the cert the first time you visit `https://localhost:4000`.
- The UI container is configured with `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/nginx.crt` so it trusts the proxy's certificate when calling internal HTTPS endpoints.

## Debugging with Docker

You can run the app in a Docker container with the Node.js inspector enabled and attach your IDE debugger.

1. Start the stack (Redis, MongoDB, etc.):

```bash
npm run docker:up
```

2. Start the UI service in debug mode (exposes inspector on port 9229 and waits for a debugger to attach):

```bash
npm run docker:debug
```

Notes:

- The command above stops any running `grants-ui` container and starts a one-off foreground debug container with `--service-ports` so ports `3000` and `9229` are available on your host.
- The underlying script (`tools/docker-debug.js`) detects the compose files used by the running stack and re-uses them, so addon overlays (GAS, Land Grants, etc.) remain active.
- The server is started with `--inspect=0.0.0.0:9229 --inspect-wait` so execution will pause until your debugger attaches.

Alternatively, use the GAE CLI to restart `grants-ui` in debug mode without leaving the rest of the stack:

```bash
npx gae debug
```

- This restarts only the `grants-ui` container **detached** (returns immediately) with the inspector on port `9229`.
- Use `npx gae down` to stop the stack when finished.

Attach your IDE debugger:

- IntelliJ IDEA / WebStorm (Node.js plugin):
  - Run | Edit Configurations... → Add New → Attach to Node.js.
  - Host: `localhost`, Port: `9229` (do not enable "Reconnect automatically").
  - Click Debug to attach. Breakpoints in `/src` should bind once the app starts.

- VS Code:
  - Run and Debug → create or update `.vscode/launch.json` with an Attach config, for example:

    ```json
    {
      "version": "0.2.0",
      "configurations": [
        {
          "type": "node",
          "request": "attach",
          "name": "Attach to Docker (9229)",
          "address": "localhost",
          "port": 9229,
          "protocol": "inspector",
          "localRoot": "${workspaceFolder}",
          "remoteRoot": "/home/node"
        }
      ]
    }
    ```

  - Start debugging with that configuration; execution will continue once attached.
