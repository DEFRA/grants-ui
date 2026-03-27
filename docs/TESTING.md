# Testing

- [Testing Framework](#testing-framework)
  - [Test Types](#test-types)
  - [Running Tests](#running-tests)
  - [Test Configuration](#test-configuration)
  - [Mutation Testing](#mutation-testing)
- [Code Quality & Linting](#code-quality--linting)
- [Acceptance and Performance Testing](#acceptance-and-performance-testing)
  - [Compose Files](#compose-files)
  - [Running Tests Locally](#running-tests-locally)
  - [Running Individual Acceptance Tests](#running-individual-acceptance-tests)
  - [Parallel Test Execution](#parallel-test-execution)
  - [Changes to Journey Test Repositories](#changes-to-journey-test-repositories)
  - [CI](#ci)
- [Performance Testing](#performance-testing)

## Testing Framework

The application uses **Vitest** as its test framework with custom module aliases for mocking external dependencies like `@defra/forms-engine-plugin`.

### Test Types

The test suite is organized into different categories:

- **Unit Tests**: Fast, isolated tests for individual functions and components (run with `npm run test:unit`)
- **Integration Tests**: Slower tests that verify interactions between components, external services, or the full server stack
- **Contract Tests**: Pact-based contract tests that verify API contracts with external services (run with `npm run test:contracts`)
- **Acceptance Tests**: End-to-end browser tests for complete user journeys (run with `npm run test:acceptance`)

### Running Tests

```bash
# Run all tests with coverage (unit + integration)
npm test

# Run only unit tests (fast, excludes slow integration tests)
npm run test:unit

# Run only contract/Pact tests
npm run test:contracts

# Run acceptance tests
npm run test:acceptance

# Run tests in watch mode during development
npm run test:watch
```

### Test Configuration

- `vitest.config.js` - Main configuration for all tests
- `vitest.unit.config.js` - Configuration for unit tests only (excludes integration tests)

Integration tests are identified by:

- `**/*.contract.test.js` - Pact contract tests
- Tests that start the full Hapi server (e.g., `start-server.test.js`)
- Tests making real external service calls (e.g., `grant-application.service.test.js`)

### Mutation Testing

The project uses **Stryker Mutator** to assess test quality by introducing mutations (small code changes) and verifying that tests catch them.

**Running Mutation Tests:**

```bash
# Run Stryker mutation testing
npx stryker run

# View the mutation report
open reports/mutation/mutation.html
```

**Configuration:**

- `stryker.config.mjs` - Main Stryker configuration
- `testRunner: 'command'` - Uses the custom test command defined in `commandRunner`
- `commandRunner.command: 'npm run test:stryker'` - Runs tests for mutation testing
- Reports are generated in `reports/mutation/` directory

**What Mutation Testing Does:**

Stryker creates modified versions of your code (mutants) by:

- Changing operators (`===` to `!==`, `&&` to `||`)
- Modifying conditionals (`>` to `>=`, `<` to `<=`)
- Removing optional chaining (`?.`)
- Altering return values

Each mutant is tested against your test suite. If tests fail, the mutant is "killed" (good). If tests pass, the mutant "survived" (indicates weak test coverage).

**Mutation Score:**

The mutation score indicates test effectiveness:

- **100%**: All mutants killed - excellent test quality
- **80-99%**: Most mutants killed - good test quality
- **60-79%**: Some mutants survived - tests need improvement
- **<60%**: Many mutants survived - significant test gaps

**Best Practices:**

- Run mutation tests on specific files or modules rather than the entire codebase (faster feedback)
- Focus on critical business logic and complex conditionals
- Use mutation reports to identify untested edge cases
- Mutation testing complements (not replaces) code coverage metrics

## Code Quality & Linting

- **Neostandard**: Modern JavaScript/Node.js linting configuration that provides opinionated code quality rules
- **TSX**: Modern Node.js runtime used for development server (better ES module support)

Beyond the standard scripts, the application includes contract testing via `npm run test:contracts` using Vitest.

## Acceptance and Performance Testing

Acceptance and performance tests are run against a containerised system with stubs for Defra ID and GAS. The system is stood up by `docker-compose-smoke-test.sh`, which accepts test hooks to run after the system is healthy.

### Compose Files

There is an override file `compose.ci.yml` which stands the system up at `https://grants-ui-proxy:4000`. Test suites are run in their own containers on the same Docker network.

All test suite services (acceptance tests, journey tests, performance tests) are defined in `compose.tests.yml` at the root of the repository.

### Running Tests Locally

| Command                            | What it runs                            |
| ---------------------------------- | --------------------------------------- |
| `./tools/run-acceptance-tests.sh`  | Acceptance tests only                   |
| `./tools/run-performance-tests.sh` | Performance tests only                  |
| `./tools/run-all-tests.sh`         | Acceptance tests then performance tests |

Or via npm:

```bash
npm run test:acceptance
npm run test:performance
npm run test:all
```

### Running Individual Acceptance Tests

It is possible to run acceptance tests at individual feature file level by passing the path to the feature file in the test container to `run-acceptance-tests.sh`. For example:

```bash
./tools/run-acceptance-tests.sh ./test/features/example-whitelist/whitelist.feature
```

### Parallel Test Execution

The acceptance tests support parallel execution through the `SE_NODE_MAX_SESSIONS` environment variable, which controls the Selenium node's maximum concurrent sessions. The default value is 1 session.

The `SE_NODE_MAX_SESSIONS` variable can be set in your `.env` file or passed directly:

```bash
SE_NODE_MAX_SESSIONS=4 ./tools/run-acceptance-tests.sh
```

**Note:** A higher value may not reduce test execution time beyond a certain point and can introduce more instability into your Selenium node. Beyond this approach a Selenium grid of hub and multiple nodes becomes necessary, but which testing shows uses much more resource for only small gains in our usage.

### Changes to Journey Test Repositories

To support this concept journey test repositories must:

- Publish an image to Docker Hub as per the services
- Allow a command to be passed to the entrypoint script
- Support an npm `run test:ci` option

See `grants-ui-acceptance-tests` for an example.

### CI

The `run-acceptance-tests.sh` script is run as part of the GitHub PR workflow for grants-ui.

## Performance Testing

After the acceptance tests complete in CI, a short k6 performance test runs for 1 minute against the same warm, dockerised system. Its purpose is to catch response time regressions introduced by code changes.

The test checks the **95th percentile response time** (`p(95)`) across all journey pages. If the threshold is breached, the CI step fails.

The threshold can be adjusted via the `P95_THRESHOLD_MS` environment variable (default: `400`ms). To experiment locally with a different threshold:

```bash
P95_THRESHOLD_MS=500 ./tools/run-performance-tests.sh
```
