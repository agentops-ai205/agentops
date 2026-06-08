# AgentOps OS - Plan de Transformation Production

## Situation actuelle

Le projet actuel est un prototype avance:

- API Fastify en TypeScript.
- Web cockpit React/Vite.
- PostgreSQL via Drizzle.
- Shared package avec schemas Zod.
- Rust core/CLI embryonnaire.
- Concepts presents: projects, missions, policies, approvals, evidence, audit, memory, evaluations.

Limites principales:

- Agents declaratifs, pas encore actifs.
- Pas de ModelProvider.
- Pas de job queue.
- Pas de sandbox production.
- Audit append-only simple, sans hash chain.
- Transitions de mission pas appliquees partout.
- Approvals insuffisamment scopes.
- Tests trop faibles.
- Frontend encore demo-driven.
- Docker correct pour prototype, pas production durcie.

## Strategie

Ne pas reconstruire tout depuis zero.

Transformer par couches:

1. Durcir le domaine.
2. Rendre les actions verifiables.
3. Sortir l'execution en jobs.
4. Ajouter agents reels en mode manual/null.
5. Ajouter providers IA.
6. Durcir sandbox.
7. Ajouter auth/RBAC.
8. Industrialiser deployment et observability.

## Phase 1 - Architecture cible

Statut: en cours.

Livrables:

- Architecture production.
- Contrats composants.
- ADR control plane model-agnostic.
- Roadmap de transformation.

Definition de done:

- Les decisions structurantes sont documentees.
- La cible est claire.
- L'ordre d'implementation est fixe.
- Les composants non negociables sont connus.

## Phase 2 - Domaine et garanties backend

Objectif: transformer le backend en vrai control plane fiable.

Travaux:

- Extraire les routes en modules.
- Creer Mission Service.
- Appliquer assertTransition partout.
- Ajouter transactions sur actions critiques.
- Normaliser erreurs API.
- Ajouter request_id/correlation_id.
- Ajouter contraintes DB pour statuts critiques.
- Ajouter migrations versionnees non rejouees aveuglement.
- Corriger close: interdiction de fermer sans evaluation acceptable.
- Corriger approval: scope, expiration, role, rejection.
- Corriger execute: ne pas traiter require_sandbox comme allow implicite.

Tests:

- Flow mission complet.
- Transitions invalides.
- Approvals hors scope.
- Evidence obligatoire.
- Evaluation obligatoire.
- Policy denials.

Sortie attendue:

- Backend coherent, testable, defendable.

## Phase 3 - Evidence et audit robustes

Objectif: rendre les preuves et l'audit credibles.

Travaux:

- Evidence immutable logique.
- Evidence types stricts.
- Hash server-side.
- Audit actor obligatoire.
- Audit hash chain par mission.
- Audit event schemas.
- Export audit JSONL.
- Lien evidence -> action -> policy -> approval.

Tests:

- Hash stable.
- Previous hash correct.
- Tampering detecte par verification.
- Evidence correction par nouvelle entree.

Sortie attendue:

- On peut expliquer et verifier ce qui s'est passe dans une mission.

## Phase 4 - Tool Registry et patch-first flow

Objectif: empecher les agents d'agir hors outils declares.

Travaux:

- Creer table/tools registry strict.
- Ajouter schemas input/output.
- Ajouter allowedRoles.
- Ajouter requiresApproval/requiresSandbox.
- Ajouter tool execution service.
- Ajouter propose_patch comme action primaire.
- Ajouter apply_patch sous policy/approval.
- Stocker diff comme evidence.

Tests:

- Outil interdit par role.
- Input invalide.
- Patch hors scope bloque.
- Patch sensible demande approval.

Sortie attendue:

- Les actions agents deviennent controlables et inspectables.

## Phase 5 - Job queue et workers

Objectif: rendre l'execution scalable.

Travaux:

- Ajouter table jobs ou queue dediee.
- Ajouter worker process.
- Deplacer execute/evaluate/agent runs vers jobs.
- Ajouter retries, timeout, cancellation.
- Ajouter dead letter.
- Ajouter heartbeat worker.
- Afficher progress cockpit.

Options techniques:

- Court terme: PostgreSQL jobs.
- Moyen terme: Redis/BullMQ ou equivalent.
- Production scalable: queue managed ou Redis HA.

Tests:

- Job success.
- Job failure.
- Retry.
- Cancellation.
- Idempotency.

Sortie attendue:

- API stateless et execution asynchrone.

## Phase 6 - AgentRunner sans fournisseur IA

Objectif: brancher les agents sans risque modele.

Travaux:

- Creer AgentRunner interface.
- Creer ManualProvider / NullProvider.
- Creer runners planner, tester, reviewer deterministes simples.
- Faire passer les runners par Tool Registry.
- Produire evidence depuis runners.
- Ajouter budget et timeout.

Pourquoi sans IA d'abord:

- Verifier architecture.
- Tester gates.
- Eviter de confondre intelligence modele et controle systeme.

Sortie attendue:

- Agents reels dans le systeme, meme si deterministes.

## Phase 7 - ModelProvider et IA interchangeable

Objectif: ajouter open source et API fermees proprement.

Travaux:

- ModelProvider interface.
- ModelRouter.
- Provider config par projet.
- Redaction layer.
- Context builder par mission.
- Budget tokens/cout.
- Provider audit.
- Adapters:
  - openai.
  - anthropic.
  - local_http.
  - manual/null.

Regles:

- Pas de secrets vers provider.
- Pas de tool call applique sans validation.
- Pas de patch applique directement.

Tests:

- Provider fake.
- Budget depasse.
- Context redaction.
- Tool call bloque par policy.

Sortie attendue:

- Agents IA branchables sans casser le control plane.

## Phase 8 - Sandbox production

Objectif: isolation reelle de l'execution.

Travaux:

- Workspace par mission.
- Env filtering.
- Network off par defaut.
- Command allowlist.
- Timeout dur.
- Output capture artifact.
- Non-root execution.
- Container sandbox option.
- File read/write scope.

Tests:

- Commande non allowlistee bloquee.
- Timeout.
- Env secret absent.
- Ecriture hors scope bloquee.
- Output limite.

Sortie attendue:

- Le mot sandbox devient defendable.

## Phase 9 - Frontend cockpit production

Objectif: passer de demo dashboard a outil operationnel.

Travaux:

- Mission timeline.
- Detail mission complet.
- Diff viewer.
- Evidence viewer.
- Approval queue.
- Job progress.
- Agent run logs.
- Policy explanations.
- Provider settings.
- Risk dashboard.
- Audit explorer.
- Empty states propres.
- Error states clairs.

Sortie attendue:

- Un operateur peut piloter une mission de bout en bout sans terminal.

## Phase 10 - Auth, RBAC et multi-project

Objectif: proteger le control plane.

Travaux:

- Auth provider configurable.
- Sessions.
- Roles.
- Permissions par projet.
- Approver role verification.
- Audit actor lie a user/service account.
- API keys pour workers/integrations.

Roles:

- admin.
- project_owner.
- technical_owner.
- security_owner.
- reviewer.
- operator.
- auditor.

Sortie attendue:

- Les approvals et actions ont une identite verifiee.

## Phase 11 - Observability et operations

Objectif: production exploitable.

Travaux:

- Logs structures.
- Metrics API.
- Metrics workers.
- Tracing.
- Health/readiness.
- Alertes.
- Backup DB.
- Migration strategy.
- Rate limits.
- Cost metrics IA.

Sortie attendue:

- Le systeme peut etre surveille, debugge et opere.

## Phase 12 - Deployment scalable

Objectif: livrer en production.

Travaux:

- Dockerfiles durcis.
- Compose production simple.
- Helm/Kubernetes optionnel.
- Env documentation.
- TLS/reverse proxy.
- Object storage.
- Managed PostgreSQL guide.
- Horizontal scaling workers.
- CI/CD.

Sortie attendue:

- Deploiement reproductible local, staging, production.

## Matrice de priorite

| Priorite | Sujet | Raison |
| --- | --- | --- |
| P0 | Mission transitions | Evite incoherence metier |
| P0 | Policy enforcement | Evite actions non controlees |
| P0 | Approval scope | Rend validation humaine credible |
| P0 | Evidence/audit | Base de confiance du produit |
| P1 | Tool registry | Controle les agents |
| P1 | Jobs/workers | Rend scalable |
| P1 | AgentRunner | Rend agents reels |
| P1 | Sandbox | Rend execution defendable |
| P2 | Model providers | Ajoute intelligence interchangeable |
| P2 | Cockpit production | Rend operable |
| P2 | Auth/RBAC | Rend multi-utilisateur |
| P3 | K8s/HA | Rend enterprise scalable |

## Anti-roadmap

Ne pas faire maintenant:

- Brancher directement un modele IA dans les routes API.
- Donner aux agents un shell libre.
- Ajouter une boucle autonome.
- Ajouter Kubernetes avant jobs/observability.
- Ajouter une UI spectaculaire avant les garanties backend.
- Promettre production tant que sandbox, audit, RBAC et jobs ne sont pas solides.

## Premier lot de code recommande

Lot 1:

- Creer services domaine: MissionService, ApprovalService, PolicyService, EvidenceService, AuditService.
- Ajouter erreurs API normalisees.
- Ajouter tests flow mission complet.
- Corriger transitions et close/evaluate.

Lot 2:

- Audit hash chain.
- Evidence types stricts.
- Approval scope.
- Policy snapshots.

Lot 3:

- ToolRegistry.
- Job queue PostgreSQL.
- Worker process.

Lot 4:

- AgentRunner manual/null.
- ModelProvider fake pour tests.

Lot 5:

- Providers IA reels.
- Sandbox container.

## Note de realisme

Le projet peut atteindre un niveau production, mais pas en sautant directement a l'IA. La force d'AgentOps sera d'abord son controle. Si le controle est faible, ajouter de l'IA rend seulement le systeme plus impressionnant et moins fiable.
