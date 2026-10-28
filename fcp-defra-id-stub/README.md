# Defra ID stub users

`users.json` is the sign-in list for the local Defra ID stub (`fcp-defra-id-stub` in
`compose.infra.yml`). Every entry is a synthetic persona from
[grants-platform-dal-stub](https://github.com/DEFRA/grants-platform-dal-stub), whose
fixtures hold the business, land and permission data behind each CRN and SBI. The two files
must list the same CRN and SBI pairs: a CRN the DAL stub does not know fails at the first DAL
call after sign-in.

| CRN          | Name            | SBI                                                          | Permissions                                   | Notes                                                  |
| ------------ | --------------- | ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| `9000000001` | Alice Carter    | `800000001` Green Farm                                       | Every group at its highest level              | Happy path: two signed SFI agreements, 10 parcels      |
| `9000000002` | Benjamin Carter | `800000001`                                                  | CS applications and agreements `AMEND`        |                                                        |
| `9000000003` | Chloe Carter    | `800000001`                                                  | CS applications and agreements `VIEW`         |                                                        |
| `9000000004` | Daniel Carter   | `800000001`                                                  | No permission groups                          |                                                        |
| `9000000005` | Nadia Khan      | `800000002` High Fell Farm, `800000003` Hope Valley Farm Ltd | Full on High Fell Farm, `VIEW` on Hope Valley | Multi-business customer; no agreements, 8 parcels each |

The stub's README has the full persona list and how to add one. When adding a persona there,
add the same CRN, SBI and names here so it can sign in locally.
