-- Create (or update) the non-owner database role the app uses when Row-Level Security is on.
-- Safe to run many times. Changes no data and no table structure.
--
-- Why: PostgreSQL skips RLS policies for the table owner and for superusers. The app today
-- connects as the owner (p7erp), so the policies from migration 270 are not enforced. A role
-- that only has SELECT/INSERT/UPDATE/DELETE is subject to them.
--
-- Run as the owner / superuser, inside the postgres container (PowerShell, from repo root):
--   Get-Content backend/scripts/create_rls_app_role.sql | docker compose exec -T postgres `
--     psql -U p7erp -d p7erp -v app_role=p7erp_app -v app_password='<strong-password>' -v owner_role=p7erp
-- Bash:
--   docker compose exec -T postgres psql -U p7erp -d p7erp -v app_role=p7erp_app \
--     -v app_password='<strong-password>' -v owner_role=p7erp < backend/scripts/create_rls_app_role.sql
--
-- Variables: app_role (default p7erp_app), app_password (required), owner_role (default: the
-- user running the script; must be the role that owns the tables / runs alembic).
-- Then set DATABASE_URL_APP=postgresql://<app_role>:<password>@postgres:5432/<db> (see RLS_RUNBOOK.md).
-- Remove the role again: see "Rollback" in docs/erp-modernization/RLS_RUNBOOK.md.

\set ON_ERROR_STOP on

\if :{?app_role}
\else
  \set app_role p7erp_app
\endif
\if :{?owner_role}
\else
  SELECT current_user AS owner_role \gset
\endif
\if :{?app_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'pass -v app_password=... (the password for the app role)'; END $$;
\endif

-- 1. The role: can log in, nothing else. NOBYPASSRLS is the important part.
SELECT format('CREATE ROLE %I LOGIN', :'app_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_role', :'app_password'
) \gexec

-- 2. Access to this database and schema (no CREATE: migrations stay with the owner).
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', current_database(), :'app_role') \gexec
GRANT USAGE ON SCHEMA public TO :"app_role";

-- 3. Data access on every existing table / sequence / function.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO :"app_role";

-- The app reads the migration version but must never change it.
REVOKE INSERT, UPDATE, DELETE ON TABLE alembic_version FROM :"app_role";

-- 4. Tables / sequences that future migrations create (as owner_role) get the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO :"app_role";

-- 5. Show the result.
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = :'app_role';
