# GitHub, Netlify, Supabase Secrets

Set these values in the `agentops-ai205/agentops` GitHub repository before running a production release.

## GitHub Actions

- `NETLIFY_AUTH_TOKEN`: Netlify personal access token used only for web deploy.
- `NETLIFY_SITE_ID`: Netlify site id for `capable-cat-f6133c`.
- `PRODUCTION_DATABASE_URL`: Supabase PostgreSQL connection string for release-time migrations.
- `AGENTOPS_OPERATOR_TOKEN`: same operator token configured in Netlify/API runtime; used for release bootstrap and authenticated smoke checks.

Desktop signing secrets are required only for public signed installers:

- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The GitHub release workflow publishes Docker images to:

- `ghcr.io/agentops-ai205/agentops-api`
- `ghcr.io/agentops-ai205/agentops-web`

Desktop workflow outputs:

- macOS and Windows bundles are uploaded as workflow artifacts on branch builds.
- tag builds attach bundles to a draft GitHub release. Keep the release draft until signing/notarization is confirmed.

## API Host

The API host must receive these runtime secrets directly in its dashboard:

- `DATABASE_URL`: Supabase PostgreSQL connection string.
- `AGENTOPS_OPERATOR_TOKEN`: long random operator token, at least 32 characters.
- `AGENTOPS_ALLOWED_ORIGINS=https://capable-cat-f6133c.netlify.app,https://agentops.ai,https://www.agentops.ai`
- `VITE_API_URL=https://capable-cat-f6133c.netlify.app/api` now, then `https://api.agentops.ai` after the API domain is live.

## Supabase

Use project `elotpgbijlaqopcmdxac` and apply:

- `apps/api/migrations/0001_agentops.sql`
- `apps/api/migrations/0002_supabase_ready_tenancy.sql`
- `apps/api/migrations/0003_supabase_rls.sql`

After the API is deployed, call `POST /v1/bootstrap` once with the operator token.
