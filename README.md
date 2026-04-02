# grants-ui

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_grants-ui&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_grants-ui)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_grants-ui&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_grants-ui)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_grants-ui&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_grants-ui)

A YAML-configured grant application form engine built on Node.js, Hapi, and the [DXT Forms Engine](https://github.com/DEFRA/dxt-forms-engine). Supports multiple grant types with Defra ID authentication, task lists, save-and-return, and submission to GAS.

## Quick Start

```bash
nvm use
npm ci
npm run dev
```

Or with Docker:

```bash
npm run docker:up
```

## Features

The Grants UI service provides a comprehensive set of features for building grant application forms. Key features include:

- **Form Components**: 13 different input components (TextField, RadiosField, CheckboxesField, etc.)
- **Page Types**: Summary, Declaration, Confirmation, Terminal, and Conditional pages
- **Guidance Components**: Html, Details, InsetText, Markdown, and List components
- **Authentication**: Defra ID integration with whitelist support
- **Conditional Logic**: Dynamic page routing and content display
- **Validation**: Custom validation messages and schema validation
- **Configuration**: YAML-based form definitions with confirmation content

For complete documentation of all available features, see [FEATURES.md](docs/FEATURES.md).

## Documentation

| Document                                               | Description                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| [Getting Started](docs/GETTING-STARTED.md)             | Requirements, setup, environment variables, project structure, npm scripts |
| [Architecture](docs/ARCHITECTURE.md)                   | Forms engine, state model, task lists, GAS integration, confirmation pages |
| [Features](docs/FEATURES.md)                           | Form components, page types, guidance, conditional logic, validation       |
| [Authentication & Security](docs/AUTH-AND-SECURITY.md) | Defra ID, whitelist, cookies, sessions, S2S auth, rate limiting            |
| [Docker](docs/DOCKER.md)                               | Development/production images, Docker Compose, HA proxy, debugging         |
| [Testing](docs/TESTING.md)                             | Unit, integration, contract, acceptance, performance, and mutation testing |
| [Logging & Error Handling](docs/LOGGING-AND-ERRORS.md) | Structured logging system, error classes, log codes                        |
| [Analytics](docs/ANALYTICS.md)                         | Google Analytics 4 tracking configuration                                  |
| [Consolidated View API](docs/CONSOLIDATED-VIEW.md)     | DAL GraphQL endpoint and configuration                                     |
| [Development Tools](docs/DEV-TOOLS.md)                 | Dev routes, demo pages, journey runner                                     |
| [Utility Scripts](tools/README.md)                     | Form upload tool, cookie unsealing utility                                 |
| [Payment Architecture](src/server/payment/README.md)   | Payment page controllers, strategies, and configuration                    |

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
