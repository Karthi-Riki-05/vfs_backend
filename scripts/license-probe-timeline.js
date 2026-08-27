#!/usr/bin/env node
"use strict";

/**
 * Read the license-probe timeline straight from the DB and print the answer.
 *
 * TEMPORARY — delete with the rest of the paid-app refund experiment.
 *
 * Reads the database directly rather than the HTTP endpoint so it works from
 * the server shell with no token and no exposed route:
 *
 *   docker exec vc-backend node scripts/license-probe-timeline.js
 *   docker exec vc-backend node scripts/license-probe-timeline.js --device <id>
 *   docker exec vc-backend node scripts/license-probe-timeline.js --raw <probeId>
 *
 * Read-only. It cannot change an entitlement, and it cannot change a probe.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] || null;
}

function pad(s, n) {
  return String(s ?? "-").padEnd(n).slice(0, n);
}

async function main() {
  const rawId = arg("--raw");
  if (rawId) {
    const row = await prisma.licenseProbe.findUnique({ where: { id: rawId } });
    if (!row) {
      console.log(`No probe with id ${rawId}`);
      return;
    }
    console.log(JSON.stringify(row, null, 2));
    return;
  }

  const deviceId = arg("--device");
  const rows = await prisma.licenseProbe.findMany({
    where: deviceId ? { deviceId } : {},
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  if (rows.length === 0) {
    console.log(
      "No probes recorded.\n\n" +
        "If the device ran and you expected rows: check that LICENSE_PROBE_TOKEN\n" +
        "is set on the BACKEND and matches the one compiled into the app — a\n" +
        "mismatch answers 503 and the device logs it but records nothing.",
    );
    return;
  }

  console.log(
    `\n${pad("WHEN (UTC)", 20)}${pad("LABEL", 18)}${pad("LICENSING", 13)}` +
      `${pad("RECOGNITION", 22)}${pad("OK", 4)}NOTE`,
  );
  console.log("-".repeat(110));

  for (const r of rows) {
    console.log(
      pad(r.createdAt.toISOString().replace("T", " ").slice(0, 19), 20) +
        pad(r.label, 18) +
        pad(r.appLicensingVerdict, 13) +
        pad(r.appRecognitionVerdict, 22) +
        pad(r.ok ? "yes" : "NO", 4) +
        (r.error ? r.error.slice(0, 60) : ""),
    );
  }

  // ── The answer ──────────────────────────────────────────────────────────
  // Only SUCCESSFUL probes count. A 403 from Google is a provisioning fault,
  // not evidence of a licensing change, and counting it would manufacture a
  // "flip" out of a misconfiguration.
  const good = rows.filter((r) => r.ok && r.appLicensingVerdict);
  const distinct = [...new Set(good.map((r) => r.appLicensingVerdict))];
  const failed = rows.length - good.length;

  console.log("\n" + "=".repeat(110));
  console.log(`probes: ${rows.length}   usable: ${good.length}   failed: ${failed}`);
  console.log(`distinct licensing verdicts: ${distinct.join(", ") || "(none)"}`);

  if (good.length === 0) {
    console.log(
      "\nVERDICT: INCONCLUSIVE — no probe decoded successfully.\n" +
        "Every row failed, so nothing was measured. Fix the provisioning first\n" +
        "(Play Integrity API enabled, Play Console app-integrity linked,\n" +
        "service account scoped) — see services/playIntegrity.service.js.",
    );
  } else if (distinct.length > 1) {
    const first = good.find((r) => r.appLicensingVerdict !== good[0].appLicensingVerdict);
    console.log(
      `\nVERDICT: FLIPPED. ${good[0].appLicensingVerdict} -> ${first.appLicensingVerdict}` +
        `\nfirst change at ${first.createdAt.toISOString()} (label "${first.label || "-"}")` +
        "\n\nappLicensingVerdict DOES react to the refund. The 14-day lease\n" +
        "architecture is viable on Android. Measure the latency from the\n" +
        "timestamps above before choosing the lease length.",
    );
  } else if (distinct[0] === "UNLICENSED") {
    console.log(
      "\nVERDICT: INVALID EXPERIMENT — UNLICENSED throughout.\n" +
        "This is what a SIDELOADED build reports from the very first probe,\n" +
        "refund or not. Reinstall from Google Play and run it again; as it\n" +
        "stands the result shows nothing about refunds.",
    );
  } else {
    console.log(
      "\nVERDICT: NO FLIP (so far). LICENSED throughout.\n" +
        "Either the refund has not propagated yet — keep probing, Google gives\n" +
        "no latency guarantee — or appLicensingVerdict does not react to a\n" +
        "paid-app refund at all. If it is still LICENSED well past the refund,\n" +
        "the 14-day lease architecture CANNOT enforce refunds on Android, and\n" +
        "the attestation work is worth doing for anti-spoofing only.",
    );
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
