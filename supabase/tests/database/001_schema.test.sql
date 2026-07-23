begin;

select plan(28);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'connector_installations', 'connector installations table exists');
select has_table('public', 'credential_refs', 'credential references table exists');
select has_table('public', 'workflow_runs', 'workflow runs table exists');
select has_table('public', 'workflow_steps', 'workflow steps table exists');
select has_table('public', 'approvals', 'approvals table exists');
select has_table('public', 'audit_events', 'audit events table exists');
select has_table('public', 'webhook_events', 'webhook events table exists');

select has_function('public', 'create_organization', 'organization creation RPC exists');
select has_function('public', 'decide_approval', 'approval decision RPC exists');
select has_function('public', 'record_audit_event', 'server audit RPC exists');

select has_index('public', 'memberships', 'memberships_user_id_idx', 'membership lookup index exists');
select has_index('public', 'workflow_runs', 'workflow_runs_org_status_created_idx', 'workflow run status index exists');
select has_index('public', 'workflow_steps', 'workflow_steps_org_idempotency_idx', 'step idempotency index exists');
select has_index('public', 'approvals', 'approvals_one_pending_per_step_idx', 'pending approval uniqueness index exists');
select has_index('public', 'audit_events', 'audit_events_org_id_desc_idx', 'audit timeline index exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  true,
  'organizations has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.memberships'::regclass),
  true,
  'memberships has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.connector_installations'::regclass),
  true,
  'connector installations has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.credential_refs'::regclass),
  true,
  'credential references has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.workflow_runs'::regclass),
  true,
  'workflow runs has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.workflow_steps'::regclass),
  true,
  'workflow steps has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.approvals'::regclass),
  true,
  'approvals has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass),
  true,
  'audit events has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.webhook_events'::regclass),
  true,
  'webhook events has RLS enabled'
);

select * from finish();
rollback;
