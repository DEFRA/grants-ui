# Derived answers on custom pages

Use `withDerivedState` from `src/server/common/helpers/state/with-derived-state.js` for pages that calculate answers
into `state.additionalAnswers` and need freshness checks on Check answers. Keep the calculation and rendering in the custom controller. The mixin supplies applicability,
freshness checking and persistence, and composes with `withTaskContext`.

```js
class ResultController extends withDerivedState(QuestionPageController) {

  getCalculatedAnswers(request, state) {
    return { calculatedAmount: state.quantity * 2 }
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      context.state = await this.refreshState(request, context)
      return h.view(this.viewName, this.getViewModel(request, context))
    }
  }
}

class ResultTaskPageController extends withTaskContext(ResultController) {}
```

## Controller contract

For definition-configured pages, put the derived-state contract in that page's
`config:` block. The form-definition loader exposes it as
`metadata.pageConfig[path]` before constructing the controller:

```yaml
- path: /result
  controller: ResultController
  config:
    derivedState:
      stateKeys:
        - calculatedAmount
      requiresAcknowledgement: true
```

`stateKeys` and acknowledgement policy belong to `config.derivedState`. The mixin can still be given static
derived-state options when that is the reusable controller's contract.

For example, the water-management total-cost page, its calculation inputs are also page
configuration:

```yaml
config:
  derivedState:
    stateKeys:
      - reservoirCostPerUnit
      - distNetworkCostPerUnit
      - tanksCostPerUnit
      - reservoirCost
      - waterDistributionNetworkCost
      - waterTanksCost
      - totalEstimatedCost
      - estimatedMaxGrant
    requiresAcknowledgement: true
  costs:
    reservoirCostPerUnit: 2.5
    distNetworkCostPerUnit: 5
    tanksCostPerUnit: 1.5
    grantMaxRate: 0.4
```

- `stateKeys` lists the exclusive, top-level keys the controller owns in `additionalAnswers`. Different controllers must
  own disjoint keys. Every calculation must return exactly these keys, including zero results. Use `null` to represent an
  intentionally absent answer; do not omit an owned key or return `undefined`. Values must be JSON-safe.
- `getCalculatedAnswers(request, state)` returns an object or a promise for that object. It must not mutate state, persist
  answers, redirect, or submit a grant application. Without `calculationInputs`, it must only calculate locally:
  Check answers invokes this method to compare calculated outputs with saved answers. With `calculationInputs`, it may
  call a calculation API because freshness checks compare inputs without invoking this method.
- `isDerivedStateApplicable(context)` checks membership in the engine's `context.relevantPages` and excludes forced
  previews. An excluded page is neither checked nor refreshed, even if it still has saved results.
- `await isStateStale(request, context)` performs a read-only check. Missing owned answers are stale. Otherwise, it
  compares the configured input snapshot, or compares calculated outputs structurally with saved values when
  `calculationInputs` is omitted. Output comparison suits inexpensive local calculations such as total estimated cost.
- `await refreshState(request, context)` calculates and validates all outputs, merges them with existing additional
  answers, and persists through `setState`. It returns the saved state for the caller to assign to `context.state`.
  Unrelated answers are preserved. Failures retain their cause and do not persist partial results.
  With `calculationInputs`, a fresh page returns existing state without calculating or writing.
- `requiresAcknowledgement: true` preserves the result-page review flow: when stale, Check answers redirects to the
  result page with an explicit `returnUrl`. The page GET refreshes and displays the result; its normal Continue action
  returns to Check answers. This is a navigation policy, **not a durable confirmation record**. A separate required form
  answer is needed if a user must explicitly confirm a result even after navigating away or opening another tab.
- `requiresAcknowledgement: false` permits Check answers to await a refresh and then render or proceed without a result
  page visit. Automatic calculations write only additional answers; they must not alter
  form-question answers or determine page applicability.

The mixin does not wrap GET/POST handlers, change task navigation, or imply task completion. A custom GET must call
`refreshState` before rendering. The existing total estimated cost controller is an example with domain-specific error
context around its GET handler.

## Freshness based on configured inputs

For API calculations, declare every state dependency alongside the owned output keys in the form definition:

```yaml
config:
  derivedState:
    stateKeys:
      - eligibilityScore
      - eligibilityBand
    calculationInputs:
      - countyProjectLocated
    requiresAcknowledgement: true
```

`calculationInputs` is an optional, non-empty list of unique paths relative to `context.state`. Dotted paths such as
`additionalAnswers.totalEstimatedCost` are supported. The mixin resolves paths generically; controllers only implement
the calculation itself. Include all dependencies and avoid circular dependencies or the page's own outputs.

When configured, freshness checks compare current inputs with the last successful calculation's snapshot. Missing
outputs or snapshots are stale, including applications saved before this feature. Changing the configured input paths
or owned keys also invalidates the snapshot. Unrelated state changes do not trigger calculation.

Snapshots live in `state.derivedStateSnapshots`, keyed by page path, outside submitted `additionalAnswers`. A refresh
captures state before calculating and persists outputs and their input snapshot together through `setState`. Failed
calculations do not update either. This reuses the existing persistence and concurrency controls; it does not deduplicate
simultaneous requests across browser tabs or service instances.

With `requiresAcknowledgement: true`, Check answers GET and POST redirect stale pages to their result page, where the
calculation runs. Returning to Check answers or reloading fresh results does not call the API. With `false`, Check answers
refreshes stale results automatically.

Omitting `calculationInputs` preserves output comparison, suitable for local calculations such as total estimated cost.
That mode also detects changes to cost configuration. Input snapshots only detect configured state changes: remote scoring
rule changes require an explicit invalidation policy, such as a scoring revision represented in state and listed as an input.

## Check answers configuration

The Check answers page's `config:` block lists pages that have derived state:

```yaml
- title: Check your answers
  id: 00000000-0000-4000-8000-000000000001
  path: /summary
  section: 00000000-0000-4000-8000-000000000002
  controller: CheckResponsesPageController
  config:
    width: full
    derivedStatePages:
      - /total-estimated-cost
    additionalSections:
      - page: /total-estimated-cost
        items:
          - title: Total Estimated Cost (£)
            stateValue: additionalAnswers.totalEstimatedCost
```

The form-definition loader hoists the `config:` block to `metadata.pageConfig` at runtime. Use slash-prefixed page paths
in `derivedStatePages` and `additionalSections[].page`. List derived pages in dependency order: a later calculation may
read an earlier page's additional answers. Avoid circular dependencies. Both GET and POST handlers await the checks after
the engine's ordinary access and validation checks. The synchronous `getRelevantPath` is unchanged. Excluded page paths
are skipped, and summary rows tied to excluded pages are omitted. Existing controllers with `isStateStale` but no
`derivedState` options retain the result-page visit behaviour.

`additionalSections` controls display independently of derived-state freshness and can also display other saved values.
See [Additional Check answers sections](FEATURES.md#additional-check-answers-sections) for its general configuration.

New local-calculation pages must be added to the appropriate `derivedStatePages` configuration in Grants UI Backend to
participate in the final freshness checks.

Task completion is configured separately. A result page can be excluded from task completion and still require a freshness
check. See [Task completion participation](FEATURES.md#task-completion-participation) for `config.excludeFromTaskCompletion`
and its migration guidance.
