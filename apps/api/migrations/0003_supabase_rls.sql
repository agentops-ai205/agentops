CREATE OR REPLACE FUNCTION public.agentops_current_organization_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  WITH jwt_claims AS (
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb AS value
  )
  SELECT COALESCE(
    NULLIF(current_setting('app.current_organization_id', true), ''),
    NULLIF(jwt_claims.value -> 'app_metadata' ->> 'organization_id', ''),
    NULLIF(jwt_claims.value ->> 'organization_id', '')
  )
  FROM jwt_claims;
$$;

COMMENT ON FUNCTION public.agentops_current_organization_id() IS
  'Returns the trusted tenant boundary from an explicit server setting or Supabase JWT claims.';

DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'projects',
    'agents',
    'policies',
    'missions',
    'approvals',
    'evidence',
    'audit_events',
    'memory_items',
    'evaluations',
    'improvement_proposals',
    'patch_proposals',
    'jobs',
    'tools',
    'workflow_runs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_tenant_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (organization_id = public.agentops_current_organization_id())',
        tbl || '_tenant_select',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_tenant_insert'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (organization_id = public.agentops_current_organization_id())',
        tbl || '_tenant_insert',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_tenant_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (organization_id = public.agentops_current_organization_id()) WITH CHECK (organization_id = public.agentops_current_organization_id())',
        tbl || '_tenant_update',
        tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_tenant_delete'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (organization_id = public.agentops_current_organization_id())',
        tbl || '_tenant_delete',
        tbl
      );
    END IF;
  END LOOP;

  ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_tenant_select'
  ) THEN
    CREATE POLICY organizations_tenant_select
      ON public.organizations
      FOR SELECT
      USING (id = public.agentops_current_organization_id());
  END IF;
END $$;
