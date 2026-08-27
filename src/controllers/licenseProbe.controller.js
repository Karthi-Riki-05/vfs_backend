"use strict";

/**
 * LICENSE PROBE — diagnostic harness. Delete once the experiment concludes.
 *
 * THE QUESTION
 *   Does Play Integrity's `appLicensingVerdict` flip LICENSED -> UNLICENSED
 *   when a user refunds an UPFRONT PAID APP, and after how long? Google
 *   documents the field as an entitlement check but never documents refund
 *   behaviour or latency, and warns that a user "may retain the app
 *   entitlement after uninstalling" on older devices. The proposed 14-day
 *   rolling-lease architecture is worthless if the flip never happens, so it
 *   is measured for $5 before any of it is built.
 *
 * THE EXPERIMENT
 *   1. Install the Pro app on a real device, real Google account.
 *   2. Buy it ($5). Probe with label "before-refund".
 *   3. Refund it in the Play Store app.
 *   4. Probe with "refund-requested", then "t+1h", "t+24h", "t+48h".
 *   5. GET the timeline and read where — or whether — the verdict changed.
 *
 * ⚠️ THIS ENDPOINT GRANTS AND REVOKES NOTHING.
 *   It writes exactly one LicenseProbe row and returns what Google said. It
 *   does not touch `hasPro`, `proPurchasedAt`, `proRefundedAt`,
 *   `currentVersion`, or any team/credit record. An observation that quietly
 *   changed entitlements would corrupt the very thing it is measuring, and a
 *   harness with write access to billing state is a liability the moment
 *   someone forgets it is there.
 *
 * ⚠️ OFF UNLESS EXPLICITLY ENABLED.
 *   Requires `LICENSE_PROBE_TOKEN` in the backend env AND a matching
 *   `X-Probe-Token` header. Unset env => 503 for everyone. That is what keeps
 *   an unauthenticated, quota-consuming, Google-calling endpoint inert in
 *   production if this ships by accident.
 *
 * WHY UNAUTHENTICATED (no `authenticate` middleware)
 *   The subject of the experiment is the DEVICE + PLAY ACCOUNT pair, not our
 *   own user account — Google's entitlement has nothing to do with whether
 *   someone is logged into ValueCharts. Requiring a session would also make
 *   the run harder exactly when it matters (a fresh install, before login,
 *   right after a refund). The shared token plus a rate limiter is the
 *   proportionate guard for a diagnostic; `userId` is accepted purely as an
 *   optional correlation label.
 */

const { prisma } = require("../lib/prisma");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { decodeIntegrityToken } = require("../services/playIntegrity.service");

/** Cap on stored/echoed free text so a device cannot write essays into the table. */
const MAX_LABEL = 120;

function assertHarnessEnabled(req) {
  const expected = process.env.LICENSE_PROBE_TOKEN;
  if (!expected || expected.trim() === "") {
    throw new AppError(
      "License probe harness is disabled",
      503,
      "PROBE_DISABLED",
    );
  }
  const given = req.headers["x-probe-token"];
  if (given !== expected) {
    // Deliberately the same code/message as "disabled": a wrong token should
    // not confirm to a prober that the harness exists and is switched on.
    throw new AppError(
      "License probe harness is disabled",
      503,
      "PROBE_DISABLED",
    );
  }
}

function clean(value, max = MAX_LABEL) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, max);
}

class LicenseProbeController {
  /**
   * POST /api/v1/license/probe
   *
   * Body: { integrityToken, packageName, platform?, appVariant?, label?,
   *         deviceId?, userId? }
   *
   * Always 200 when the harness is enabled and the row was written — including
   * when Google refused the token. A decode failure is a RESULT to be recorded
   * and read, not an error to be retried into oblivion, and returning 4xx
   * would make the device's own log the only trace of it.
   */
  probe = asyncHandler(async (req, res) => {
    assertHarnessEnabled(req);

    const {
      integrityToken,
      packageName,
      platform,
      appVariant,
      label,
      deviceId,
      userId,
      nonce,
      clientError,
    } = req.body || {};

    const pkg = clean(packageName, 200);
    const sentNonce = clean(nonce, 200);

    // The device may report its own failure (no Play Services, Google refused
    // to mint a token). Recorded as the result rather than decoded, because
    // there is nothing to decode — and because a run of these is a finding.
    const result = clientError
      ? { ok: false, error: `client: ${clean(clientError, 900)}`, status: null }
      : await decodeIntegrityToken({ integrityToken, packageName: pkg });

    // NONCE BINDING. Google echoes the nonce inside the signed payload, so a
    // mismatch means the verdict belongs to some OTHER request — a token
    // captured earlier, or lifted from another device. The harness only
    // OBSERVES this; production must REFUSE on mismatch, which is the whole
    // mechanism that makes attestation better than a client-set header.
    const echoedNonce = result.ok ? result.summary.requestHash : null;
    const nonceMatches =
      sentNonce && echoedNonce ? sentNonce === echoedNonce : null;
    if (nonceMatches === false) {
      logger.warn(
        `[license-probe] NONCE MISMATCH — sent=${sentNonce} echoed=${echoedNonce}. ` +
          "In production this request would be refused.",
      );
    }

    // Google's own packageName is preferred over the client's claim — the
    // point of the exercise is to stop believing the client.
    const row = await prisma.licenseProbe.create({
      data: {
        label: clean(label),
        deviceId: clean(deviceId, 200),
        userId: clean(userId, 200),
        platform: clean(platform, 20) || "android",
        appVariant: clean(appVariant, 20),
        packageName: result.ok ? result.summary.packageName || pkg : pkg,
        appLicensingVerdict: result.ok ? result.summary.appLicensingVerdict : null,
        appRecognitionVerdict: result.ok
          ? result.summary.appRecognitionVerdict
          : null,
        deviceVerdicts: result.ok ? result.summary.deviceVerdicts : null,
        tokenTimestampMs: result.ok ? result.summary.tokenTimestampMs : null,
        requestHash: result.ok ? result.summary.requestHash : null,
        ok: result.ok,
        error: result.ok
          ? nonceMatches === false
            ? "decoded OK but NONCE MISMATCH"
            : null
          : clean(result.error, 1000),
        raw: result.ok ? result.payload : null,
      },
      select: {
        id: true,
        label: true,
        appLicensingVerdict: true,
        appRecognitionVerdict: true,
        deviceVerdicts: true,
        ok: true,
        error: true,
        createdAt: true,
      },
    });

    // Logged at info so the flip is visible in `docker logs` without a DB
    // query — the moment you most want to see it is while holding the phone.
    logger.info(
      `[license-probe] ${row.label || "(no label)"} device=${clean(deviceId, 40) || "?"} ` +
        `pkg=${pkg} ok=${result.ok} licensing=${row.appLicensingVerdict || "-"} ` +
        `recognition=${row.appRecognitionVerdict || "-"}${result.ok ? "" : ` error="${result.error}"`}`,
    );

    // nonceMatches is echoed so the DEVICE log shows the binding result too —
    // null means it could not be compared (no nonce sent, or nothing decoded).
    res.json({ success: true, data: { ...row, nonceMatches } });
  });

  /**
   * GET /api/v1/license/probe/timeline?deviceId=&limit=
   *
   * The experiment's readout: oldest-first, so the LICENSED -> UNLICENSED
   * transition reads top to bottom. `raw` is deliberately excluded — it is
   * large, and it is there for later forensics, not for this view.
   */
  timeline = asyncHandler(async (req, res) => {
    assertHarnessEnabled(req);

    const deviceId = clean(req.query.deviceId, 200);
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const rows = await prisma.licenseProbe.findMany({
      where: deviceId ? { deviceId } : {},
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        label: true,
        deviceId: true,
        platform: true,
        appVariant: true,
        packageName: true,
        appLicensingVerdict: true,
        appRecognitionVerdict: true,
        deviceVerdicts: true,
        tokenTimestampMs: true,
        ok: true,
        error: true,
      },
    });

    // The single number the experiment exists to produce: did it ever change?
    const verdicts = rows
      .filter((r) => r.ok && r.appLicensingVerdict)
      .map((r) => r.appLicensingVerdict);
    const distinct = [...new Set(verdicts)];

    res.json({
      success: true,
      data: {
        count: rows.length,
        distinctLicensingVerdicts: distinct,
        flipped: distinct.length > 1,
        rows,
      },
    });
  });
}

module.exports = new LicenseProbeController();
