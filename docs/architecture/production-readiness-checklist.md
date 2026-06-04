# AgentOps OS - Checklist Production

## Domaine metier

- [ ] Toutes les transitions mission passent par Mission Service.
- [ ] Les transitions invalides retournent une erreur normalisee.
- [ ] Une mission ne peut pas fermer sans evidence.
- [ ] Une mission ne peut pas fermer sans evaluation acceptable.
- [ ] Les statuts critiques sont contraints cote DB ou service transactionnel.
- [ ] Les changements d'etat critiques sont transactionnels avec audit.
- [ ] Les actions sont idempotentes quand elles peuvent etre rejouees.

## Policies

- [ ] Policy Engine versionne.
- [ ] Policy snapshot stocke par action critique.
- [ ] Secrets paths bloques.
- [ ] Auth changes demandent approval security.
- [ ] DB migrations demandent approval technical/data.
- [ ] Production deploy demande approval release.
- [ ] Self-improvement demande double approval.
- [ ] Commandes non allowlistees ne sont pas executees comme allow simple.
- [ ] Les decisions require_sandbox et require_review ont un traitement explicite.

## Approvals

- [ ] Approval liee a un actor verifie.
- [ ] Role approver verifie.
- [ ] Scope obligatoire.
- [ ] Expiration supportee.
- [ ] Rejection empeche l'action concernee.
- [ ] Approval non reutilisable hors scope.
- [ ] Double approval pour actions critiques.

## Agents

- [ ] AgentRunner interface implementee.
- [ ] Runners par role.
- [ ] Agent ne modifie pas directement les fichiers.
- [ ] Agent propose patchs et tool calls.
- [ ] Tool calls revalides par policy.
- [ ] Budget tokens/cout/timeouts appliques.
- [ ] Sortie agent structuree et auditee.

## Model Providers

- [ ] Interface ModelProvider stable.
- [ ] Manual/null provider disponible.
- [ ] Provider fake pour tests.
- [ ] Provider API fermee optionnel.
- [ ] Provider open source/local optionnel.
- [ ] Redaction avant appel modele.
- [ ] Budget cout/tokens.
- [ ] Provider usage audite.
- [ ] Aucun secret brut envoye au modele.

## Tool Registry

- [ ] Tous les outils ont input schema.
- [ ] Tous les outils ont output schema.
- [ ] Roles autorises par outil.
- [ ] Risk level par outil.
- [ ] requiresApproval explicite.
- [ ] requiresSandbox explicite.
- [ ] Tool result produit audit metadata.
- [ ] Tool failures sont visibles.

## Sandbox

- [ ] Workspace par mission.
- [ ] Command allowlist.
- [ ] Timeout dur.
- [ ] Output limite.
- [ ] Env filtre.
- [ ] Reseau off par defaut.
- [ ] Secrets absents par defaut.
- [ ] Read/write scope fichiers.
- [ ] Non-root execution.
- [ ] Logs complets captures comme artifacts.

## Evidence

- [ ] Evidence type strict.
- [ ] Hash calcule serveur.
- [ ] Evidence immutable logique.
- [ ] Artifact storage pour contenus lourds.
- [ ] Evidence liee a action/policy/approval quand pertinent.
- [ ] Evidence visible cockpit.
- [ ] Verification de hash disponible.

## Audit

- [ ] Actor obligatoire.
- [ ] Event schema stable.
- [ ] Request/correlation id.
- [ ] Previous hash.
- [ ] Event hash.
- [ ] Hash chain par mission ou projet.
- [ ] Export audit.
- [ ] Pas d'update silencieux d'evenements.
- [ ] Retention configuree.

## Jobs et workers

- [ ] API ne bloque pas sur taches longues.
- [ ] Job queue.
- [ ] Worker process.
- [ ] Retries controles.
- [ ] Cancellation.
- [ ] Dead letter.
- [ ] Heartbeat.
- [ ] Progress visible.
- [ ] Idempotency key.

## API

- [ ] Erreurs normalisees.
- [ ] Request id.
- [ ] Validation Zod ou equivalent sur toutes entrees.
- [ ] Pagination endpoints listes.
- [ ] Rate limiting.
- [ ] CORS configure par environnement.
- [ ] Healthcheck DB.
- [ ] Readiness check.
- [ ] Graceful shutdown.

## DB

- [ ] Migrations non rejouees aveuglement.
- [ ] FK coherentes.
- [ ] Index projets/missions/statuts/dates.
- [ ] Contraintes check/enums critiques.
- [ ] Transactions actions critiques.
- [ ] Backups documentes.
- [ ] Strategy migration rollback.

## Frontend

- [ ] Mission detail complet.
- [ ] Timeline mission.
- [ ] Approval queue.
- [ ] Evidence viewer.
- [ ] Audit explorer.
- [ ] Diff viewer.
- [ ] Job progress.
- [ ] Agent run detail.
- [ ] Provider settings.
- [ ] Error states.
- [ ] Empty states.
- [ ] Responsive verified.

## Auth et RBAC

- [ ] Auth active.
- [ ] Sessions securisees.
- [ ] Roles.
- [ ] Permissions par projet.
- [ ] API keys workers.
- [ ] Audit actor lie a user/service account.
- [ ] Read-only auditor.

## Observability

- [ ] Logs structures.
- [ ] Metrics API.
- [ ] Metrics workers.
- [ ] Traces.
- [ ] Alerts.
- [ ] Cost metrics provider.
- [ ] Policy denial metrics.
- [ ] Stuck job alerts.

## Deployment

- [ ] Dockerfiles non-root.
- [ ] Images minimales.
- [ ] Env vars documentees.
- [ ] Secrets manager.
- [ ] TLS via reverse proxy.
- [ ] Object storage configure.
- [ ] PostgreSQL managed ou backup solide.
- [ ] Staging/prod separes.
- [ ] CI build/test.
- [ ] Release rollback documente.

## Definition de prod

Le projet est deployable production seulement quand toutes les sections P0 et P1 sont cochees, et que les sections Auth, Observability et Deployment ont au minimum une implementation defendable pour l'environnement vise.
