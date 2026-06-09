CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_email_lower
  ON user_accounts (lower(email));

CREATE INDEX IF NOT EXISTS idx_user_accounts_org
  ON user_accounts (organization_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash
  ON user_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_org
  ON user_sessions (organization_id);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_accounts'
      AND policyname = 'user_accounts_tenant_select'
  ) THEN
    CREATE POLICY user_accounts_tenant_select
      ON public.user_accounts
      FOR SELECT
      USING (organization_id = public.agentops_current_organization_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sessions'
      AND policyname = 'user_sessions_tenant_select'
  ) THEN
    CREATE POLICY user_sessions_tenant_select
      ON public.user_sessions
      FOR SELECT
      USING (organization_id = public.agentops_current_organization_id());
  END IF;
END $$;
