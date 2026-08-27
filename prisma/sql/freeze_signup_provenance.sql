-- ============================================================================
-- users_freeze_signup_provenance — make User.first{Platform,AppType,LoginType}
-- genuinely write-once.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE
--   `users` has five account-creation sites and is written by ~40 services.
--   "Never update these columns" enforced only by convention would survive
--   exactly until the next `prisma.user.update({ data: {...spread} })`. The
--   whole value of the columns is that they cannot be rewritten after the
--   fact, so the guarantee belongs where no code path can bypass it.
--
-- SEMANTICS
--   • NULL -> value        ALLOWED. This is the backfill direction, and the
--                          only way a pre-existing account can ever acquire
--                          provenance (from an attestation, or an admin who
--                          establishes it from store records).
--   • value -> same value  ALLOWED. A no-op UPDATE that happens to include the
--                          column — the common case for any code that spreads
--                          a previously-SELECTed row back into an update.
--   • value -> NULL        REJECTED.
--   • value -> other value REJECTED.
--
--   Rejection raises SQLSTATE 23514 (check_violation), which Prisma surfaces
--   as a normal query error, so an offending write fails loudly in tests
--   rather than silently corrupting an audit column.
--
-- IDEMPOTENT: safe to re-run on every deploy (CREATE OR REPLACE + DROP IF
-- EXISTS). Prisma does not manage triggers, so `prisma db push` neither
-- creates nor removes this — it is applied by scripts/server-deploy.sh on the
-- server, and by hand locally (see below).
--
-- LOCAL:
--   docker exec -i vc-postgres psql -U admin -d value_charts_db \
--     < backend/prisma/sql/freeze_signup_provenance.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION users_freeze_signup_provenance()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.first_platform IS NOT NULL
     AND NEW.first_platform IS DISTINCT FROM OLD.first_platform THEN
    RAISE EXCEPTION
      'first_platform is write-once (user %: % -> %)',
      OLD.id, OLD.first_platform, NEW.first_platform
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.first_app_type IS NOT NULL
     AND NEW.first_app_type IS DISTINCT FROM OLD.first_app_type THEN
    RAISE EXCEPTION
      'first_app_type is write-once (user %: % -> %)',
      OLD.id, OLD.first_app_type, NEW.first_app_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.first_login_type IS NOT NULL
     AND NEW.first_login_type IS DISTINCT FROM OLD.first_login_type THEN
    RAISE EXCEPTION
      'first_login_type is write-once (user %: % -> %)',
      OLD.id, OLD.first_login_type, NEW.first_login_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_freeze_signup_provenance ON users;

-- Column-scoped: the trigger body only runs when one of the three columns is
-- actually present in the UPDATE, so the ~40 services that update unrelated
-- columns pay nothing for it.
CREATE TRIGGER users_freeze_signup_provenance
  BEFORE UPDATE OF first_platform, first_app_type, first_login_type ON users
  FOR EACH ROW
  EXECUTE FUNCTION users_freeze_signup_provenance();
