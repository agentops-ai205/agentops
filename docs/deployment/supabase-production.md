# Supabase Production Readiness

AgentOps uses PostgreSQL as the canonical system of record. Supabase can host the same schema through `DATABASE_URL`; migrations stay in `apps/api/migrations`.

## Required Environment

- `DATABASE_URL`: Supabase pooled or direct PostgreSQL URL. Netlify Functions must use `sslmode=require`.
- `AGENTOPS_DEFAULT_ORGANIZATION_ID`: default tenant boundary, usually `org.default` for single-tenant deployments.
- `AGENTOPS_POLICY_ENGINE=rust_core`
- `AGENTOPS_SANDBOX_ENGINE=rust_core`
- `AGENTOPS_CORE_CLI_PATH`: release path to the `agentops` Rust binary.

## Health Checks

- `/live`: process is alive, no database dependency.
- `/ready`: database and core runtime readiness.
- `/health`: compatibility alias for `/ready`.

## Tenancy Boundary

Every production data table now carries `organization_id`. Supabase RLS policies should use this column as the tenant boundary, mapped to a trusted auth claim such as `app_metadata.organization_id`.

Do not enable broad anonymous access. The API should connect with a server-side role; browser clients should go through the API unless a table has explicit read-only RLS policies.

`0003_supabase_rls.sql` enables Row Level Security and adds tenant-scoped policies for every operational table. The policy boundary is `public.agentops_current_organization_id()`, resolved from either:

- `app.current_organization_id`, for trusted server-side database sessions that explicitly set the tenant.
- Supabase JWT claims, preferably `app_metadata.organization_id`, for future direct Supabase-authenticated clients.

The production web app should still call the AgentOps API instead of using browser-side table access.

## Migration Order

1. Apply `0001_agentops.sql`.
2. Apply `0002_supabase_ready_tenancy.sql`.
3. Apply `0003_supabase_rls.sql`.
4. Run `/v1/bootstrap` once from a controlled operator context.

## Production Backup Posture

- Keep Supabase managed backups enabled.
- Export schema and data, or create a dashboard restore point, before destructive schema changes.
- Store every production schema change as a migration file under `apps/api/migrations`.
- Record release evidence after migration: migration list, `/api/health`, and RLS coverage.
