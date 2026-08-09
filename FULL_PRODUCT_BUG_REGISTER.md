# Full Product Bug Register

## Summary

| Severity | Open | Fixed | Total confirmed |
|---|---:|---:|---:|
| Blocker | 0 | 0 | 0 |
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** |

No product defect has been confirmed at this checkpoint.

## Finding admission criteria

A finding is entered only when it is reproducible in a supported execution mode and attributable to product or release tooling. Each accepted finding must include:

1. A stable `A2Z-QA-###` identifier.
2. Severity and affected surface.
3. Exact prerequisites and reproduction steps.
4. Expected and actual behavior.
5. Evidence establishing impact and root cause.
6. The smallest safe remediation.
7. A regression test that fails before and passes after the fix.
8. Affected-gate and full-release rerun results.

## Rejected observations

### Concurrent runtime harness collision

During exploratory execution, Phase 3 was accidentally started while another Next.js runtime harness held the shared build resources. It printed an application-readiness error during the collision. The supported sequential suite passed, and a deliberate controlled attempt did not reproduce a false-zero exit. This observation is classified as audit orchestration noise, not a product defect; no QA identifier or code change was created.

## Open defects

None.

## Fixed defects

None.

## Pending external execution

Real PostgreSQL/Redis/backup and four-project Playwright execution will run on the audit pull request. A failure is not automatically a defect: it must first be reproduced and separated from runner or dependency-transit failure. Confirmed defects will be added above and remediated on the audit branch only.
