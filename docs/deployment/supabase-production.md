# Supabase Production Readiness

AgentOps uses PostgreSQL as the canonical system of record. Supabase can host the same schema through `DATABASE_URL`; migrations stay in `apps/api/migrations`.

## Required Environment

- `DATABASE_URL`: Supabase pooled or direct PostgreSQL URL.
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

## Migration Order

1. Apply `0001_agentops.sql`.
2. Apply `0002_supabase_ready_tenancy.sql`.
3. Run `/v1/bootstrap` once from a controlled operator context.

## Current Limitation

RLS is schema-ready but not enabled by default in migrations. That is intentional until the final Supabase auth model is chosen, because enabling RLS without exact policies can break the API at deploy time.
