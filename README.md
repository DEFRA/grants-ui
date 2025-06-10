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

### GAS Integration

The Grants Application Service (GAS) is used to store grant definitions that the app submits data against.

Creating a Grant Definition
A grant definition is created via the GAS backend by making a POST request to the /grants endpoint (see postman folder in the root of the project). This defines the structure and schema of the grant application payload, which the app will later submit.

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
