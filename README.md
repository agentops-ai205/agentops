# AgentOps OS

AgentOps OS est une plateforme fullstack pour piloter des operations IA critiques sous supervision humaine: agents, modeles, outils, workflows, web app, IDE, preuves et audit. Elle transforme une intention humaine en mission structuree, controlee par policies, approvals, evidence, evaluation et memoire projet.

## Stack

- Web: React, TypeScript, Vite
- Desktop installable: PWA standalone (`agentops.ai`) avec le meme cockpit et IDE
- API: Fastify, TypeScript
- DB canonique: PostgreSQL via `DATABASE_URL`
- Persistence projet: noyau `.agentops` en YAML, JSON, JSONL et Markdown
- Core systeme: Rust, avec CLI `agentops`
- IDE integre: agent runner, terminal sandboxe, patch proposals, evidence capture
- Deploy: Docker Compose, compatible local ou cloud PostgreSQL

## Lancer en local

1. Copier `.env.example` vers `.env` si besoin.
2. Demarrer PostgreSQL:

```bash
docker compose up -d postgres
```

3. Installer et lancer:

```bash
npm install
npm run db:migrate
npm run dev
```

L'API ecoute `http://127.0.0.1:3000` et le cockpit web `http://127.0.0.1:5173`.

## Deploy

Le compose complet lance PostgreSQL, API et web:

```bash
docker compose up --build
```

Pour un cloud DB, garder les services `api` et `web`, puis remplacer `DATABASE_URL` par l'URL PostgreSQL fournie par Supabase, Neon, Railway, Render, RDS ou autre.

Le deploiement production conteneurise est prepare dans `deploy/docker-compose.production.yml`. Il attend `deploy/production.env`, cree depuis `deploy/production.env.example`, et peut exposer l'API sur `api.agentops.ai`.

La release GitHub est preparee dans `.github/workflows/release.yml`. Elle verifie le projet, publie les images Docker sur GHCR, puis deploie Netlify si `NETLIFY_AUTH_TOKEN` et `NETLIFY_SITE_ID` sont disponibles. Les secrets attendus sont listes dans `docs/deployment/github-secrets.md`.

## Architecture production

La phase 1 de transformation production est documentee dans:

- `docs/architecture/production-architecture.md`: architecture cible du control plane AgentOps.
- `docs/architecture/component-contracts.md`: contrats techniques entre agents, modeles, tools, sandbox, evidence et audit.
- `docs/architecture/production-readiness-checklist.md`: checklist objective avant de parler de deploiement production.
- `docs/roadmap/production-transformation-plan.md`: plan de transformation du prototype actuel vers une plateforme production scalable.
- `docs/adr/0001-agentops-control-plane.md`: decision d'architecture centrale: AgentOps reste un control plane model-agnostic.

## Noyau .agentops

Le dossier `.agentops` est la constitution portable du projet:

- `agentops.yml`: constitution technique
- `policies/`: autonomie, approvals, security, data
- `agents/`: roles logiques des agents
- `workflows/`: feature, bugfix, refactor, migration, self-improve
- `evals/`: qualite, securite, performance, regression, acceptance humaine
- `memory/`: projet, decisions, lessons, patterns, incidents
- `audit/`: logs append-only
- `reports/`: rapports de missions et propositions d'amelioration

## API principale

- `POST /v1/projects`
- `GET /v1/projects/:projectId`
- `POST /v1/projects/:projectId/missions`
- `GET /v1/missions/:missionId`
- `POST /v1/missions/:missionId/plan`
- `POST /v1/missions/:missionId/approve`
- `POST /v1/missions/:missionId/execute`
- `POST /v1/missions/:missionId/evaluate`
- `POST /v1/missions/:missionId/close`
- `GET /v1/agents`
- `GET /v1/tools`
- `GET /v1/model-providers`
- `GET /v1/jobs`
- `POST /v1/jobs`
- `POST /v1/missions/:missionId/agents/run`
- `GET /v1/policies/evaluate`
- `POST /v1/policies/evaluate`
- `POST /v1/evidence`
- `POST /v1/missions/:missionId/patches/propose`
- `POST /v1/patches/:patchId/apply`
- `GET /v1/audit`
- `POST /v1/improvements/propose`
- `POST /v1/improvements/:id/approve`
- `POST /v1/improvements/:id/apply`

## Doctrine

AgentOps OS n'est pas un agent. C'est le control plane qui rend les agents, modeles et outils utiles, mesurables, auditables, gouvernes et ameliorables.
