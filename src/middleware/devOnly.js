const AppError = require("../utils/AppError");

/**
 * Hard-blocks an endpoint on production. Test/simulation routes that mutate
 * real subscription / flow-pack rows by email must never be reachable on the
 * live database — they are local/dev/staging tooling only.
 */
module.exports = function devOnly(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    return next(
      new AppError(
        "This endpoint is disabled in production",
        403,
        "FORBIDDEN_IN_PRODUCTION",
      ),
    );
  }
  next();
};
