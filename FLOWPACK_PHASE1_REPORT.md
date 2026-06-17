# Flow Pack Phase 1 Fix Report

**Date:** 2026-06-11
**Source:** `backend/FLOWPACK_AUDIT.md` (Gaps #1, #2, #5)
**Environment:** local (backend http://localhost:5002)
**No git commits. No deployment.**

---

### Fixes Applied

| #   | Gap                                                     | Fix                                                                                                                                                                                                                                                                                                                               | File                                             | Status |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| 1   | createFlow ignores `proAdditionalFlowsPurchased` (HIGH) | `effectiveLimit = (proFlowLimit \|\| 10) + (proAdditionalFlowsPurchased \|\| 0)` in BOTH personal (~L227) and team (~L200) branches; both selects now fetch the field; error messages show `effectiveLimit`                                                                                                                       | `backend/src/services/flow.service.js`           | ✅     |
| 2   | Expiry cron kills active recurring add-on (HIGH)        | `downgradeUser()` now reads `flowAddonStatus`/`flowAddonCurrentPeriodEnd`; when add-on is `active` (or `cancelling` within paid period) it clears ONLY System A fields (`activeFlowPackId`, `flowPackExpiresAt`, `proAdditionalFlowsPurchased`) and returns early — `proFlowLimit`/`proUnlimitedFlows` untouched, no picker phase | `backend/src/services/flowPackExpiry.service.js` | ✅     |
| 3   | Re-subscribe doesn't auto-restore flows (MED)           | `handleFlowAddonCheckoutWebhook` now (inside the existing `$transaction`): clears `isInFlowPickerPhase`, and `updateMany` restores ALL `markedForDowngrade` flows (`markedForDowngrade=false, deletedAt=null`) — covers both picker-pending and trashed flows, mirroring System A's `handleExtraFlowsWebhook`                     | `backend/src/services/pro.service.js`            | ✅     |

### Test Results

| TC   | Scenario                                                                                         | Expected                                                                     | Result                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-1 | User with `proFlowLimit=1` + `proAdditionalFlowsPurchased=100` creates flow #3                   | Allowed (effectiveLimit=101)                                                 | ✅ PASS — flow created; with additional=0 the same request was correctly blocked                                                                                                                                                                                   |
| TC-2 | Limit error message shows effective limit                                                        | `Flow limit reached (<effectiveLimit>)`                                      | ✅ PASS — `"Flow limit reached (1)"` with additional=0; code uses `effectiveLimit` in both branches                                                                                                                                                                |
| TC-3 | Expired System A pack (past grace) + active System B add-on → run `runDailyCheck()`              | `proFlowLimit` stays 100, no picker, pack→expired, System A pointers cleared | ✅ PASS — log: `pack expired but flow add-on is active — skipped limit reset`; after: `proFlowLimit=100, flowAddonStatus=active, activeFlowPackId=null, isInFlowPickerPhase=false`                                                                                 |
| TC-4 | 3 flows `markedForDowngrade` (1 trashed) + picker phase → simulate `flow_addon` checkout webhook | 0 marked flows, trash restored, picker cleared                               | ✅ PASS — `Restored 3 downgrade-flagged flows`; after: marked=0, trashed=0, `isInFlowPickerPhase=false`, `proFlowLimit=100`                                                                                                                                        |
| TC-5 | Code verification greps                                                                          | All 3 fixes present                                                          | ✅ PASS                                                                                                                                                                                                                                                            |
| TC-6 | Backend test suite                                                                               | No new failures                                                              | ✅ PASS — **544/545** (1 pre-existing failure, unrelated: `dashboard.test.js` DASH-P07 asserts old "stats ignore team context" behavior, but `dashboard.service.js` was intentionally changed 2026-06-03 to per-team scoping — stale test, not touched by Phase 1) |

All test data (TC flows, fake pack, transaction log row) cleaned up; test user reset to baseline (`proFlowLimit=10`, additional=0, no add-on). Webhook idempotency, syntax checks (`node --check` ×3), and `/health`=200 after restart all verified.

### Impact

| Issue                             | Before              | After                                             |
| --------------------------------- | ------------------- | ------------------------------------------------- |
| System A buyer flow creation      | Blocked at 10 ❌    | Works up to base+pack (e.g. 110) ✅               |
| System A expiry + System B active | Downgraded to 10 ❌ | Protected — Stripe webhook owns limits ✅         |
| Re-subscribe flow restore         | Manual only ❌      | Auto-restored (incl. trashed) + picker cleared ✅ |

### Notes / Remaining (Phase 2 candidates from audit)

- Gap #3: no webhook safety net for `flow_addon` checkout (`session_id` + verify endpoint)
- Gap #4: unify flow-count scope (`personalFlowTeamOr`) across createFlow / add-on cancellation
- Gaps #6–#9: `past_due` entitlements, Standard→Unlimited upgrade, System A retirement, dead `flowLimit.service.js`, RevenueCat parity
- Stale test `DASH-P07` in `dashboard.test.js` should be updated to match the per-team-scoping design (pre-existing, out of Phase 1 scope)

### READY FOR PHASE 2: **YES ✅**
