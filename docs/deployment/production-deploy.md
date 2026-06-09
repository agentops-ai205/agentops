# Production Deploy Runbook

Target accounts:

- GitHub: https://github.com/agentops-ai205
- Netlify: https://app.netlify.com/projects/agentops-ai205/overview
- Supabase: https://supabase.com/dashboard/project/elotpgbijlaqopcmdxac

Target public surface:

- Web now: `https://capable-cat-f6133c.netlify.app`
- API now: `https://capable-cat-f6133c.netlify.app/api`
- Future custom domain: `https://agentops.ai`
- Future API domain: `https://api.agentops.ai`

## Build Gates

Run before every deploy:

```bash
npm test
npm run build
npm run preflight:prod -- --env deploy/production.env.example --allow-placeholders
docker build -f Dockerfile.api -t agentops-api:local .
docker build -f Dockerfile.web -t agentops-web:local .
```

## GitHub

The repository is `agentops-ai205/agentops`. The default branch is `codex/agentops-v3-production`; keep production changes flowing through that branch. The included workflow runs Rust tests, API tests, production builds, and Docker image builds.

Repository URL:

- `https://github.com/agentops-ai205/agentops`

Production release workflow:

- `.github/workflows/release.yml`
- Publishes `ghcr.io/agentops-ai205/agentops-api`
- Publishes `ghcr.io/agentops-ai205/agentops-web`
- Applies Supabase migrations when `PRODUCTION_DATABASE_URL` exists.
- Deploys the web app to Netlify when `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` exist.
- Bootstraps the control plane when `AGENTOPS_OPERATOR_TOKEN` exists.
- Runs smoke checks against `https://capable-cat-f6133c.netlify.app` and `/api`.

Continuous integration:

- `.github/workflows/ci.yml` validates tests, build, preflight, dependency audit and Docker image builds on `codex/agentops-v3-production`.
- `.github/workflows/desktop.yml` builds macOS and Windows desktop bundles on branch pushes, pull requests, manual dispatch and release tags.

Desktop release workflow:

- Tag a release with `vX.Y.Z`.
- GitHub builds macOS and Windows bundles from the shared React UI and Tauri runtime.
- Bundles are attached to a draft GitHub Release for signing/notarization review.

Required GitHub/Netlify/API secrets are listed in `docs/deployment/github-secrets.md`.

Day-two operations, incident response and release evidence are tracked in `docs/deployment/production-operations.md`.

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
- `VITE_API_URL=https://capable-cat-f6133c.netlify.app/api` until `api.agentops.ai` is live.

`netlify.toml` already pins `VITE_API_URL=https://capable-cat-f6133c.netlify.app/api` so a Netlify deploy cannot accidentally ship a frontend pointing at `127.0.0.1`.

Custom domain:

1. Add `agentops.ai` and `www.agentops.ai` to the Netlify site.
2. Point DNS for `agentops.ai` to Netlify as instructed by Netlify.
3. Keep `capable-cat-f6133c.netlify.app` as the temporary production URL until the custom domain is attached.
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

DNS for the API should map `api.agentops.ai` to the chosen API host. After the API domain is live, set Netlify `VITE_API_URL=https://api.agentops.ai` and rebuild the web app.

For a generic Docker host:

```bash
cp deploy/production.env.example deploy/production.env
# Fill DATABASE_URL and AGENTOPS_OPERATOR_TOKEN in deploy/production.env.
npm run prod:migrate -- --env deploy/production.env
docker compose -f deploy/docker-compose.production.yml up -d --build api
npm run prod:bootstrap -- --env deploy/production.env --api https://api.agentops.ai
npm run prod:smoke -- --api https://api.agentops.ai --web https://agentops.ai --require-rust-core
```

To run the web container outside Netlify as a fallback:

```bash
docker compose -f deploy/docker-compose.production.yml --profile web up -d --build
```

## Current Deployment Note

Netlify now exposes the transactional API through `/api/*` for the web cockpit, missions, approvals, evidence, policy checks and audit backed by Supabase. The long-running worker/sandbox path should still move to a container-capable host before higher-autonomy code execution is exposed publicly.
