# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src`. Server routes, controllers, helpers, services, and views are under `src/server`; browser JavaScript and Sass are under `src/client`; shared utilities are in `src/shared`; configuration is in `src/config`. Unit tests are colocated as `*.test.js`. Contract assets live in `src/contracts`. Acceptance tests are in `acceptance/test`, with feature files, steps, page objects, and support utilities split by folder. Operational scripts and local tooling are in `scripts/`, `tools/`, `localstack/`, and root Docker Compose files.

## Build, Test, and Development Commands

- `npm run dev`: runs frontend webpack watch and the Node server watcher together.
- `npm run build`: builds production frontend assets and transpiles server files into `.server`.
- `npm start`: builds first, then starts the production server.
- `npm run docker:up` / `npm run docker:down`: prepare local config and start or stop the Docker stack.
- `npm test`: runs Vitest with coverage.
- `npm run test:unit`: runs the unit-test Vitest config.
- `npm run test:contracts`: runs contract tests.
- `npm run test:acceptance`: runs acceptance tests.
- `npm run lint`: runs JavaScript, SCSS, and type checks.

## Coding Style & Naming Conventions

Use ES modules and 2-space indentation. Prettier uses single quotes, no semicolons, no trailing commas, and a 120-character print width. Run `npm run format` or `npm run format:check` before committing broad edits. ESLint and Stylelint enforce JavaScript and Sass style. Prefer descriptive kebab-case filenames such as `forms-status-redirect.js`; keep tests beside covered modules as `module-name.test.js`.

## Domain Language

Use `CONTEXT.md` as the source of truth for grant-domain terms and avoided synonyms. When adding user-facing copy, tests, docs, or AI-generated changes, prefer the glossary terms there, especially around grants, journeys, statuses, identities, and integrations.

## Testing Guidelines

Vitest is the primary test runner. Add or update colocated `*.test.js` files for server and shared logic, and keep acceptance coverage in `acceptance/test/features` plus matching steps when journeys change. Run the narrowest relevant test first, for example `npx vitest run src/server/common/request-pipeline/redirects/forms-status-redirect.test.js`, then run `npm run lint` and broader suites for shared behavior.

## Commit & Pull Request Guidelines

Git history uses short imperative messages, often prefixed with a ticket, for example `TGC-1384: Enable farm-payments allowlist` or `TGC-1374 - Fix: ...`. Keep commits focused and avoid unrelated formatting. PRs should describe the change, link the ticket or issue, list validation commands, and include screenshots only for visible UI changes. Mention config, Docker, or migration impacts explicitly.

## Security & Configuration Tips

Do not commit secrets. Start from `.env.example` and local setup scripts. Use Snyk and Dependabot findings as release blockers when they affect touched dependencies.
