# Flow Pack Phase 2 Fix Report

**Date:** 2026-06-11
**Source:** `backend/FLOWPACK_AUDIT.md` (Gaps #3, #6, #7) + stale DASH-P07 test
**Reference:** `backend/FLOWPACK_PHASE1_REPORT.md`
**Environment:** local (backend :5002, frontend :3002)
**No git commits. No deployment.**

---

### Fixes Applied

| #   | Gap                                           | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Files                                                                                                                                   | Status |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 3   | No System B webhook safety net (MED-HIGH)     | New `verifyFlowAddonCheckout` service (mirrors `verifyExtraFlowsPurchase`: paid-check, owner-check, purchaseType-check, idempotent via `TransactionLog.txnId`, then runs the same webhook handler) + `POST /api/v1/pro/verify-flow-addon` route/controller + `session_id={CHECKOUT_SESSION_ID}` appended to the flow_addon success URL + frontend calls `proApi.verifyFlowAddon(sessionId)` on return before refreshing                                                           | `pro.service.js`, `pro.controller.js`, `pro.routes.js`, `pro.api.ts`, `subscription/page.tsx`, `app/api/pro/verify-flow-addon/route.ts` | ✅     |
| 6   | Standard → Unlimited upgrade blocked (MED)    | `createFlowAddonSubscriptionCheckout` now branches when active: `standard_100`→`unlimited` calls new `upgradeFlowAddon()` (Stripe price swap on the EXISTING subscription, `proration_behavior: create_prorations`, DB updated immediately, returns `{upgraded: true}` — no redirect); `unlimited`→`standard_100` → `400 DOWNGRADE_NOT_ALLOWED`; same/unknown plan → `400 ALREADY_SUBSCRIBED`. Frontend handles `upgraded` (toast + refresh, no redirect) and the two error codes | `pro.service.js`, `subscription/page.tsx`                                                                                               | ✅     |
| 7   | System A purchasable alongside System B (MED) | `createFlowPurchaseCheckout` now rejects with `400 ADDON_SUBSCRIPTION_ACTIVE` when `flowAddonStatus` is `active` or `cancelling`; misleading Stripe copy fixed: "monthly subscription" → "30-day pack (one-time charge)". (No frontend change needed: `proApi.buyFlows` has **no UI button** — System A is API-only today)                                                                                                                                                        | `pro.service.js`                                                                                                                        | ✅     |
| —   | Stale DASH-P07 test (BONUS)                   | Rewritten to assert the post-2026-06-03 per-team scoping: team context → every `flow.count` where has `{teamId, ownerId}` (owner-scoped, DATA-LOSS-001). Added DASH-P08 asserting the personal-context case (no teamId)                                                                                                                                                                                                                                                           | `tests/dashboard.test.js`                                                                                                               | ✅     |

**Extra (required for Gap #3 to function):** the frontend had **no Next.js proxy routes at all** for `/api/pro/flow-addon/*` — the existing add-on checkout/cancel/status buttons 404'd through the `/api` proxy. Added `app/api/pro/flow-addon/{checkout,cancel,status}/route.ts` alongside `verify-flow-addon`.

**New regression tests added** (`tests/pro.test.js`): ADDON-UP-01 (downgrade → 400), ADDON-UP-02 (in-place upgrade: asserts Stripe `subscriptions.update` called with the existing sub + new price + prorations, and DB flipped to unlimited), ADDON-UP-03 (System A blocked → `ADDON_SUBSCRIPTION_ACTIVE`).

---

### Test Results

| TC   | Scenario                                 | Expected                                       | Result                                                                                                                                                                                                                                                                 |
| ---- | ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-1 | `POST /pro/verify-flow-addon` with `{}`  | 400 `MISSING_SESSION_ID`                       | ✅ PASS (live)                                                                                                                                                                                                                                                         |
| TC-2 | flow_addon success URL                   | `session_id={CHECKOUT_SESSION_ID}` present     | ✅ PASS (`pro.service.js:1037`)                                                                                                                                                                                                                                        |
| TC-3 | standard active → request unlimited      | Upgrade path entered, not `ALREADY_SUBSCRIBED` | ✅ PASS — live call reached Stripe (`No such subscription: 'sub_test_x'` with a fake sub id proves the gate opened); full happy path proven by ADDON-UP-02 with mocked Stripe. Same-plan → `ALREADY_SUBSCRIBED` ✅, downgrade → `DOWNGRADE_NOT_ALLOWED` ✅ (both live) |
| TC-4 | System A `buy-flows` while add-on active | 400 `ADDON_SUBSCRIPTION_ACTIVE`                | ✅ PASS (live + ADDON-UP-03)                                                                                                                                                                                                                                           |
| TC-5 | dashboard.test.js                        | DASH-P07 passes                                | ✅ PASS — 9/9 (incl. new DASH-P08)                                                                                                                                                                                                                                     |
| TC-6 | Full backend suite                       | All green                                      | ✅ PASS — **549/549, 30/30 suites** (was 544/545; +4 new tests, stale failure fixed)                                                                                                                                                                                   |
| —    | Frontend `tsc --noEmit`                  | No errors in touched files                     | ✅ PASS                                                                                                                                                                                                                                                                |

Guard restructure note: the upgrade branch only fires for a verified `flowAddonPlan === 'standard_100'`; an active add-on with an unknown/null stored plan stays safely blocked as `ALREADY_SUBSCRIBED` (this is what ADDON-CO-04 asserts).

Test user reset to baseline after testing. `/health` 200 after both restarts.

---

### Impact

| Issue                            | Before                                          | After                                    |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| flow_addon webhook lost          | Charged monthly, no entitlement, no recovery ❌ | Auto-recovered on success-page return ✅ |
| Standard → Unlimited             | Cancel + wait out period + resubscribe ❌       | Instant prorated price swap ✅           |
| One-time pack + recurring add-on | Double billing possible ❌                      | Blocked (`ADDON_SUBSCRIPTION_ACTIVE`) ✅ |
| One-time pack Stripe copy        | "monthly subscription" (false) ❌               | "30-day pack (one-time charge)" ✅       |
| Add-on UI through `/api` proxy   | 404 (missing proxy routes) ❌                   | Proxied ✅                               |
| DASH-P07                         | Failing (stale assertion) ❌                    | Passing, + DASH-P08 coverage ✅          |

### Remaining (Phase 3 candidates from audit)

- Gap #4: unify flow-count scope (`personalFlowTeamOr`) across createFlow / add-on cancellation
- Gap #6 (audit numbering): `past_due` keeps full entitlements indefinitely
- Gap #8 audit item: delete dead `flowLimit.service.js`
- Gap #9: RevenueCat flow-pack parity (business decision)
- System A retirement decision (now safely fenced off, but still live for users without an add-on)

### Backend tests: 549/549 ✅

### READY FOR PHASE 3: YES ✅
