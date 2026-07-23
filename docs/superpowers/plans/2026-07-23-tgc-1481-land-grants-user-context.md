# TGC-1481 Land Grants User Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward the authenticated user's Defra ID access token and SBI on every Grants UI request to Land Grants API.

**Architecture:** Extract a small `{ defraIdToken, sbi }` object at request boundaries and pass it explicitly through controllers, strategies, services, and clients. The common Land Grants client validates the context, preserves service-to-service `Authorization`, adds the external-gateway headers, and injects the authenticated SBI into every POST body.

**Tech Stack:** Node.js ES modules, Hapi, Defra Forms Engine, Vitest, Pact V3, Prettier, ESLint

## Global Constraints

- Preserve the existing encrypted service credential in `Authorization`.
- Send `gateway-type: external`.
- Send the raw Defra ID access token in `x-forwarded-authorization`.
- Add the authenticated SBI to every POST JSON body, overriding any payload SBI.
- Fail before calling Land Grants API if the Defra ID token or SBI is missing or blank.
- Do not add the token to logs, errors, cache keys, or cached values.
- Do not introduce an unused GET client; a future GET must use `new URL(...)` and `searchParams.set('sbi', sbi)`.
- Keep existing retry, timeout, upstream-error mapping, cache, and binary vector-tile behaviour.
- Use ES modules, 2-space indentation, single quotes, no semicolons, and no trailing commas.

---

## File structure

**Create**

- `src/server/land-grants/services/land-grants-user-context.js`: extracts and validates the authenticated Land Grants context.
- `src/server/land-grants/services/land-grants-user-context.test.js`: covers successful extraction and fail-fast validation.

**Modify**

- `src/server/land-grants/services/land-grants.client.js`: enforces headers and authenticated SBI for all POSTs.
- `src/server/land-grants/services/land-grants.client.test.js`: verifies the outbound contract and endpoint propagation.
- `src/server/land-grants/services/land-grants.service.js`: accepts and forwards explicit user context.
- `src/server/land-grants/services/land-grants.service.test.js`: verifies service-to-client propagation without changing cache identity.
- `src/server/land-grants/controllers/select-actions-base-page.controller.js`: supplies context for actions and validation.
- `src/server/land-grants/controllers/select-actions-base-page.controller.test.js`: verifies context propagation.
- `src/server/land-grants/controllers/submission-page.controller.js`: supplies context for submission validation.
- `src/server/land-grants/controllers/submission-page.controller.test.js`: verifies context propagation.
- `src/server/land-grants/controllers/select-land-parcel-page.controller.js`: supplies context for parcel loads.
- `src/server/land-grants/controllers/select-land-parcel-page.controller.test.js`: verifies context propagation.
- `src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.js`: supplies context for generic parcel selection.
- `src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.test.js`: verifies context propagation.
- `src/server/common/map/handlers.js`: reuses context for parcel, location, and vector-tile calls.
- `src/server/common/map/handlers.test.js`: verifies map call propagation.
- `src/server/payment/controllers/payment-page.controller.js`: supplies context to payment strategies.
- `src/server/payment/controllers/payment-page.controller.test.js`: verifies context propagation and existing error rendering.
- `src/server/payment/payment-strategies.js`: accepts context and passes it into both payment strategies.
- `src/server/payment/payment-strategies.test.js`: verifies multi-action and woodland propagation.
- `src/server/woodland/woodland-hectares-page.controller.js`: supplies context for woodland validation.
- `src/server/woodland/woodland-hectares-page.controller.test.js`: verifies context propagation.
- `src/server/woodland/woodland.service.js`: passes context into woodland clients.
- `src/server/woodland/woodland.service.test.js`: verifies service propagation.
- `src/server/woodland/woodland.client.js`: passes context to the common Land Grants client.
- `src/server/woodland/woodland.client.test.js`: verifies both woodland endpoints.
- `src/contracts/v2/land-grants.client.contract.test.js`: records the new headers and SBI body contract.

---

### Task 1: Authenticated Land Grants user context

**Files:**

- Create: `src/server/land-grants/services/land-grants-user-context.js`
- Create: `src/server/land-grants/services/land-grants-user-context.test.js`

**Interfaces:**

- Consumes: `request.auth.credentials.token` and `request.auth.credentials.sbi`.
- Produces: `getLandGrantsUserContext(request): LandGrantsUserContext`.
- Produces: `validateLandGrantsUserContext(value): LandGrantsUserContext`.
- Produces type: `LandGrantsUserContext = { defraIdToken: string, sbi: string }`.

- [ ] **Step 1: Write the failing context tests**

```js
import { describe, expect, it } from 'vitest'
import { getLandGrantsUserContext, validateLandGrantsUserContext } from './land-grants-user-context.js'

const validContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}

describe('getLandGrantsUserContext', () => {
  it('extracts the Defra ID token and SBI from authenticated credentials', () => {
    const request = {
      auth: {
        credentials: {
          token: validContext.defraIdToken,
          sbi: validContext.sbi
        }
      }
    }

    expect(getLandGrantsUserContext(request)).toEqual(validContext)
  })
})

describe('validateLandGrantsUserContext', () => {
  it.each([undefined, null, '', '   '])('rejects missing or blank Defra ID token: %s', (defraIdToken) => {
    expect(() => validateLandGrantsUserContext({ ...validContext, defraIdToken })).toThrow(
      'Missing Defra ID token in Land Grants user context'
    )
  })

  it.each([undefined, null, '', '   '])('rejects missing or blank SBI: %s', (sbi) => {
    expect(() => validateLandGrantsUserContext({ ...validContext, sbi })).toThrow(
      'Missing SBI in Land Grants user context'
    )
  })

  it('returns a validated context without changing the token', () => {
    expect(validateLandGrantsUserContext(validContext)).toEqual(validContext)
  })
})
```

- [ ] **Step 2: Run the test and verify that the module is missing**

Run:

```bash
npx vitest run src/server/land-grants/services/land-grants-user-context.test.js
```

Expected: FAIL because `land-grants-user-context.js` does not exist.

- [ ] **Step 3: Implement extraction and validation**

```js
/**
 * @param {AnyFormRequest | import('@hapi/hapi').Request} request
 * @returns {LandGrantsUserContext}
 */
export function getLandGrantsUserContext(request) {
  return validateLandGrantsUserContext({
    defraIdToken: request.auth?.credentials?.token,
    sbi: request.auth?.credentials?.sbi
  })
}

/**
 * @param {Partial<LandGrantsUserContext> | null | undefined} userContext
 * @returns {LandGrantsUserContext}
 */
export function validateLandGrantsUserContext(userContext) {
  const defraIdToken = userContext?.defraIdToken
  const sbi = userContext?.sbi

  if (typeof defraIdToken !== 'string' || !defraIdToken.trim()) {
    throw new Error('Missing Defra ID token in Land Grants user context')
  }

  if (typeof sbi !== 'string' || !sbi.trim()) {
    throw new Error('Missing SBI in Land Grants user context')
  }

  return { defraIdToken, sbi }
}

/**
 * @typedef {object} LandGrantsUserContext
 * @property {string} defraIdToken
 * @property {string} sbi
 */

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npx vitest run src/server/land-grants/services/land-grants-user-context.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the context boundary**

```bash
git add src/server/land-grants/services/land-grants-user-context.js src/server/land-grants/services/land-grants-user-context.test.js
git commit -S -m "feat(TGC-1481): validate Land Grants user context"
```

---

### Task 2: Enforce the outbound Land Grants contract

**Files:**

- Modify: `src/server/land-grants/services/land-grants.client.js`
- Modify: `src/server/land-grants/services/land-grants.client.test.js`

**Interfaces:**

- Consumes: `validateLandGrantsUserContext(userContext)`.
- Changes: `postToLandGrantsApiRaw(endpoint, body, baseUrl, userContext)`.
- Changes: `postToLandGrantsApi(endpoint, body, baseUrl, userContext)`.
- Changes every endpoint wrapper to accept `userContext` as its final argument.
- Produces: POST headers containing service `Authorization`, `gateway-type`, and `x-forwarded-authorization`.
- Produces: JSON body `{ ...callerBody, sbi: authenticatedSbi }`.

- [ ] **Step 1: Update the client tests to express the new contract**

Add the shared fixture:

```js
const mockUserContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}
```

Pass `mockUserContext` as the final argument to every direct client and endpoint-wrapper call. Change the
successful POST expectation to:

```js
const result = await postToLandGrantsApi('/submit', { data: 'test' }, mockApiEndpoint, mockUserContext)

expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/submit`, {
  method: 'POST',
  headers: {
    Authorization: expect.any(String),
    'Content-Type': 'application/json',
    'gateway-type': 'external',
    'x-forwarded-authorization': mockUserContext.defraIdToken
  },
  body: JSON.stringify({
    data: 'test',
    sbi: mockUserContext.sbi
  })
})
```

Add fail-fast and anti-spoofing tests:

```js
it('does not call fetch when user context is missing', async () => {
  await expect(postToLandGrantsApi('/submit', {}, mockApiEndpoint)).rejects.toThrow(
    'Missing Defra ID token in Land Grants user context'
  )
  expect(mockFetch).not.toHaveBeenCalled()
})

it('overrides a payload SBI with the authenticated SBI', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ ok: true }) })

  await postToLandGrantsApi('/submit', { sbi: 'spoofed-sbi' }, mockApiEndpoint, mockUserContext)

  const [, options] = mockFetch.mock.calls[0]
  expect(JSON.parse(options.body)).toEqual({ sbi: mockUserContext.sbi })
})
```

Extend an existing retry test so the operation runs twice, then assert both calls retain the same protected
values and the token was not logged:

```js
expect(mockFetch).toHaveBeenCalledTimes(2)
for (const [, options] of mockFetch.mock.calls) {
  expect(options.headers['x-forwarded-authorization']).toBe(mockUserContext.defraIdToken)
  expect(JSON.parse(options.body).sbi).toBe(mockUserContext.sbi)
}
expect(JSON.stringify(log.mock.calls)).not.toContain(mockUserContext.defraIdToken)
```

- [ ] **Step 2: Run the client test and verify the new expectations fail**

Run:

```bash
npx vitest run src/server/land-grants/services/land-grants.client.test.js
```

Expected: FAIL because the client does not accept or forward user context.

- [ ] **Step 3: Add context enforcement to the common POST implementation**

Import the validator:

```js
import { validateLandGrantsUserContext } from './land-grants-user-context.js'
```

Change the function signature and insert validation as its first statement:

```js
export async function postToLandGrantsApiRaw(endpoint, body, baseUrl, userContext) {
  const { defraIdToken, sbi } = validateLandGrantsUserContext(userContext)
}
```

Replace the existing `fetch` options object with:

```js
{
  method: 'POST',
  headers: {
    ...createApiHeadersForLandGrantsBackend(),
    'gateway-type': 'external',
    'x-forwarded-authorization': defraIdToken
  },
  body: JSON.stringify({
    ...body,
    sbi
  })
}
```

Change the JSON wrapper to:

```js
export async function postToLandGrantsApi(endpoint, body, baseUrl, userContext) {
  const response = await postToLandGrantsApiRaw(endpoint, body, baseUrl, userContext)
  return response.json()
}
```

Add `userContext` as the final parameter to, and forward it from:

```js
fetchParcelTile(parcelIds, z, x, y, baseUrl, userContext)
calculate(payload, baseUrl, userContext)
parcelsWithSize(parcelIds, baseUrl, userContext)
parcelsGroups(parcelIds, baseUrl, userContext)
parcelsWithFields(fields, parcelIds, baseUrl, userContext)
parcelsWithExtendedInfo(parcelIds, baseUrl, userContext)
validate(request, baseUrl, userContext)
locateParcelTiles(parcelIds, baseUrl, userContext)
```

For example:

```js
export async function calculate(payload, baseUrl, userContext) {
  return postToLandGrantsApi('/api/v2/payments/calculate', payload, baseUrl, userContext)
}
```

- [ ] **Step 4: Run client and context tests**

Run:

```bash
npx vitest run src/server/land-grants/services/land-grants-user-context.test.js src/server/land-grants/services/land-grants.client.test.js
```

Expected: PASS with all endpoint wrappers receiving the final context argument.

- [ ] **Step 5: Commit the outbound contract**

```bash
git add src/server/land-grants/services/land-grants.client.js src/server/land-grants/services/land-grants.client.test.js
git commit -S -m "feat(TGC-1481): forward user context from Land Grants client"
```

---

### Task 3: Propagate context through Land Grants services

**Files:**

- Modify: `src/server/land-grants/services/land-grants.service.js`
- Modify: `src/server/land-grants/services/land-grants.service.test.js`

**Interfaces:**

- Consumes: `LandGrantsUserContext`.
- Changes service signatures to accept `userContext` as the final argument.
- Keeps `fetchParcels(request, userContext)` because Consolidated View still consumes the authenticated Hapi request.
- Removes SBI from `validateApplication(data)` input; the client now injects the authenticated value.

- [ ] **Step 1: Add a shared service-test context and update propagation expectations**

```js
const mockUserContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}
```

Pass `mockUserContext` to each tested public service call. Update client expectations, for example:

```js
const result = await calculateLandActionsPayment(state, mockUserContext)

expect(calculate).toHaveBeenCalledWith(
  expect.objectContaining({ parcel: expect.any(Array) }),
  mockApiEndpoint,
  mockUserContext
)
```

For parcel hydration:

```js
const result = await fetchParcels(mockRequest, mockUserContext)

expect(parcelsWithSize).toHaveBeenCalledWith(parcelKeys, mockApiEndpoint, mockUserContext)
```

For validation, remove `sbi` from the service input and assert it is not assembled locally:

```js
await validateApplication(
  {
    applicationId: 'ABC-123',
    crn: 'CRN123',
    state
  },
  mockUserContext
)

expect(validate).toHaveBeenCalledWith(
  expect.not.objectContaining({ sbi: expect.anything() }),
  mockApiEndpoint,
  mockUserContext
)
```

Retain the cache tests and assert repeated calls with the same existing cache key still invoke the Land
Grants client only once. Do not include `defraIdToken` in expected cache keys.

- [ ] **Step 2: Run the service test and verify propagation expectations fail**

Run:

```bash
npx vitest run src/server/land-grants/services/land-grants.service.test.js
```

Expected: FAIL because service functions do not yet accept `mockUserContext`.

- [ ] **Step 3: Add explicit context parameters throughout the service**

Make these exact signature and call-site substitutions while retaining each function's existing mapping,
cache, and error-handling statements:

```diff
-export async function calculateLandActionsPayment(state) {
+export async function calculateLandActionsPayment(state, userContext) {
-  const { payment } = await calculate(payload, LAND_GRANTS_API_URL)
+  const { payment } = await calculate(payload, LAND_GRANTS_API_URL, userContext)

-export async function fetchAvailableActionsForParcel({ parcelId = '', sheetId = '', enabledLandActions = [] }) {
+export async function fetchAvailableActionsForParcel(
+  { parcelId = '', sheetId = '', enabledLandActions = [] },
+  userContext
+) {
-  const { parcels, groups: groupDefinitions = [] } = await parcelsWithExtendedInfo(parcelIds, LAND_GRANTS_API_URL)
+  const { parcels, groups: groupDefinitions = [] } = await parcelsWithExtendedInfo(
+    parcelIds,
+    LAND_GRANTS_API_URL,
+    userContext
+  )

-export async function fetchParcelsGroups(state) {
+export async function fetchParcelsGroups(state, userContext) {
-  const { groups = [] } = await parcelsGroups(parcelIds, LAND_GRANTS_API_URL)
+  const { groups = [] } = await parcelsGroups(parcelIds, LAND_GRANTS_API_URL, userContext)

-async function fetchParcelsSize(parcelIds) {
+async function fetchParcelsSize(parcelIds, userContext) {
-  const { parcels } = await parcelsWithSize(parcelIds, LAND_GRANTS_API_URL)
+  const { parcels } = await parcelsWithSize(parcelIds, LAND_GRANTS_API_URL, userContext)

-export async function fetchParcels(request) {
+export async function fetchParcels(request, userContext) {
-    inflight = loadParcelsForSbi(request, sbi).finally(() => inflightParcelsBySbi.delete(sbi))
+    inflight = loadParcelsForSbi(request, sbi, userContext).finally(() => inflightParcelsBySbi.delete(sbi))

-async function loadParcelsForSbi(request, sbi) {
+async function loadParcelsForSbi(request, sbi, userContext) {
-  const sizes = await fetchParcelsSize(parcelKeys)
+  const sizes = await fetchParcelsSize(parcelKeys, userContext)

-export async function fetchParcelTileLocation(parcelIds) {
+export async function fetchParcelTileLocation(parcelIds, userContext) {
-    const result = await locateParcelTiles(parcelIds, LAND_GRANTS_API_URL)
+    const result = await locateParcelTiles(parcelIds, LAND_GRANTS_API_URL, userContext)
```

Replace `validateApplication` in full:

```js
export async function validateApplication(data, userContext) {
  const { applicationId, crn, state } = data

  const payload = {
    applicationId: applicationId?.toLowerCase(),
    requester: 'grants-ui',
    applicantCrn: crn,
    landActions: stateToLandActionsMapper(state)
  }
  const result = await validate(payload, LAND_GRANTS_API_URL, userContext)
  result.errorMessages = buildErrorMessagesFromResponse(result.actions)
  return result
}
```

Update JSDoc on every changed function and import the type:

```js
/**
 * @import { LandGrantsUserContext } from './land-grants-user-context.js'
 */
```

- [ ] **Step 4: Run service, client, and context tests**

Run:

```bash
npx vitest run src/server/land-grants/services/land-grants-user-context.test.js src/server/land-grants/services/land-grants.client.test.js src/server/land-grants/services/land-grants.service.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit service propagation**

```bash
git add src/server/land-grants/services/land-grants.service.js src/server/land-grants/services/land-grants.service.test.js
git commit -S -m "feat(TGC-1481): propagate user context through Land Grants services"
```

---

### Task 4: Supply context from form and map request boundaries

**Files:**

- Modify: `src/server/land-grants/controllers/select-actions-base-page.controller.js`
- Modify: `src/server/land-grants/controllers/select-actions-base-page.controller.test.js`
- Modify: `src/server/land-grants/controllers/submission-page.controller.js`
- Modify: `src/server/land-grants/controllers/submission-page.controller.test.js`
- Modify: `src/server/land-grants/controllers/select-land-parcel-page.controller.js`
- Modify: `src/server/land-grants/controllers/select-land-parcel-page.controller.test.js`
- Modify: `src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.js`
- Modify: `src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.test.js`
- Modify: `src/server/common/map/handlers.js`
- Modify: `src/server/common/map/handlers.test.js`

**Interfaces:**

- Consumes: `getLandGrantsUserContext(request)`.
- Supplies one explicit context object to each Land Grants service/client call.
- Leaves existing controller error rendering and map upstream-status handling intact.

- [ ] **Step 1: Update controller and map tests with authenticated tokens**

Use this credential shape in successful request fixtures:

```js
const credentials = {
  token: 'defra-id-access-token',
  sbi: '123456789',
  crn: 'CRN123'
}

const expectedUserContext = {
  defraIdToken: credentials.token,
  sbi: credentials.sbi
}
```

Update expectations to include `expectedUserContext`, including:

```js
expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith(
  { parcelId: 'parcel1', sheetId: 'sheet1', enabledLandActions: expect.any(Array) },
  expectedUserContext
)

expect(validateApplication).toHaveBeenCalledWith(
  expect.not.objectContaining({ sbi: expect.anything() }),
  expectedUserContext
)

expect(fetchParcels).toHaveBeenCalledWith(mockRequest, expectedUserContext)
expect(fetchParcelTileLocation).toHaveBeenCalledWith(['SD7148-9160', 'SD7148-9161'], expectedUserContext)
expect(fetchParcelTile).toHaveBeenCalledWith(
  ['SD7148-9160', 'SD7148-9161'],
  '12',
  '100',
  '200',
  'https://land-grants-api',
  expectedUserContext
)
```

- [ ] **Step 2: Run the request-boundary tests and verify they fail**

Run:

```bash
npx vitest run src/server/land-grants/controllers/select-actions-base-page.controller.test.js src/server/land-grants/controllers/submission-page.controller.test.js src/server/land-grants/controllers/select-land-parcel-page.controller.test.js src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.test.js src/server/common/map/handlers.test.js
```

Expected: FAIL because request credentials are not yet converted into user context.

- [ ] **Step 3: Extract and pass context at each boundary**

Import:

```js
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
```

Use it inside existing `try` blocks so existing user-facing error handling remains effective:

```js
const userContext = getLandGrantsUserContext(request)
```

Apply these calls:

```js
fetchAvailableActionsForParcel({ parcelId, sheetId, enabledLandActions: this.enabledLandActions }, userContext)
validateApplication({ applicationId, crn, state }, userContext)
fetchParcels(request, userContext)
fetchParcelTileLocation(parcelIds, userContext)
fetchParcelTile(parcelIds, z, x, y, LAND_GRANTS_API_URL, userContext)
```

In both map handlers, extract one `userContext` and reuse it for every Land Grants call made by that inbound
request. Keep Consolidated View receiving the original `request` through `fetchParcels`.

- [ ] **Step 4: Run request-boundary and service tests**

Run:

```bash
npx vitest run src/server/land-grants/controllers/select-actions-base-page.controller.test.js src/server/land-grants/controllers/submission-page.controller.test.js src/server/land-grants/controllers/select-land-parcel-page.controller.test.js src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.test.js src/server/common/map/handlers.test.js src/server/land-grants/services/land-grants.service.test.js
```

Expected: PASS, including existing error and cache cases.

- [ ] **Step 5: Commit request-boundary propagation**

```bash
git add src/server/land-grants/controllers/select-actions-base-page.controller.js src/server/land-grants/controllers/select-actions-base-page.controller.test.js src/server/land-grants/controllers/submission-page.controller.js src/server/land-grants/controllers/submission-page.controller.test.js src/server/land-grants/controllers/select-land-parcel-page.controller.js src/server/land-grants/controllers/select-land-parcel-page.controller.test.js src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.js src/server/land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.test.js src/server/common/map/handlers.js src/server/common/map/handlers.test.js
git commit -S -m "feat(TGC-1481): supply user context to Land Grants journeys"
```

---

### Task 5: Propagate context through payment and woodland

**Files:**

- Modify: `src/server/payment/controllers/payment-page.controller.js`
- Modify: `src/server/payment/controllers/payment-page.controller.test.js`
- Modify: `src/server/payment/payment-strategies.js`
- Modify: `src/server/payment/payment-strategies.test.js`
- Modify: `src/server/woodland/woodland-hectares-page.controller.js`
- Modify: `src/server/woodland/woodland-hectares-page.controller.test.js`
- Modify: `src/server/woodland/woodland.service.js`
- Modify: `src/server/woodland/woodland.service.test.js`
- Modify: `src/server/woodland/woodland.client.js`
- Modify: `src/server/woodland/woodland.client.test.js`

**Interfaces:**

- Changes payment strategy signature to `calculatePayment(state, userContext)`.
- Changes woodland service and client functions to accept `userContext` as the final argument.
- Preserves current payment and woodland error views.

- [ ] **Step 1: Update payment and woodland tests**

Add:

```js
const mockUserContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}
```

Update payment strategy expectations:

```js
await paymentStrategies.multiAction.calculatePayment(mockState, mockUserContext)
expect(landGrantsService.calculateLandActionsPayment).toHaveBeenCalledWith(mockState, mockUserContext)
expect(landGrantsService.fetchParcelsGroups).toHaveBeenCalledWith(mockState, mockUserContext)

await paymentStrategies.wmp.calculatePayment(mockState, mockUserContext)
expect(woodlandService.calculateWmpPayment).toHaveBeenCalledWith(
  {
    parcelIds: ['parcel1', 'parcel2'],
    hectaresUnderTenYearsOld: 5.5,
    hectaresTenOrOverYearsOld: 2
  },
  mockUserContext
)
```

Give successful payment and woodland controller requests `auth.credentials.token` and `auth.credentials.sbi`,
then assert their service or strategy mock receives `mockUserContext`.

Update woodland client expectations:

```js
expect(landGrantsClient.postToLandGrantsApi).toHaveBeenCalledWith(
  '/api/v1/wmp/validate',
  {
    parcelIds: ['SD6346-3387'],
    oldWoodlandAreaHa: 2,
    newWoodlandAreaHa: 1
  },
  'http://api',
  mockUserContext
)
```

Make the equivalent assertion for `/api/v1/wmp/payments/calculate`.

- [ ] **Step 2: Run payment and woodland tests and verify they fail**

Run:

```bash
npx vitest run src/server/payment/controllers/payment-page.controller.test.js src/server/payment/payment-strategies.test.js src/server/woodland/woodland-hectares-page.controller.test.js src/server/woodland/woodland.service.test.js src/server/woodland/woodland.client.test.js
```

Expected: FAIL because user context is not yet accepted or forwarded.

- [ ] **Step 3: Update payment boundaries and strategies**

In both payment route handlers, extract context inside the existing `try` around calculation:

```js
const userContext = getLandGrantsUserContext(request)
const result = await this.strategy.calculatePayment(state, userContext)
```

Update strategy signatures and calls:

```js
async calculatePayment(state, userContext) {
  const [paymentResult, actionGroups] = await Promise.all([
    calculateLandActionsPayment(state, userContext),
    fetchParcelsGroups(state, userContext)
  ])
  const { payment } = paymentResult
  const totalPence = payment?.annualTotalPence ?? 0
  return {
    totalPence,
    totalPayment: formatPrice(totalPence),
    payment,
    parcelItems: mapPaymentInfoToParcelItems(payment, actionGroups),
    additionalYearlyPayments: mapAdditionalYearlyPayments(payment)
  }
}
```

```js
async calculatePayment(state, userContext) {
  const { landParcels = [], hectaresUnderTenYearsOld = 0, hectaresTenOrOverYearsOld = 0 } = state
  const { payment, totalPence } = await calculateWmpPayment(
    {
      parcelIds: landParcels,
      hectaresUnderTenYearsOld,
      hectaresTenOrOverYearsOld
    },
    userContext
  )
  return { totalPence, totalPayment: formatPrice(totalPence), payment }
}
```

Update the strategy JSDoc type in `resolveStrategy` and the registry to:

```js
calculatePayment: (state: object, userContext: LandGrantsUserContext) => Promise<PaymentStrategyResult>
```

- [ ] **Step 4: Update woodland controller, service, and client propagation**

In `renderBackendErrors`, extract context inside the existing `try`:

```js
const userContext = getLandGrantsUserContext(request)
const failedReasons = await validateWoodlandHectares(
  {
    parcelIds,
    hectaresTenOrOverYearsOld,
    hectaresUnderTenYearsOld
  },
  userContext
)
```

Update service calls:

```js
export async function validateWoodlandHectares(options, userContext) {
  const response = await validateWoodland(options, LAND_GRANTS_API_URL, userContext)

  if (response.result?.hasPassed) {
    return []
  }

  return (response.result?.rules ?? []).filter((rule) => !rule.passed).map((rule) => rule.reason)
}

export async function calculateWmpPayment(options, userContext) {
  const { payment } = await calculateWmp(options, LAND_GRANTS_API_URL, userContext)
  const totalPence = payment?.agreementTotalPence ?? 0
  return { payment, totalPence }
}
```

Update clients:

```js
export async function validateWoodland(payload, baseUrl, userContext) {
  return postToLandGrantsApi(
    '/api/v1/wmp/validate',
    {
      parcelIds: payload.parcelIds,
      oldWoodlandAreaHa: payload.hectaresTenOrOverYearsOld,
      newWoodlandAreaHa: payload.hectaresUnderTenYearsOld
    },
    baseUrl,
    userContext
  )
}
```

Replace `calculateWmp` with:

```js
export async function calculateWmp(
  { parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld },
  baseUrl,
  userContext
) {
  return postToLandGrantsApi(
    '/api/v1/wmp/payments/calculate',
    {
      parcelIds,
      oldWoodlandAreaHa: hectaresTenOrOverYearsOld,
      newWoodlandAreaHa: hectaresUnderTenYearsOld
    },
    baseUrl,
    userContext
  )
}
```

- [ ] **Step 5: Run payment, woodland, and common-client tests**

Run:

```bash
npx vitest run src/server/payment/controllers/payment-page.controller.test.js src/server/payment/payment-strategies.test.js src/server/woodland/woodland-hectares-page.controller.test.js src/server/woodland/woodland.service.test.js src/server/woodland/woodland.client.test.js src/server/land-grants/services/land-grants.client.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit payment and woodland propagation**

```bash
git add src/server/payment/controllers/payment-page.controller.js src/server/payment/controllers/payment-page.controller.test.js src/server/payment/payment-strategies.js src/server/payment/payment-strategies.test.js src/server/woodland/woodland-hectares-page.controller.js src/server/woodland/woodland-hectares-page.controller.test.js src/server/woodland/woodland.service.js src/server/woodland/woodland.service.test.js src/server/woodland/woodland.client.js src/server/woodland/woodland.client.test.js
git commit -S -m "feat(TGC-1481): forward user context for payment and woodland"
```

---

### Task 6: Update the Land Grants consumer contract

**Files:**

- Modify: `src/contracts/v2/land-grants.client.contract.test.js`

**Interfaces:**

- Consumes: `postToLandGrantsApi(endpoint, body, baseUrl, userContext)`.
- Records the external gateway headers and authenticated SBI for each Pact interaction.

- [ ] **Step 1: Add contract fixtures and update every interaction**

Add:

```js
const makeUserContext = (sbi = '123456789') => ({
  defraIdToken: 'defra-id-access-token',
  sbi
})

const makeLandGrantsHeaders = (userContext) => ({
  'Content-Type': 'application/json',
  'gateway-type': 'external',
  'x-forwarded-authorization': userContext.defraIdToken
})

const withAuthenticatedSbi = (body, userContext) => ({
  ...body,
  sbi: userContext.sbi
})
```

For every interaction, create a context matching the expected SBI, then change both the Pact request and the
client call:

```js
const userContext = makeUserContext().withRequest({
  method: 'POST',
  path: '/api/v2/payments/calculate',
  headers: makeLandGrantsHeaders(userContext),
  body: withAuthenticatedSbi(payload, userContext)
})

const response = await postToLandGrantsApi('/api/v2/payments/calculate', payload, mockserver.url, userContext)
```

Use `makeUserContext('106284736')` for validation cases built around SBI `106284736`. Apply the same pattern
to every `/api/v2/parcels` and `/api/v2/application/validate` interaction.

Change the incomplete validation case so the client supplies SBI and the provider reports the next missing
field:

```js
const incompletePayload = {
  applicationId: '34E-8CA-45D',
  requester: 'grants-ui'
}
const userContext = makeUserContext('106284736')

const badRequestResponseExample = {
  statusCode: 400,
  error: 'Bad Request',
  message: '"applicantCrn" is required'
}
```

- [ ] **Step 2: Run the consumer contract tests**

Run:

```bash
npm run test:contracts
```

Expected: PASS and regenerated Pact files include `gateway-type`, `x-forwarded-authorization`, and `sbi` for
every Land Grants interaction. If provider state has not yet adopted TGC-1481, record that as a cross-service
coordination dependency rather than weakening the Grants UI contract.

- [ ] **Step 3: Commit the consumer contract**

Stage the test and any regenerated tracked Pact artifacts:

```bash
git add src/contracts/v2/land-grants.client.contract.test.js src/contracts/pacts
git commit -S -m "test(TGC-1481): contract Land Grants user context"
```

---

### Task 7: Full verification and call-site audit

**Files:**

- Modify only files reformatted by the repository formatter.

**Interfaces:**

- Verifies no call can reach a Land Grants endpoint without explicit user context.

- [ ] **Step 1: Audit every Land Grants call site**

Run:

```bash
rg -n "postToLandGrantsApiRaw|postToLandGrantsApi|fetchParcelTile|calculate\\(|parcelsWithSize|parcelsGroups|parcelsWithFields|parcelsWithExtendedInfo|validate\\(|locateParcelTiles" src/server src/contracts
```

Expected: every Land Grants client and wrapper invocation supplies `userContext` as its final argument; no
unrelated service client is changed.

- [ ] **Step 2: Run the formatter**

Run:

```bash
npm run format
```

Expected: PASS.

- [ ] **Step 3: Run focused and full unit tests**

Run:

```bash
npx vitest run src/server/land-grants src/server/common/map src/server/payment src/server/woodland
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run lint and contract checks**

Run:

```bash
npm run lint
npm run test:contracts
```

Expected: PASS. Coverage remains above the repository threshold and no token appears in snapshots or logs.

- [ ] **Step 5: Review the final diff and commit formatter-only changes if present**

Run:

```bash
git diff --check
git status --short
git diff --stat main...HEAD
git log --show-signature --oneline main..HEAD
```

Expected: no whitespace errors, only TGC-1481 files changed, and every implementation commit has a valid
`github-ee` signature.

If `npm run format` changed tracked files after the last task commit:

```bash
git add src docs
git commit -S -m "style(TGC-1481): format user context changes"
```
