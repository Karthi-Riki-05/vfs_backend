"use strict";

/**
 * Play Integrity token decoding — server side.
 *
 * The token the app obtains from Play Integrity is opaque and encrypted. It is
 * decoded EITHER by calling Google (this file) OR locally with the app's
 * decryption keys from Play Console. Calling Google is used here because the
 * service account already exists for Play Billing, so the harness adds no new
 * secret to provision — only an API to enable and one scope to grant.
 *
 * ⚠️ WHY THE SERVER DECODES AND NOT THE APP
 *   This is the entire point of attestation. A verdict the app decodes and
 *   reports is worth exactly as much as the `X-App-Source` header it would
 *   replace — the client says "I am licensed" and the server believes it. Only
 *   a token the SERVER submits to Google, and a verdict Google returns to the
 *   SERVER, is evidence. Never accept a client-parsed verdict.
 *
 * PROVISIONING (all three are required, and none is code):
 *   1. Google Cloud console → enable the **Play Integrity API** on the project
 *      that owns GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.
 *   2. Play Console → your app → Release → App integrity → link that Cloud
 *      project, and set the response encryption to "Google-managed" (required
 *      for server-side decoding via this endpoint).
 *   3. The service account needs the `playintegrity` scope (granted below) and
 *      access to the app in Play Console.
 *
 *   A missing step surfaces as a 403 from Google, not as a wrong verdict —
 *   which is why decodeIntegrityToken() below returns the raw Google error
 *   instead of collapsing everything to "unlicensed". Reading a config failure
 *   as a refund is precisely the mistake that would lock out paying customers.
 */

const fs = require("fs");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// Separate scope from androidpublisher — the same key can hold both, but the
// Play Integrity API will not accept an androidpublisher-only token.
const SCOPE = "https://www.googleapis.com/auth/playintegrity";

let _client = null;

/**
 * Lazily builds the authenticated Play Integrity client.
 *
 * `googleapis` is required inside the function, not at module top, for the same
 * reason googleplay.service.js does it: the library is very large and eager
 * loading bloats every process (and every jest worker) that merely requires
 * the route tree.
 */
function getClient() {
  if (_client) return _client;

  // eslint-disable-next-line global-require
  const { google } = require("googleapis");

  const inline = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH;

  let credentials;
  if (inline && inline.trim() !== "") {
    credentials = JSON.parse(inline);
  } else if (path && fs.existsSync(path)) {
    credentials = JSON.parse(fs.readFileSync(path, "utf8"));
  } else {
    throw new AppError(
      "Play Integrity is not configured on the server (no Google Play service account)",
      503,
      "INTEGRITY_NOT_CONFIGURED",
    );
  }

  const auth = new google.auth.GoogleAuth({ credentials, scopes: [SCOPE] });
  _client = google.playintegrity({ version: "v1", auth });
  return _client;
}

/**
 * Flattens Google's nested verdict into the handful of fields the experiment
 * actually compares, while the caller keeps the full payload.
 *
 * Every field is optional on purpose. Google omits `accountDetails` entirely
 * when licensing could not be evaluated, and reading an absent
 * appLicensingVerdict as UNLICENSED would turn a partial response into a
 * false refund signal.
 */
function summarise(payload) {
  const account = payload?.accountDetails || {};
  const app = payload?.appIntegrity || {};
  const device = payload?.deviceIntegrity || {};
  const request = payload?.requestDetails || {};

  return {
    appLicensingVerdict: account.appLicensingVerdict || null,
    appRecognitionVerdict: app.appRecognitionVerdict || null,
    packageName: app.packageName || request.requestPackageName || null,
    deviceVerdicts: Array.isArray(device.deviceRecognitionVerdict)
      ? device.deviceRecognitionVerdict.join(",")
      : null,
    // Google sends this as a string already; keep it a string (see the
    // LicenseProbe.tokenTimestampMs comment — BigInt serialises badly).
    tokenTimestampMs:
      request.timestampMillis != null ? String(request.timestampMillis) : null,
    // Classic integrity requests echo `nonce`; Standard requests echo
    // `requestHash`. The harness uses classic (see LicenseProbe.kt), so read
    // nonce first and fall back — one column serves both, and a production
    // switch to Standard will not silently start recording null.
    requestHash: request.nonce || request.requestHash || null,
  };
}

/**
 * Decode one integrity token.
 *
 * @param {object} opts
 * @param {string} opts.integrityToken  the opaque token from the device
 * @param {string} opts.packageName     MUST be the flavour's real
 *   applicationId — `com.valuecharts.pro` for the Pro app,
 *   `com.valuecharts.app` for Team. They are separate Play listings, so a
 *   mismatch is a 400 from Google rather than a wrong verdict.
 *
 * @returns {Promise<{ok: true, summary: object, payload: object}
 *                 | {ok: false, error: string, status: number|null}>}
 *
 * Never throws for a Google-side failure: the harness must RECORD a failure,
 * because a run of failures is itself a finding. Only a missing service
 * account throws (that is a misconfiguration, not a measurement).
 */
async function decodeIntegrityToken({ integrityToken, packageName }) {
  if (!integrityToken || typeof integrityToken !== "string") {
    return { ok: false, error: "integrityToken missing or not a string", status: null };
  }
  if (!packageName || typeof packageName !== "string") {
    return { ok: false, error: "packageName missing or not a string", status: null };
  }

  const client = getClient(); // may throw INTEGRITY_NOT_CONFIGURED — intended

  try {
    const res = await client.v1.decodeIntegrityToken({
      packageName,
      requestBody: { integrityToken },
    });

    const payload = res?.data?.tokenPayloadExternal;
    if (!payload) {
      return {
        ok: false,
        error: "Google returned no tokenPayloadExternal",
        status: res?.status ?? null,
      };
    }

    return { ok: true, summary: summarise(payload), payload };
  } catch (err) {
    // Surface Google's own message verbatim. A 403 here almost always means a
    // provisioning step above was skipped, and paraphrasing it would send the
    // reader looking for a code bug that does not exist.
    const status = err?.response?.status ?? err?.code ?? null;
    const detail =
      err?.response?.data?.error?.message || err?.message || "unknown error";
    logger.warn(
      `[playIntegrity] decode failed (status=${status}) for ${packageName}: ${detail}`,
    );
    return { ok: false, error: `${detail}`, status: typeof status === "number" ? status : null };
  }
}

module.exports = { decodeIntegrityToken, summarise, SCOPE };
