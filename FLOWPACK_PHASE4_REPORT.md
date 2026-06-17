# Flow Pack Phase 4 — E2E Test Report

**Date:** 2026-06-11
**Source:** `FLOWPACK_AUDIT.md` + Phase 1–3 reports
**Environment:** local (frontend :3002, backend :5002)
**No git commits. No deployment.**

---

### Infrastructure Built

| Artifact                                | Purpose                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/playwright.config.ts`         | New config — testDir `./e2e`, baseURL :3002, sequential (`workers: 1`, tests share DB state), 1 retry, screenshots/traces on failure, shared `storageState`                                                                                                               |
| `frontend/e2e/setup/global-setup.ts`    | Resets Pro test user + deletes `[E2E]` flows, then logs in ONCE and saves `e2e/.auth/pro.json` (per-test UI logins tripped the 10-per-15-min auth rate limiter)                                                                                                           |
| `frontend/e2e/setup/global-teardown.ts` | Deletes `[E2E]` flows, resets user to baseline                                                                                                                                                                                                                            |
| `frontend/e2e/helpers/db.ts`            | `dbNode()` (pipes scripts to the backend container via **stdin** — `-e` broke on shell `$disconnect` expansion), `setUserState`/`getUserState`, `createTestFlows`/`deleteTestFlows`, `resetProUser`, `runPastDueGraceCheck` (direct invoke — `CRON_SECRET` unset locally) |
| `frontend/e2e/helpers/auth.ts`          | UI login + **cached** backend Bearer token (1 auth call per run instead of ~8)                                                                                                                                                                                            |
| `frontend/e2e/flow-pack.spec.ts`        | 22 tests across 9 scenarios                                                                                                                                                                                                                                               |
| `package.json` scripts                  | `e2e`, `e2e:ui`, `e2e:headed`, `e2e:flowpack`, `e2e:report`                                                                                                                                                                                                               |
| `@playwright/test` + chromium           | Installed as devDependency (was missing — only one orphaned legacy spec existed, targeting port 3000 / nonexistent seed users; excluded via testDir)                                                                                                                      |

Test user: `prouser@valueflowtest.com` (the prompt's `alphapro@…` doesn't exist).

---

### Test Results — 22/22 ✅ (1.7m)

| Test  | Description                                                                | Status | Notes                               |
| ----- | -------------------------------------------------------------------------- | ------ | ----------------------------------- |
| FP-01 | FlowUsageBar shows /10 + Buy More Flows                                    | ✅     |                                     |
| FP-02 | Flow #11 → 403 FLOW_LIMIT_REACHED "(10)"                                   | ✅     | real API                            |
| FP-03 | Subscription page offers both packs                                        | ✅     | buttons are `$10/month`/`$20/month` |
| FP-04 | Dashboard shows /100 with Standard active                                  | ✅     |                                     |
| FP-05 | Flow #11 allowed with Standard active                                      | ✅     | real API                            |
| FP-06 | Active add-on card + Cancel Subscription                                   | ✅     |                                     |
| FP-07 | Upgrade to Unlimited button on Standard card                               | ✅     | **found+fixed UI gap** (see below)  |
| FP-08 | "flows used (Unlimited)" shown                                             | ✅     |                                     |
| FP-09 | Flow #16 allowed with Unlimited                                            | ✅     | real API                            |
| FP-10 | Picker banner on flows page (15 flows, picker phase)                       | ✅     |                                     |
| FP-11 | Re-subscribe → /100 shown, no picker banner                                | ✅     |                                     |
| FP-12 | System A pack: effective limit 110 enforced                                | ✅     | real API (Phase 1 Gap #1)           |
| FP-13 | buy-flows blocked → ADDON_SUBSCRIPTION_ACTIVE + Deprecation/Sunset headers | ✅     | Phase 2 Gap #7 + Phase 3 retirement |
| FP-14 | past_due grace: dashboard keeps /100                                       | ✅     | Phase 3 Gap #6                      |
| FP-15 | "Payment failed" + 3-day warning on subscription page                      | ✅     | **new UI added** (see below)        |
| FP-16 | Expired grace → cron reduces to 10, grace cleared                          | ✅     | runs real `checkPastDueGrace()`     |
| FP-17 | Upgrade gate opens (not ALREADY_SUBSCRIBED)                                | ✅     | Phase 2 Gap #6                      |
| FP-18 | Downgrade → DOWNGRADE_NOT_ALLOWED                                          | ✅     |                                     |
| FP-19 | Pro dashboard: FLOW USAGE, no Team Activity                                | ✅     |                                     |
| FP-20 | ?app=pro + login → /dashboard/pro                                          | ✅     | fresh unauthenticated session       |
| FP-21 | No horizontal overflow at 360px                                            | ✅     |                                     |
| FP-22 | Plan card reflects active Standard add-on                                  | ✅     |                                     |

---

### Bugs / Gaps Found & Fixed During E2E

| #   | Found by  | Issue                                                                                                                                                                        | Fix                                                                                                                                                                                                               |
| --- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FP-07     | **Phase 2's Standard→Unlimited upgrade had NO UI entry point** — when an add-on is active the buy cards are hidden, so the backend upgrade path was unreachable from the app | Added "Upgrade to Unlimited" button to the active Standard add-on card (`subscription/page.tsx`), wired to the existing `handleAddonSubscribe("unlimited")` which already handles the `{upgraded: true}` response |
| 2   | FP-15     | **No UI for add-on `past_due`** — the add-on card only rendered for active/cancelling, so a payment-failed user saw nothing                                                  | Add-on card now renders for `past_due` with a red "Payment failed" tag + "Update your payment method within 3 days to keep your flows."                                                                           |
| 3   | first run | Per-test UI logins hit the backend auth rate limiter (10/15min) — 8 late tests failed on login timeouts                                                                      | Single login in global-setup + shared `storageState`; backend token cached per worker                                                                                                                             |
| 4   | first run | `docker exec node -e "<script>"` broke on shell expansion (`$disconnect` → `prisma.()`)                                                                                      | Scripts piped via stdin                                                                                                                                                                                           |

### Final Score

- **E2E: 22/22 ✅** (`npm run e2e:flowpack`, 1.7m)
- **Backend: 549/549 ✅** (unchanged)
- **TypeScript: 0 errors** in all touched files

### ALL PHASES COMPLETE ✅

- Phase 1: Gaps #1, #2, #5 (limit math, cron guard, re-subscribe restore)
- Phase 2: Gaps #3, #6-upgrade, #7 + DASH-P07 + missing flow-addon proxy routes
- Phase 3: Gaps #4, #6-past_due, #8, #9 + System A soft retirement
- Phase 4: 22 E2E tests covering all of the above end-to-end, 2 real UI gaps found and fixed
