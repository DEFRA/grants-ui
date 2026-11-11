# Outbound Call Metrics

Every call Grants UI makes to another service is timed and counted. The metrics are sent to CloudWatch with the CDP
custom metrics library, [`@defra/cdp-metrics`](https://github.com/DEFRA/cdp-libraries/tree/main/packages/cdp-metrics),
which uses AWS Embedded Metrics Format (EMF). In CDP they appear in Grafana through the CloudWatch data source.

They let us link performance-test load to the load it puts on each dependency, and help us support the service in
production.

## Metrics

Each attempt produces one data point for each metric below. When a call is retried, every attempt is counted, because
every attempt is real load on the dependency.

| Metric                    | Unit         | Meaning                                                                               |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `OutboundRequestCount`    | Count        | Always 1. Use `Sum` for the request count or rate.                                    |
| `OutboundRequestDuration` | Milliseconds | Time from sending the request to getting the response or error. Use `p50`/`p99`.      |
| `OutboundRequestFailure`  | Count        | 1 if the call threw or returned HTTP 5xx or 429, otherwise 0. `Average` = error rate. |

HTTP 4xx responses other than 429 are not counted as failures. Many of them are normal answers, for example a 404
when there is no saved state.

## Dimensions

Each metric is published with three dimension sets, so Grafana can query each level without metric maths:

- `Service`
- `Service`, `Scheme`
- `Service`, `Operation`, `Scheme`

| Dimension   | Values                                                                                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Service`   | `grants-ui-backend`, `gas`, `land-grants-api`, `grant-scoring`, `consolidated-view`, `defra-id`, `entra`, `os-maps`, `audit-sns`                                                                                                                                                                                                                   |
| `Operation` | A stable name for the call, for example `getStateWithDefinition`, `saveState`, `submitApplication`, `invokePostAction.<action>`, `/api/v2/parcels`                                                                                                                                                                                                 |
| `Scheme`    | The grant code the call was made for. If the caller does not say, the `slug` of the request being handled is used. `non-scheme-specific` is used for shared calls (Entra service tokens, Defra ID discovery/JWKS, the allowlist, releasing locks on sign-out), for calls made outside a request, and for any value that is not a valid grant code. |

## Adding a new outbound call

Wrap each network attempt with `withOutboundMetrics`. If there is a retry, put the wrapper inside the function you
pass to `retry`:

```js
import { OutboundService, withOutboundMetrics } from '~/src/server/common/helpers/outbound-call-metrics.js'

const response = await withOutboundMetrics(
  { service: OutboundService.GRANTS_UI_BACKEND, operation: 'saveState', scheme: grantCode },
  () => fetch(url, options)
)
```

- `operation` must be low-cardinality. Never use a raw URL, a reference number or an id.
- Leave out `scheme` to use the current request's slug. Pass `NON_SCHEME_SPECIFIC` for calls that are shared across
  grants.
- Pass `isFailure` if the default failure rule (an error was thrown, or HTTP 5xx/429) does not suit the call.

## Configuration

| Setting               | Purpose                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_METRICS`      | Turns emission on or off (`isMetricsEnabled`). Defaults to on when `NODE_ENV=production`. When off, calls are not instrumented.                                 |
| `AWS_EMF_ENVIRONMENT` | Set to `Local` by `npm run dev` / `npm run dev:debug`, so metrics are printed to stdout and not sent to CloudWatch. **Do not set it in deployed environments.** |

Metrics are sent in the background and never delay or fail the call being measured. If they cannot be sent, a
`SYSTEM.METRICS_EMIT_FAILED` warning is logged.

## Not covered

These calls are made inside third-party libraries, so Grants UI cannot wrap them:

- Defra ID sign-in token exchange (inside the auth plugin).
- Redis session and cache traffic (inside catbox / ioredis).
