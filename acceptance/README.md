# Acceptance Tests

This directory contains the GAE acceptance tests for `grants-ui`. The framework used is WebdriverIO with Cucumber and the tests can run:

- Locally using visible instances of Chrome against your local instance of `grants-ui`.

- As part of a CI script running the tests in a container, standing up the `grants-ui` ecosystem in containers beforehand.

The latter script is run as part of the CI pipeline when creating or updating a pull request.

## Running acceptance tests locally using visible instances of Chrome

Stand up your local system using the repository's main [compose.yml](../compose.yml) file:
```
docker compose up --build
```
Open a terminal in the [acceptance](../acceptance/) directory. Rename [.env.example](./.env.example) to `.env`. Then:
```
cd acceptance
npm run test:local
```

#### Report

The test report is written to [/acceptance/allure-report](./allure-report/).

#### Running specific tests

To run specific tests, add a Cucumber tag to those tests, e.g. `@runme`, and use the following command:
```
npx wdio run ./wdio.local.conf.js --cucumberOpts.tags=@runme
```

#### Parallelization

Tests are run in parallel at feature file level by default. This is controlled by the `maxInstances` property in [wdio.local.conf.js](./wdio.local.conf.js). Set this to 1 to see individual tests run one at a time in the browser.

## Running acceptance tests using the CI script

This script uses the repository's main [compose.yml](../compose.yml) file to bring up the full `grants-ui` ecosystem with a stub of `fg-gas-backend (GAS)` in a Docker network. The script then runs the acceptance tests in another container with an instance of Selenium Chrome. The script will set up any necessary environment variables.

- Open a terminal in the repository root
- Run command `./tools/run-acceptance-tests.sh`

#### ARM note

For ARM architectures, change the `selenium-` images used in [/acceptance/compose.yml](./compose.yml) to `seleniarm-` images.
