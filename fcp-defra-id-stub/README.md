# Defra ID stub users

`users.json` is the sign-in list for the local Defra ID stub (`fcp-defra-id-stub` in
`compose.infra.yml`). Every entry is a synthetic persona from
[grants-platform-dal-stub](https://github.com/DEFRA/grants-platform-dal-stub), whose
fixtures hold the business, land and permission data behind each CRN and SBI. The two files
must list the same CRN and SBI pairs: a CRN the DAL stub does not know fails at the first DAL
call after sign-in.

| CRN          | Name                   | SBI                                                                      | Permissions                                          | Notes                                                  |
| ------------ | ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------ |
| `9000000001` | Florence Test-Lockwood | `800000001` Test Alder Carr Farm                                         | Every group at its highest level                     | Happy path: two signed SFI agreements, 10 parcels      |
| `9000000002` | Arthur Test-Lockwood   | `800000001`                                                              | CS applications and agreements `AMEND`               |                                                        |
| `9000000003` | Phoebe Test-Lockwood   | `800000001`                                                              | CS applications and agreements `VIEW`                |                                                        |
| `9000000004` | Hugo Test-Lockwood     | `800000001`                                                              | No permission groups                                 |                                                        |
| `9000000005` | Matilda Test-Stanhope  | `800000002` Test Bracken Edge Farm, `800000003` Test Clover Lea Farm Ltd | Full on Test Bracken Edge Farm, `VIEW` on Clover Lea | Multi-business customer; no agreements, 8 parcels each |

CRNs `9000000006` to `9000000033` (SBIs `800000004` to `800000024`) are the acceptance-suite
personas; `acceptance/test/features` names which one each scenario signs in as. Scenarios on
different grants may share a persona, because application state, locks and audit events are
keyed per grant. Scenarios on the same grant never share an SBI: each wipes its SBI's state for
that grant at the start, and the suite runs scenarios in parallel.

The journey tests in the grant config repos use these personas:

- CRN `9000000035` (SBI `800000026` Test Heather Ling Farm) for
  [grants-config-water-management](https://github.com/DEFRA/grants-config-water-management)
- CRN `9000000036` (SBI `800000027` Test Foxglove Farm) for
  [grants-config-grasslands](https://github.com/DEFRA/grants-config-grasslands), whose parcels
  include the ones its journey test selects
- CRNs `9000000024` (SBI `800000011` Test Ivy Lodge Farm) and `9000000013` (SBI `800000014` Test
  Maple Rise Farm) for the application journey and lifecycle tests in
  [grants-config-woodland](https://github.com/DEFRA/grants-config-woodland). These are also
  acceptance-suite personas, so keep their parcels `SD6252 7537`, `SD6351 8781` and
  `SD6352 8774` if an acceptance scenario changes them

Those tests wipe the SBI's state for their grant at the start of every run, so don't use these
SBIs for other scenarios on the same grant or for manual testing of that grant.

The stub's README has the full persona list and how to add one. When adding a persona there,
add the same CRN, SBI and names here so it can sign in locally.
