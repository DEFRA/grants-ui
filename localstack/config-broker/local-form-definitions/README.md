# Local form-definition overrides

Drop work-in-progress **form definitions** here to test them locally **before**
pushing them to the config repo. A single toggle in the `gt` TUI (the `local`
menu) enables or disables **all** overrides in this folder at once.

## Folder layout

Mirror the config repo layout, `<grant>/<service>/<file>`:

```text
local-form-definitions/
  woodland/
    grants-ui/
      woodland.yaml        # a raw forms-model FormDefinition (engine: V2, name, metadata, ...)
```

Each file is the same shape as the config repo's
`configurations/<grant>/grants-ui/<grant>.yaml`.

## How it works

- The grant version is read from the pulled `config-broker-local/<grant>@<version>`
  folder, and the override is published to grants-ui-backend as **one patch above**
  the repo version (e.g. repo `1.2.3` -> override `1.2.4`), so it becomes the
  active version the frontend serves.
- Enabling applies every override in this folder; disabling removes them and
  purges the dependent local application state/locks/submissions for the bumped
  version so the frontend cleanly reverts to the repo version.
- The toggle works both before `gt up` (applied once the stack is healthy) and
  while the stack is already running (applied/removed immediately).
- The injected definition's `name` gets a ` (local override active)` suffix
  so an overridden form is easy to tell apart from the real repo version.
- While the override is active, a `↳ refresh overrides` item appears directly below
  `local` in the `gt` main menu. Selecting it re-publishes the YAML in this folder
  into Mongo on demand, so you can edit a definition and pull in your latest changes
  without toggling the override off and on again (containers must be running).

## Notes

- The contents of this folder are git-ignored (only this `README.md` is
  committed) — overrides are developer-local.
