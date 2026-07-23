begin;

select plan(21);

select has_table('public', 'meta_drafts', 'Meta drafts table exists');
select has_table('public', 'meta_webhook_health', 'Meta webhook health table exists');
select has_column('public', 'webhook_events', 'expires_at', 'webhook replay claims have expiry');
select has_function('public', 'claim_meta_webhook_delivery', 'atomic Meta webhook claim RPC exists');
select has_function('public', 'record_meta_webhook_health', 'Meta webhook health RPC exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.meta_drafts'::regclass),
  true,
  'Meta drafts have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.meta_webhook_health'::regclass),
  true,
  'Meta webhook health has RLS enabled'
);

select is(
  has_table_privilege('authenticated', 'public.meta_drafts', 'select'),
  true,
  'authenticated staff can select Meta drafts subject to RLS'
);
select is(
  has_table_privilege('authenticated', 'public.meta_drafts', 'insert'),
  true,
  'authenticated staff can insert Meta drafts subject to RLS'
);
select is(
  has_table_privilege('authenticated', 'public.meta_webhook_health', 'select'),
  false,
  'webhook health persistence is server-only'
);
select is(
  has_function_privilege(
    'service_role',
    'public.claim_meta_webhook_delivery(uuid,uuid,text,text,timestamptz)',
    'execute'
  ),
  true,
  'service role can atomically claim Meta webhook deliveries'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.claim_meta_webhook_delivery(uuid,uuid,text,text,timestamptz)',
    'execute'
  ),
  false,
  'authenticated clients cannot claim webhook deliveries'
);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values
  ('40000000-0000-0000-0000-000000000001', 'meta-owner@example.test', '{}', '{}'),
  ('40000000-0000-0000-0000-000000000002', 'meta-member@example.test', '{}', '{}'),
  ('40000000-0000-0000-0000-000000000003', 'meta-viewer@example.test', '{}', '{}'),
  ('40000000-0000-0000-0000-000000000004', 'meta-outsider@example.test', '{}', '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.create_organization('Meta Remote MCP Test', 'meta-remote-mcp-test');
reset role;

insert into public.memberships (
  organization_id, user_id, role, status, invited_by, joined_at
)
select organization.id, member.user_id, member.role, 'active'::public.membership_status,
  '40000000-0000-0000-0000-000000000001', timezone('utc', now())
from public.organizations organization
cross join (
  values
    ('40000000-0000-0000-0000-000000000002'::uuid, 'member'::public.member_role),
    ('40000000-0000-0000-0000-000000000003'::uuid, 'viewer'::public.member_role)
) as member(user_id, role)
where organization.slug = 'meta-remote-mcp-test';

insert into public.connector_installations (
  id, organization_id, provider, external_account_id, display_name,
  status, scopes, configuration, installed_by
)
select
  '50000000-0000-0000-0000-000000000001',
  organization.id,
  'meta',
  'test-page-1',
  'Synthetic Meta Page',
  'active'::public.connector_status,
  array['pages_read_engagement'],
  '{}'::jsonb,
  '40000000-0000-0000-0000-000000000001'
from public.organizations organization
where organization.slug = 'meta-remote-mcp-test';

select set_config(
  'app.meta_test_org_id',
  (select id::text from public.organizations where slug = 'meta-remote-mcp-test'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.meta_drafts (
      organization_id, page_id, kind, content, created_by, legal_review_required
    )
    values (
      current_setting('app.meta_test_org_id')::uuid,
      'test-page-1',
      'post',
      'Synthetic office-hours draft.',
      '40000000-0000-0000-0000-000000000002',
      false
    )
  $$,
  'active member can create a tenant-scoped Meta draft'
);

select is(
  (select count(*) from public.meta_drafts where page_id = 'test-page-1'),
  1::bigint,
  'active member can read the organization draft'
);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$
    insert into public.meta_drafts (
      organization_id, page_id, kind, content, created_by, legal_review_required
    )
    values (
      current_setting('app.meta_test_org_id')::uuid,
      'test-page-1',
      'post',
      'Viewer must not create this draft.',
      '40000000-0000-0000-0000-000000000003',
      false
    )
  $$,
  '42501',
  null,
  'viewer cannot create Meta drafts'
);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*) from public.meta_drafts),
  0::bigint,
  'outsider cannot read another organization Meta drafts'
);
reset role;

set local role service_role;
select is(
  public.claim_meta_webhook_delivery(
    current_setting('app.meta_test_org_id')::uuid,
    '50000000-0000-0000-0000-000000000001',
    'meta:delivery-1',
    repeat('a', 64),
    timezone('utc', now()) + interval '1 hour'
  ),
  true,
  'first webhook delivery claim succeeds'
);
select is(
  public.claim_meta_webhook_delivery(
    current_setting('app.meta_test_org_id')::uuid,
    '50000000-0000-0000-0000-000000000001',
    'meta:delivery-1',
    repeat('a', 64),
    timezone('utc', now()) + interval '1 hour'
  ),
  false,
  'duplicate webhook delivery claim is rejected'
);
select is(
  (select count(*) from public.webhook_events where delivery_id = 'meta:delivery-1'),
  1::bigint,
  'webhook replay claim stores one redacted event envelope'
);

select lives_ok(
  $$
    select public.record_meta_webhook_health(
      current_setting('app.meta_test_org_id')::uuid,
      'test-page-1',
      true,
      timezone('utc', now())
    );
    select public.record_meta_webhook_health(
      current_setting('app.meta_test_org_id')::uuid,
      'test-page-1',
      false,
      timezone('utc', now())
    )
  $$,
  'service role can record accepted and rejected webhook health signals'
);
select ok(
  (
    select failed_deliveries = 1
      and last_verified_at is not null
      and last_delivery_at is not null
    from public.meta_webhook_health
    where organization_id = current_setting('app.meta_test_org_id')::uuid
      and page_id = 'test-page-1'
  ),
  'webhook health persists verification time and failure count'
);
reset role;

select * from finish();
rollback;
