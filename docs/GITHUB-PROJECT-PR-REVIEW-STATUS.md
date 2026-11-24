# GitHub Project PR review status pilot

The `pr-review-status.yml` workflow updates the `Status` field for pull
requests in this repository. It uses the pull request's current aggregate
`reviewDecision`, so a triggering review event is not treated as the final
decision by itself. If the pull request is not yet in the Project, the workflow
adds it before setting the field.

## GitHub configuration

Before enabling the workflow:

1. Verify that the existing `Status` field in the Grants Enablement Project
   includes these options: `Draft`, `Awaiting review`,
   `Changes requested`, and `Approved`.
2. Set the repository or organization Actions variable
   `GRANTS_ENABLEMENT_PROJECT_NUMBER` to the project number shown in its URL.
3. Configure an organization-approved GitHub App with read access to pull
   requests in `grants-ui` and write access to organization Projects. Install
   it for `grants-ui`, set its client ID as the
   `GRANTS_PROJECTS_APP_CLIENT_ID` Actions variable, and store its private key
   as the `GRANTS_PROJECTS_APP_PRIVATE_KEY` Actions secret. The workflow mints a
   short-lived installation token for each run.

The workflow uses `pull_request_target` for pull request lifecycle events and
checks out only the repository's default branch. It does not check out or run
pull request code. The built-in Project automation for closed or merged items
is separate; configure auto-archive in the Project if closed PRs should be
archived.

After rollout, existing open PRs are updated when they next trigger the
workflow. Updating the existing queue immediately requires a separate backfill.

This is a repository-scoped pilot. A workflow in this repository does not
receive events from other repositories; extending it requires installing
equivalent automation in those repositories or adopting an organization-level
GitHub App/webhook.
