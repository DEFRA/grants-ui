# Local form-definition overrides

Drop work-in-progress **form definitions** here to test them locally **before**
pushing them to the config repo. The `gt` TUI `local` menu lists each override as
its own per-grant toggle, so you enable exactly the grants you want.

Overrides from this folder appear with the source `local-form-definitions`. The
menu **also** lists form definitions from any sibling `grants-config-*` repo
checked out next to grants-ui (see "Sibling config repos" below), so you don't
have to copy a file in here at all if you already have the config repo cloned.

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

## Sibling config repos

Check out a config repo (e.g. `grants-config-grasslands`) **next to** the
grants-ui repo:

```text
<parent>/
  grants-ui/
  grants-config-grasslands/
    configurations/
      grasslands/
        grants-ui/
          grasslands.yaml
```

Its grant form definitions are discovered automatically and offered in the
`local` menu with the source `grants-config-<name>`, so you can edit the real
form definition in that repo (with diffs, branches and history) and pull it into
grants-ui via the same toggle / `↳ refresh overrides` action. Set
`GRANTS_UI_SIBLING_CONFIG_DIR` if your checkouts live somewhere other than the
grants-ui parent directory.

A grant can only be overridden from one source at a time; if it exists both here
and in a sibling repo and you select both, this folder wins and the sibling copy
is skipped with a warning.

## How it works

- The grant version is read from the pulled `config-broker-local/<grant>@<version>`
  folder, and the override is published to grants-ui-backend as **one patch above**
  the repo version (e.g. repo `1.2.3` -> override `1.2.4`), so it becomes the
  active version the frontend serves.
- Ticking a grant applies that override; un-ticking it removes the override and
  purges the dependent local application state/locks/submissions for the bumped
  version so the frontend cleanly reverts to the repo version.
- Selections work both before `gt up` (applied once the stack is healthy) and
  while the stack is already running (applied/removed immediately).
- The injected definition's `name` gets a ` (local override active)` suffix
  so an overridden form is easy to tell apart from the real repo version.
- While any override is active, a `↳ refresh overrides` item appears directly below
  `local` in the `gt` main menu. Selecting it re-publishes the selected YAML (from
  this folder or a sibling repo) into Mongo on demand, so you can edit a definition
  and pull in your latest changes without toggling anything off and on again
  (containers must be running).

## Notes

- The contents of this folder are git-ignored (only this `README.md` is
  committed) — overrides are developer-local.
