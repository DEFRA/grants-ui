# Getting Started

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Feature Structure](#feature-structure)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Production](#production)
  - [Environment Variables](#environment-variables)
  - [Npm Scripts](#npm-scripts)
  - [Update Dependencies](#update-dependencies)
  - [Formatting](#formatting)
- [Redis](#redis)
- [Proxy](#proxy)
- [Authorise Snyk](#authorise-snyk)
- [Dependabot](#dependabot)
- [SonarCloud](#sonarcloud)

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `>= v9`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd grants-ui
nvm use
```

## Feature Structure

The repository has been structured to follow a feature-based structure, where each feature is organized into its own directory with all related components (controllers, views, tests, and utilities).

### Feature Organization

Each feature follows a consistent structure:

```
src/server/{feature-name}/
├── {feature-name}.controller.js          # Main controller logic
├── {feature-name}.controller.test.js     # Controller tests
├── views/                                # Feature-specific views/templates
│   └── {feature-page}.html/.njk
├── index.js                              # Feature entry point (if needed)
└── {additional-utilities}.js             # Feature-specific utilities
```

#### Optional Subfolder Organization

For more complex features, additional subfolders can be used to further organize the code:

```
src/server/{feature-name}/
├── controllers/                          # Multiple controllers for different pages
│   ├── page1.controller.js
│   ├── page1.controller.test.js
│   ├── page2.controller.js
│   └── page2.controller.test.js
├── services/                             # Business logic and external service calls
│   ├── {feature-name}.service.js
│   └── {feature-name}.service.test.js
├── mappers/                              # Data transformation utilities
│   ├── state-to-gas-answers-mapper.js
│   └── state-to-gas-answers-mapper.test.js
├── utils/                                # Feature-specific utility functions
│   ├── format-phone.js
│   └── format-phone.test.js
├── views/                                # Feature-specific views/templates
│   └── {feature-page}.html/.njk
└── index.js                              # Feature entry point
```

This subfolder approach is particularly useful for features with multiple pages, complex business logic, or extensive data transformation requirements.

### Benefits of Feature-Based Structure

- **Co-location**: Related files are grouped together, making it easier to find and modify feature-specific code
- **Maintainability**: Clear separation of concerns with each feature self-contained
- **Scalability**: New features can be added following the same pattern
- **Testing**: Feature-specific tests are located alongside the code they test
- **Navigation**: Developers can quickly understand the structure and locate relevant files

## Local Development

### Setup

Install application dependencies:

```bash
npm ci
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

Or see the [Docker Compose setup](./DOCKER.md#docker-compose).

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Environment Variables

Below is a list of required environment variables to configure and run the Grants UI application locally or in an environment (e.g., Dev, Test, Perf Test, Prod).

#### DEFRA ID Integration

These are required only if DEFRA ID authentication is enabled, and you are using either the FCP Defra ID Stub or connecting to Defra ID in the `development` environment:

| Variable                         | Description                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `DEFRA_ID_WELL_KNOWN_URL`        | The OIDC discovery URL used by DEFRA ID (must be reachable at startup).                  |
| `DEFRA_ID_CLIENT_ID`             | Provided by DEFRA ID — used to identify the app.                                         |
| `DEFRA_ID_CLIENT_SECRET`         | Secret from DEFRA ID — **must be kept confidential**.                                    |
| `DEFRA_ID_SERVICE_ID`            | Used by DEFRA ID to display your service name on the login screen.                       |
| `DEFRA_ID_REDIRECT_URL`          | URL DEFRA ID redirects to after login. **Must match exactly what DEFRA ID has on file.** |
| `DEFRA_ID_SIGN_OUT_REDIRECT_URL` | Redirect after logout. Same note as above.                                               |

#### Session and Cookie security

| Variable                  | Description                                                    | Default |
| ------------------------- | -------------------------------------------------------------- | ------- |
| `SESSION_COOKIE_PASSWORD` | High-entropy password (e.g., 32+ chars) for cookie encryption. |
| `SESSION_COOKIE_TTL`      | Cookie duration in milliseconds.                               |
| `SESSION_TIMEOUT`         | Inactivity timeout before logout.                              |
| `SESSION_CACHE_TTL`       | TTL for session data in the cache.                             |
| `SESSION_CACHE_ENGINE`    | Session store engine — `memory` or `redis`.                    |

#### Application URLs

| Variable                | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `APP_BASE_URL`          | Base URL of the Grants UI app.                 |
| `GRANTS_UI_BACKEND_URL` | Local or remote backend endpoint.              |
| `GAS_API_URL`           | Endpoint for Grants Application Service (GAS). |

#### GAS API

| Variable             | Description                                |
| -------------------- | ------------------------------------------ |
| `GAS_API_AUTH_TOKEN` | Service to service auth token for GAS API. |

Note: The token is a **SECRET** and needs to be generated using a script in the GAS API repo and
a hash stored in the GAS MongoDB. This env var should be the raw token value,
which is formatted as a GUID string.

#### GOV.UK Notify

| Variable             | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `NOTIFY_TEMPLATE_ID` | ID of the Notify template used for user-facing comms. |
| `NOTIFY_API_KEY`     | GOV.UK Notify API key — **treat as a secret**.        |

#### Redis Configuration

| Variable                    | Description                                          | Default                        |
| --------------------------- | ---------------------------------------------------- | ------------------------------ |
| `REDIS_HOST`                | Redis host (e.g., `localhost` or Docker)             | `127.0.0.1`                    |
| `REDIS_USERNAME`            | Username for Redis, if using ACL.                    | (empty)                        |
| `REDIS_PASSWORD`            | Password for Redis connection.                       | (empty)                        |
| `REDIS_KEY_PREFIX`          | Prefix for all Redis keys used.                      | `grants-ui:`                   |
| `USE_SINGLE_INSTANCE_CACHE` | Connect to single Redis instance instead of cluster. | `true` in dev, `false` in prod |
| `REDIS_TLS`                 | Connect to Redis using TLS.                          | `true` in production           |
| `REDIS_CONNECT_TIMEOUT`     | Redis connection timeout in milliseconds.            | `30000`                        |
| `REDIS_RETRY_DELAY`         | Redis retry delay in milliseconds.                   | `1000`                         |
| `REDIS_MAX_RETRIES`         | Redis max retries per request.                       | `10`                           |

#### Feature Flags & Misc

| Variable        | Description                                 |
| --------------- | ------------------------------------------- |
| `FEEDBACK_LINK` | URL to feedback (e.g., GitHub issue, form). |

#### Additional Configuration

| Variable                     | Description                                    | Default                 |
| ---------------------------- | ---------------------------------------------- | ----------------------- |
| `SERVICE_VERSION`            | Service version (injected in CDP environments) | null                    |
| `ENVIRONMENT`                | CDP environment name                           | `local`                 |
| `SERVICE_NAME`               | Application service name                       | `Farm and land service` |
| `STATIC_CACHE_TIMEOUT`       | Static asset cache timeout in milliseconds     | `604800000` (1 week)    |
| `ASSET_PATH`                 | Path to static assets                          | `/public`               |
| `TRACING_HEADER`             | HTTP header for distributed tracing            | `x-cdp-request-id`      |
| `GA_TRACKING_ID`             | Google Analytics tracking ID (optional)        | undefined               |
| `COOKIE_POLICY_URL`          | URL for cookie policy page                     | `/cookies`              |
| `COOKIE_CONSENT_EXPIRY_DAYS` | Days before cookie consent expires             | `365`                   |
| `DEV_TOOLS_ENABLED`          | Enable development tools and routes            | `true` (dev only)       |

#### Defra ID Additional Settings

| Variable                  | Description                        | Default |
| ------------------------- | ---------------------------------- | ------- |
| `DEFRA_ID_REFRESH_TOKENS` | Enable token refresh functionality | `true`  |

#### Land Grants Configuration

| Variable                         | Description                              |
| -------------------------------- | ---------------------------------------- |
| `LAND_GRANTS_API_URL`            | Land Grants API endpoint                 |
| `LAND_GRANTS_API_AUTH_TOKEN`     | Auth token for Land Grants API           |
| `LAND_GRANTS_API_ENCRYPTION_KEY` | Encryption key for Land Grants API token |

**Note:** For detailed Land Grants API authentication, see [Auth & Security - Land Grants API Authentication](./AUTH-AND-SECURITY.md#land-grants-api-authentication).

#### Consolidated View API (Optional)

See [Consolidated View API](./CONSOLIDATED-VIEW.md) for configuration and live DAL setup.

#### Microsoft Entra (Internal Use)

| Variable                       | Description                    |
| ------------------------------ | ------------------------------ |
| `ENTRA_INTERNAL_TOKEN_URL`     | Microsoft Entra token endpoint |
| `ENTRA_INTERNAL_TENANT_ID`     | Microsoft tenant ID            |
| `ENTRA_INTERNAL_CLIENT_ID`     | Microsoft client ID            |
| `ENTRA_INTERNAL_CLIENT_SECRET` | Microsoft client secret        |

#### Development Tools Configuration

When `DEV_TOOLS_ENABLED=true`, the following demo data can be configured. See [Development Tools](./DEV-TOOLS.md) for more details:

| Variable                 | Description           | Default              |
| ------------------------ | --------------------- | -------------------- |
| `DEV_DEMO_REF_NUMBER`    | Demo reference number | `DEV2024001`         |
| `DEV_DEMO_BUSINESS_NAME` | Demo business name    | `Demo Test Farm Ltd` |
| `DEV_DEMO_SBI`           | Demo SBI number       | `999888777`          |
| `DEV_DEMO_CONTACT_NAME`  | Demo contact name     | `Demo Test User`     |

#### Config API (Form Definitions)

Form definitions can optionally be loaded from the `grants-ui-config-api` instead of (or in addition to) local YAML files. See [Architecture - Grant Form Definitions](./ARCHITECTURE.md#grant-form-definitions) for details on how these two sources work together.

| Variable                      | Description                                                           | Default               |
| ----------------------------- | --------------------------------------------------------------------- | --------------------- |
| `CONFIG_API_URL`              | Base URL of the `grants-ui-config-api`                                | (empty — YAML only)   |
| `CONFIG_API_JWT_SECRET`       | Shared secret used to sign JWT bearer tokens sent to the Config API   | (required if URL set) |
| `CONFIG_API_JWT_EXPIRY`       | Expiry duration for the signed JWT (e.g. `"1h"`, `"30m"`)             | `1h`                  |
| `FORMS_API_SLUGS`             | Comma-separated list of form slugs to load from the Config API        | (empty)               |
| `FORMS_API_CACHE_TTL_SECONDS` | Redis TTL in seconds for form definitions fetched from the Config API | `300`                 |

### Npm Scripts

All available Npm scripts can be seen in [package.json](../package.json)
To view them in your command line run:

```bash
npm run
```

#### Available Scripts

- **`build`** - Orchestrates the full build process (frontend then server)
- **`build:frontend`** - Compiles client-side assets using Webpack
- **`build:server`** - Transpiles server code using Babel to the `.server` directory
- **`dev`** - Runs both frontend and server in watch mode for local development
- **`dev:debug`** - Runs development environment with Node inspector enabled
- **`docker:up`** / **`docker:down`** - Manage the standard Docker Compose stack
- **`docker:reset`** - Tear down Docker environment including volumes and local images
- **`docker:rebuild`** - Trigger a fresh build of Docker images
- **`docker:debug`** - Run the UI in a one-off Docker container with debugger ports exposed
- **`docker:ha:up`** / **`docker:ha:down`** - Manage a high-availability stack with scaled services and Nginx proxy
- **`docker:landgrants:up`** / **`docker:landgrants:ha:up`** - Manage stacks that include the Land Grants API and Postgres
- **`format`** / **`format:check`** - Format code or check formatting using Prettier
- **`lint`** - Run all linting checks (JavaScript, SCSS, and TypeScript types)
- **`lint:fix`** - Automatically fix ESLint issues
- **`test`** - Run all tests with Vitest and generate coverage reports
- **`test:unit`** - Run unit tests only (isolated from integration/contracts)
- **`test:contracts`** - Run Pact contract tests
- **`test:acceptance`** - Execute end-to-end journey tests via shell script
- **`test:performance`** - Execute performance tests via shell script
- **`test:all`** - Execute both acceptance and performance tests via shell script
- **`test:watch`** - Run Vitest in interactive watch mode
- **`test:stryker`** - Run Vitest specifically for Stryker mutation testing
- **`start`** - Start the production server (requires `npm run build` first)
- **`snyk-test`** / **`snyk-monitor`** - Run security vulnerability scans
- **`unseal:cookie`** - Utility to decrypt and inspect session cookies
- **`gas-status:set`** - Update MockServer to return a specific GAS application status (e.g., `npm run gas-status -- APPLICATION_AMEND`)
- **`gas-status:get`** - Retrieve the current GAS application status configured in MockServer

### Update Dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
use the in-memory cache by setting `SESSION_CACHE_ENGINE=memory` or changing the default value in `~/src/config/config.js`.

## Proxy

A forward-proxy can be enabled by setting the `HTTP_PROXY` environment variable. When present, `setGlobalDispatcher(new ProxyAgent(proxyUrl))` is invoked automatically so calls made with `fetch` from `undici` use the proxy.

If you are not using Wreck, Axios or Undici or a similar http that uses `Request`. Then you may have to provide the proxy dispatcher:

To add the dispatcher to your own client:

```javascript
import { ProxyAgent } from 'undici'

return await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

## Authorise Snyk

Run `snyk auth` to authenticate your local machine with Snyk.

## Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](../.github/example.dependabot.yml) to `.github/dependabot.yml`

## SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](../sonar-project.properties).
