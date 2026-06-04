# Production Deploy Runbook

Target accounts:

- GitHub: https://github.com/agentops-ai205
- Netlify: https://app.netlify.com/teams/agentops-ai205/projects
- Supabase: https://supabase.com/dashboard/org/dnrwrzfmznqmlrkvqsac

## Build Gates

Run before every deploy:

```bash
npm test -- --run
npm run build
docker build -f Dockerfile.api -t agentops-api:local .
docker build -f Dockerfile.web -t agentops-web:local .
```

## GitHub

Create the repository under `agentops-ai205`, push the monorepo, then enable GitHub Actions. The included workflow runs Rust tests, API tests, production builds, and Docker image builds.

## Supabase

Use the Supabase Postgres `DATABASE_URL`, apply migrations in order, then call `/v1/bootstrap` once from an operator context.

Required API variables:

- `DATABASE_URL`
- `AGENTOPS_DEFAULT_ORGANIZATION_ID`
- `AGENTOPS_OPERATOR_TOKEN`
- `AGENTOPS_ALLOWED_ORIGINS`
- `AGENTOPS_CORE_CLI_PATH=/app/bin/agentops`
- `AGENTOPS_POLICY_ENGINE=rust_core_strict`
- `AGENTOPS_SANDBOX_ENGINE=rust_core`

## Netlify

Use `netlify.toml`. Set:

- Build command: from `netlify.toml`
- Publish directory: `apps/web/dist`
- `VITE_API_URL`: deployed API URL

## Current Deployment Note

Netlify can deploy the web app directly. The API needs a container-capable host or a server runtime that can run the Node API plus the Rust `agentops` binary. Netlify Functions are not the right default for this API because the worker/sandbox model needs longer-lived execution.
