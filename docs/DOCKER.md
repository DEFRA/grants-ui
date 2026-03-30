# Docker

- [Development Image](#development-image)
- [Production Image](#production-image)
- [Docker Compose](#docker-compose)
- [High-Availability (HA) Local Proxy](#high-availability-ha-local-proxy)
- [Debugging with Docker](#debugging-with-docker)

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

```bash
npm run docker:up
```

And optionally:

- Land Grants API and Postgres via `compose.land-grants.yml`

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

- The command above stops any running `grants-ui` container and starts a one-off debug container with `--service-ports` so ports `3000` and `9229` are available on your host.
- The underlying script runs the server with `--inspect=0.0.0.0:9229 --inspect-wait` so execution will pause until your debugger attaches.

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
