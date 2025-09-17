# Acceptance Tests

This directory contains acceptance tests for `grants-ui`. The framework used is WebdriverIO with Cucumber and the tests can run:

- Locally using a visible instance of Chrome against your local instance of `grants-ui`.
- As part of a CI script running the tests in a container, standing up the system in containers beforehand.

The latter script is also run as part of the CI pipeline when submitting a PR.

## Running acceptance tests locally using a visible instance of Chrome

- Stand up your local system. This can be done using the repository's main [compose.yml](../compose.yml) file or by running in your IDE. The tests require an instance of `grants-ui-backend` to be running.
- Open a terminal in the [acceptance](../acceptance/) directory.
- Rename [.env.example](./.env.example) to `.env`
- `npm install`
- `npm run test:local`

To run only specific tests, add a Cucumber tag to those tests, e.g. `@runme`, and use the following command:

- `npx wdio run ./wdio.local.conf.js --cucumberOpts.tags=@runme`

#### Parallelization

Tests are run in parallel at feature file level by default. This is controlled by the `maxInstances` property in [wdio.local.conf.js](./wdio.local.conf.js). Set this to 1 to see individual tests run one at a time in the browser.

## Running acceptance tests using the CI script

This script uses the repository's main [compose.yml](../compose.yml) file to bring up `grants-ui`, `grants-ui-backend`, `fcp-defra-id-stub`, MongoDB, Redis, and a stub of `fg-gas-backend (GAS)` in containers. The script then runs the acceptance tests in another container with an instance of Selenium Chrome. The script will set up any necessary environment variables.

- Open a terminal in the repository root directory
- `./tools/run-acceptance-tests.sh`

#### ARM note

For ARM architectures, change the Selenium image used in [/acceptance/compose.yml](./compose.yml) to `seleniarm/standalone-chromium`.

## Report

The test report is written to [/acceptance/allure-report](./allure-report/).
