# Deploy Notes — server steps `git pull` cannot carry

Some of what the running stack needs is **not in any git repository**. Pulling
this repo onto the server updates code and nothing else, so anything listed
here has to be applied by hand.

Keep this file current: when a change needs a matching server action, add a row
to **Pending actions** in the same commit that makes the change.

## What is and isn't version controlled

Three separate repos live under the project root — `backend/`, `frontend/`,
`flutter_webview-main/`. The **root itself is not a repo**, so these travel with
no pull and must be edited on the server directly:

| Path | Carried by `git pull`? |
|---|---|
| `backend/`, `frontend/`, `flutter_webview-main/` | ✅ yes |
| `docker-compose.yml`, `docker-compose.server.yml` | ❌ no — edit on the server |
| `docs/` | ❌ no |
| `.env` (`/var/www/vfs/.env`) | ❌ no, by design — secrets never in git |

## Pending actions

Tick a row only once it is applied **on the dev/prod server**, not locally.

| # | Action | Where | Why | Done |
|---|---|---|---|---|
| 1 | Delete the `REVENUECAT_WEBHOOK_SECRET:` line | `docker-compose.server.yml` (IAP block) | RevenueCat removed 2026-08-14; the variable is now unread. Harmless if skipped, but stale config misleads. | ⬜ |
| 2 | Remove `REVENUECAT_WEBHOOK_SECRET` | server `.env` | Same. | ⬜ |
| 3 | Add `APPLE_BUNDLE_ID: ${APPLE_BUNDLE_ID:-}` under the IAP block | `docker-compose.server.yml` | **Never been present on the server.** Without it `applestore.service.js` fails *open* and skips the bundle check — so the backend would accept an Apple purchase claiming any bundle id. Becomes a real hole when the iOS Pro app ships. | ⬜ |
| 4 | Set `APPLE_BUNDLE_ID=com.valuecharts.flow.chart,com.valuecharts.pro.flow.chart` | server `.env` | Comma-separated allowlist — `allowedBundleIds()` splits on commas. A single wrong value refuses **every** iOS purchase with `BUNDLE_MISMATCH`, so set both. | ⬜ |
| 5 | Add the four `APPLE_*` Sign-In vars under the frontend block | `docker-compose.server.yml` | `frontend/lib/auth.ts` mints Apple's OAuth `client_secret` as an ES256 JWT at runtime; without these the Apple provider fails to initialise and Sign in with Apple is dead in prod. | ⬜ |
| 6 | Set `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | server `.env` | `APPLE_PRIVATE_KEY` is the multi-line `.p8` from Apple Developer → Keys. Quote it and keep the `\n` newlines intact, or the ES256 signing throws at boot. | ⬜ |
| 7 | Rebuild the backend after 1–6 | server | Deleted RevenueCat routes keep answering until the image is rebuilt. | ⬜ |

## IAP environment variables

Read by `services/googleplay.service.js`, `services/applestore.service.js`,
`controllers/iap.controller.js`. Protocol and store-console setup live in
[`../flutter_webview-main/IAP_CONTRACT.md`](../flutter_webview-main/IAP_CONTRACT.md).

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_PATH` | yes (or `_JSON`) | Play Developer API key. `_JSON` holds the same credential inline; set one, not both. |
| `IAP_RTDN_TOKEN` | yes | Shared token for Google RTDN. **Must match** the `?token=` in the Pub/Sub push endpoint. Unset ⇒ every RTDN push is rejected 401 (fails closed). |
| `APPLE_SHARED_SECRET` | legacy only | Needed only for the old `verifyReceipt` path. The app sends a StoreKit 2 JWS, which is verified against the pinned Apple root CA and needs no secret. |
| `APPLE_BUNDLE_ID` | yes | Comma-separated bundle allowlist. Unset ⇒ check skipped with a warning (fails **open**). |
| `APPLE_ROOT_CA_FINGERPRINT` | no | Overrides the pinned Apple Root CA G3 fingerprint. Leave unset in production — only useful to point at a test root. |
| `REVENUECAT_WEBHOOK_SECRET` | **removed** | Vendor dropped 2026-08-14. Delete wherever it survives. |

## Applying changes

```bash
cd /var/www/vfs
git -C backend pull
# hand-apply any Pending actions above
docker-compose -f docker-compose.server.yml up -d --build backend
```

Verify the RevenueCat routes are gone (expect 404, not 503):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://dev.valueflowsoft.com/api/revenuecat/webhook
```

---

*Verified against the repo on 2026-08-19. `docs/INDEX.md` remains the source of
truth for behaviour; this file covers only what deployment cannot inherit from git.*
