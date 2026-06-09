DO $$
DECLARE
  tbl TEXT;
  server_tables TEXT[] := ARRAY[
    'organizations',
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
    'workflow_runs',
    'user_accounts',
    'user_sessions'
  ];
BEGIN
  FOREACH tbl IN ARRAY server_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = tbl || '_server_api_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        tbl || '_server_api_all',
        tbl
      );
    END IF;
  END LOOP;
END $$;
