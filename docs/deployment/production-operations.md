# AgentOps Production Operations

Last verified: 2026-06-09

## Current Production

- GitHub source of truth: `agentops-ai205/agentops`, default branch `codex/agentops-v3-production`.
- Netlify site: `capable-cat-f6133c`.
- Web URL: `https://capable-cat-f6133c.netlify.app`.
- API URL: `https://capable-cat-f6133c.netlify.app/api`.
- Supabase project ref: `elotpgbijlaqopcmdxac`.

## Required Green Checks

Run after every production deploy:

```bash
npm run prod:smoke -- --api https://capable-cat-f6133c.netlify.app/api --web https://capable-cat-f6133c.netlify.app
```

Run after every container API deploy:

```bash
npm run prod:smoke -- --api https://api.agentops.ai --web https://agentops.ai --require-rust-core
```

Manual API checks:

- `GET /api/live` must return `ok: true`.
- `GET /api/health` must return `ok: true` and `checks.database: true`.
- `GET /api/ready` is retried by release smoke tests. On Netlify Functions it is advisory unless `--require-rust-core` is set.
- `checks.policy_engine` and `checks.sandbox_engine` are expected to be `typescript` on Netlify Functions until the containerized Rust worker path is live.
- On the API container, `checks.rust_core` must be `true` and readiness must fail if `rust_core_strict` is configured without the Rust binary.

Manual UI checks:

- The page title is `AgentOps OS`.
- The cockpit shows `Desktop IDE`, `Patch Review`, `Audit Ledger`, `Evidence`, and `SANDBOX JOBS`.
- Old v1/v2 surfaces must not appear on the production URL.

## Netlify Guardrails

Netlify production deploys must use:

- Production branch: `codex/agentops-v3-production`.
- Build command from `netlify.toml`.
- Publish directory: `apps/web/dist`.
- `DATABASE_URL` as a secret value with `sslmode=require`.
- `AGENTOPS_OPERATOR_TOKEN` as a secret value.
- `AGENTOPS_ALLOWED_ORIGINS=https://capable-cat-f6133c.netlify.app`.
- `VITE_API_URL=https://capable-cat-f6133c.netlify.app/api`.

If the custom domain is attached later, add the custom origin without removing the Netlify origin until smoke tests pass on the domain.

## Supabase Guardrails

Supabase must have all migrations applied:

1. `0001_agentops.sql`
2. `0002_supabase_ready_tenancy.sql`
3. `0003_supabase_rls.sql`

Operational checks:

- Row Level Security enabled on every operational table.
- At least one policy on every RLS-protected table.
- Pooler URL includes `sslmode=require` in Netlify.
- The database password is stored only in hosting secret managers.

Backup posture:

- Use Supabase managed backups for the project.
- Before destructive schema changes, export schema and data from Supabase or create a restore point in the dashboard.
- Never run manual SQL changes in production without recording the migration file and evidence in AgentOps.

## Incident Response

If the web UI loads but API fails:

1. Check `https://capable-cat-f6133c.netlify.app/api/live`.
2. Check `https://capable-cat-f6133c.netlify.app/api/health`.
3. Inspect Netlify Function logs for missing env vars or database connection errors.
4. Verify `DATABASE_URL` is still scoped to Functions and Production.

If `database:false`:

1. Confirm Supabase project is healthy.
2. Confirm `DATABASE_URL` contains the current database password.
3. Confirm the URL ends with `sslmode=require`.
4. Redeploy Netlify without cache after changing any secret.

If the old UI appears:

1. Confirm Netlify production branch is `codex/agentops-v3-production`.
2. Trigger deploy without cache.
3. Confirm GitHub default branch is still `codex/agentops-v3-production`.

## Release Evidence

For each production release, capture:

- Git commit SHA.
- Netlify deploy ID.
- `/api/live` response.
- `/api/health` response.
- UI smoke markers.
- Migration list applied to Supabase.
