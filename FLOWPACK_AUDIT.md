# Pro App Flow Pack Audit Report

**Date:** 2026-06-11
**Scope:** Standard ($10/mo, 100 flows) + Unlimited ($20/mo) packs — schema, purchase, expiry, limit enforcement, frontend, mobile.
**Mode:** READ-ONLY audit. No code changes made.

---

## ⚠️ Headline Finding

There are **TWO parallel pack systems** coexisting in the codebase:

| System                                         | purchaseType      | Stripe mode              | Entitlement fields                                                                                                   | Expiry mechanism                                               |
| ---------------------------------------------- | ----------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **A. One-time 30-day pack** (legacy)           | `pro_extra_flows` | `payment` (one-time)     | `ProFlowPurchase` row + `proAdditionalFlowsPurchased` / `proUnlimitedFlows`, `activeFlowPackId`, `flowPackExpiresAt` | Daily cron (`flowPackExpiry.service.js`): 30-day + 3-day grace |
| **B. Recurring add-on subscription** (current) | `flow_addon`      | `subscription` (monthly) | `flowAddonStripeSubId/Plan/Status/CurrentPeriodEnd` + sets `proFlowLimit=100` or `proUnlimitedFlows=true`            | Stripe `customer.subscription.deleted` webhook                 |

The frontend (`subscription/page.tsx`) exposes BOTH: `handleAddonSubscribe` (System B, `POST /pro/flow-addon/checkout`) and the legacy `purchased=`/`session_id=` success path (System A, `/pro/buy-flows`). The two systems write to overlapping User fields and **conflict with each other** (see Gap #2).

---

### 1. Flow Pack Schema

| Field                         | Model | Type             | Purpose                                                                                                                                                                                                      |
| ----------------------------- | ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `proFlowLimit`                | User  | Int @default(10) | Base allowance; **overwritten to 100** by Standard add-on webhook, reset to 10 on cancel/expiry                                                                                                              |
| `proAdditionalFlowsPurchased` | User  | Int @default(0)  | Incremented +100 by one-time pack (System A)                                                                                                                                                                 |
| `proUnlimitedFlows`           | User  | Boolean          | Set by Unlimited (both systems)                                                                                                                                                                              |
| `activeFlowPackId`            | User  | String?          | Pointer to active `ProFlowPurchase` (System A only)                                                                                                                                                          |
| `flowPackExpiresAt`           | User  | DateTime?        | Active one-time pack expiry (System A only)                                                                                                                                                                  |
| `isInFlowPickerPhase`         | User  | Boolean          | User must pick 10 flows to keep after downgrade                                                                                                                                                              |
| `flowAddonStripeSubId`        | User  | String?          | Stripe subscription id (System B)                                                                                                                                                                            |
| `flowAddonPlan`               | User  | String?          | `'standard_100' \| 'unlimited'`                                                                                                                                                                              |
| `flowAddonStatus`             | User  | String?          | `'active' \| 'cancelling' \| 'cancelled' \| 'past_due'`                                                                                                                                                      |
| `flowAddonCurrentPeriodEnd`   | User  | DateTime?        | Stripe period end                                                                                                                                                                                            |
| `ProFlowPurchase` (model)     | —     | —                | One row per one-time pack: `packType` (`fifty_flows`/`unlimited`), `isUnlimited`, `expiresAt`, `gracePeriodEndsAt`, `status` (`active\|grace\|expired\|renewed`), `notified7/3/1Days`, `renewedFromId` chain |
| `markedForDowngrade`          | Flow  | Boolean          | Flow pushed to 30-day trash queue by expiry; cleared on renewal/picker                                                                                                                                       |
| `FlowLimit` (model)           | —     | —                | **Legacy free-tier counter** (`totCount`/`flowUsed`); its service is **dead code** (see Gap #1)                                                                                                              |

**Pack types:**

- Standard: System A → `ProFlowPurchase.packType='fifty_flows'` + `proAdditionalFlowsPurchased += 100`; System B → `flowAddonPlan='standard_100'` + `proFlowLimit=100`
- Unlimited: System A → `packType='unlimited'` + `proUnlimitedFlows=true`; System B → `flowAddonPlan='unlimited'` + `proUnlimitedFlows=true`

**Expiry tracking:** System A: `User.flowPackExpiresAt` + `ProFlowPurchase.expiresAt/gracePeriodEndsAt`. System B: `flowAddonCurrentPeriodEnd` (informational; Stripe drives lifecycle).

> Note: `AiCreditBalance` (planCredits/addonCredits/planResetsAt) is AI-credit only — it does **not** track flow packs.

---

### 2. Purchase Flow — Step by Step

**Standard Pack ($10/mo) — System B (current recurring add-on):**

```
User clicks "Subscribe" on subscription page
→ handleAddonSubscribe('standard')  (page.tsx:425)
→ POST /api/v1/pro/flow-addon/checkout {plan:'standard'}
→ pro.service.createFlowAddonSubscriptionCheckout (pro.service.js:928)
   guards: hasPro+proPurchasedAt required; rejects if flowAddonStatus already 'active'
   Stripe Checkout mode='subscription', priceId from STRIPE_*_FLOW_STANDARD_PRICE_ID
   metadata: {purchaseType:'flow_addon', userId, plan:'standard_100'}
→ Stripe webhook checkout.session.completed
→ payment.service routes purchaseType==='flow_addon' → handleFlowAddonCheckoutWebhook (pro.service.js:1012)
   idempotent via TransactionLog.txnId === session.id
→ DB ($transaction): flowAddonStripeSubId, flowAddonPlan='standard_100',
   flowAddonStatus='active', flowAddonCurrentPeriodEnd, proFlowLimit=100 (REPLACE not add),
   proUnlimitedFlows=false; + TransactionLog row (appContext:'pro')
→ User redirected to /dashboard/subscription?flow_addon_subscribed=standard_100
   → success toast + fetchProSubStatus() (page.tsx:375-384)
```

**Unlimited Pack ($20/mo) — System B:**

```
Same path with plan='unlimited' → metadata plan:'unlimited'
→ webhook sets proUnlimitedFlows=true (proFlowLimit untouched)
→ redirect ?flow_addon_subscribed=unlimited
```

**Legacy one-time path — System A (`POST /pro/buy-flows`, still routed & live):**

```
createFlowPurchaseCheckout (pro.service.js:445) — mode='payment', $10/100 flows or $20/unlimited
   (Stripe product copy says "monthly subscription" but it is a ONE-TIME charge)
→ webhook pro_extra_flows → handleExtraFlowsWebhook (pro.service.js:~700)
   idempotency: existing ProFlowPurchase by stripePaymentIntentId
   renewal stacking: new expiry = max(now, old expiresAt) + 30 days; grace = +3 days
   old pack → status='renewed'; new ProFlowPurchase status='active'
→ User: activeFlowPackId, flowPackExpiresAt, isInFlowPickerPhase=false;
   Unlimited → proUnlimitedFlows=true; Standard → proAdditionalFlowsPurchased += 100
→ auto-restores trashed markedForDowngrade flows on renewal
→ redirect ?purchased=<pkg>&session_id=… → frontend calls /pro/verify-flow-purchase
   safety net if webhook was slow
```

---

### 3. Expiry Flow — Step by Step

**System A (one-time 30-day packs) — cron-driven:**

```
Pack purchased → expiresAt = +30d, gracePeriodEndsAt = +33d
→ Daily cron POST /api/v1/cron/check-flow-pack-expiry (Bearer CRON_SECRET)
   → flowPackExpiry.runDailyCheck() (flowPackExpiry.service.js)
→ T-7d / T-3d / T-1d: email + in-app Notification + push (idempotent via notified*Days flags)
→ expiresAt passed, within grace: status='grace', "renew before X" notices
→ gracePeriodEndsAt passed: downgradeUser()
   • ProFlowPurchase.status='expired'
   • User: activeFlowPackId=null, flowPackExpiresAt=null, proUnlimitedFlows=false,
     proAdditionalFlowsPurchased=0, proFlowLimit=10           ← ⚠️ clobbers active add-on (Gap #2)
   • Personal flows counted via personalFlowTeamOr (teamId=null + owned teams)
   • ≤10 flows: notify only
   • >10 flows: isInFlowPickerPhase=true; flows beyond top-10 (shared-first, then
     recency) → markedForDowngrade=true; email/notify/push "pick 10 flows"
→ STEP F: hard-purge markedForDowngrade flows trashed 30+ days ago
→ Flows above limit: NOT deleted at expiry — only marked; trashed via picker confirm
  (flow.service.js:1079 sets deletedAt+markedForDowngrade), restorable for 30 days,
  auto-restored on repurchase
```

**System B (recurring add-on) — Stripe-driven:**

```
User cancels → POST /pro/flow-addon/cancel → stripe cancel_at_period_end=true,
   flowAddonStatus='cancelling' (limits unchanged until period end)
→ Stripe fires customer.subscription.deleted at period end
→ payment.service._handleSubscriptionDeleted matches flowAddonStripeSubId
→ handleFlowAddonSubscriptionDeleted (pro.service.js:1109):
   • flowAddon* fields cleared, proFlowLimit=10, proUnlimitedFlows=false
   • counts flows by {ownerId, deletedAt:null, appContext:'pro'} ← ⚠️ different scope (Gap #5)
   • >10: isInFlowPickerPhase=true; excess (beyond 10 most-recent) markedForDowngrade
   • cancellation email
→ customer.subscription.updated → status sync only (active/past_due/cancelled);
   past_due does NOT reduce limits (Gap #6)
```

**Is there a cron job?** YES — `/cron/check-flow-pack-expiry` (System A only; System B has no cron, relies entirely on Stripe webhooks).
**Does it reset flow count?** YES — resets entitlement fields to base 10; flows themselves only get `markedForDowngrade`.
**Does it block new flows?** YES — indirectly: once `proFlowLimit` is back to 10, `createFlow` blocks at 10.

---

### 4. Flow Creation Limit Check

The live check is **inline in `flow.service.js` createFlow (lines ~160-238)** — NOT `flowLimit.service.js` (which is imported by nothing; dead code).

```javascript
// flow.service.js — personal branch (teamId == null)
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { hasPro: true, proUnlimitedFlows: true, proFlowLimit: true },
});
if (user && !user.proUnlimitedFlows) {
  const limit = user.proFlowLimit || 10; // ⚠️ ignores proAdditionalFlowsPurchased
  const count = await prisma.flow.count({
    where: { ownerId: userId, teamId: null, deletedAt: null }, // ⚠️ teamId:null only
  });
  if (count >= limit)
    throw new AppError(
      `Flow limit reached (${limit})...`,
      403,
      "FLOW_LIMIT_REACHED",
    );
}

// team branch (teamId set — incl. Pro team)
if (!team.owner.proUnlimitedFlows) {
  const limit = team.owner.proFlowLimit || 10; // ⚠️ same omission
  const count = await prisma.flow.count({ where: { teamId, deletedAt: null } });
  if (count >= limit)
    throw new AppError(
      `Team flow limit reached (${limit})...`,
      403,
      "FLOW_LIMIT_REACHED",
    );
}
```

**Checks pack expiry?** NO directly — relies on the cron/webhook having already reset `proFlowLimit`/`proUnlimitedFlows`. Between expiry and the next cron run (up to ~24h) the user keeps full limits. Acceptable, but enforcement is eventually-consistent.
**Handles unlimited?** YES — `proUnlimitedFlows` short-circuits (covers add-on unlimited too, since the webhook sets the same flag).
**What happens at limit?** `AppError 403 FLOW_LIMIT_REACHED`.
**Handles one-time packs (System A)?** ❌ NO — `proAdditionalFlowsPurchased` is never read here (Gap #1).

---

### 5. Gap Analysis

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Severity                        | Where                                                                                                                    | Impact                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **createFlow ignores `proAdditionalFlowsPurchased`.** One-time Standard pack buyer (System A) gets `proAdditionalFlowsPurchased=100` but `proFlowLimit` stays 10 → UI (`getPackStatus`, `getProSubscriptionStatus`) shows limit 110, **createFlow blocks at 10**. The service that DID add it (`flowLimit.service.checkAndEnforceLimit`) is dead code — zero imports.                                                                                                    | **HIGH**                        | `backend/src/services/flow.service.js:219` (and team branch :197); dead code `backend/src/services/flowLimit.service.js` | Paying customer charged $10 but cannot create flow #11. UI and enforcement disagree.                                  |
| 2   | **Expiry cron clobbers active recurring add-on.** `flowPackExpiry.downgradeUser()` unconditionally sets `proFlowLimit=10`, `proUnlimitedFlows=false` without checking `flowAddonStatus==='active'`. A user with a leftover System A pack expiring while holding an active System B subscription gets downgraded despite paying monthly.                                                                                                                                  | **HIGH**                        | `backend/src/services/flowPackExpiry.service.js` (downgradeUser, user.update block)                                      | Active paying subscriber loses 100/unlimited entitlement until next webhook event rewrites it (which may never come). |
| 3   | **No webhook safety net for `flow_addon` checkout.** System A has `/pro/verify-flow-purchase` (frontend calls it with `session_id`); System B's success URL carries no `session_id` and the frontend only shows a toast + refetch. If the `checkout.session.completed` webhook is lost, the user is charged monthly with no entitlement and no recovery path.                                                                                                            | **MED-HIGH**                    | `pro.service.js:1004` (success_url), `page.tsx:372-384`                                                                  | Paid but not activated; requires manual support intervention.                                                         |
| 4   | **Inconsistent flow-count scope between enforcement and display.** createFlow personal branch counts `teamId:null` only; `getPackStatus`/picker/expiry cron use `personalFlowTeamOr` (null + owned teams). Per the Phase B design, Pro flows live in the user's Pro team, so the personal branch undercounts and each owned team gets its own full allowance — a user can exceed the intended cap by spreading flows (10 personal-null + `proFlowLimit` per owned team). | **MED**                         | `flow.service.js:221` vs `backend/src/lib/personalFlowScope.js`                                                          | Limit can be over- or under-enforced depending on workspace; usage bar disagrees with creation errors.                |
| 5   | **Add-on cancellation uses a third scope definition.** `handleFlowAddonSubscriptionDeleted` counts/marks by `appContext:'pro'` (any teamId), while the cron uses `personalFlowTeamOr` and createFlow uses `teamId:null`. Three different definitions of "the user's flows".                                                                                                                                                                                              | **MED**                         | `pro.service.js:1131-1152`                                                                                               | Wrong flows marked for downgrade; team-app flows ignored or pro-team flows double-handled.                            |
| 6   | **`past_due` keeps full entitlements indefinitely.** `handleFlowAddonSubscriptionUpdated` only syncs the status string; limits revert solely on `subscription.deleted`. If Stripe dunning is configured to leave the sub `past_due` without cancelling, a non-paying user keeps 100/unlimited forever.                                                                                                                                                                   | **LOW-MED**                     | `pro.service.js:1090-1107`                                                                                               | Revenue leakage; depends on Stripe dunning settings.                                                                  |
| 7   | **System A is still purchasable alongside System B.** `createFlowPurchaseCheckout` only blocks when `proUnlimitedFlows` is set — a user with an active `standard_100` add-on can also buy a one-time pack (double charge, overlapping entitlements, and Gap #2 interactions). Stripe product copy for the one-time pack says "monthly subscription" though it is a single charge.                                                                                        | **MED**                         | `pro.service.js:445-540`, route `/pro/buy-flows`                                                                         | Confusing double-billing; misleading checkout copy.                                                                   |
| 8   | **No RevenueCat flow-pack support** (see §6). Mobile users cannot purchase either pack.                                                                                                                                                                                                                                                                                                                                                                                  | **LOW** (if web-only by design) | `revenuecat.controller.js` PRODUCT_MAP                                                                                   | Feature parity gap on mobile.                                                                                         |
| 9   | **Expiry enforcement gap up to 24h + dependency on cron being scheduled.** No evidence in-repo of what schedules `/cron/check-flow-pack-expiry` (external scheduler assumed). If unscheduled, System A packs never expire.                                                                                                                                                                                                                                               | **LOW-MED**                     | `backend/src/routes/cron.routes.js:66`                                                                                   | Packs silently never expire (or expire late).                                                                         |

---

### 6. Flow — Complete Happy Path

```
User has Pro app (10 base flows, proFlowLimit=10)
→ Buys Standard add-on (System B): proFlowLimit=100, flowAddonStatus='active'
→ Creates flows up to 100 (creation check honors proFlowLimit) ✅
→ Cancels: 'cancelling' until period end, then Stripe deletes sub
→ Webhook reverts proFlowLimit=10; flows 11-100:
   • Still EXIST — excess (beyond 10 most-recent, appContext:'pro') markedForDowngrade
   • User enters flow-picker phase (isInFlowPickerPhase=true)
   • Can still VIEW them until picker confirm trashes non-selected (30-day trash)
   • Cannot create NEW flows above 10 (403 FLOW_LIMIT_REACHED)
→ User re-subscribes → webhook sets proFlowLimit=100 again
   ⚠️ but flow_addon webhook does NOT clear markedForDowngrade / isInFlowPickerPhase
   (only the System A handleExtraFlowsWebhook auto-restores) — partial re-activation

⚠️ BROKEN path (System A): buys one-time Standard pack → proAdditionalFlowsPurchased=100
→ UI shows 110-flow limit, createFlow still blocks at 10 (Gap #1)
```

---

### 7. Edge Cases Found

| Case                                                                                            | Handled?                                                                                                       | Gap? |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| Pack expires mid-month (System A: 7/3/1-day notices, grace, picker)                             | YES                                                                                                            | ✅   |
| User has 50 flows, pack expires (picker: keep 10, rest → 30-day trash, auto-restore on renewal) | YES (System A) / PARTIAL (System B re-subscribe doesn't auto-restore)                                          | ⚠️   |
| User upgrades Standard → Unlimited add-on                                                       | **NO** — blocked: `ALREADY_SUBSCRIBED` if any add-on active; must cancel, wait for period end, re-subscribe    | ❌   |
| User cancels Unlimited → back to base 10                                                        | YES — cancel-at-period-end + deleted-webhook revert + picker                                                   | ✅   |
| Mobile purchase via RevenueCat                                                                  | **NO** — PRODUCT_MAP only has pro_monthly/pro_yearly/free; no flow-pack products                               | ❌   |
| Double purchase (one-time pack while add-on active, or 2 one-time packs)                        | PARTIAL — one-time renewal stacks expiry correctly; but add-on + one-time can coexist and conflict (Gap #2/#7) | ⚠️   |
| Stripe webhook fails                                                                            | PARTIAL — System A has /verify-flow-purchase fallback; System B (flow_addon) has NO fallback (Gap #3)          | ⚠️   |
| Webhook replay/retry                                                                            | YES — idempotency via TransactionLog.txnId (B) and stripePaymentIntentId lookup (A)                            | ✅   |
| past_due dunning                                                                                | Status synced only; limits untouched (Gap #6)                                                                  | ⚠️   |

---

### 8. Recommended Fixes

| Priority | Fix                                                                                                                                                                                                   | File                                                               | Effort |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| 1        | createFlow: include `proAdditionalFlowsPurchased` in the limit (`proFlowLimit + proAdditionalFlowsPurchased`) in BOTH personal and team branches — or formally retire System A and migrate its fields | `backend/src/services/flow.service.js:197,219`                     | S      |
| 2        | `flowPackExpiry.downgradeUser`: skip the entitlement reset (or reset only pack-derived fields) when `flowAddonStatus === 'active'`                                                                    | `backend/src/services/flowPackExpiry.service.js`                   | S      |
| 3        | Add `session_id={CHECKOUT_SESSION_ID}` to flow_addon success_url + a `/pro/verify-flow-addon` safety-net endpoint mirroring `verifyExtraFlowsPurchase`                                                | `backend/src/services/pro.service.js`, `pro.routes.js`, `page.tsx` | M      |
| 4        | Unify flow-count scope: use `personalFlowTeamOr` in createFlow personal branch and in `handleFlowAddonSubscriptionDeleted`                                                                            | `flow.service.js`, `pro.service.js`                                | M      |
| 5        | On flow_addon (re)activation webhook: clear `isInFlowPickerPhase` and auto-restore `markedForDowngrade` flows (mirror handleExtraFlowsWebhook)                                                        | `pro.service.js handleFlowAddonCheckoutWebhook`                    | S      |
| 6        | Support Standard→Unlimited upgrade via `stripe.subscriptions.update` price swap instead of `ALREADY_SUBSCRIBED` rejection                                                                             | `pro.service.js:955`                                               | M      |
| 7        | Decide System A's fate: either disable `/pro/buy-flows` for users with an active add-on (and fix the "monthly subscription" copy on a one-time charge) or remove it                                   | `pro.routes.js`, `pro.service.js`                                  | S-M    |
| 8        | Delete dead `flowLimit.service.js` (nothing imports it) to remove the misleading second limit implementation                                                                                          | `backend/src/services/flowLimit.service.js`                        | S      |
| 9        | (Business decision) Add flow-pack products to the RevenueCat PRODUCT_MAP for mobile parity                                                                                                            | `revenuecat.controller.js`                                         | M      |

---

### READY FOR FIX PROMPT: **YES**

Highest-value first pass: Fixes #1 + #2 + #5 (all small, all in identified functions, no schema change). Fix #3 follows the existing `verifyExtraFlowsPurchase` pattern exactly.

---

## System A Retirement Plan (added Phase 3, 2026-06-11)

- **Status:** Soft-retired.
- **Fenced from System B:** `buy-flows` rejects with `ADDON_SUBSCRIPTION_ACTIVE` while a recurring add-on is active/cancelling (Phase 2, Gap #7).
- **UI:** no frontend button exists (`proApi.buyFlows` is API-only).
- **API route:** `POST /pro/buy-flows` now returns `Deprecation: true` + `Sunset: Thu, 31 Dec 2026 23:59:59 GMT` headers.
- **Active packs:** still fully serviced — expiry cron, grace, picker, renewal stacking, and auto-restore all remain live.
- **Stripe copy:** corrected to "30-day pack (one-time charge)" (Phase 2).
- **Hard removal:** after **2026-12-31** (every 30-day pack sold by then will have expired). Remove: `/buy-flows` + `/verify-flow-purchase` routes, `createFlowPurchaseCheckout`, `handleExtraFlowsWebhook`, `verifyExtraFlowsPurchase`, and (after data migration) the `ProFlowPurchase`-driven cron paths.
