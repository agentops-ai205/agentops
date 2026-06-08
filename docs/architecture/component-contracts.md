# AgentOps OS - Contrats Composants Production

## But

Ce document fixe les contrats minimaux entre les composants AgentOps. Il doit guider l'implementation pour garder un coeur stable, testable et independant des fournisseurs IA.

## Types domaine canoniques

### Mission

Champs obligatoires:

- id
- project_id
- title
- intent
- status
- risk_level
- autonomy_level
- scope
- constraints
- success_criteria
- human_approval
- created_at
- updated_at

Regles:

- Une mission ne change jamais de statut hors Mission Service.
- Toute transition produit un audit event.
- Toute transition sensible verifie policy et approval.
- La fermeture exige evidence et evaluation.

### Agent

Champs obligatoires:

- id
- role
- name
- capabilities
- model_policy
- tool_permissions
- status
- score

Regles:

- Un agent est un role operationnel, pas un modele.
- Le modele est choisi par le Model Router.
- Les outils sont limites par role, mission, policy et niveau d'autonomie.

### Action

Une action est une intention executable ou evaluable.

Champs:

- type
- mission_id
- project_id
- actor_id
- agent_role
- autonomy_level
- risk_level
- path
- command
- tool_name
- input
- reason

Regles:

- Toute action passe par Policy Engine avant execution.
- Toute action executee produit audit.
- Toute action importante produit evidence.

## ModelProvider

Interface cible:

```ts
export interface ModelProvider {
  id: string;
  kind: "manual" | "closed_api" | "local_open_source" | "private_endpoint";
  capabilities: ModelCapability[];
  complete(request: ModelRequest): Promise<ModelResponse>;
}
```

### ModelRequest

```ts
export interface ModelRequest {
  missionId: string;
  agentRole: AgentRole;
  systemPrompt: string;
  userPrompt: string;
  context: ContextItem[];
  tools: ToolDescriptor[];
  outputSchema?: JsonSchema;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  redactionPolicy: RedactionPolicy;
  metadata: Record<string, unknown>;
}
```

### ModelResponse

```ts
export interface ModelResponse {
  providerId: string;
  model: string;
  content: string;
  structured?: unknown;
  requestedToolCalls: RequestedToolCall[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
  finishReason: "stop" | "length" | "tool_call" | "error";
  latencyMs: number;
  safetyFlags: string[];
}
```

Regles:

- Le provider ne recoit que le contexte autorise.
- Les secrets sont redactes avant appel provider.
- Les sorties modele ne sont jamais appliquees directement.
- Les tool calls demandes par modele sont revalides par Tool Registry et Policy Engine.

## ModelRouter

Responsabilites:

- Selectionner un provider compatible.
- Appliquer budgets cout/tokens.
- Respecter confidentialite et politique projet.
- Fallback vers manual/null si aucun provider autorise.
- Journaliser provider, modele, cout et latence.

Decision factors:

- role agent.
- risk level.
- data sensitivity.
- autonomy level.
- provider availability.
- project policy.
- cost budget.

## AgentRunner

Interface cible:

```ts
export interface AgentRunner {
  role: AgentRole;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
```

### AgentRunInput

```ts
export interface AgentRunInput {
  mission: Mission;
  project: Project;
  agent: Agent;
  allowedTools: ToolDescriptor[];
  context: ContextItem[];
  policies: PolicySnapshot;
  approvals: Approval[];
  budget: RunBudget;
  requestedBy: Actor;
}
```

### AgentRunResult

```ts
export interface AgentRunResult {
  status: "completed" | "blocked" | "needs_approval" | "failed";
  summary: string;
  proposedStatus?: MissionStatus;
  proposedPlan?: MissionPlan;
  proposedPatch?: PatchProposal;
  requestedToolCalls: RequestedToolCall[];
  evidence: EvidenceCandidate[];
  findings: Finding[];
  residualRisk: RiskLevel;
}
```

Regles:

- Un runner ne modifie pas l'etat directement.
- Un runner retourne des propositions.
- L'Orchestrator decide la suite via policies et transitions.

## ToolRegistry

ToolDescriptor:

```ts
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  risk: RiskLevel;
  allowedRoles: AgentRole[];
  requiresApproval: boolean;
  requiresSandbox: boolean;
  auditEventType: string;
}
```

ToolResult:

```ts
export interface ToolResult {
  toolName: string;
  status: "success" | "failed" | "blocked";
  output: unknown;
  evidence?: EvidenceCandidate;
  auditMetadata: Record<string, unknown>;
}
```

Regles:

- Un outil sans schema ne va pas en production.
- Un outil risque doit exiger approval ou sandbox.
- Les outils fichier doivent respecter le scope mission.
- Les outils commande doivent passer par Sandbox Executor.

## PatchProposal

Contrat:

```ts
export interface PatchProposal {
  id: string;
  missionId: string;
  baseRef: string;
  summary: string;
  files: PatchFile[];
  unifiedDiff: string;
  riskLevel: RiskLevel;
  generatedBy: string;
}
```

Regles:

- Patch propose avant application.
- Diff visible dans le cockpit.
- Application seulement apres policy et approval si necessaire.
- Hash du diff stocke en evidence.

## SandboxExecutor

CommandRequest:

```ts
export interface CommandRequest {
  missionId: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  network: "off" | "allowlisted" | "on";
  filesystem: {
    read: string[];
    write: string[];
  };
  resourceLimits?: {
    cpu?: string;
    memoryMb?: number;
    outputBytes?: number;
  };
}
```

CommandResult:

```ts
export interface CommandResult {
  command: string;
  exitCode: number | null;
  stdoutRef?: string;
  stderrRef?: string;
  outputPreview: string;
  startedAt: string;
  finishedAt: string;
  timedOut: boolean;
  hash: string;
}
```

Regles:

- Pas de shell libre en production sans isolation.
- Pas d'environnement brut herite du process API.
- Sorties completes stockees en artifact si longues.
- Resultat hashe.

## EvidenceService

CreateEvidenceInput:

```ts
export interface CreateEvidenceInput {
  missionId: string;
  type: EvidenceType;
  title: string;
  content?: string;
  artifactRef?: string;
  metadata: Record<string, unknown>;
  createdBy: string;
}
```

Regles:

- content ou artifactRef obligatoire.
- hash calcule cote serveur.
- evidence immutable logique.
- correction = nouvelle evidence liee a l'ancienne.

## AuditLedger

AuditEvent:

```ts
export interface AuditEvent {
  id: string;
  projectId?: string;
  missionId?: string;
  actorId: string;
  agentId?: string;
  eventType: string;
  actionType?: string;
  policyDecision: PolicyDecision;
  result: string;
  reason: string;
  metadata: Record<string, unknown>;
  previousHash?: string;
  eventHash: string;
  createdAt: string;
}
```

Regles:

- Insertion audit dans la meme transaction que l'action critique quand possible.
- Actor obligatoire.
- Hash chain par mission ou projet.
- Aucun update silencieux d'un evenement audit.

## JobQueue

Job:

```ts
export interface Job {
  id: string;
  type: JobType;
  projectId: string;
  missionId?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "dead";
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}
```

Regles:

- Toute execution longue est un job.
- Job cancellable.
- Retry controle.
- Dead letter inspectable.
- Progress visible cockpit.

## API erreurs

Format cible:

```json
{
  "error": {
    "code": "MISSION_INVALID_TRANSITION",
    "message": "Mission cannot transition from DRAFT to CLOSED.",
    "details": {
      "from": "DRAFT",
      "to": "CLOSED"
    },
    "request_id": "req_..."
  }
}
```

Regles:

- Jamais stack trace en production.
- Codes d'erreur stables.
- Details utiles mais non sensibles.

## Tests obligatoires par contrat

- State machine: toutes transitions autorisees et interdites.
- Policy engine: chemins sensibles, commandes, autonomie, roles.
- Approval scope: approval valide, expiree, hors scope, rejetee.
- Evidence hash: contenu, artifact, duplicats.
- Audit hash chain: ordre, hash, previous hash.
- Agent runner null/manual.
- Tool registry: schema validation et role enforcement.
- API flow complet mission.
- Sandbox: allowlist, timeout, env filtering.
