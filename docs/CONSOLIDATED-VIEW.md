# Consolidated View API (DAL)

The Consolidated View API provides business data via a GraphQL endpoint. By default, the app uses a local stub (`grants-ui-dal-stub`). To test against the live DAL, follow the steps below.

## Local development with the live DAL

### Prerequisites

- The DAL endpoint URL
- A valid `CV_API_DEVELOPER_KEY` (generate from https://portal.cdp-int.defra.cloud/user-profile)
- Entra ID credentials (`ENTRA_INTERNAL_TENANT_ID`, `ENTRA_INTERNAL_CLIENT_ID`, `ENTRA_INTERNAL_CLIENT_SECRET`)

### Configuration

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

### How it works

- When `CV_API_DEVELOPER_KEY` is set, an `x-api-key` header is added to all requests to the Consolidated View API.
- When it is empty or unset, the header is omitted. This is the default for deployed environments.
- The key is only intended for local development. It should never be set in production.

### Troubleshooting

| Symptom                                        | Cause                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `403 Forbidden` with `{"message":"Forbidden"}` | `CV_API_DEVELOPER_KEY` is missing, expired, or not passed into the Docker container. Check `compose.yml` includes the env var and your `.env` has a valid key. |
| `401 Unauthorized`                             | Entra ID credentials are invalid or expired. Check `ENTRA_INTERNAL_*` values.                                                                                  |
| Requests hit the stub instead of live DAL      | `CV_API_MOCK_ENABLED` is still `true` (the default). Set it to `false`.                                                                                        |
