# Consolidated View API (DAL)

The Consolidated View API provides business data via a GraphQL endpoint. By default the local stack uses [grants-platform-dal-stub](https://github.com/DEFRA/grants-platform-dal-stub), which executes the real DAL schema from synthetic fixtures. Grants UI uses the same GraphQL request and response handling for the stub and the live DAL; only the endpoint and whether it requests an Entra token differ.

## Local development with grants-platform-dal-stub (default)

`compose.infra.yml` runs the stub and `compose.grants-ui.yml` points at it:

```env
CV_API_ENDPOINT="http://grants-platform-dal-stub:3008/graphql"
CV_API_AUTH_ENABLED=false
```

`CV_API_AUTH_ENABLED=false` skips the Entra token request and omits the service bearer token, so no `ENTRA_*` settings are needed. Use this setting only with the stub, which ignores authentication. It is refused when `ENVIRONMENT` is `test` or `prod`, because the live DAL always requires the token. Sign in with one of the stub's synthetic CRNs (`9000000001` is the happy path; see the stub's README); the Defra ID stub's `users.json` lists the same CRN and SBI pairs.

Running `npm run dev` on the host instead of in Docker needs the stub's host address in `.env`: `CV_API_ENDPOINT="http://localhost:3008/graphql"` and `CV_API_AUTH_ENABLED=false` (see `.env.example`). Remove the host endpoint override before returning to Docker Compose, which passes `.env` overrides into the container.

To run a sibling checkout of the stub instead of the published image, pick `local` in the `gt` TUI and enable `grants-platform-dal-stub`, which builds `grants-platform-dal-stub:local` from `../grants-platform-dal-stub` and overrides the compose image.

The proxied CI/HA stack (`compose.ci.yml`, `compose.ha.yml`) reaches the same stub through nginx on port 4008.

Local stub testing exercises DAL queries, response handling and journey behaviour. It does not verify AWS STS or Entra authentication; that requires an environment configured for federation and access to the live DAL.

## Local development with the live DAL

With `CV_API_AUTH_ENABLED=true`, Grants UI obtains an AWS STS Web Identity token bound to its IAM role and exchanges it at Entra for a DAL access token. The tenant ID, client ID and token URL are still required for that exchange. This connection no longer uses a stored Entra client secret, so no client secret rotation is required.

Live DAL access from a local process requires AWS credentials for a role permitted to obtain a Web Identity token and an Entra federated credential configured to trust that role. The default local Floci setup does not provide this authentication. Configure the following in `.env` once those prerequisites are available:

```env
CV_API_AUTH_ENABLED=true
CV_API_ENDPOINT="<dal-endpoint>"
CV_API_DEVELOPER_KEY=<your-api-key>
ENTRA_INTERNAL_TOKEN_URL="https://login.microsoftonline.com"
ENTRA_INTERNAL_TENANT_ID=<your-tenant-id>
ENTRA_INTERNAL_CLIENT_ID=<your-client-id>
```

`ENTRA_FEDERATED_CREDENTIALS_AUDIENCE` defaults to `Grants Application UI`. It must match the audience on the Entra federated credential for the target environment; override it when that environment uses a different audience.

Obtain the developer key from the [CDP portal](https://portal.cdp-int.defra.cloud/user-profile). Grants UI sends it as `x-api-key` only when `ENVIRONMENT=local`. Deployed environments do not send this header.

## Troubleshooting

| Symptom                                         | Check                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Requests reach the stub instead of the live DAL | Set `CV_API_ENDPOINT` to the live DAL URL and `CV_API_AUTH_ENABLED=true`.                                                        |
| Token requests occur when using the stub        | Set `CV_API_AUTH_ENABLED=false`.                                                                                                 |
| AWS STS token acquisition fails                 | Check the process's AWS credentials, endpoint configuration and permission to obtain a Web Identity token.                       |
| Entra rejects the token exchange                | Check the tenant ID, client ID and federated credential, including its audience matching `ENTRA_FEDERATED_CREDENTIALS_AUDIENCE`. |
| Live DAL returns `401 Unauthorized`             | Check the Entra access token and the application's access to the target DAL.                                                     |
| Local live DAL returns `403 Forbidden`          | Check that `CV_API_DEVELOPER_KEY` is valid and passed into the process or container.                                             |

The retired `CV_API_MOCK_ENABLED` and `CV_API_STUB_URL` settings no longer select the stub. Use `CV_API_ENDPOINT` and `CV_API_AUTH_ENABLED` instead.
