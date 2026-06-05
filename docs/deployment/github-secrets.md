# GitHub, Netlify, Supabase Secrets

Set these values in the `agentops-ai205/agentops` GitHub repository before running a production release.

## GitHub Actions

- `NETLIFY_AUTH_TOKEN`: Netlify personal access token used only for web deploy.
- `NETLIFY_SITE_ID`: Netlify site id for `agentops.ai`.

The GitHub release workflow publishes Docker images to:

- `ghcr.io/agentops-ai205/agentops-api`
- `ghcr.io/agentops-ai205/agentops-web`

## API Host

The API host must receive these runtime secrets directly in its dashboard:

- `DATABASE_URL`: Supabase PostgreSQL connection string.
- `AGENTOPS_OPERATOR_TOKEN`: long random operator token, at least 32 characters.
- `AGENTOPS_ALLOWED_ORIGINS=https://agentops.ai,https://www.agentops.ai,https://agentops-ai205.netlify.app`
- `VITE_API_URL=https://api.agentops.ai` when building the web container.

## Supabase

Use project `elotpgbijlaqopcmdxac` and apply:

- `apps/api/migrations/0001_agentops.sql`
- `apps/api/migrations/0002_supabase_ready_tenancy.sql`

After the API is deployed, call `POST /v1/bootstrap` once with the operator token.
