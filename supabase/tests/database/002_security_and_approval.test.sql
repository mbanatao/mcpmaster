begin;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.test', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000002', 'operator@example.test', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@example.test', '{}', '{}');

select is(
  (select count(*) from public.profiles),
  3::bigint,
  'auth user trigger creates one profile per user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.create_organization('Batalla & Associates', 'batalla-associates') $$,
  'authenticated staff member can create an organization atomically'
);

select is(
  (select count(*) from public.organizations where slug = 'batalla-associates'),
  1::bigint,
  'organization owner can read the new organization'
);

select is(
  (
    select role::text
    from public.memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    where organization.slug = 'batalla-associates'
      and membership.user_id = '00000000-0000-0000-0000-000000000001'
  ),
  'owner',
  'organization creation also creates the owner membership'
);

reset role;

insert into public.memberships (
  organization_id,
  user_id,
  role,
  status,
  invited_by,
  joined_at
)
select
  organization.id,
  '00000000-0000-0000-0000-000000000002',
  'operator'::public.member_role,
  'active'::public.membership_status,
  '00000000-0000-0000-0000-000000000001',
  timezone('utc', now())
from public.organizations organization
where organization.slug = 'batalla-associates';

insert into public.workflow_runs (
  id,
  organization_id,
  workflow_key,
  workflow_version,
  status,
  requester_id,
  risk_ceiling,
  input_redacted,
  idempotency_key
)
select
  '10000000-0000-0000-0000-000000000001',
  organization.id,
  'meta.review_and_publish',
  '1.0.0',
  'waiting_approval'::public.workflow_run_status,
  '00000000-0000-0000-0000-000000000001',
  'R3'::public.risk_class,
  '{"content_type":"office_hours"}'::jsonb,
  'run-meta-office-hours-001'
from public.organizations organization
where organization.slug = 'batalla-associates';

insert into public.workflow_steps (
  id,
  organization_id,
  run_id,
  step_key,
  sequence,
  tool_name,
  status,
  risk,
  approval_required,
  idempotency_key,
  input_redacted
)
select
  step.id,
  organization.id,
  '10000000-0000-0000-0000-000000000001',
  step.step_key,
  step.sequence,
  step.tool_name,
  'waiting_approval'::public.workflow_step_status,
  step.risk,
  true,
  step.idempotency_key,
  step.input_redacted
from public.organizations organization
cross join (
  values
    (
      '20000000-0000-0000-0000-000000000001'::uuid,
      'publish-approved-post'::text,
      1,
      'meta_post_publish'::text,
      'R2'::public.risk_class,
      'step-meta-publish-001'::text,
      '{"page_id":"synthetic-page","preview":"Approved office hours"}'::jsonb
    ),
    (
      '20000000-0000-0000-0000-000000000002'::uuid,
      'delete-post'::text,
      2,
      'meta_post_delete'::text,
      'R3'::public.risk_class,
      'step-meta-delete-001'::text,
      '{"page_id":"synthetic-page","post_id":"synthetic-post"}'::jsonb
    )
) as step(id, step_key, sequence, tool_name, risk, idempotency_key, input_redacted)
where organization.slug = 'batalla-associates';

insert into public.approvals (
  id,
  organization_id,
  run_id,
  step_id,
  requested_by,
  action_hash,
  preview_redacted,
  expires_at
)
select
  approval.id,
  organization.id,
  '10000000-0000-0000-0000-000000000001',
  approval.step_id,
  '00000000-0000-0000-0000-000000000001',
  approval.action_hash,
  approval.preview_redacted,
  timezone('utc', now()) + interval '1 hour'
from public.organizations organization
cross join (
  values
    (
      '30000000-0000-0000-0000-000000000001'::uuid,
      '20000000-0000-0000-0000-000000000001'::uuid,
      repeat('a', 64),
      '{"action":"Publish approved office-hours post"}'::jsonb
    ),
    (
      '30000000-0000-0000-0000-000000000002'::uuid,
      '20000000-0000-0000-0000-000000000002'::uuid,
      repeat('b', 64),
      '{"action":"Delete synthetic post"}'::jsonb
    )
) as approval(id, step_id, action_hash, preview_redacted)
where organization.slug = 'batalla-associates';

select set_config(
  'app.test_org_id',
  (select id::text from public.organizations where slug = 'batalla-associates'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.organizations where slug = 'batalla-associates'),
  1::bigint,
  'active operator can read the organization'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*) from public.organizations),
  0::bigint,
  'outsider cannot read another organization'
);

select is(
  (select count(*) from public.workflow_runs),
  0::bigint,
  'outsider cannot read another organization workflow runs'
);

select throws_ok(
  $$
    insert into public.workflow_runs (
      organization_id,
      workflow_key,
      workflow_version,
      requester_id,
      idempotency_key
    )
    values (
      current_setting('app.test_org_id')::uuid,
      'unauthorized.workflow',
      '1.0.0',
      '00000000-0000-0000-0000-000000000003',
      'unauthorized-run'
    )
  $$,
  '42501',
  null,
  'outsider cannot create a workflow run in another organization'
);

reset role;

select is(
  has_table_privilege('authenticated', 'public.credential_refs', 'select'),
  false,
  'credential references are server-only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select public.decide_approval(
      '30000000-0000-0000-0000-000000000001',
      'approved'::public.approval_decision,
      'Approved synthetic office-hours post'
    )
  $$,
  'owner can approve an R2 action'
);

select is(
  (
    select decision::text
    from public.approvals
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'approved',
  'R2 approval decision is persisted'
);

select throws_ok(
  $$
    select public.decide_approval(
      '30000000-0000-0000-0000-000000000002',
      'approved'::public.approval_decision,
      'Self-approved high-risk delete'
    )
  $$,
  'P0001',
  'high-risk requests require a different approver',
  'requester cannot self-approve an R3 action'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$
    select public.decide_approval(
      '30000000-0000-0000-0000-000000000002',
      'approved'::public.approval_decision,
      'Second staff member approved synthetic delete'
    )
  $$,
  'operator can approve an R3 request created by another staff member'
);

select is(
  (
    select decision_by
    from public.approvals
    where id = '30000000-0000-0000-0000-000000000002'
  ),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'R3 approval records the independent approver'
);

reset role;

select is(
  (select count(*) from public.audit_events),
  3::bigint,
  'organization creation and both approval decisions produce audit events'
);

select is(
  (
    select count(*)
    from public.audit_events event
    left join public.audit_events previous
      on previous.event_hash = event.previous_hash
    where event.previous_hash is not null
      and previous.id is null
  ),
  0::bigint,
  'every non-initial audit event links to an existing previous hash'
);

select throws_ok(
  $$
    update public.audit_events
    set event_type = 'tampered'
    where id = (select min(id) from public.audit_events)
  $$,
  'P0001',
  'audit_events are append-only',
  'audit events cannot be updated even by a privileged database role'
);

select is(
  has_table_privilege('authenticated', 'public.webhook_events', 'select'),
  false,
  'raw webhook event state is server-only'
);

select is(
  has_table_privilege('authenticated', 'public.audit_events', 'update'),
  false,
  'authenticated clients cannot update audit events'
);

select is(
  has_function_privilege(
    'service_role',
    'public.record_audit_event(uuid,text,public.audit_actor_type,jsonb,uuid,uuid,uuid)',
    'execute'
  ),
  true,
  'service role can append audit events through the controlled RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.record_audit_event(uuid,text,public.audit_actor_type,jsonb,uuid,uuid,uuid)',
    'execute'
  ),
  false,
  'authenticated clients cannot call the server audit RPC'
);

select * from finish();
rollback;
