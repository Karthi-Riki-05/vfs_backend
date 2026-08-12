"use strict";

/**
 * Apple App Store — server-side validation and lifecycle tracking
 * (direct integration; no third-party billing vendor).
 *
 * Two entry points, both normalizing Apple payloads into the ONE internal
 * event shape consumed by iap.service.handleIapEvent():
 *   - validatePurchase()       — verifies the client's proof of purchase right
 *     after purchase. Accepts BOTH shapes the Flutter plugin can produce:
 *       · StoreKit 2 signed transaction (JWS) — the DEFAULT from
 *         in_app_purchase_storekit (`_useStoreKit2 = true`). Verified locally
 *         against the pinned Apple root; no network call, no shared secret.
 *       · legacy base64 app receipt — verified via Apple's verifyReceipt
 *         endpoint (shared secret). Deprecated by Apple but operational.
 *     See isSignedTransaction() for why both must be handled.
 *   - handleNotification()     — App Store Server Notifications V2: verifies
 *     the JWS signature chain (x5c → pinned Apple Root CA) and maps
 *     notification types to internal lifecycle events.
 *
 * Config (backend .env):
 *   APPLE_SHARED_SECRET          — app-specific shared secret (App Store
 *                                  Connect → App Information → Shared Secret).
 *                                  Needed ONLY for the legacy receipt path.
 *   APPLE_BUNDLE_ID              — expected bundle id (com.valuecharts.flow.chart);
 *                                  when set, signed transactions from any other
 *                                  app are rejected
 *   APPLE_ROOT_CA_FINGERPRINT    — optional override of the pinned SHA-256
 *                                  fingerprint of Apple's root certificate
 *
 * User attribution on notifications: Apple's appAccountToken must be a UUID,
 * which our user ids are not — so notifications resolve the user through the
 * iap_transactions ledger (originalTransactionId recorded at validate time).
 */

const crypto = require("crypto");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { prisma } = require("../lib/prisma");
const { resolveIapProduct } = require("../config/iapProducts");

const VERIFY_RECEIPT_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const VERIFY_RECEIPT_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

// SHA-256 fingerprint of "Apple Root CA - G3" (the root that signs App Store
// Server Notification certificates). Public, stable value — but verify once
// against https://www.apple.com/certificateauthority/ at deploy time and
// override via env if Apple ever rotates roots.
const DEFAULT_APPLE_ROOT_FINGERPRINT =
  "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179";

// Server Notification V2 notificationType (+subtype) → internal event type.
// https://developer.apple.com/documentation/appstoreservernotifications
function mapNotificationType(notificationType, subtype) {
  switch (notificationType) {
    case "SUBSCRIBED":
      return "INITIAL_PURCHASE";
    case "DID_RENEW":
      return "RENEWAL";
    case "DID_CHANGE_RENEWAL_STATUS":
      return subtype === "AUTO_RENEW_ENABLED"
        ? "UNCANCELLATION"
        : "CANCELLATION";
    case "DID_FAIL_TO_RENEW":
      return "BILLING_ISSUE";
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
      return "EXPIRATION";
    case "REFUND":
      // Refund of a subscription kills it now; refund of a one-time product
      // routes through CANCELLATION (the pro/one-time revoke path).
      return "EXPIRATION";
    case "ONE_TIME_CHARGE":
      return "NON_RENEWING_PURCHASE";
    case "DID_CHANGE_RENEWAL_PREF":
      return "PRODUCT_CHANGE";
    default:
      return null;
  }
}

/** Decodes one JWS segment (base64url JSON). */
function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Verifies an Apple JWS (ES256, x5c certificate chain) and returns the
 * decoded payload. Chain checks: leaf signs the payload, each cert is signed
 * by the next, and the chain terminates at the pinned Apple root.
 */
function verifyAppleJws(signedPayload) {
  const parts = String(signedPayload).split(".");
  if (parts.length !== 3) {
    throw new AppError("Malformed Apple JWS", 400, "INVALID_JWS");
  }
  const header = decodeSegment(parts[0]);
  const chain = (header.x5c || []).map(
    (der) =>
      new crypto.X509Certificate(
        `-----BEGIN CERTIFICATE-----\n${der}\n-----END CERTIFICATE-----`,
      ),
  );
  if (chain.length < 2) {
    throw new AppError("Apple JWS missing certificate chain", 400, "INVALID_JWS");
  }

  // Each certificate must be signed by its issuer (the next in the chain);
  // the last must chain to itself (root) — and match the pinned Apple root.
  for (let i = 0; i < chain.length; i++) {
    const issuer = chain[i + 1] || chain[i];
    if (!chain[i].verify(issuer.publicKey)) {
      throw new AppError(
        "Apple JWS certificate chain verification failed",
        400,
        "INVALID_JWS_CHAIN",
      );
    }
  }
  const rootFingerprint = (
    process.env.APPLE_ROOT_CA_FINGERPRINT || DEFAULT_APPLE_ROOT_FINGERPRINT
  ).replace(/:/g, "").toUpperCase();
  const actualRoot = chain[chain.length - 1].fingerprint256
    .replace(/:/g, "")
    .toUpperCase();
  if (actualRoot !== rootFingerprint) {
    throw new AppError(
      "Apple JWS does not chain to the pinned Apple root CA",
      400,
      "INVALID_JWS_ROOT",
    );
  }

  // Signature: ES256 over "header.payload" with the leaf's public key.
  const verified = crypto.verify(
    "sha256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: chain[0].publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(parts[2], "base64url"),
  );
  if (!verified) {
    throw new AppError("Apple JWS signature invalid", 400, "INVALID_JWS_SIG");
  }
  return decodeSegment(parts[1]);
}

/** Calls verifyReceipt — production first, sandbox on status 21007. */
async function verifyReceiptWithApple(receiptData) {
  const secret = process.env.APPLE_SHARED_SECRET;
  if (!secret || secret.trim() === "") {
    throw new AppError(
      "Apple billing is not configured on the server",
      503,
      "IAP_NOT_CONFIGURED",
    );
  }
  const body = JSON.stringify({
    "receipt-data": receiptData,
    password: secret,
    "exclude-old-transactions": true,
  });
  const call = async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return res.json();
  };
  let result = await call(VERIFY_RECEIPT_PROD);
  if (result.status === 21007) result = await call(VERIFY_RECEIPT_SANDBOX);
  if (result.status !== 0) {
    throw new AppError(
      `Apple receipt rejected (status ${result.status})`,
      400,
      "RECEIPT_INVALID",
    );
  }
  return result;
}

/**
 * True when the client's proof of purchase is a StoreKit 2 *signed
 * transaction* (JWS) rather than a legacy base64 app receipt.
 *
 * This distinction is not academic: in_app_purchase_storekit ships with
 * `_useStoreKit2 = true` by DEFAULT (verified in 0.4.10+1), and on that path
 * `PurchaseVerificationData.serverVerificationData` is the JWS representation
 * of the transaction — NOT the app receipt. Feeding a JWS to verifyReceipt
 * makes Apple answer `21002 malformed`, which is exactly how every iOS sandbox
 * purchase failed on 2026-08-12 before this branch existed.
 *
 * A JWS is three base64url segments joined by dots; a PKCS#7 app receipt is a
 * single base64 blob and never contains a dot, so the shape is a safe
 * discriminator. Both are accepted so the server keeps working whichever
 * StoreKit generation a given app build uses.
 */
function isSignedTransaction(proof) {
  return String(proof).split(".").length === 3;
}

/**
 * Normalizes a StoreKit 2 signed transaction into the shared shape below.
 * The JWS signature is verified against the pinned Apple root, so the decoded
 * fields are trustworthy — no round-trip to Apple is needed (and no shared
 * secret, which verifyReceipt required).
 */
function normalizeSignedTransaction(proof) {
  const txn = verifyAppleJws(proof);
  const expected = process.env.APPLE_BUNDLE_ID;
  if (expected && txn.bundleId && txn.bundleId !== expected) {
    throw new AppError(
      "Transaction belongs to a different app",
      400,
      "BUNDLE_MISMATCH",
    );
  }
  if (!expected) {
    // Logged with the observed value so the env var can be set to the right
    // bundle id without guessing, then this check starts enforcing.
    logger.warn(
      `[iap-apple] APPLE_BUNDLE_ID unset — bundle id check skipped; ` +
        `transaction reports bundleId=${txn.bundleId} env=${txn.environment}`,
    );
  }
  return {
    productId: txn.productId,
    transactionId: String(txn.transactionId),
    originalTransactionId: String(
      txn.originalTransactionId || txn.transactionId,
    ),
    expiresMs: txn.expiresDate ? Number(txn.expiresDate) : null,
    revokedMs: txn.revocationDate ? Number(txn.revocationDate) : null,
  };
}

/** Normalizes the newest legacy-receipt transaction for [productId]. */
async function normalizeLegacyReceipt(receiptData, productId) {
  const result = await verifyReceiptWithApple(receiptData);

  // Newest transaction for this product across both receipt sections.
  const transactions = [
    ...(result.latest_receipt_info || []),
    ...(result.receipt?.in_app || []),
  ].filter((t) => t.product_id === productId);
  transactions.sort(
    (a, b) => Number(b.purchase_date_ms || 0) - Number(a.purchase_date_ms || 0),
  );
  const txn = transactions[0];
  if (!txn) {
    throw new AppError(
      `Receipt has no transaction for ${productId}`,
      400,
      "PURCHASE_NOT_FOUND",
    );
  }
  return {
    productId: txn.product_id,
    transactionId: String(txn.transaction_id),
    originalTransactionId: String(
      txn.original_transaction_id || txn.transaction_id,
    ),
    expiresMs: txn.expires_date_ms ? Number(txn.expires_date_ms) : null,
    revokedMs: txn.cancellation_date_ms
      ? Number(txn.cancellation_date_ms)
      : null,
  };
}

/**
 * Verifies a purchase for [productId] and returns the normalized event.
 * Accepts either proof shape — see isSignedTransaction().
 * The authenticated caller IS the attribution — the resulting ledger row
 * (originalTransactionId ↔ userId) is what later notifications resolve
 * against.
 */
async function validatePurchase({ userId, productId, receiptData }) {
  if (!productId || !receiptData) {
    throw new AppError("Missing purchase fields", 400, "INVALID_PURCHASE");
  }

  const txn = isSignedTransaction(receiptData)
    ? normalizeSignedTransaction(receiptData)
    : await normalizeLegacyReceipt(receiptData, productId);

  // The signed/verified product id is authoritative; a client asking us to
  // grant a DIFFERENT product than the one Apple actually sold must be
  // refused (server-is-authoritative — see docs/xc-security.md).
  if (txn.productId && txn.productId !== productId) {
    throw new AppError(
      `Purchase is for ${txn.productId}, not ${productId}`,
      400,
      "PRODUCT_MISMATCH",
    );
  }

  const product = resolveIapProduct(productId);
  const isSubscription =
    !!product && (product.type === "team" || product.type === "flow_addon");

  if (isSubscription && txn.expiresMs && txn.expiresMs < Date.now()) {
    throw new AppError("Subscription already expired", 400, "PURCHASE_EXPIRED");
  }
  if (txn.revokedMs) {
    throw new AppError("Purchase was refunded", 400, "PURCHASE_REFUNDED");
  }

  return {
    id: `ap:${txn.transactionId}`,
    type: isSubscription ? "INITIAL_PURCHASE" : "NON_RENEWING_PURCHASE",
    app_user_id: userId,
    product_id: productId,
    // Record the ORIGINAL transaction id so Server Notifications (which key
    // on it) can resolve the user through the ledger.
    transaction_id: txn.originalTransactionId,
    original_transaction_id: txn.originalTransactionId,
    price: null,
    currency: null,
    store: "APP_STORE",
    expiration_at_ms: txn.expiresMs,
  };
}

/**
 * Verifies and normalizes an App Store Server Notification V2. Returns the
 * internal event, or null when no action is needed. User attribution comes
 * from the ledger row written by validatePurchase().
 */
async function normalizeNotification(body) {
  const signedPayload = body?.signedPayload;
  if (!signedPayload) return null;

  const payload = verifyAppleJws(signedPayload);
  const type = mapNotificationType(payload.notificationType, payload.subtype);
  if (!type) {
    logger.info(
      `[iap-apple] notification ${payload.notificationType}/${payload.subtype || "-"} — no action`,
    );
    return null;
  }

  const signedTxn = payload.data?.signedTransactionInfo;
  if (!signedTxn) return null;
  const txn = verifyAppleJws(signedTxn);

  // Resolve the user via the validate-time ledger binding.
  const originalId = txn.originalTransactionId || txn.transactionId;
  const ledgerRow = await prisma.iapTransaction.findFirst({
    where: { transactionId: originalId, provider: "apple" },
    orderBy: { createdAt: "desc" },
  });
  if (!ledgerRow) {
    logger.error(
      `[iap-apple] notification ${payload.notificationType} for unknown originalTransactionId ${originalId} — cannot attribute, manual review needed`,
    );
    return null;
  }

  return {
    id: payload.notificationUUID
      ? `ap-ntf:${payload.notificationUUID}`
      : `ap-ntf:${type}:${txn.transactionId}`,
    type,
    app_user_id: ledgerRow.userId,
    product_id: txn.productId,
    new_product_id: txn.productId, // PRODUCT_CHANGE carries the new product here
    // Per-period transaction id (unique per renewal) so a RENEWAL grant is
    // not swallowed by the txn-level dedup; the ORIGINAL id stays the stable
    // subscription key used for paymentId/flowAddon ownership.
    transaction_id: txn.transactionId || originalId,
    original_transaction_id: originalId,
    price: txn.price != null ? txn.price / 1000 : null, // milliunits → units
    currency: txn.currency || null,
    store: "APP_STORE",
    expiration_at_ms: txn.expiresDate || null,
  };
}

module.exports = {
  validatePurchase,
  normalizeNotification,
  // exported for tests
  verifyAppleJws,
  mapNotificationType,
};
