CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'single_tenant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organizations (id, name, plan)
VALUES ('org.default', 'Default Organization', 'single_tenant')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE improvement_proposals
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE patch_proposals
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org.default';

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_agents_org ON agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_policies_org ON policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_missions_org ON missions(organization_id);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(organization_id);
CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_memory_org ON memory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_org ON evaluations(organization_id);
CREATE INDEX IF NOT EXISTS idx_improvements_org ON improvement_proposals(organization_id);
CREATE INDEX IF NOT EXISTS idx_patch_org ON patch_proposals(organization_id);
CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_tools_org ON tools(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org ON workflow_runs(organization_id);

CREATE INDEX IF NOT EXISTS idx_missions_org_project ON missions(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(organization_id, created_at DESC);

COMMENT ON COLUMN projects.organization_id IS
  'Tenant boundary. Supabase RLS policies should compare this value with the authenticated organization claim.';

COMMENT ON COLUMN missions.organization_id IS
  'Denormalized tenant boundary for efficient RLS and operational queries.';

COMMENT ON COLUMN audit_events.organization_id IS
  'Tenant boundary for audit export, retention, and Supabase RLS.';
