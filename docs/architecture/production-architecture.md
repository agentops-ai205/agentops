# AgentOps OS - Architecture Cible Production

## Objectif

AgentOps OS est un control plane pour operations IA critiques: agents, modeles, outils, workflows, web app, IDE, preuves et audit. Le produit ne doit pas dependre d'un modele unique, d'un fournisseur unique ou d'un agent autonome non controle. Sa valeur centrale est de transformer une intention humaine en mission tracable, autorisee, executee dans des limites explicites, prouvee, evaluee et auditee.

Le systeme doit conserver trois modes:

- Sans IA active: cockpit de controle, policies, approvals, evidence, audit et evaluation manuelle.
- IA via API fermee: OpenAI, Anthropic, Google ou autre fournisseur compatible.
- IA open source locale ou privee: modeles servis localement ou dans un cloud controle.

Le modele IA propose. AgentOps autorise, trace, isole, verifie et demande approbation quand le risque l'exige.

## Principes non negociables

- Model-agnostic: aucun composant coeur ne depend directement d'un fournisseur IA.
- Human-gated: les actions sensibles exigent une approbation explicite.
- Tool-gated: un agent ne peut utiliser que des outils declares dans le registre.
- Patch-first: un agent propose un patch; il ne modifie pas librement les fichiers.
- Evidence-first: chaque action importante produit une preuve verifiable.
- Audit-first: chaque decision, blocage, approval, execution et evaluation est journalise.
- Sandbox-first: les commandes et operations fichier sont executees dans un environnement controle.
- Least privilege: droits par role agent, projet, mission, outil et niveau d'autonomie.
- No blind trust: ni modele open source ni modele ferme ne sont consideres fiables par defaut.

## Vue d'ensemble

```text
User / Operator
  -> Web Cockpit
  -> API Control Plane
      -> Mission Service
      -> Policy Engine
      -> Approval Service
      -> Agent Orchestrator
          -> Agent Runner
          -> Model Router
              -> OpenAI Adapter
              -> Anthropic Adapter
              -> Local Model Adapter
              -> Null/Manual Adapter
          -> Tool Registry
          -> Sandbox Executor
      -> Evidence Service
      -> Evaluation Service
      -> Memory Service
      -> Audit Ledger
      -> Job Queue
  -> PostgreSQL
  -> Object Storage
  -> Observability Stack
```

## Composants cibles

### 1. Web Cockpit

Interface operationnelle pour humains responsables.

Fonctions obligatoires:

- Vue projets, missions, agents, risques et statuts.
- Creation de missions structurees.
- Timeline de mission.
- Validation humaine avec scope, expiration et justification.
- Inspection des policies appliquees.
- Consultation des preuves, hashes et logs.
- Comparaison plan / patch / execution / evaluation.
- Pilotage des providers IA autorises.
- Gestion RBAC: owner, reviewer, security, operator, auditor.
- Mode read-only audit.

Le cockpit doit eviter l'effet demo. Il doit etre utile pour operer un systeme reel.

### 2. API Control Plane

Backend canonique du produit.

Responsabilites:

- Exposer les endpoints publics et internes.
- Valider tous les inputs.
- Appliquer la machine d'etat.
- Orchestrer approvals, policies, agents, jobs et evidence.
- Normaliser erreurs et evenements.
- Garantir l'idempotence des actions critiques.
- Fournir healthchecks, readiness checks et metriques.

L'API ne doit pas executer directement des taches longues. Elle doit creer des jobs.

### 3. Mission Service

Source de verite des missions.

Cycle cible:

```text
DRAFT
  -> PLANNED
  -> WAITING_APPROVAL
  -> APPROVED
  -> IN_PROGRESS
  -> TESTING
  -> SECURITY_REVIEW
  -> HUMAN_REVIEW
  -> READY_TO_MERGE
  -> MERGED
  -> LEARNING_CAPTURED
  -> CLOSED
```

Branches:

- BLOCKED
- CANCELLED
- REVISION_REQUIRED
- FAILED_TESTS
- RISK_REJECTED
- ROLLED_BACK

Chaque transition doit etre verifiee par le service, pas seulement par l'interface.

### 4. Policy Engine

Moteur deterministe de decision.

Inputs:

- Projet.
- Mission.
- Agent role.
- Niveau d'autonomie.
- Action demandee.
- Fichiers touches.
- Commande demandee.
- Donnees sensibles detectees.
- Provider modele.
- Contexte d'execution.

Decisions:

- allow
- deny
- require_approval
- require_sandbox
- require_review
- require_more_context

Le moteur policy doit etre versionne. Une mission doit enregistrer quelle version de policy a ete appliquee.

### 5. Approval Service

Service de validation humaine.

Exigences:

- Approval liee a un scope precis.
- Role approver verifie.
- Expiration possible.
- Justification obligatoire pour actions sensibles.
- Decision non reutilisable hors scope.
- Rejection explicite tracable.
- Double approval pour self-improvement, production et security.

### 6. Agent Orchestrator

Coordinateur des agents.

Il ne doit pas etre un agent lui-meme. Il choisit quel agent runner appeler, cree les jobs, transmet le contexte autorise et applique les gates.

Agents cibles:

- planner: transforme intention en mission et plan.
- architect: analyse impacts, dependances, risques et options.
- coder: propose patchs limites au scope.
- tester: selectionne et lance verifications autorisees.
- security: inspecte risques, secrets, auth, supply chain.
- reviewer: juge qualite, coherence et maintenabilite.
- documenter: produit docs et changelog.
- metadev: propose ameliorations du systeme AgentOps.
- release: prepare livraison apres gates.

### 7. Agent Runner

Execution controlee d'un agent.

Un runner recoit:

- Mission.
- Role.
- Contexte reduit.
- Policies applicables.
- Outils autorises.
- Budget de tokens/cout.
- Timeout.

Un runner retourne:

- Thought-free result: pas de chaine de pensee brute.
- Plan ou patch.
- Tool calls demandes.
- Evidence candidate.
- Risques observes.
- Recommandation de prochain statut.

### 8. Model Router et Providers

Interface unique pour tous les modeles.

Providers cibles:

- null/manual: aucun modele, mode controle pur.
- openai: API OpenAI.
- anthropic: API Anthropic.
- google: API Gemini.
- local_http: modele open source expose via HTTP.
- ollama/vllm-compatible: option locale ou privee.

Le router choisit selon:

- role agent.
- classification de risque.
- cout maximal.
- confidentialite.
- latence.
- disponibilite.
- preference projet.

Les providers ne doivent jamais recevoir des secrets bruts ou des fichiers hors scope.

### 9. Tool Registry

Catalogue des outils disponibles pour agents.

Categories:

- read_file
- search_code
- propose_patch
- run_command
- run_tests
- create_evidence
- evaluate_policy
- request_approval
- write_memory

Chaque outil a:

- input schema.
- output schema.
- niveau de risque.
- policies applicables.
- roles autorises.
- sandbox requirements.
- audit event type.

### 10. Sandbox Executor

Execution isolee des commandes et patchs.

Exigences minimum production:

- Repertoire de travail separe par mission.
- Command allowlist.
- Timeout dur.
- Limite output.
- Variables d'environnement filtrees.
- Reseau off par defaut.
- Secrets non injectes par defaut.
- Quotas CPU/memoire si possible.
- Artifacts captures.
- Exit code et logs hashes.

Exigences avancees:

- Isolation conteneur.
- Filesystem read/write scope.
- Diff preview avant application.
- Execution non-root.
- Policies egress reseau.
- Reproductibilite des runs.

### 11. Evidence Service

Gestion des preuves.

Types:

- plan
- patch
- command_output
- test_result
- build_result
- review
- security_review
- approval
- deployment
- rollback
- memory_capture

Chaque preuve doit avoir:

- id stable.
- mission_id.
- type.
- contenu ou artifact reference.
- hash.
- auteur ou agent_id.
- timestamp.
- metadata.
- source.

Les gros artifacts doivent aller dans un object storage, pas en texte long dans PostgreSQL.

### 12. Audit Ledger

Journal d'audit robuste.

Etat actuel acceptable pour prototype: DB + JSONL.

Cible production:

- Append-only logique.
- Hash chain par projet ou mission.
- Evenements schemas.
- Actor explicite.
- Correlation id.
- Request id.
- Previous event hash.
- Event hash.
- Export audit.
- Retention configurable.

Objectif: rendre les manipulations visibles, pas promettre une immutabilite magique si l'infra est compromise.

### 13. Evaluation Service

Evaluation de mission avant fermeture.

Inputs:

- Mission.
- Policy decisions.
- Evidence.
- Test results.
- Reviews.
- Risk level.
- Approvals.
- Diff scope.
- Incidents.

Outputs:

- Scores.
- Decision.
- Findings.
- Required followups.
- Confidence.
- Residual risk.

La formule peut etre deterministe en v1, puis hybride IA + rules apres durcissement.

### 14. Memory Service

Memoire controlee du projet.

Types:

- decision.
- lesson.
- pattern.
- incident.
- preference.
- architecture fact.

Regles:

- Pas de secrets.
- Pas de donnees personnelles sensibles.
- Source obligatoire.
- Confidence obligatoire.
- Expiration possible.
- Review cycle.
- Suppression/archivage auditable.

### 15. Job Queue et Workers

Les taches longues doivent sortir de l'API.

Jobs:

- agent.plan
- agent.architect
- agent.propose_patch
- tool.run_command
- evaluation.run
- evidence.hash
- memory.extract
- audit.export

Exigences:

- Retries controles.
- Dead letter queue.
- Idempotency key.
- Status progress.
- Cancellation.
- Timeout.
- Worker heartbeat.

### 16. PostgreSQL

Base canonique.

Exigences:

- Migrations versionnees.
- Contraintes FK.
- Contraintes enum/check pour statuts critiques.
- Index par projet, mission, statut, date.
- Transactions autour des transitions.
- Idempotence sur actions sensibles.
- Audit event insertion atomique avec action.

### 17. Object Storage

Pour preuves lourdes:

- logs complets.
- diffs.
- rapports tests.
- screenshots.
- artifacts de build.

Compatible:

- S3.
- MinIO local.
- Cloud provider equivalent.

### 18. Observability

Production sans observability est aveugle.

Obligatoire:

- Logs structures.
- Metrics.
- Tracing request/job.
- Healthcheck API.
- Readiness DB.
- Worker heartbeat.
- Audit export.
- Alertes sur failures, stuck jobs, policy denials anormaux.

## Frontieres de confiance

Zones:

- Browser utilisateur: non fiable.
- API publique: validation obligatoire.
- DB: source canonique mais pas audit immuable seule.
- Agent runner: non fiable par defaut.
- Model provider externe: non fiable par defaut.
- Sandbox: zone controlee mais a durcir.
- Secrets manager: zone critique.
- Object storage: preuves et artifacts.

Regle: aucune sortie agent/model ne doit devenir action sans validation policy et audit.

## Modes de deploiement

### Local dev

- API.
- Web.
- PostgreSQL.
- Worker.
- Optional local model.

### Single-node production simple

- Docker Compose durci.
- PostgreSQL manage ou local sauvegarde.
- API + web + worker.
- MinIO ou S3.
- Reverse proxy TLS.

### Scalable production

- API stateless replicas.
- Worker replicas par queue.
- PostgreSQL managed.
- Redis/queue managed.
- Object storage.
- Observability stack.
- Horizontal scaling agent workers.
- Provider rate limit management.

## Priorites techniques

Ordre strict:

1. Stabiliser le domaine: statuts, transitions, approvals, policies.
2. Sortir les taches longues en jobs.
3. Ajouter AgentRunner + ModelProvider en mode null/manual d'abord.
4. Ajouter ToolRegistry et patch-first flow.
5. Durcir sandbox et evidence.
6. Ajouter providers IA.
7. Ajouter auth/RBAC.
8. Ajouter observability et deployment production.

## Ce que le projet ne doit pas devenir

- Un simple wrapper de chat IA.
- Un agent autonome qui fait tout sans controle.
- Une interface demo ou tout est pre-rempli.
- Un systeme qui promet une sandbox alors qu'il lance des commandes shell ordinaires.
- Un produit lie a un seul fournisseur IA.
- Une collection de roles agents non connectes a des actions verifiees.

## Definition de done production

AgentOps OS peut etre considere production-ready quand:

- Une mission complete passe par toutes les gates sans intervention manuelle technique hors cockpit.
- Les agents peuvent proposer des plans et patchs via providers interchangeables.
- Les actions sensibles sont bloquees ou approuvees selon policy.
- Les commandes tournent dans une sandbox limitee.
- Les preuves sont hashees et consultables.
- L'audit relie chaque action a un acteur, une policy, une mission et un hash.
- Les jobs sont resilients, observables et annulables.
- L'auth/RBAC protege les operations.
- Le deploiement est documente, reproductible et surveillable.
