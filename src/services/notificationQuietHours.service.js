const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const DEFAULTS = { enabled: false, startHour: 22, endHour: 8, timezone: "UTC" };

async function getQuietHours(userId) {
  const row = await prisma.notificationQuietHours.findUnique({
    where: { userId },
    select: { enabled: true, startHour: true, endHour: true, timezone: true },
  });
  return row || { ...DEFAULTS };
}

function validateHour(value, label) {
  if (
    value !== undefined &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 23)
  ) {
    throw new AppError(
      `${label} must be an integer 0-23`,
      400,
      "VALIDATION_ERROR",
    );
  }
}

async function setQuietHours(
  userId,
  { enabled, startHour, endHour, timezone },
) {
  validateHour(startHour, "startHour");
  validateHour(endHour, "endHour");
  if (timezone !== undefined) {
    try {
      // Throws RangeError for an invalid IANA zone — cheapest validation available.
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new AppError(
        `"${timezone}" is not a valid timezone`,
        400,
        "VALIDATION_ERROR",
      );
    }
  }

  const data = {};
  if (typeof enabled === "boolean") data.enabled = enabled;
  if (typeof startHour === "number") data.startHour = startHour;
  if (typeof endHour === "number") data.endHour = endHour;
  if (typeof timezone === "string") data.timezone = timezone;

  return prisma.notificationQuietHours.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS, ...data },
    update: data,
  });
}

/**
 * Compute the user's current local hour (0-23) in their declared timezone
 * and check it against their quiet-hours window, handling the overnight
 * wraparound case (e.g. startHour=22, endHour=8 spans midnight).
 *
 * Fail-open: any error (bad timezone, DB error, etc.) returns false — a
 * broken quiet-hours check must never silently suppress a real notification.
 */
async function isInQuietHours(userId) {
  try {
    const { enabled, startHour, endHour, timezone } =
      await getQuietHours(userId);
    if (!enabled) return false;

    const localHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(new Date()),
    );
    // Intl can format midnight as "24" depending on locale/runtime — normalise.
    const hour = localHour === 24 ? 0 : localHour;

    if (startHour === endHour) return false; // zero-width window = never quiet
    if (startHour < endHour) {
      // Same-day window, e.g. 9-17.
      return hour >= startHour && hour < endHour;
    }
    // Overnight window, e.g. 22-8 (wraps past midnight).
    return hour >= startHour || hour < endHour;
  } catch (err) {
    logger.warn(
      `[notificationQuietHours] isInQuietHours failed, failing open: ${err.message}`,
    );
    return false;
  }
}

module.exports = { getQuietHours, setQuietHours, isInQuietHours };
