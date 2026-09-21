# Local GAS: application received to awaiting claim

This runbook describes the manual local-development path for a Woodland Management Plan (WMP) grant application from the submitted **application received** position to **awaiting claim**.

It is deliberately for the local Docker stack only. The Caseworking (CW) and Agreement Service events below simulate messages normally produced by those services; do not use them against shared environments.

The TL;DR is to use `gt`, but this runbook explains the steps in more detail.

1. **gt → tools → manage GAS → generate offer** - `grants-ui` will now serve the agreement redirect

2. **gt → tools → manage GAS → prepare claim** - `grants-ui` will now serve the claim journey

## Result

The application finishes at:

```text
PHASE_CLAIM > STAGE_AWAITING_CLAIM > STATUS_AWAITING_CLAIM
```

with one `ENT_CS_CAPITAL_PA3` entitlement in GAS's `entitlements` collection.

## Before starting

Start GAS and Land Grants so GAS can compile the agreement definition:

```bash
gt up --gas --land-grants
```

Confirm the `gas` container is healthy and that it has `LAND_GRANTS_URL` configured. The application must be a submitted Woodland application at this exact position:

```text
PHASE_PRE_AWARD > STAGE_REVIEWING_APPLICATION > STATUS_APPLICATION_RECEIVED
```

Its submitted answers must include a PA3 agreement payment and `totalHectaresForSelectedParcels`.

Set these values once for the commands below. `APP_REF` is the GAS client reference; `GRANT_CODE` is normally `woodland`.

```bash
export APP_REF='wmp-abc-123'
export GRANT_CODE='woodland'
```

Use this read-only query before and after each step to inspect the current application and entitlement records:

```bash
docker compose -f compose.infra.yml exec -T mongodb mongosh fg-gas-backend --quiet --eval "
const ref = '$APP_REF'
db.applications.find({ clientRef: ref }, { clientRef: 1, code: 1, currentPhase: 1, currentStage: 1, currentStatus: 1, agreements: 1 }).forEach(printjson)
db.entitlements.find({ clientRef: ref }).forEach(printjson)
"
```

Wait for the GAS inbox/outbox to finish between steps. The relevant logs can be followed with:

```bash
docker logs -f gas
```

## Transition sequence

| Step | Producer               | External status/event          | Expected GAS position                               |
| ---- | ---------------------- | ------------------------------ | --------------------------------------------------- |
| 1    | CW                     | `STATUS_AGREEMENT_GENERATING`  | Reviewing application / agreement generating        |
| 2    | GAS                    | `GENERATE_OFFER` process       | Agreement document is created asynchronously        |
| 3    | Agreement Service      | `offered` lifecycle event      | Preparing agreement / agreement ready for applicant |
| 4    | CW                     | `STATUS_AGREEMENT_OFFERED`     | Agreement with applicant / agreement offered        |
| 5    | Agreement Service      | `accepted` lifecycle event     | Agreement accepted / agreement accepted             |
| 6    | CW                     | `STATUS_APPLICATION_COMPLETED` | Application completed / application completed       |
| 7    | Local fixture shortcut | Direct status update           | Prepare claim / preparing claim                     |
| 8    | Grant Admin API        | Create PA3 entitlement         | Position is unchanged                               |
| 9    | Local fixture shortcut | Direct status update           | Claim / awaiting claim                              |

## 1. Ask GAS to generate the offer

CW sends an event to GAS's update-status queue. The following command uses the GAS container's AWS configuration and generates a fresh, FIFO-safe event ID.

```bash
docker exec -e APP_REF="$APP_REF" -e GRANT_CODE="$GRANT_CODE" -i gas node --input-type=module <<'EOF'
import { randomUUID } from 'node:crypto'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

const clientRef = process.env.APP_REF
const code = process.env.GRANT_CODE
const event = {
  id: randomUUID(),
  specversion: '1.0',
  time: new Date().toISOString(),
  type: 'fg.cw-backend.test.case.status.updated',
  source: 'CW',
  data: { caseRef: clientRef, workflowCode: code, currentStatus: 'PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING' }
}
const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL })
await sqs.send(new SendMessageCommand({
  QueueUrl: process.env.GAS__SQS__UPDATE_STATUS_QUEUE_URL,
  MessageBody: JSON.stringify(event),
  MessageGroupId: `${code}-${clientRef}`,
  MessageDeduplicationId: event.id
}))
await sqs.destroy()
EOF
```

Alternatively, use **gt → tools → manage GAS → generate offer**, which performs this step.

GAS transitions to `STATUS_AGREEMENT_GENERATING`, then its `GENERATE_OFFER` process creates an agreement. Wait until the application reaches `STATUS_AGREEMENT_READY_FOR_APPLICANT` and note the agreement reference from `application.agreements`, for example `WMP863021179`.

```bash
export AGREEMENT_REF='WMP863021179'
```

At this point, `grants-ui` will use the `agreement` redirect for users browsing to their Woodland application. Locally this just shows a dummy page.

## 2. Move the agreement to the applicant

CW now sends the fully-qualified offered status:

```text
PHASE_PRE_AWARD:STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED
```

Use the same CW event shape as step 1, changing only `data.currentStatus` to the value above. Wait until GAS reaches:

```text
PHASE_PRE_AWARD > STAGE_AGREEMENT_WITH_APPLICANT > STATUS_AGREEMENT_OFFERED
```

## 3. Simulate Agreement Service acceptance

In production, Agreement Service accepts the agreement and publishes an `io.onsite.agreement.status.updated` lifecycle event. For local manual testing, place that event on GAS's agreement-status queue. Set the acceptance, start and end dates to the values appropriate for the test agreement.

```js
{
  id: '<new UUID>',
  specversion: '1.0',
  time: '<ISO timestamp>',
  type: 'io.onsite.agreement.status.updated',
  source: 'urn:service:agreement',
  data: {
    agreementNumber: '<AGREEMENT_REF>',
    clientRef: '<APP_REF>',
    code: 'woodland',
    status: 'accepted',
    date: '<ISO timestamp>',
    startDate: '<ISO timestamp>',
    endDate: '<ISO timestamp>'
  }
}
```

Send it using the Step 1 SQS script, but use `GAS__SQS__UPDATE_AGREEMENT_STATUS_QUEUE_URL` as the queue URL and the object above as the message body. GAS executes `ACCEPT_AGREEMENT`; verify:

```text
PHASE_PRE_AWARD > STAGE_AGREEMENT_ACCEPTED > STATUS_AGREEMENT_ACCEPTED
```

## 4. Complete the application in CW

Send a final CW event, again using the Step 1 shape, with:

```text
PHASE_PRE_AWARD:STAGE_APPLICATION_COMPLETED:STATUS_APPLICATION_COMPLETED
```

Verify that GAS reaches:

```text
PHASE_PRE_AWARD > STAGE_APPLICATION_COMPLETED > STATUS_APPLICATION_COMPLETED
```

## 5. Enter prepare claim

The Woodland definition permits this state transition but currently has no CW external-status mapping for it. For local testing, update all three GAS status fields directly:

```bash
docker compose -f compose.infra.yml exec -T mongodb mongosh fg-gas-backend --quiet --eval "
const result = db.applications.updateOne(
  { clientRef: '$APP_REF', code: '$GRANT_CODE', currentPhase: 'PHASE_PRE_AWARD', currentStage: 'STAGE_APPLICATION_COMPLETED', currentStatus: 'STATUS_APPLICATION_COMPLETED' },
  { \$set: { currentPhase: 'PHASE_PRE_AWARD', currentStage: 'STAGE_PREPARE_CLAIM', currentStatus: 'STATUS_PREPARING_CLAIM' } }
)
if (result.modifiedCount !== 1) throw new Error('Application was not in the expected completed position')
"
```

Verify:

```text
PHASE_PRE_AWARD > STAGE_PREPARE_CLAIM > STATUS_PREPARING_CLAIM
```

## 6. Mint a temporary Grant Admin token and create the entitlement

The grant-admin API only accepts a service token associated with `fg-grants-platform-admin`. The script below is equivalent to GAS's `mint-access-token.js`: it creates a random raw token, stores only its SHA-256 hash, calls the API with the raw token, and removes the token record in `finally`.

It does not print the raw token. `totalHectares` uses GAS's ten-thousandths representation, so an application area of `66.2516` hectares is sent as `662516`.

```bash
docker exec -e APP_REF="$APP_REF" -e GRANT_CODE="$GRANT_CODE" -i gas node --input-type=module <<'EOF'
import { createHash, randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'

const clientRef = process.env.APP_REF
const code = process.env.GRANT_CODE
const mongo = new MongoClient(process.env.MONGO_URI)
const rawToken = randomUUID()
const tokenId = createHash('sha256').update(rawToken, 'utf8').digest('hex')

await mongo.connect()
const tokens = mongo.db(process.env.MONGO_DATABASE).collection('access_tokens')
try {
  const application = await mongo.db(process.env.MONGO_DATABASE).collection('applications').findOne({ clientRef, code })
  const totalHectares = application?.phases?.flatMap((phase) => [phase.answers ?? {}])
    .find((answers) => Number.isFinite(answers.totalHectaresForSelectedParcels))?.totalHectaresForSelectedParcels
  if (!Number.isFinite(totalHectares)) throw new Error('Application has no totalHectaresForSelectedParcels answer')

  await tokens.insertOne({
    id: tokenId,
    client: 'fg-grants-platform-admin',
    clientId: 'fg-grants-platform-admin',
    expiresAt: new Date(Date.now() + 60_000)
  })
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3102}/grant-admin/grants/${code}/applications/${clientRef}/claims/entitlements`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${rawToken}` },
    body: JSON.stringify({
      clientRef,
      grantCode: code,
      claimCode: 'ENT_CS_CAPITAL_PA3',
      data: { totalHectares: { value: Math.round(totalHectares * 10_000) } }
    })
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Entitlement API returned ${response.status}: ${body}`)
  console.log(body)
} finally {
  await tokens.deleteOne({ id: tokenId })
  await mongo.close()
}
EOF
```

The API validates that the application is at `STATUS_PREPARING_CLAIM`, creates the entitlement with a generated ID, resolves the fixed PA3 fields from the agreement, and enforces the one-entitlement limit. Do not insert entitlement documents directly into MongoDB.

## 7. Enter awaiting claim

After the entitlement API returns `201 Created`, update the status directly one final time:

```bash
docker compose -f compose.infra.yml exec -T mongodb mongosh fg-gas-backend --quiet --eval "
const result = db.applications.updateOne(
  { clientRef: '$APP_REF', code: '$GRANT_CODE', currentPhase: 'PHASE_PRE_AWARD', currentStage: 'STAGE_PREPARE_CLAIM', currentStatus: 'STATUS_PREPARING_CLAIM' },
  { \$set: { currentPhase: 'PHASE_CLAIM', currentStage: 'STAGE_AWAITING_CLAIM', currentStatus: 'STATUS_AWAITING_CLAIM' } }
)
if (result.modifiedCount !== 1) throw new Error('Application was not in the expected prepare-claim position')
"
```

The final verification query should show the awaiting-claim position and one PA3 entitlement. It is now available to the claim journey.

## Shortcut

For the same local fixture flow, use **gt → tools → manage GAS → prepare claim**. It performs the sequence above, retains full output in the TUI log viewer (`l`), and only moves to awaiting claim after entitlement creation succeeds.
