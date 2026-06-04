import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const files: Record<string, string> = {
  ".agentops/README.md": `# AgentOps Kernel

Ce dossier est le noyau portable AgentOps OS du projet. Il decrit les missions, agents, policies, workflows, evaluations, memoire, audit et rapports exploitables par une app, un CLI, un IDE ou un agent de codage.
`,
  ".agentops/agentops.yml": `spec_version: "1.0"
project:
  id: "com.agentops.os"
  name: "AgentOps OS"
  type: "agentic_governance_platform"
  criticality: "high"
  owners:
    product: "product-owner@example.com"
    technical: "technical-owner@example.com"
    security: "security-owner@example.com"
runtime:
  default_branch: "main"
  protected_branches: ["main", "production"]
  package_manager: "npm"
  build_commands:
    - "npm run test"
    - "npm run build"
agent_policy:
  default_autonomy_level: 2
  max_autonomy_level: 5
  require_human_approval_for:
    - "secrets_access"
    - "database_schema_change"
    - "auth_change"
    - "production_deploy"
    - "policy_change"
    - "self_improvement_apply"
memory:
  enabled: true
  review_cycle_days: 30
  forbidden_memory:
    - "raw_secrets"
    - "personal_sensitive_data"
`,
  ".agentops/rules.md": `# Rules

- Toute action agentique importante doit produire une preuve.
- Aucun agent ne peut elever son propre niveau d'autonomie.
- Les secrets, changements auth, schema DB, production et policies exigent approbation humaine.
- Les tests et preuves machine priment sur les affirmations conversationnelles.
`,
  ".agentops/mission.schema.json": `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AgentOps Mission",
  "type": "object",
  "required": ["mission_id", "title", "intent", "scope", "success_criteria", "autonomy_level"],
  "properties": {
    "mission_id": {"type": "string"},
    "title": {"type": "string"},
    "intent": {"type": "string"},
    "context": {"type": "object"},
    "scope": {
      "type": "object",
      "properties": {
        "include": {"type": "array", "items": {"type": "string"}},
        "exclude": {"type": "array", "items": {"type": "string"}}
      }
    },
    "constraints": {"type": "object"},
    "success_criteria": {"type": "array", "items": {"type": "string"}},
    "risk_level": {"enum": ["low", "medium", "high", "critical"]},
    "autonomy_level": {"type": "integer", "minimum": 0, "maximum": 9}
  }
}
`,
  ".agentops/policies/autonomy.yml": `default_autonomy_level: 2
max_autonomy_level: 5
forbidden:
  - self_elevation
  - unsupervised_policy_change
  - unsupervised_secret_access
levels:
  0: observation
  1: proposition
  2: draft_patch
  3: local_write
  4: write_and_tests
  5: supervised_pr
  6: conditional_merge
  7: supervised_release
  8: proposed_self_improvement
  9: controlled_self_improvement
`,
  ".agentops/policies/approvals.yml": `requires_approval:
  secrets_access: ["security_owner"]
  auth_change: ["security_owner", "technical_owner"]
  database_schema_change: ["technical_owner", "data_owner"]
  production_deploy: ["release_owner"]
  policy_change: ["governance_owner", "security_owner"]
  self_improvement_apply: ["governance_owner", "security_owner"]
`,
  ".agentops/policies/security.yml": `network:
  default: "off"
  allowlist: []
secrets:
  expose_raw: false
files:
  deny:
    - ".env"
    - ".env.*"
    - "secrets/**"
    - "infra/prod/**"
commands:
  allow:
    - "npm run test"
    - "npm run build"
    - "cargo test"
  deny:
    - "rm -rf *"
    - "curl * | sh"
    - "ssh *"
`,
  ".agentops/policies/data.yml": `sensitive_data:
  forbidden_memory:
    - raw_secrets
    - personal_sensitive_data
retention:
  audit_days: 365
  hypothesis_memory_days: 14
`,
  ".agentops/agents/planner.agent.yml": `id: planner
role: planner
mission: "Transformer une intention humaine en mission structuree."
permissions:
  read: ["."]
  write: [".agentops/reports/mission-reports/**"]
anti_drift: "Ne modifie pas le code produit."
`,
  ".agentops/agents/architect.agent.yml": `id: architect
role: architect
mission: "Cartographier architecture, impacts et risques."
permissions:
  read: ["**/*"]
  execute: []
anti_drift: "Pas d'execution."
`,
  ".agentops/agents/coder.agent.yml": `id: coder
role: coder
mission: "Implementer les changements autorises."
permissions:
  read: ["apps/**", "packages/**", "crates/**", "package.json"]
  write: ["apps/**", "packages/**", "crates/**", "test/**"]
  execute: ["npm run test", "npm run build", "cargo test"]
anti_drift: "Pas de secrets, pas de production, pas de policies sans approval."
`,
  ".agentops/agents/tester.agent.yml": `id: tester
role: tester
mission: "Verifier build, tests et regressions."
permissions:
  read: ["**/*"]
  write: [".agentops/reports/mission-reports/**"]
  execute: ["npm run test", "npm run build", "cargo test"]
anti_drift: "Ne modifie pas la logique produit hors mission."
`,
  ".agentops/agents/security.agent.yml": `id: security
role: security
mission: "Analyser risques, secrets, dependances et permissions."
permissions:
  read: ["**/*"]
  execute: ["npm audit"]
anti_drift: "Ne corrige pas sans mission explicite."
`,
  ".agentops/agents/reviewer.agent.yml": `id: reviewer
role: reviewer
mission: "Juger qualite, maintenabilite et preuves."
permissions:
  read: ["**/*"]
  write: [".agentops/reports/mission-reports/**"]
anti_drift: "Ne merge pas."
`,
  ".agentops/agents/metadev.agent.yml": `id: metadev
role: metadev
mission: "Proposer ameliorations du systeme agentique."
permissions:
  read: [".agentops/audit/**", ".agentops/memory/**", ".agentops/evals/**"]
  write: [".agentops/reports/improvement-proposals/**"]
anti_drift: "Validation humaine obligatoire pour appliquer."
`,
  ".agentops/workflows/feature.workflow.yml": `required_agents: [planner, architect, coder, tester, reviewer]
optional_agents: [security, documenter]
gates:
  - plan_approved
  - tests_passed
  - risk_below_threshold
  - human_review_complete
mandatory_evidence:
  - plan.md
  - diff.patch
  - test-results.json
  - mission-report.md
`,
  ".agentops/workflows/bugfix.workflow.yml": `required_agents: [planner, coder, tester, reviewer]
gates:
  - reproduction_evidence
  - minimal_change
  - regression_test
mandatory_evidence:
  - reproduction.md
  - root-cause.md
  - test-results.json
`,
  ".agentops/workflows/refactor.workflow.yml": `required_agents: [architect, coder, tester, reviewer]
gates:
  - behavior_preserved
  - tests_passed
  - diff_limited
`,
  ".agentops/workflows/migration.workflow.yml": `required_agents: [architect, coder, tester, security, reviewer]
gates:
  - rollback_plan
  - compatibility_tests
  - owner_approval
`,
  ".agentops/workflows/self-improve.workflow.yml": `required_agents: [metadev, reviewer]
gates:
  - observation
  - hypothesis
  - simulation
  - before_after_evaluation
  - risk_assessment
  - double_approval
  - rollback_plan
`,
  ".agentops/evals/quality.yml": `scores:
  quality: "tests_passed * review_quality * maintainability"
  confidence: "evidence_strength * test_coverage * reviewer_agreement"
required_commands:
  - "npm run test"
  - "npm run build"
`,
  ".agentops/evals/security.yml": `checks:
  - secrets_not_exposed
  - auth_changes_reviewed
  - dependency_changes_approved
  - destructive_commands_blocked
`,
  ".agentops/evals/performance.yml": `metrics:
  - mission_cycle_time
  - human_review_load
  - test_failure_recovery
`,
  ".agentops/evals/regression.yml": `required:
  - targeted_tests
  - global_build
  - mission_evidence
`,
  ".agentops/evals/human-acceptance.yml": `requires:
  - product_owner_acceptance_for_value
  - technical_owner_acceptance_for_architecture
  - security_owner_acceptance_for_sensitive_changes
`,
  ".agentops/memory/project.md": `# Project Memory

Stack: React, TypeScript, Vite, Fastify, PostgreSQL, Rust CLI/core.

Doctrine: AgentOps OS est une couche de gouvernance, pas un agent tout-puissant.
`,
  ".agentops/memory/decisions.md": `# Decisions

- PostgreSQL est la base canonique. Le local et le cloud utilisent le meme schema via DATABASE_URL.
- Les fichiers .agentops restent le noyau portable et lisible du projet.
- Les changements auth, DB, production, secrets et policies exigent approval.
`,
  ".agentops/memory/lessons.md": `# Lessons

- Une mission sans preuve est incomplete.
- Le dashboard doit montrer les limites de l'agent autant que ses resultats.
`,
  ".agentops/memory/patterns.md": `# Patterns

- API de mission non conversationnelle.
- Audit append-only en DB et export JSONL.
- Policy engine deterministe avant action.
`,
  ".agentops/memory/incidents.md": `# Incidents

Aucun incident enregistre.
`,
  ".agentops/audit/action-log.jsonl": "",
  ".agentops/audit/approval-log.jsonl": "",
  ".agentops/audit/risk-log.jsonl": ""
};

export async function initializeKernel(root = config.projectRoot) {
  for (const file of Object.keys(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), files[file], { flag: "a+" });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await initializeKernel();
  console.log(`AgentOps kernel initialized at ${path.join(config.projectRoot, ".agentops")}`);
}
