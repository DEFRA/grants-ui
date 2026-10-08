# Example grant configs

These are the development and acceptance-test grant configs for Grants UI.
They were copied from the local `grants-config-example-grants` repository's
`main` branch at `77f8338` (package version `3.27.1`).

The auth example's questions schema also accepts the `referenceNumber` emitted
by Grants UI. Acceptance now validates against that nested questions schema,
rather than compiling the whole GAS definition as if it were a JSON schema.

Keep the `<grant>/<service>/<file>` layout. Each bundle includes its form
definition, allowlist and any GAS, agreement, payment or casework definitions.
Real grant configs continue to live in their own repositories.

## Developing an example journey

1. Start the local stack with `gt up`.
2. Edit the YAML or JSON files here.
3. Select **refresh example grants** in `gt`, or run `gt refresh-examples`.
4. Reload the browser and run the relevant journey or acceptance tests.

Refresh retains saved applications. For an incompatible change, select
**refresh and reset example applications**, or run
`gt refresh-examples --reset-applications`. This explicitly removes only these
examples' application state, locks and submissions from Grants UI Backend;
it does not remove real grant applications or downstream GAS applications.
Selected example form-definition overrides are reapplied after a manual refresh;
real grant overrides are left untouched. Resets run only after successful ingestion.

## Technical versions and ingestion

There are no independent releases, tags or manual version bumps for these files.
`tools/prepare-example-grants.js` generates complete bundles under the ignored
`compose/config-broker-local/<grant>@<version>/` tree and creates `release.yml`.
It starts at `3.27.1`, retains a version for unchanged content, and automatically
increments the highest known patch version when a bundle changes. Effective
local allowlists participate in that content check. The local version/content
record is `.example-grants.json` inside the generated tree.
When an example is removed, preparation removes only its recorded generated
bundle; cached versions from external config repos remain untouched.

Runtime semver identifiers remain necessary for backend application state,
locks, submissions and GAS. Refresh uploads each complete bundle to local S3
and sends a release request to the existing broker input queue. The broker
publishes its normal notifications to Grants UI Backend and GAS; new backend
definitions receive fresh timestamps for forms-engine cache invalidation.
No production service changes or direct application-runtime file loading are
required. Refresh waits for the backend to ingest the prepared definitions;
GAS ingestion continues asynchronously when its addon is running.

Local setup uses the same preparation step as CI. Cached real grant configs can
be reused offline, while examples are always prepared from the current checkout.
The acceptance submission schema is extracted from the GAS `PRE_AWARD.questions`
schema into ignored `acceptance/schemas/`; do not maintain a second schema copy.

Example allowlists contain only `local` settings, directly in each bundle.
Five use `allowAll: true`; `example-whitelist` retains a restricted CRN/SBI list
to exercise both allowed and denied access in acceptance tests.
The allowlists in `../local-allowlists/` are now only for externally managed configs.
Developer-local overrides in `../local-form-definitions/` remain optional.
An old sibling `grants-config-example-grants` checkout is no longer discovered
as an override source.
