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

## How calls are captured

Nothing is needed at call sites. `installOutboundCallMetrics()` runs once at start-up, in `createServer`, and
subscribes to Node's diagnostics channels for outgoing requests:

- `undici:request:*` for every `fetch` call, through the egress proxy or not;
- `http.client.*` for everything built on `node:http`: Wreck, h2o2, Bell / OIDC and the AWS SDK. Each AWS SDK retry is
  a separate request, so each one is counted.

## Dimensions

Each metric is published with three dimension sets, so Grafana can query each level without metric maths:

- `Service`
- `Service`, `Scheme`
- `Service`, `Method`, `Scheme`

| Dimension | Values                                                                                                                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Service` | Found by matching the call's URL against the base URLs in config, listed in `SERVICE_URL_SETTINGS`: `grants-ui-backend`, `gas`, `land-grants-api`, `grant-scoring`, `consolidated-view`, `defra-id`, `entra`, `os-maps`, `agreements`. Any other host is reported by its hostname, for example `sns.eu-west-2.amazonaws.com`. |
| `Method`  | The HTTP method (`GET`, `POST`, ...). Any non-standard method is reported as `OTHER`.                                                                                                                                                                                                                                         |
| `Scheme`  | The `slug` of the request being handled (`currentRequest()`), when it looks like a grant code. Calls to Entra and Defra ID, calls made outside a request, and anything else use `non-scheme-specific`.                                                                                                                        |

## Adding a new dependency

New calls are captured automatically. To give a new dependency a stable `Service` name rather than its hostname, add
its base URL setting to `SERVICE_URL_SETTINGS` in `src/server/common/helpers/outbound-call-metrics.js`. If it is shared
by every grant, add it to `NON_SCHEME_SERVICES` too.

## Configuration

| Setting               | Purpose                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_METRICS`      | Turns emission on or off (`isMetricsEnabled`). Defaults to on when `NODE_ENV=production` or `AWS_EMF_ENVIRONMENT=Local`. When off, calls are not instrumented. |
| `AWS_EMF_ENVIRONMENT` | Set to `Local` for local development, so metrics are printed to stdout and not sent to CloudWatch. **Do not set it in deployed environments.**                 |

## Testing locally

Metrics are on locally, because `compose.grants-ui.yml` and `nodemon.json` set `AWS_EMF_ENVIRONMENT=Local`. Start the
stack as usual (`gt`, `npm run docker:up` or `npm run dev`) and watch the data points:

```sh
tail -f logs/outbound-metrics.log
```

To turn them off, start with `ENABLE_METRICS=false`.

`METRICS_DEBUG_LOG_FILE` (set to `logs/outbound-metrics.log` in `compose.grants-ui.yml` and `nodemon.json`) makes
every data point also be appended to that file as one JSON line: the dimension sets and metric values exactly as given
to the metrics logger. `logs/` is git-ignored. With `AWS_EMF_ENVIRONMENT=Local` the EMF documents are also printed to
stdout. Leave `METRICS_DEBUG_LOG_FILE` unset in deployed environments.

Metrics are sent in the background and never delay or fail the call being measured. If they cannot be sent, a
`SYSTEM.METRICS_EMIT_FAILED` warning is logged.

## Not covered

- Redis session and cache traffic. It is plain TCP (ioredis), not HTTP.
- Anything that opens raw sockets. Nothing in the service does this today.
