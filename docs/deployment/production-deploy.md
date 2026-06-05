# Production Deploy Runbook

Target accounts:

- GitHub: https://github.com/agentops-ai205
- Netlify: https://app.netlify.com/projects/agentops-ai205/overview
- Supabase: https://supabase.com/dashboard/project/elotpgbijlaqopcmdxac

Target public surface:

- Web: `https://agentops.ai`
- API: `https://api.agentops.ai`
- Temporary web preview: `https://agentops-ai205.netlify.app`

## Build Gates

Run before every deploy:

```bash
npm test -- --run
npm run build
npm run preflight:prod
docker build -f Dockerfile.api -t agentops-api:local .
docker build -f Dockerfile.web -t agentops-web:local .
```

## GitHub

Create the repository under `agentops-ai205`, push the monorepo, then enable GitHub Actions. The included workflow runs Rust tests, API tests, production builds, and Docker image builds.

Repository URL:

- `https://github.com/agentops-ai205/agentops`

Production release workflow:

- `.github/workflows/release.yml`
- Publishes `ghcr.io/agentops-ai205/agentops-api`
- Publishes `ghcr.io/agentops-ai205/agentops-web`
- Deploys the web app to Netlify when `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` exist.

Required GitHub/Netlify/API secrets are listed in `docs/deployment/github-secrets.md`.

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

Production startup now fails intentionally when `NODE_ENV=production` is missing either `AGENTOPS_OPERATOR_TOKEN` or `AGENTOPS_ALLOWED_ORIGINS`. This prevents a public unauthenticated API.

## Netlify

Use `netlify.toml`. Set:

- Build command: from `netlify.toml`
- Publish directory: `apps/web/dist`
- `VITE_API_URL=https://api.agentops.ai`

`netlify.toml` already pins `VITE_API_URL=https://api.agentops.ai` so a Netlify deploy cannot accidentally ship a frontend pointing at `127.0.0.1`.

Custom domain:

1. Add `agentops.ai` and `www.agentops.ai` to the Netlify site.
2. Point DNS for `agentops.ai` to Netlify as instructed by Netlify.
3. Keep `agentops-ai205.netlify.app` as a temporary preview URL only.
4. Do not present the Netlify preview URL as the product URL.

## API Container

Deploy `Dockerfile.api` on a container-capable host. Required capabilities:

- Runs a long-lived Node API process.
- Allows outbound PostgreSQL traffic to Supabase.
- Preserves the bundled Rust binary at `/app/bin/agentops`.
- Exposes `/live`, `/ready`, and `/health`.
- Supports secret environment variables.

Use `deploy/production.env.example` as the variable checklist. The real secrets must live in the host dashboard, not in the repo.

Before changing DNS or publishing a production API, run:

```bash
npm run preflight:prod
```

To validate only the committed template:

```bash
npm run preflight:prod -- --env deploy/production.env.example --allow-placeholders
```

DNS for the API should map `api.agentops.ai` to the chosen API host. After the API is live, set Netlify `VITE_API_URL=https://api.agentops.ai` and rebuild the web app.

For a generic Docker host:

```bash
cp deploy/production.env.example deploy/production.env
# Fill DATABASE_URL and AGENTOPS_OPERATOR_TOKEN in deploy/production.env.
docker compose -f deploy/docker-compose.production.yml up -d --build api
```

To run the web container outside Netlify as a fallback:

```bash
docker compose -f deploy/docker-compose.production.yml --profile web up -d --build
```

## Current Deployment Note

Netlify can deploy the web app directly. The API needs a container-capable host or a server runtime that can run the Node API plus the Rust `agentops` binary. Netlify Functions are not the right default for this API because the worker/sandbox model needs longer-lived execution.
