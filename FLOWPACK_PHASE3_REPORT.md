# Flow Pack Phase 3 Fix Report

**Date:** 2026-06-11
**Source:** `backend/FLOWPACK_AUDIT.md` (Gaps #4, #6, #8, #9) + System A retirement
**Reference:** `FLOWPACK_PHASE1_REPORT.md`, `FLOWPACK_PHASE2_REPORT.md`
**Environment:** local (backend :5002)
**No git commits. No deployment.** DB schema change made (additive column) with backup taken first.

---

### Fixes Applied

| #   | Gap                                           | Fix                                                                                                                                                                                                                                                                                                                                                                                                       | Files                                                                            | Status |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| 4   | Flow-count scope inconsistent (3 definitions) | `personalFlowTeamOr` (teamId=null + owned teams, always ownerId-scoped) is now the single scope in: createFlow personal branch, `handleFlowAddonSubscriptionDeleted` (count + excess marking), and BOTH display counts (`getAppStatus.proFlowsUsed`, `getProSubscriptionStatus.flowCount`) — so "used" never disagrees with creation errors. Helper hardened with `(ownedTeams \|\| [])`                  | `flow.service.js`, `pro.service.js`, `personalFlowScope.js`                      | ✅     |
| 6   | `past_due` keeps full entitlements forever    | **Option B (3-day grace):** `handleFlowAddonSubscriptionUpdated` on `past_due` sets `flowAddonGracePeriodEnd = now+3d` + warning notification, limits KEPT during grace; new `checkPastDueGrace()` cron (wired into `/cron/check-flow-pack-expiry`) reduces to base 10 + triggers flow picker after grace; recovery (`active` after `past_due`) clears grace and restores plan entitlements automatically | `pro.service.js`, `flowPackExpiry.service.js`, `cron.routes.js`, `schema.prisma` | ✅     |
| 8   | Dead `flowLimit.service.js`                   | Verified zero requires across `src/`, `index.js`, `tests/` → archived to `src/services/_archived/flowLimit.service.js.archived` with explanation header; safe to hard-delete after 2026-09-11                                                                                                                                                                                                             | `services/_archived/`                                                            | ✅     |
| 9   | RevenueCat flow-pack parity                   | Business decision documented as **web-only for now**: explanatory comment added above `PRODUCT_MAP` with the exact integration path if/when approved                                                                                                                                                                                                                                                      | `revenuecat.controller.js`                                                       | ✅     |
| —   | System A retirement                           | Soft retirement: `Deprecation: true` + `Sunset: Thu, 31 Dec 2026` headers on `POST /pro/buy-flows`; full retirement plan appended to `FLOWPACK_AUDIT.md` (active packs stay serviced; hard removal after 2026-12-31)                                                                                                                                                                                      | `pro.routes.js`, `FLOWPACK_AUDIT.md`                                             | ✅     |

**Schema change:** `User.flowAddonGracePeriodEnd DateTime? @map("flow_addon_grace_period_end")` — additive `ALTER TABLE ADD COLUMN` only. Backup taken first (`backup-2026-06-11T09-05-27.sql`, 408 MB), then `prisma db push` (no flags) + `prisma generate`; column verified in `information_schema`.

---

### Test Results

| TC   | Scenario                                  | Expected                                 | Result                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-1 | `personalFlowTeamOr` in createFlow        | imported + used in personal-branch count | ✅ (`flow.service.js:4,239`)                                                                                                                                                                                                                     |
| TC-2 | Unified scope in cancellation handler     | no `appContext:'pro'` flow counting      | ✅ (`personalScopeOr` in count + excess marking; remaining `appContext:"pro"` hits are team/AI-credit lookups, not flow counts)                                                                                                                  |
| TC-3 | past_due grace logic                      | present in webhook + cron                | ✅ + **live 5-step lifecycle test passed:** (1) past_due → grace set, limits kept at 100; (2) within grace → cron no-op; (3) grace backdated → reduced to 10, grace cleared; (4) re-run → idempotent (0 reduced); (5) recovery → restored to 100 |
| TC-4 | flowLimit.service archived                | file in `_archived/`, zero imports       | ✅                                                                                                                                                                                                                                               |
| TC-5 | System A deprecated                       | headers present                          | ✅ — live response: `Deprecation: true`, `Sunset: Thu, 31 Dec 2026 23:59:59 GMT`                                                                                                                                                                 |
| TC-6 | Cron runs grace check                     | `checkPastDueGrace` called               | ✅ (`cron.routes.js:76`, result merged into response)                                                                                                                                                                                            |
| TC-7 | Full backend suite                        | 549/549                                  | ✅ **549/549, 30/30 suites**                                                                                                                                                                                                                     |
| —    | Live createFlow sanity after scope change | flow creates normally                    | ✅ (created + cleaned up)                                                                                                                                                                                                                        |

Test user reset to baseline; test notifications/flows cleaned up. `/health` 200 after all restarts.

---

### All 9 Audit Gaps — Final Status

| Gap | Description                                                  | Phase   | Status                                         |
| --- | ------------------------------------------------------------ | ------- | ---------------------------------------------- |
| #1  | createFlow ignores `proAdditionalFlowsPurchased`             | P1      | ✅ Fixed                                       |
| #2  | Expiry cron kills active System B add-on                     | P1      | ✅ Fixed                                       |
| #3  | No System B webhook safety net                               | P2      | ✅ Fixed                                       |
| #4  | Flow-count scope inconsistent                                | P3      | ✅ Fixed (enforcement + display unified)       |
| #5  | Re-subscribe doesn't auto-restore flows                      | P1      | ✅ Fixed                                       |
| #6  | Standard→Unlimited upgrade blocked / `past_due` entitlements | P2 / P3 | ✅ Fixed (upgrade P2; past_due 3-day grace P3) |
| #7  | System A purchasable alongside System B                      | P2      | ✅ Fixed (+ deprecated P3)                     |
| #8  | Dead `flowLimit.service.js`                                  | P3      | ✅ Archived                                    |
| #9  | RevenueCat flow-pack parity                                  | P3      | ✅ Documented (web-only by decision)           |

### Notes

- `checkPastDueGrace` intentionally leaves `flowAddonStatus='past_due'` (Stripe keeps dunning; `subscription.deleted` does final cleanup) — idempotency comes from clearing `flowAddonGracePeriodEnd`.
- Known design asymmetry kept as-is: createFlow's TEAM branch still counts per-team against the owner's limit (creating in a team you've joined). Only the personal branch + owned-team scope was unified per the audit.
- Backend test count unchanged at 549 — no new tests added this phase; the past_due lifecycle was verified live end-to-end. Worth adding Jest coverage for `checkPastDueGrace` in a future pass.

### READY FOR PHASE 4 (Playwright E2E Tests): YES ✅
