# FCP Audit Events

## Overview

grants-ui publishes audit events to the **FCP Audit service** as users move through a grant. Events are published to an AWS SNS topic using the [`@defra/fcp-audit-publisher`](https://www.npmjs.com/package/@defra/fcp-audit-publisher) library, which validates each event against the canonical FCP Audit schema before publishing.

The events, identified by their `action`, are:

| `action`       | When                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| `authorised`   | A signed-in user comes to our service - successfully loads a grant's start page |
| `unauthorised` | Access is denied (see the `details.reason` breakdown below)                     |
| `navigate`     | A signed-in user advances to the next page of the journey                       |

An **`unauthorised`** event (always `status: 'denied'`) distinguishes the denial case via `details.reason`:

| `details.reason`    | Signed in? | Meaning                                                    | Emitted from                                       |
| ------------------- | ---------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `not-authenticated` | No         | Not signed in - came to a grant and was bounced to sign-in | `audit.js` (the `onPreResponse` hook)              |
| `whitelist`         | Yes        | Signed in, but CRN/SBI fails whitelist validation          | `src/server/common/helpers/whitelist/whitelist.js` |

Publishing is **fire-and-forget** and gated behind a feature flag, so it never adds latency to - or breaks - the user's request, and is off by default.

The implementation lives in:

| File                                                   | Role                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/server/common/helpers/audit/audit.js`             | Hapi plugin (`auditPublisher`) - registers the `onPreResponse` hook and owns the SNS client |
| `src/server/common/helpers/audit/audit-event.js`       | Builds the event payload; maps the environment; sanitises the client IP                     |
| `src/server/common/helpers/logging/log-codes/audit.js` | `AUDIT.EVENT_PUBLISHED` / `AUDIT.EVENT_PUBLISH_FAILED` log codes                            |
| `src/server/common/helpers/whitelist/whitelist.js`     | Emits `unauthorised` (`reason: 'whitelist'`) when a signed-in user fails whitelist checks   |

The plugin is registered in `src/server/index.js`.

## How it works

The plugin adds an `onPreResponse` extension that fires for **every** request and decides which (if any) event to publish:

- **`authorised`** - a signed-in user successfully loading a grant's **start page**, i.e. all of:
  - the method is `GET`
  - the request is authenticated
  - the route has a `{slug}` param
  - the response status is `2xx`
  - the request path is the form's start page (the engine's `getStartPath(model)`, e.g. `/start`), so a single grant _arrival_ is audited rather than every page in the journey

- **`unauthorised`** - a not-signed-in user coming to a grant, i.e. all of:
  - the request is **not** authenticated
  - the route has a `{slug}` param
  - the response is a `302` redirect to `/auth/sign-in` (the cookie auth strategy bouncing the user to sign in)

  The form model is never loaded for these (auth fails before the handler runs), so the start page can't be singled out - any grant route counts as an arrival. The event carries `status: 'denied'` and `details.reason: 'not-authenticated'`, and no `user`/`accounts` (there is no session).

  The `whitelist` reason (see the table above) is **not** emitted by this hook: it describes a _signed-in_ user being denied, and is published from the whitelist check (via the same `request.sendAuditEvent` decoration).

- **`navigate`** - a signed-in user advancing to the next page (an authenticated `POST` to `/{slug}/{path}` that returns `303`).

When a request matches, it builds the event, calls `publishAuditEvent(...)`, and logs the outcome (`AUDIT.EVENT_PUBLISHED` with the SNS `messageId`, or `AUDIT.EVENT_PUBLISH_FAILED`). A publish failure is logged but never surfaced to the user.

## Configuration

| Variable                                      | Default                                                       | Description                                                |
| --------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `AUDIT_ENABLED`                               | `false`                                                       | Master switch - publish audit events to SNS                |
| `AUDIT_SNS_TOPIC_ARN`                         | `arn:aws:sns:eu-west-2:000000000000:fcp_audit_events` (local) | ARN of grants-ui's own SNS topic                           |
| `AUDIT_APPLICATION`                           | `Grants`                                                      | GIO application name (shared across the Grants services)   |
| `AWS_REGION`                                  | `eu-west-2`                                                   | Region for the SNS client                                  |
| `AWS_ENDPOINT_URL`                            | `http://localstack:4566` (local)                              | Custom AWS endpoint (LocalStack); leave unset for real AWS |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `test` / `test` (local)                                       | Credentials; in CDP these come from the IAM role           |

In deployed environments these are set via [cdp-app-config](https://github.com/DEFRA/cdp-app-config/blob/main/services/grants-ui). `environment` and `component` are derived automatically from `ENVIRONMENT` (mapped to `cdp-<env>`) and the git repository name (`grants-ui`); `version` is supplied by the publisher library.

## Event payload

The event conforms to the canonical FCP Audit schema. grants-ui populates:

| Field            | Value                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `application`    | `Grants`                                                                                                     |
| `component`      | `grants-ui`                                                                                                  |
| `environment`    | `cdp-<env>` (e.g. `cdp-prod`); `local` for local dev                                                         |
| `version`        | from the publisher library                                                                                   |
| `user`           | `IDM/<contactId>` (Defra ID), when authenticated                                                             |
| `sessionid`      | the session id from the JWT, when present                                                                    |
| `correlationid`  | the `x-cdp-request-id` header, else a generated UUID                                                         |
| `ip`             | the user's IP (first `x-forwarded-for` entry, else `remoteAddress`), sanitised to the schema's 20-char limit |
| `datetime`       | ISO 8601 timestamp                                                                                           |
| `audit.entities` | `[{ entity: 'application', action: <action>, entityid: <slug> }]` (e.g. `action: 'authorised'`)              |
| `audit.status`   | `success` (`denied` for `unauthorised`)                                                                      |
| `audit.accounts` | `crn` / `sbi` / `organisationId`, when known                                                                 |

Events carry an `audit` block only (persisted for analysis); they are **not** currently forwarded to the SOC, which would require a `security` block with a `pmccode` agreed with the security team.

> The canonical schema and field semantics are documented in the FCP Audit "Publishing Audit events" Confluence page. Where it disagrees with other Grants services, the canonical schema wins (e.g. `cdp-`-prefixed `environment`, `entityid` not `id`).

## Local testing

The whole flow runs locally against LocalStack and the Defra ID stub - no real AWS or Defra ID needed. (The `fcp-audit-publisher-stub` is itself a _publisher_, not a receiver, so it cannot observe grants-ui's events - use the steps below instead.)

### End-to-end walkthrough

1. **Enable audit.** Ensure the project-root `.env` (which docker compose reads and passes to the container) has:

   ```bash
   AUDIT_ENABLED=true
   ```

   The other `AUDIT_*` and `AWS_*` vars already default correctly in `compose.yml` for local use.

2. **Start docker compose** (re-run after changing `.env` so the container picks up the new value). This boots LocalStack and auto-runs `localstack/start-localstack.sh`, which creates the `fcp_audit_events` topic and an `fcp_audit` SQS queue subscribed to it.

   ```bash
   docker compose up
   ```

   The app serves on http://localhost:3000 and LocalStack on http://localhost:4566.

3. **Sign in** via the local Defra ID stub: open http://localhost:3000/auth/sign-in and choose a pre-seeded test user (no real credentials required).

4. **Start a grant** while signed in, e.g. open http://localhost:3000/example-grant-with-auth, which lands on its start page (`/example-grant-with-auth/start`). A successful (`2xx`) authenticated `GET` to the form's start page triggers an `authorised` event - navigating on through the journey emits `navigate` events instead.

   To see the **`unauthorised`** event, sign out (http://localhost:3000/auth/sign-out) and open a grant URL directly: the cookie strategy bounces you to `/auth/sign-in` and an `unauthorised` event (with `details.reason: 'not-authenticated'`, no `user`/`accounts`) is published.

5. **Confirm it published**, either:
   - search the app logs for an `AUDIT.EVENT_PUBLISHED` entry with a `messageId`:

     ```bash
     npm run audit:logs
     ```

   - or read the event off the local queue (runs `awslocal` inside the LocalStack container, so no host AWS CLI or credentials needed):

     ```bash
     npm run audit:queue
     ```

     The message `Body` is the raw event JSON (no SNS envelope).

### Expected output

`npm run audit:logs` shows a line like:

```text
INFO: Audit event published: messageId=4577b478-dcf9-46ba-b40f-22f9051c3798, entity=application, action=authorised, entityid=example-grant-with-auth
```

`npm run audit:queue` returns one message whose `Body` (parsed) looks like:

```json
{
  "datetime": "2026-05-29T12:46:53.007Z",
  "version": "1.0.0",
  "correlationid": "76a58294-03c0-4c82-b4b8-c09997e7ce39",
  "application": "Grants",
  "component": "grants-ui",
  "environment": "local",
  "ip": "192.168.65.1",
  "audit": {
    "entities": [{ "entity": "application", "action": "authorised", "entityid": "example-grant-with-auth" }],
    "status": "success",
    "accounts": { "crn": "1102838829", "sbi": "106284736", "organisationId": "106284736" }
  },
  "user": "IDM/1102838829",
  "sessionid": "06d67b48-8b36-45c8-86c5-83d28b7cec73"
}
```

A `messageId` in the log line means the library validated the payload against the schema _and_ SNS accepted it.

#### How this differs in deployed environments

The structure is identical; only certain values are environment-specific:

| Field                             | Local                                                                           | Deployed (CDP)                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `environment`                     | `local`                                                                         | `cdp-<env>` from `ENVIRONMENT` (e.g. `cdp-prod`)                                                |
| `correlationid`                   | a generated UUID (no trace header locally)                                      | the request's `x-cdp-request-id` header; a UUID is generated only as a fallback                 |
| `ip`                              | Docker host-gateway address (e.g. `192.168.65.1`)                               | the real client IP, taken from `x-forwarded-for`                                                |
| `user` / `sessionid` / `accounts` | the local test user (`.env` `DEFAULT_CRN`/`DEFAULT_SBI` via the Defra ID stub)  | the signed-in user's real Defra ID session                                                      |
| delivery                          | LocalStack `fcp_audit_events` topic → the local `fcp_audit` queue you read back | the service's real SNS topic → consumed by the FCP Audit service's `fcp_audit` SQS subscription |

### Without infra - schema conformance test

`src/server/common/helpers/audit/audit-event.test.js` runs the built event (with publisher defaults applied) through the library's real `validateAuditEvent`, so schema drift is caught with no LocalStack required:

```bash
npm run audit:test
```

## Provisioning the topic in deployed environments

Each publishing service owns its SNS topic and asks FCP Audit to subscribe:

1. Create grants-ui's SNS topic for the environment, and request that the FCP Audit `fcp_audit` SQS queue be added as a subscriber (CDP Support handle both).
2. Read the resulting topic ARN from the CDP portal → service page → **Resources**.

### Wiring up the ARN

No code change is needed - the ARN flows in via the `AUDIT_SNS_TOPIC_ARN` env var (`audit.snsTopicArn` config) and is passed straight to `publishAuditEvent`. Once you have it:

1. **Set the ARN per environment** in [cdp-app-config](https://github.com/DEFRA/cdp-app-config/blob/main/services/grants-ui) (not in this repo's `compose.yml`/`.env`, which are local-only). Each environment has its own topic:

   ```
   AUDIT_SNS_TOPIC_ARN=arn:aws:sns:eu-west-2:<account>:fcp_audit_farming_grants_ui
   ```

2. **Enable publishing** where you want events to flow - `AUDIT_ENABLED` defaults to `false`, so set `AUDIT_ENABLED=true` in that environment. (ARN set + `AUDIT_ENABLED=false` is a valid "configured but dormant" state.)

3. **Confirm the service can publish** - the grants-ui IAM role needs `sns:Publish` on the topic. A missing permission surfaces as an `AUDIT.EVENT_PUBLISH_FAILED` log entry (a 403 from SNS).

4. **Roll out gradually** - enable in `dev`/`test` first, confirm via the `Audit event published: messageId=…` log line and that FCP Audit is receiving on its subscription, then enable `prod`.
