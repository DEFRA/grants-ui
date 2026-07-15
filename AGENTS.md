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

## System Overview

The request path is:

```text
User -> Grants UI -> Grants UI Backend
                  -> GAS
```

Grants UI renders journeys, handles authentication/session flow, maps form state into submission payloads, and decides user navigation. Grants UI Backend owns persisted application state and application status for save-and-return journeys, and serves form definitions for the slugs configured to load from it. GAS owns submitted grant applications, grant definitions used for submission, and post-submission GAS statuses.

## Architectural Constraints

Redirect logic must remain deterministic and side-effect-light: given the same Grants UI status, GAS status, request path, and configured redirect rules, it should choose the same destination. Status transitions for submitted applications must be driven through configured `grantRedirectRules` and the status helper path, not scattered across page controllers.

Keep Grants UI application status separate from GAS status. Grants UI application status is the local journey lifecycle (`CLEARED`, `SUBMITTED`, `REOPENED`); GAS status is the downstream submitted-application state used as an input to redirect rules. When adding new status behaviour, update the configuration and focused redirect/status tests together.

Persist form state only through the forms engine state helpers or the existing persistence services. Use `context.relevantState` for data submitted to GAS and `context.state` for auxiliary UI state. Do not mutate `context.state` in place.

Defra Forms content must not introduce dedicated Hapi routes. The forms engine registers generic parameterised GET and POST routes such as `/{slug}/{path}/{itemId?}` and resolves the form page and controller at request time. Route-level configuration, extensions, or lifecycle hooks applied to these routes can therefore affect all matching grant journey pages, not only the page named by `path`. Page-specific behaviour must be scoped using the resolved request, form page, or controller context within the generic route lifecycle. Pay particular attention to whether behaviour applies to the GET document, the POST response, or both.

## Never Do This

- Never treat GAS status and Grants UI application status as equivalent or interchangeable.
- Never query GAS for draft applications; drafts live in Grants UI Backend state.
- Never bypass `grantRedirectRules` with ad hoc post-submission redirects in individual controllers.
- Never update application status in local state only when the transition must be persisted through Grants UI Backend.
- Never put secrets, service tokens, private HTTP client files, or real user identifiers into fixtures, docs, snapshots, or committed config.

## Developer Addenda

Developers can add their own `AGENTS.local.md` and should be read as an addendum to this file. Keep that file local to your machine and do not commit it.

## Testing Guidelines

Vitest is the primary test runner. Add or update colocated `*.test.js` files for server and shared logic, and keep acceptance coverage in `acceptance/test/features` plus matching steps when journeys change. Run the narrowest relevant test first, for example `npx vitest run src/server/common/request-pipeline/redirects/forms-status-redirect.test.js`, then run `npm run lint` and broader suites for shared behavior.

## Commit & Pull Request Guidelines

Git history uses short imperative messages, often prefixed with a ticket, for example `TGC-1384: Enable farm-payments allowlist` or `TGC-1374 - Fix: ...`. Keep commits focused and avoid unrelated formatting. PRs should describe the change, link the ticket or issue, list validation commands, and include screenshots only for visible UI changes. Mention config, Docker, or migration impacts explicitly.

## Security & Configuration Tips

Do not commit secrets. Start from `.env.example` and local setup scripts. Use Snyk and Dependabot findings as release blockers when they affect touched dependencies.
