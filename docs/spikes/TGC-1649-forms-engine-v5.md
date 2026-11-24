# TGC-1649: Forms Engine Plugin v5 upgrade spike

## Recommendation

Treat v5 as an application migration, not a dependency-only release. Deliver an English-only compatibility upgrade first; make Welsh-language delivery a separate, explicitly scoped phase. Do not merge this spike as the production upgrade: existing application tests, the normal frontend build and type checking still expose migration work.

The upstream guide does not mandate rewriting every existing English-only YAML definition. Language support adds a different requirement: stable V2 identities and translated content, including the content owned by Grants UI rather than the forms engine.

## Scope and provenance

Investigated on 24 November 2026 in `spike/TGC-1649-forms-engine-v5`, based on Grants UI `9b857c29`.

- Engine: `@defra/forms-engine-plugin@5.0.0`, upstream tag commit `7406af5e63af954bd27f8013cf79047dd63560fe`.
- Explicit model dependency: `@defra/forms-model@4.0.7`.
- Application Joi: `18.3.1`; legacy dependencies may retain their own Joi 17 copies. Schemas composed with engine schemas must use Joi 18.
- Runtime used: Node `24.22.3`, npm `11.19.1`; both meet the v5 requirements.
- Resolved maps: application `@defra/interactive-map@0.0.58-alpha`, engine `0.0.56-alpha`, MapLibre `6.19.0`.
- The user approved a release-age exception for this isolated spike. The repository `.npmrc` remains unchanged.
- No production application code, scheme definitions, backend state or deployed services were migrated. The added tools are investigative probes, not compatibility shims.

Primary references:

- [v5.0.0 release notes](https://github.com/DEFRA/forms-engine-plugin/releases/tag/v5.0.0)
- [Pinned v4-to-v5 migration guide](https://github.com/DEFRA/forms-engine-plugin/blob/7406af5e63af954bd27f8013cf79047dd63560fe/docs/migration-v4-to-v5.md)
- [Pinned multilingual guide](https://github.com/DEFRA/forms-engine-plugin/blob/7406af5e63af954bd27f8013cf79047dd63560fe/docs/features/multi-language.md)
- [Tracking Field reference](https://defra.github.io/forms-engine-plugin/features/components/tracking-field)

## Measured application compatibility

The first measurement changed only the engine version. The second explicitly installed forms-model v4 and aligned the application Joi major as required by the migration guide. No existing tests were weakened or disabled.

| Check                 | Engine-only installation                                                              | Model/Joi-aligned installation                                                 |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Server Babel build    | Passed: 372 files                                                                     | Application source unchanged after the build                                   |
| Normal frontend build | Failed: 32 unresolved optional ArcGIS/OpenLayers imports                              | Same application webpack configuration; the separate experiment below succeeds |
| Type checking         | 32 diagnostics: 31 missing forms-model imports and one MapLibre expression type error | One MapLibre expression type error remains                                     |
| Existing test suite   | 12 files failed, 333 passed; 32 tests failed, 6,000 passed                            | 8 files failed, 337 passed; 28 tests failed, 6,097 passed                      |

The aligned suite has three import-time suite failures as well as its 28 failing tests. A passing Babel transpilation is not proof of runtime compatibility. The existing suite also mocks parts of the forms engine, so its passing tests do not replace real-engine journey verification.

### Concrete migration work exposed

| Area                  | Observed impact                                                                                                                                        | Required change                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies          | Fresh engine-only installation did not expose the application's undeclared forms-model import at the root. Joi majors also differed.                   | Declare forms-model directly and align application schemas with Joi 18. Review the existing Dependabot Joi-major restriction.                                        |
| Browser maps          | The engine's new interactive-map dependency pulls optional Esri/OpenLayers imports into `shared.js`.                                                   | Apply the documented webpack exclusions; do not install unused GIS frameworks merely to satisfy the bundler.                                                         |
| Map worker            | The application did not copy the documented MapLibre worker. Its custom map initialiser passes `apiPath` and `assetPath`, but not `workerPath`.        | Serve the worker at the chosen public path and pass that path through the custom point/geospatial initialisers. Verify both forms maps and parcel maps in a browser. |
| Map versions          | Application and engine resolve different interactive-map alpha versions.                                                                               | Agree and pin a compatible common version after testing the application customisations; do not force an unverified override.                                         |
| Map tests/types       | Three tests import MapLibre private source paths that v6 no longer exports. `parcel-map/selection.js` has one expression-tuple type error.             | Move tests to supported interfaces and type the actual expression correctly, without `ts-ignore` or weakened assertions.                                             |
| Nunjucks              | Application-owned template environments fail with `Unable to call t, which is undefined or falsey`. This affects form partials and repeater rendering. | Call the public `prepareNunjucksEnvironment` for every environment that renders engine templates, including integration-test renderers and application routes.       |
| Declaration printing  | `format-answer.js` constructs a `DeclarationField` with empty props; v5 display code needs a model translator and throws on `createTranslator`.        | Supply the real rendering/translation context or use the supported display interface. This is an application implementation failure, not merely a test mock issue.   |
| Repeat answer display | The custom Check answers card code receives `351000, 530000` rather than separate labelled coordinate lines.                                           | Adapt the custom presentation path while preserving the intended accessible labels and stored coordinate representation.                                             |
| Model titles          | The guide removes `setPageTitles`; absent titles are resolved at render time instead of being written into `model.def`.                                | Audit task-list, print and custom title readers; use the rendered/translated title rather than assuming the definition was mutated.                                  |
| Rendering interfaces  | Components and component collections now use a `RenderContext` object; additional translator arguments are optional on page-controller interfaces.     | Audit direct engine/internal calls. Do not mechanically rewrite all custom page controllers.                                                                         |

Relevant application seams include `src/config/nunjucks/nunjucks.js`, `src/server/common/test-helpers/component-helpers.js`, `src/server/common/templates/index.test.js`, `src/server/common/helpers/repeat-page-item-names.js`, `src/server/common/helpers/print-application-service/utils/format-answer.js`, `src/server/check-responses/repeat-answers.js`, `src/client/javascripts/component-maps.js` and `src/client/javascripts/parcel-map/selection.js`.

### Isolated build experiment

```sh
NODE_ENV=production npx webpack --config tools/forms-engine-v5/webpack.config.mjs
```

This wrapper adds the upstream `IgnorePlugin` exclusions and copies the MapLibre worker to `.public/assets/interactive-map/maplibre-gl-worker.mjs`. It compiled successfully with 88 assets and the existing MapLibre/asset-size warnings. The normal `webpack.config.js` is deliberately unchanged. This proves compilation and worker emission, not end-to-end map operation.

The current CSP already permits `worker-src 'self' blob:`. No broad CSP relaxation is required for that documented prerequisite.

## Current YAML corpus

The read-only probe inspected 56 YAML files: 28 form definitions and 28 excluded allowlist/release files. The forms comprise seven checked-in examples, eleven local config-broker snapshots and ten definitions from sibling scheme repositories. There are 24 distinct source hashes; this is a compatibility corpus, not 28 separate schemes.

| Result                                                                              | Count |
| ----------------------------------------------------------------------------------- | ----- |
| Parse errors                                                                        | 0     |
| Raw schema failures                                                                 | 21    |
| Failures after actual Grants UI preprocessing                                       | 0     |
| Prepared models constructed with engine controllers                                 | 6     |
| Prepared model construction blocked by missing application controller registrations | 22    |
| Definitions containing Welsh translations                                           | 0     |

The raw failures are page-level `config` keys that Grants UI already hoists into metadata before validation. All 28 prepared definitions pass the v5 schema. The model probe deliberately does not replace custom controllers with fake classes: it reports `UnknownPageControllerError`, for example for `CheckDetailsController` and `MapSelectPageController`. Therefore this result does **not** certify end-to-end operation of those 22 definitions.

The current scheme snapshots covered were woodland `1.49.8`, water-management `0.8.43`, grasslands `0.30.3` and farm-payments `1.11.3`. Source checkouts and mounted versions are not interchangeable: the probe records SHA-256 hashes, and the auth, multi-application and both task-list example snapshots differ from their checked-in copies.

All inputs declare engine V2, but the map example still uses legacy schema 1. V5 accepts that schema with a deprecation warning; it does not automatically migrate it to schema 2. Schema 2 can generate missing UUIDs during validation, but those defaults are random on each validation. Seventeen checked source files have at least one missing ID; eight of the 24 distinct source definitions have all inspected IDs explicit. Inventory each producer's translatable items before Welsh enablement and persist IDs once.

Reproduce from this worktree layout:

```sh
node tools/forms-engine-v5/schema-check.mjs --json \
  compose/config-broker/example-grants \
  ../../grants-ui/compose/config-broker-local \
  ../../grants-config-{woodland,grasslands,farm-payments,example-grants}/configurations
```

The command exits non-zero for model-construction failures even when prepared schemas pass. Its JSON separates schema errors, preprocessing failures and missing custom-controller registrations, and includes package integrity and source hashes. The scheme repositories should own a release-time schema/translation validation gate; broker transport and backend storage should not silently regenerate IDs or rewrite content.

## Requested feature verification

The final feature harness registers the real v5 Hapi plugin, real `FileFormService`, Yar sessions and the engine's in-memory `CacheService`. It uses synthetic content, bypasses CSRF only in this isolated harness, and exercises the engine's own GET/POST handlers. No production authentication, submission or backend state is involved.

```sh
NODE_ENV=production node tools/forms-engine-v5/feature-probe/probe.mjs
NODE_ENV=production PORT=3099 node tools/forms-engine-v5/feature-probe/probe.mjs --serve
```

The browser URL is `http://127.0.0.1:3099/v5-feature-probe/yes-no`. Production mode disables the engine's development file watchers so the one-shot probe terminates after stopping its servers.

| Scenario                                                             | Observed result                                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Missing required Yes/No answer with legacy `customValidationMessage` | Configured `Choose yes or no` appears in the page error and error summary.                                                   |
| Missing answer with `customValidationMessages['any.required']`       | Configured `Select a response for the spike` appears.                                                                        |
| Valid Yes and No                                                     | Both persist as booleans; `false` is accepted as a valid answer.                                                             |
| Tracking field on GET                                                | A hidden input renders with value `true`; the persisted cache does not yet contain the tracking flag.                        |
| Invalid POST on the same page                                        | The tracking flag is not persisted.                                                                                          |
| Explicit tracking `false` in POST                                    | Validation rejects it; the flag is not a general-purpose editable boolean input.                                             |
| Successful POST with tracking `true`                                 | A later request reads boolean `visited: true` from the real session cache.                                                   |
| Welsh preference                                                     | Question/page translations and native `Ie`/`Nage`/`Parhau` appear; `html lang=\"cy\"`; preference survives the next request. |
| Missing Welsh component translation                                  | Falls back to the English definition text.                                                                                   |
| Welsh requested for a form without translations                      | Falls back to `en-GB`.                                                                                                       |
| Custom Yes/No copy in Welsh                                          | The author-supplied custom error remains English; it is not automatically translated.                                        |

**Tracking caveat:** the default engine summary rendered a visible `Tracking true` row. Grants UI's `shouldDisplayAnswer()` also currently returns true for `TrackingField`. The field is hidden on the input page, but neither observation supports promising invisible tracking throughout Check answers/print. Agree the intended behaviour upstream and explicitly cover the application summary, repeater and print filters before adopting the field.

These results were also checked in a real browser: missing-answer error rendering, hidden input properties, successful No submission with `answer: false` / `visited: true` in persisted state, summary visibility and Welsh rendering. The synthetic host is not evidence that every production grant journey or the map integration has migrated.

Use the documented/editor-compatible flat translation keys:

```yaml
metadata:
  translations:
    cy:
      components.11111111-1111-4111-8111-111111111111.title: Ateb Cymraeg?
      pages.33333333-3333-4333-8333-333333333333.title: Tudalen ateb
```

Keep language preference in the session, not answer state merely to preserve it through redirects. Upstream adapter `meta.language` is not automatically added to this application's custom GAS/claim payloads; any downstream language requirement needs its own agreed contract.

## English and Welsh delivery are separate decisions

The engine defaults to English without `getLanguage`. A Welsh preference falls back to English for a definition without Welsh translations. Missing individual translations fall back to the source-language text, which is operationally useful but can produce mixed-language journeys.

Welsh delivery additionally needs:

- Stable, persisted page, component, section and list-item IDs; translation keys are tied to those IDs, not field names.
- `metadata.translations.cy` maintained alongside the English form text.
- A validated per-request language selection policy, session persistence and a language switcher preserving the current path/query.
- Correct document `lang` attributes for screen readers.
- Translation of application-owned headers, footer, cookies, auth, task statuses, errors, confirmations, declaration content, print output and service/help copy. The engine's `t` translates engine keys, not all Grants UI strings or arbitrary `page.config` values.
- Translation-aware custom view models, filters and controller copy. English-only regular-expression rewriting of engine messages and `pluralize` calls must not be used for Welsh wording.
- A content approval and completeness gate per scheme before enabling Welsh. A technically accepted partial translation is not a fully translated service.

## Submission and deployment contracts

The upstream adapter submission schema changes to numeric `meta.schemaVersion: 1`, adds language/condition results, changes some coordinate strings and includes null keys for blank repeated answers. Grants UI has its own GAS submission mappers and declaration flow, so these changes must be checked at the actual mapper seam rather than copied indiscriminately into GAS payloads.

Regression checks must cover `context.relevantState` versus auxiliary state, repeat item identity, false/null/missing values, coordinates, reopened applications, claims, Check answers and printing. Tracking flags must not become authority for access or eligibility decisions merely because they are boolean.

The upstream guide warns about users already in postcode lookup during deployment. Plan a controlled rollout, cache/asset consistency and rollback rehearsal, including sessions with old saved answers. Record which definition versions were tested; local snapshots are not proof of the live production inventory.

## Verification commands

From the spike worktree:

```sh
npm ci --ignore-scripts
npm run build:server
npm run build:frontend
npm run lint:types
npm test
NODE_ENV=production npx webpack --config tools/forms-engine-v5/webpack.config.mjs
```

The normal frontend build, type check and application test suite are expected to report the incompatibilities above until the delivery migration is implemented. Keep those failures visible; this is not a merge-ready upgrade.

## Scheme YAML migration strategy

1. Inventory the exact definition versions served by Grants UI Backend, including versions retained by existing applications and claims. Validate the backend definition envelope after the same preprocessing used in Grants UI; validating an unrelated raw YAML root is not a journey test.
2. Keep English-only definitions in their accepted legacy format for the first rollout. Preserve field names, page paths, grant codes, controller names and stored-state keys. Do not add tracking fields to every existing page as part of the dependency upgrade.
3. Run the validator and representative real-engine GET/POST, task-list, repeat, declaration and print scenarios for each scheme. Exercise both current and pinned older definitions, including reopened applications and claims.
4. Before Welsh enablement, migrate a scheme to explicit `schema: 2` using the forms-model V2 structure. Assign UUIDs once, persist them in source control and translate references consistently. Keep `engine: V2` separate from the definition schema version: declaring the engine does not supply stable IDs.
5. Maintain an ID/reference mapping during conversion. Migrate section/list/condition references without changing answer names or the state/GAS contract. Carry application-specific `config` and metadata through the existing hoisting step.
6. Store Welsh text with that versioned definition. Require completeness and linguistic review for engine-supported fields and the scheme's application-owned content; test fallback deliberately rather than treating fallback as approval to release mixed-language pages.
7. Publish versioned configuration artifacts through the existing scheme repository/config-broker/backend workflow. Roll out code that can read the required old and new definitions before enabling translated definitions. Rehearse rollback with saved state and assets; do not overwrite definitions referenced by submitted applications.

No source scheme YAML or backend definition was changed by the spike.

## Proposed implementation tickets and effort

These are proposed ticket scopes, not newly created Jira issues. Estimates are engineering person-days for a developer familiar with this codebase, plus review, assuming an English-first release and no unrelated architectural extraction. They are planning ranges, not measured delivery durations.

| Proposed ticket                                         | Scope and acceptance                                                                                                                                                              | Estimate  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Align v5 dependencies and runtime configuration         | Pin engine/model/Joi; remove stale upgrade restrictions; verify reproducible installs, current Node/npm and deployment images.                                                    | 0.5–1 day |
| Migrate map build and runtime assets                    | Ignore unused optional adapters; serve and configure the worker; agree map versions; replace private-source tests; verify point, geospatial and parcel maps and CSP in a browser. | 2–3 days  |
| Adapt Nunjucks, custom display and print integration    | Prepare all template environments; repair declaration rendering context and coordinate presentation; verify English layouts, summaries and printing.                              | 1–2 days  |
| Integrate Yes/No copy and tracking flags into Grants UI | Preserve custom error copy; define tracking lifecycle, task/condition behavior and hidden-answer filtering; verify false/null/true and saved-state compatibility.                 | 1–2 days  |
| Lock down journey/data compatibility and rollout        | Test actual custom controllers, GAS/claim mappings, older saved sessions, postcode lookup during rollout, asset consistency and rollback.                                         | 2–4 days  |
| Validate and release scheme configuration cohorts       | Inventory/version the scheme corpus, fix only demonstrated incompatibilities, exercise representative definitions and document release order.                                     | 1–2 days  |

English-first engineering estimate: **7.5–14 person-days**, with approximately **3–5 QA person-days** for cross-scheme/manual journey regression. Work can overlap, but shared template/map changes should land before scheme regression sign-off.

Welsh is additional scope:

| Proposed ticket                                          | Scope and acceptance                                                                                                                                       | Estimate                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Add platform language selection and service translations | Validated language preference, switcher, document language, application routes/templates/errors/statuses and print handling; no lost state when switching. | 4–7 engineering days                                                             |
| Add deterministic V2 definition/translation tooling      | Persisted IDs, complete reference conversion, translation coverage checks and configuration publication/rollback support.                                  | 2–4 engineering days                                                             |
| Enable Welsh for one scheme                              | Migrate and review that scheme's content and custom page configuration; bilingual journey/accessibility regression and approval.                           | 1–3 engineering days per scheme, plus translation, policy approval and QA effort |

Confirm the live scheme inventory, content ownership and Welsh release scope before turning these ranges into a delivery commitment. Translation and policy approval lead time is not included.
