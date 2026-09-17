# Consolidated View API (DAL)

The Consolidated View API provides business data via a GraphQL endpoint. By default, the app uses a local stub (`grants-ui-dal-stub`). To test against the live DAL, follow the steps below.

## Local development with the live DAL

### Prerequisites

- The DAL endpoint URL
- A valid `CV_API_DEVELOPER_KEY` (generate from https://portal.cdp-int.defra.cloud/user-profile)
- Entra ID settings (`ENTRA_INTERNAL_TENANT_ID`, `ENTRA_INTERNAL_CLIENT_ID`) and, if the environment you're pointing at requires one, an `ENTRA_INTERNAL_CLIENT_SECRET`

### Configuration

grants-ui is being migrated environment by environment to authenticate to Entra using an AWS STS Web Identity federated credential bound to the service's IAM role, instead of a stored client secret. Which method is used is set explicitly per environment via `ENTRA_AUTH_METHOD`:

- **`web_identity`** - authenticates via AWS STS (see `entra.webIdentity.audience` / `ENTRA_FEDERATED_CREDENTIALS_AUDIENCE`). Set only for environments where a Web Identity federated credential has been configured and verified in the Entra App Registration.
- **`client_secret`** (the default) - uses `ENTRA_INTERNAL_CLIENT_SECRET`, exactly as before. This is every environment that hasn't been migrated yet, and local development, which has no IAM role to obtain a Web Identity token from.

`ENTRA_FEDERATED_CREDENTIALS_AUDIENCE` defaults to `Grants Application UI` - the grants-ui Entra App Registration's **display name**, not the service identifier `grants-ui`. This was confirmed via the Microsoft Graph API against the actual federated credentials on the App Registration (`GET /applications/{id}/federatedIdentityCredentials`) after `grants-ui` (the more common org convention - see `grants-config-browser`, `fg-grants-platform-admin`) was tried and rejected with `AADSTS700212`.

Set the following in your `.env` file:

```env
CV_API_MOCK_ENABLED=false
CV_API_ENDPOINT="<dal-endpoint>"
CV_API_DEVELOPER_KEY=<your-api-key>

ENTRA_INTERNAL_TOKEN_URL="https://login.microsoftonline.com"
ENTRA_INTERNAL_TENANT_ID=<your-tenant-id>
ENTRA_INTERNAL_CLIENT_ID=<your-client-id>
ENTRA_INTERNAL_CLIENT_SECRET=<your-client-secret>
```

Leave `ENTRA_AUTH_METHOD` unset locally (and in the Docker Compose setup below) so it defaults to `client_secret` - a laptop has no IAM role to authenticate as.

### How it works

- The `x-api-key` header is added to requests to the Consolidated View API only when `CV_API_DEVELOPER_KEY` is set **and** the app is running with `cdpEnvironment` (`ENVIRONMENT`) set to `local`.
- In any deployed environment the header is never sent, regardless of whether the key is set.
- The key is only intended for local development. It should never be set in production.

### Troubleshooting

| Symptom                                        | Cause                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `403 Forbidden` with `{"message":"Forbidden"}` | `CV_API_DEVELOPER_KEY` is missing, expired, or not passed into the Docker container. Check `compose.grants-ui.yml` includes the env var and your `.env` has a valid key.                                                                                                                                                    |
| `401 Unauthorized`                             | Entra ID credentials are invalid or expired. If `ENTRA_AUTH_METHOD` is `client_secret` (or unset), check `ENTRA_INTERNAL_CLIENT_SECRET`; if it's `web_identity`, check the Entra App Registration's Web Identity federated credential has an Audience matching `ENTRA_FEDERATED_CREDENTIALS_AUDIENCE` for that environment. |
| Requests hit the stub instead of live DAL      | `CV_API_MOCK_ENABLED` is still `true` (the default). Set it to `false`.                                                                                                                                                                                                                                                     |
