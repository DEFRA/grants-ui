# TGC-1481: Land Grants user context forwarding

## Purpose

Grants UI must forward the signed-in user's Defra ID access token and SBI to the Land Grants API on every
request. Land Grants API will use that context when it calls the Data Access Layer so SitiAgri agreements can
be included in Grasslands available-area calculations.

The Defra ID token provides user context and an audit trail. It does not replace the existing
service-to-service authentication between Grants UI and Land Grants API.

## Contract

Every Land Grants API request will include:

- the existing encrypted service credential in `Authorization`
- `gateway-type: external`
- the raw Defra ID access token in `x-forwarded-authorization`
- the authenticated user's SBI

For POST requests, the SBI will be included in the JSON request body. For future GET requests, it will be
included as an `sbi` query parameter.

The header name follows the convention already used by Grants UI's Consolidated View integration. This
resolves the conflicting `x-authorisation-header` example in the ticket in favour of
`x-forwarded-authorization`.

## User context

Request-facing code will extract a small, explicit Land Grants user-context object from the authenticated
Hapi request:

```js
{
  defraIdToken,
  sbi
}
```

The extractor will fail before an outbound request if either value is absent or empty. Land Grants calls must
not silently lose their user or audit context.

Only this context object will pass through controllers, payment strategies, services, and clients. Passing
the complete Hapi request into lower layers is deliberately avoided so the Land Grants modules remain
independent of the web framework and their dependencies remain visible in function signatures.

## Request construction

The common Land Grants client will be the enforcement point for the outbound contract.

For POST requests it will:

1. validate the supplied user context
2. create the existing service-authenticated headers
3. add `gateway-type` and `x-forwarded-authorization`
4. add the authenticated SBI to the serialized JSON body
5. perform the request using the existing timeout, retry, error mapping, and logging behaviour

The authenticated SBI will override any `sbi` supplied in a caller's payload. This prevents a caller from
accidentally or deliberately forwarding a different business identity.

The validated context will be created once per inbound request and reused for retries. Neither the Defra ID
token nor the user-context object will be added to logs, errors, cache keys, or cached values.

Grants UI currently makes only POST requests to Land Grants API, so this change will not introduce an unused
GET client. When a GET request is added, it must build its URL with the `URL` constructor and add the
authenticated SBI through `searchParams`.

## Call coverage

User context will be propagated through every current Land Grants API call, not only the Grasslands parcels
request:

- parcel details and available actions
- parcel size and group lookups
- payment calculations
- application validation
- parcel tile location and tile retrieval
- woodland validation
- woodland payment calculations

Request handlers and form controllers already have access to the authenticated request. Payment strategies
and service functions will gain an explicit user-context parameter so calls cannot bypass the contract.

Cached parcel responses may continue to be shared by their existing business cache keys. Authentication
context is required before invoking the service, but tokens will not become part of cache identity or cache
contents.

## Failure behaviour

Missing Defra ID token or SBI is a programming/authentication-context error. The client will fail fast and
will not call Land Grants API.

Existing upstream response handling remains unchanged:

- retry eligible server and network failures
- do not retry ordinary client failures
- preserve structured upstream error logging without sensitive headers or tokens
- preserve binary handling for vector-tile responses

## Testing

Focused unit tests will verify:

- context extraction succeeds for authenticated requests
- missing or blank token and SBI fail before `fetch`
- service `Authorization` remains present
- `gateway-type` and `x-forwarded-authorization` are sent
- the authenticated SBI is added to every POST body and overrides payload SBI
- retries retain the same headers and SBI without logging the token
- every endpoint wrapper forwards user context
- controller, map, payment, and woodland call chains propagate user context
- existing cache behaviour remains intact

After focused tests, validation will run the repository formatter, unit tests, lint checks, and any broader
test suite affected by the changed call signatures.
