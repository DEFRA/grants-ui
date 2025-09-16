# Acceptance Tests

This directory contains the acceptance tests for grants-ui. The framework used is WebdriverIO with Cucumber and the tests are containerised, running against a single browser (Chrome).

## Running tests inside a container

This is how the tests run in the Jenkins pipeline. Docker services are created for the tests and the Selenium instance of Chrome. Headless browser mode is used.

- For ARM architectures, change the Selenium image used in [compose.yml](compose.yml):

```dockerfile
  selenium:
    image: selenium/standalone-chrome
  # CHANGES TO..
  selenium:
    image: seleniarm/standalone-chromium
```

- If running against a local instance of the application ensure the application is running, typically with `docker-compose up --build` from the root folder of the repository.

- From the `/acceptance` directory run `docker-compose run --build --rm acceptance-tests`. This will run all acceptance tests.

## Running tests outside a container

The tests can be run outside a container, with the browser visible.

### Environment Variables

Provide the following environment variables, typically via a `.env` file in the `/acceptance` directory:

```
GRANTS_UI_BACKEND_AUTH_TOKEN: auth_token
GRANTS_UI_BACKEND_ENCRYPTION_KEY: encryption_token
```

### Commands

```
npm install
npm run test:local
```

To run specific tests, add a tag, e.g. `@runme` to those tests and use the following command:

```
npx wdio run ./wdio.conf.js --cucumberOpts.tags=@runme
```

## Parallelization

Tests are run in parallel at feature file level at default. This is controlled by the `maxInstances` property in `wdio.conf.js`:

```js
maxInstances: 10,
```

## Report

The report is written to `/acceptance/allure-report`.
