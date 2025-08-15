# grants-ui

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_grants-ui&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_grants-ui)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_grants-ui&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_grants-ui)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_grants-ui&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_grants-ui)

Core delivery platform Node.js Frontend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Environment variables](#environment-variables)
  - [GAS Integration](#gas-integration)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Structured Logging System](#structured-logging-system)
  - [Core Components](#core-components)
  - [Directory Structure](#directory-structure)
  - [Log Code Categories](#log-code-categories)
  - [Usage Examples](#usage-examples)
  - [Log Code Structure](#log-code-structure)
  - [Configuration](#configuration)
  - [Best Practices](#best-practices)
  - [Integration Points](#integration-points)
  - [Testing](#testing)
  - [Monitoring and Observability](#monitoring-and-observability)
  - [Migration from Manual Logging](#migration-from-manual-logging)
  - [Adding New Log Codes](#adding-new-log-codes)
  - [Development Workflow](#development-workflow)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v18` and [npm](https://nodejs.org/) `>= v9`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd grants-ui
nvm use
```

## Server-side Caching

We use Catbox for server-side caching. By default the service will use CatboxRedis when deployed and CatboxMemory for
local development.
You can override the default behaviour by setting the `SESSION_CACHE_ENGINE` environment variable to either `redis` or
`memory`.

Please note: CatboxMemory (`memory`) is _not_ suitable for production use! The cache will not be shared between each
instance of the service and it will not persist between restarts.

## Session Rehydration

The application includes session rehydration functionality that allows user sessions to be restored from a backend API. This is particularly useful for maintaining user state across different services.

### How Session Rehydration Works

The application fetches saved state from the backend API using the endpoint configured in `GRANTS_UI_BACKEND_URL`.
When a user is authenticated, the serivce:

- Checks for existing cache
- If there is none, fetches data from Mongo
- Performs session rehydration

### Configuration

Session rehydration is controlled by the following environment variables:

- `GRANTS_UI_BACKEND_URL`: The backend API endpoint for fetching/storing session state

### Error Handling

If session rehydration fails (e.g., backend unavailable, network issues), the application will:

- Log the error for debugging
- Continue normal operation without restored state
- Allow the user to proceed with a fresh session

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
disable setting `SESSION_CACHE_ENGINE=false` or changing the default value in `~/src/config/index.js`.

## Proxy

We are using forward-proxy which is set up by default. To make use of this: `import { fetch } from 'undici'` then because of the `setGlobalDispatcher(new ProxyAgent(proxyUrl))` calls will use the ProxyAgent Dispatcher

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
npm install
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

To successfully run `grants-ui` locally there is a requirement to have the cdp-defra-id-stub (https://github.com/DEFRA/cdp-defra-id-stub) checked out, installed and running locally with this command:

```bash
npm run dev
```

### Environment variables

Below is a list of required environment variables to configure and run the Grants UI application locally or in an environment (e.g., Dev, Test, Perf Test, Prod).

#### DEFRA ID Integration

These are required only if DEFRA ID authentication is enabled:

| Variable                         | Description                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `DEFRA_ID_WELL_KNOWN_URL`        | The OIDC discovery URL used by DEFRA ID (must be reachable at startup).                  |
| `DEFRA_ID_CLIENT_ID`             | Provided by DEFRA ID — used to identify the app.                                         |
| `DEFRA_ID_CLIENT_SECRET`         | Secret from DEFRA ID — **must be kept confidential**.                                    |
| `DEFRA_ID_SERVICE_ID`            | Used by DEFRA ID to display your service name on the login screen.                       |
| `DEFRA_ID_REDIRECT_URL`          | URL DEFRA ID redirects to after login. **Must match exactly what DEFRA ID has on file.** |
| `DEFRA_ID_SIGN_OUT_REDIRECT_URL` | Redirect after logout. Same note as above.                                               |

Note: for local development it is neccessary to remove config.get('defraId.clientId') from provider.scope in getBellOptions(oidcConfig) in auth.js so change from:

```
scope: ['openid', 'offline_access', config.get('defraId.clientId')],
```

to:

```
scope: ['openid', 'offline_access'],
```

#### Session and Cookie security

| Variable                  | Description                                                    | Default |
| ------------------------- | -------------------------------------------------------------- | ------- |
| `SESSION_COOKIE_PASSWORD` | High-entropy password (e.g., 32+ chars) for cookie encryption. |
| `SESSION_COOKIE_TTL`      | Cookie duration in milliseconds.                               |
| `SESSION_TIMEOUT`         | Inactivity timeout before logout.                              |
| `SESSION_CACHE_TTL`       | TTL for session data in the cache.                             |
| `SESSION_CACHE_ENGINE`    | Session store engine — `memory` or `redis`.                    |
| `SESSION_CACHE_NAME`      | Cache segment name used in Hapi for session caching.           |

#### Application URLs

| Variable                | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `APP_BASE_URL`          | Base URL of the Grants UI app.                 |
| `GRANTS_UI_BACKEND_URL` | Local or remote backend endpoint.              |
| `GAS_API_URL`           | Endpoint for Grants Application Service (GAS). |
| `MANAGER_URL`           | Used for internal routing or redirects.        |
| `DESIGNER_URL`          | Form designer UI base URL.                     |
| `SUBMISSION_URL`        | Backend submission URL (Docker-safe format).   |
| `UPLOADER_URL`          | File uploader service endpoint.                |
| `UPLOADER_BUCKET_NAME`  | Name of the S3 or storage bucket.              |

#### GOV.UK Notify

| Variable             | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `NOTIFY_TEMPLATE_ID` | ID of the Notify template used for user-facing comms. |
| `NOTIFY_API_KEY`     | GOV.UK Notify API key — **treat as a secret**.        |

#### Redis Configuration

| Variable           | Description                              |
| ------------------ | ---------------------------------------- |
| `REDIS_HOST`       | Redis host (e.g., `localhost` or Docker) |
| `REDIS_USERNAME`   | Username for Redis, if using ACL.        |
| `REDIS_PASSWORD`   | Password for Redis connection.           |
| `REDIS_KEY_PREFIX` | Prefix for all Redis keys used.          |

#### Feature Flags & Misc

| Variable               | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `SBI_SELECTOR_ENABLED` | Enables the SBI selector UI for multiple-business users. |
| `FEEDBACK_LINK`        | URL to feedback (e.g., GitHub issue, form).              |

### GAS Integration

The Grants Application Service (GAS) is used to store grant definitions that the app submits data against.

Creating a Grant Definition
A grant definition is created via the GAS backend by making a POST request to the /grants endpoint (see postman folder in the root of the project). This defines the structure and schema of the grant application payload, which the app will later submit.

You can also create a grant using the swagger link below.

https://fg-gas-backend.dev.cdp-int.defra.cloud/documentation#/

Example request:

```
curl --location --request POST 'https://fg-gas-backend.dev.cdp-int.defra.cloud/grants' \
--header 'Content-Type: application/json' \
--data-raw '{
  "code": "adding-value-v4",
  "questions": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "GrantApplicationPayload",
    "type": "object",
    "properties": {
      "referenceNumber": { "type": "string" },
      "businessNature": { "type": "string" },
      "businessLegalStatus": { "type": "string" },
      "isInEngland": { "type": "boolean" },
      "planningPermissionStatus": { "type": "string" },
      "projectStartStatus": { "type": "string" },
      "isLandBusinessOwned": { "type": "boolean" },
      "hasFiveYearTenancyAgreement": { "type": "boolean" },
      "isBuildingSmallerAbattoir": { "type": "boolean" },
      "isBuildingFruitStorage": { "type": "boolean" },
      "isProvidingServicesToOtherFarmers": { "type": "boolean" },
      "eligibleItemsNeeded": {
        "type": "array",
        "items": { "type": "string" }
      },
      "needsStorageFacilities": { "type": "string" },
      "estimatedCost": { "type": "number" },
      "canPayRemainingCosts": { "type": "boolean" },
      "processedProduceType": { "type": "string" },
      "valueAdditionMethod": { "type": "string" },
      "impactType": {
        "type": "array",
        "items": { "type": "string" }
      },
      "hasMechanisationUsage": { "type": "boolean" },
      "manualLabourEquivalence": { "type": "string" },
      "grantApplicantType": { "type": "string" },
      "agentFirstName": { "type": "string" },
      "agentLastName": { "type": "string" },
      "agentBusinessName": { "type": "string" },
      "agentEmail": { "type": "string", "format": "email" },
      "agentEmailConfirmation": { "type": "string", "format": "email" },
      "agentMobile": { "type": "string" },
      "agentLandline": { "type": "string" },
      "agentBusinessAddress__addressLine1": { "type": "string" },
      "agentBusinessAddress__addressLine2": { "type": ["string", "null"] },
      "agentBusinessAddress__town": { "type": "string" },
      "agentBusinessAddress__county": { "type": ["string", "null"] },
      "agentBusinessAddress__postcode": { "type": "string" },
      "applicantFirstName": { "type": "string" },
      "applicantLastName": { "type": "string" },
      "applicantEmail": { "type": "string", "format": "email" },
      "applicantEmailConfirmation": { "type": "string", "format": "email" },
      "applicantMobile": { "type": "string" },
      "applicantLandline": { "type": "string" },
      "applicantBusinessAddress__addressLine1": { "type": "string" },
      "applicantBusinessAddress__addressLine2": { "type": ["string", "null"] },
      "applicantBusinessAddress__town": { "type": "string" }
      // ... more fields if needed
    }
  }
}'
```

Example response:

```
{
    "code": "adding-value-v4"
}
```

#### Using the Grant Definition

Once the grant is created, its code (for example, adding-value-v4) must be added to the relevant configuration file to link it with the frontend flow.

The grant code should be added to:

```
src/server/common/forms/definitions/adding-value.json
```

under the following section:

```
{
  "metadata": {
    "gas": {
      "grantCode": "adding-value-v4"
    }
  }
}
```

This ensures that when the app submits application data, it targets the correct grant definition in GAS.

#### Submission Schema Validators

Each GAS grant also has an associated schema stored locally in:

`src/server/common/forms/schemas/`

Each file should be named with the grant code (e.g., adding-value-v4.json) and contain the JSON Schema that validates the application payload for that grant.

At application startup, the app scans the schemas directory and compiles each schema into a JSON Schema validator using Ajv. These validators are cached in memory in a map of the form:

`Map<string, ValidateFunction>`

This map is used at runtime to validate payloads prior to submission using:

`validateSubmissionAnswers(payload, grantCode)`

This ensures each grant submission matches the expected schema defined in GAS and prevents invalid data from being submitted.

#### Grant Schema Updates

In order to update a grant schema, visit:

- https://fg-gas-backend.dev.cdp-int.defra.cloud/documentation#/

Find the endpoint `GET /grants/{code}`, pass in the code, e.g. `frps-private-beta`, will return the grant.

When changes have been made to the schema, use the endpoint `PUT /tmp/grants/{code}` to update the grant schema.

In order to test if your schema change has worked, send through an application, and view the case tool, to see if your new data exists in the case:

https://fg-cw-frontend.dev.cdp-int.defra.cloud/cases

From here you can find the `caseId`, use the below swagger to query the `GET /cases/{caseId}`

https://fg-cw-backend.dev.cdp-int.defra.cloud/documentation#/

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

#### Available Scripts

- **`build`** - Build both frontend and server for production
- **`build:frontend`** - Build frontend assets with webpack for production
- **`build:server`** - Transpile server code with Babel for production
- **`dev`** - Start development environment with frontend and server watch mode
- **`dev:debug`** - Start development environment with debug mode enabled
- **`docker:dev`** - Start development environment using Docker Compose
- **`docker:dev:rebuild`** - Rebuild and restart Docker development environment
- **`format`** - Format code using Prettier
- **`format:check`** - Check code formatting without making changes
- **`lint`** - Run all linting checks (JavaScript, SCSS, TypeScript)
- **`lint:fix`** - Automatically fix linting issues where possible
- **`test`** - Run test suite with coverage
- **`test:watch`** - Run tests in watch mode
- **`start`** - Start production server (requires build first)
- **`snyk-test`** - Run Snyk security vulnerability tests
- **`snyk-monitor`** - Monitor project with Snyk

### Update dependencies

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

## Docker

### Development image

Build:

```bash
docker build --target development --no-cache --tag grants-ui:development .
```

Run:

```bash
docker run -p 3000:3000 grants-ui:development
```

### Production image

Build:

```bash
docker build --no-cache --tag grants-ui .
```

Run:

```bash
docker run -p 3000:3000 grants-ui
```

### Docker Compose

A local environment with:

- Localstack for AWS services (S3, SQS)
- Redis
- MongoDB
- This service.
- A commented out backend example.

```bash
docker compose up --build -d
```

**Authorise Snyk**

Run `snyk auth` to authenticate your local machine with Snyk.

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties).

## Structured Logging System

The application implements a comprehensive structured logging system providing consistent, searchable, and maintainable logging across all components.

### Core Components

- **Logger**: Pino-based logger with ECS format support
- **Log Codes**: Structured, hierarchical log definitions
- **Validation**: Runtime validation of log code definitions
- **Tracing**: Distributed tracing with request correlation

### Directory Structure

```
src/server/common/helpers/logging/
├── logger.js              # Logger factory
├── logger-options.js      # Logger configuration
├── request-logger.js      # Hapi request logger plugin
├── log.js                 # Structured logging wrapper
├── log-codes.js           # Structured log definitions
├── log-code-validator.js  # Log code validation
└── *.test.js             # Test files
```

### Log Code Categories

The system organizes log codes into logical categories:

- **AUTH**: Authentication and authorization events
- **FORMS**: Form processing and validation
- **SUBMISSION**: Grant submission lifecycle
- **DECLARATION**: Declaration page processing
- **CONFIRMATION**: Confirmation page processing
- **TASKLIST**: Task list management
- **LAND_GRANTS**: Land grant specific functionality
- **AGREEMENTS**: Agreement processing
- **SYSTEM**: System-level events and errors

### Usage Examples

#### Basic Structured Logging

```javascript
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

// Log successful authentication
log(LogCodes.AUTH.SIGN_IN_SUCCESS, {
  userId: 'user123',
  organisationId: 'org456'
})

// Log form submission
log(LogCodes.SUBMISSION.SUBMISSION_SUCCESS, {
  grantType: 'adding-value',
  referenceNumber: 'REF123456'
})

// Log validation error
log(LogCodes.FORMS.FORM_VALIDATION_ERROR, {
  formName: 'declaration',
  error: 'Required field missing'
})
```

#### Direct Logger Access

```javascript
import { logger } from '~/src/server/common/helpers/logging/log.js'

// For simple logging when structured codes aren't needed
logger.info('Simple info message')
logger.error(error, 'Error with context')
```

### Log Code Structure

Each log code must have two required properties:

```javascript
{
  level: 'info' | 'debug' | 'error',
  messageFunc: (messageOptions) => string
}
```

Example log code definition:

```javascript
AUTH: {
  SIGN_IN_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `User sign-in successful for user=${messageOptions.userId}, organisation=${messageOptions.organisationId}`
  }
}
```

### Configuration

Logging is configured via environment variables:

- `LOG_ENABLED`: Enable/disable logging (default: enabled except in test)
- `LOG_LEVEL`: Log level (debug, info, warn, error, etc.)
- `LOG_FORMAT`: Output format (ecs for production, pino-pretty for development)

### Best Practices

1. **Use Structured Logging**: Prefer log codes over direct logger calls
2. **Include Context**: Always include relevant identifiers (userId, grantType, etc.)
3. **Consistent Naming**: Use consistent parameter names across log codes
4. **Error Handling**: Log errors with sufficient context for debugging
5. **Performance**: Use debug level for detailed logs that may impact performance
6. **Security**: Never log sensitive information (passwords, tokens, etc.)

### Integration Points

The structured logging system is integrated throughout the application:

- **Authentication**: All auth events (sign-in, sign-out, token verification)
- **Form Processing**: Load, submission, validation events
- **Controllers**: Declaration, confirmation, and other page controllers
- **Error Handling**: Global error handler with structured error logging
- **Services**: Form services, submission services, and external API calls

### Testing

All logging components include comprehensive test coverage:

- **Unit Tests**: Test individual log codes and validation
- **Integration Tests**: Test logging in request/response cycles
- **Mock Testing**: Mock logger for testing without actual log output

### Monitoring and Observability

The structured logging system supports:

- **ECS Format**: Elasticsearch Common Schema for log aggregation
- **Distributed Tracing**: Request correlation across service boundaries
- **Log Aggregation**: Searchable logs with consistent structure
- **Alerting**: Structured data enables automated alerting on specific events

### Migration from Manual Logging

When updating existing code:

1. Replace `request.logger.info()` with structured log codes
2. Replace `logger.error()` with appropriate error log codes
3. Add relevant context parameters (userId, grantType, etc.)
4. Use appropriate log levels (info, debug, error)
5. Test that logging works correctly in different environments

### Adding New Log Codes

To add new log codes:

1. **Define the log code** in `log-codes.js` with proper structure
2. **Add to appropriate category** or create new category if needed
3. **Include both level and messageFunc** properties
4. **Write comprehensive tests** in the corresponding test file
5. **Update documentation** if introducing new patterns

Example:

```javascript
FORMS: {
  FORM_CACHE_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Form cache error for ${messageOptions.formName}: ${messageOptions.error}`
  }
}
```

### Development Workflow

1. **Use existing log codes** when possible
2. **Create new log codes** when needed following established patterns
3. **Test thoroughly** including edge cases and error scenarios
4. **Document changes** in code comments and this guide
5. **Review logs** in development to ensure proper formatting

This structured logging system provides a robust foundation for monitoring, debugging, and maintaining the Grants UI application with consistent, searchable, and actionable logging throughout the system.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.

## TODO

src/server/land-grants/parcels/controller.js L51
sbi is a hardcoded value for testing purposes, should come from Defra ID (CRN included in the JWT returned from Defra ID in the contactId property)
