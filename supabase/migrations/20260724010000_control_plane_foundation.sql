create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create type public.member_role as enum ('owner', 'admin', 'operator', 'member', 'viewer');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'revoked');
create type public.connector_status as enum ('pending', 'active', 'degraded', 'revoked');
create type public.rotation_status as enum ('current', 'rotation_due', 'rotating', 'revoked');
create type public.risk_class as enum ('R0', 'R1', 'R2', 'R3', 'R4');
create type public.workflow_run_status as enum (
  'queued', 'planning', 'waiting_approval', 'running', 'completed',
  'completed_with_warnings', 'failed', 'cancelled', 'expired'
);
create type public.workflow_step_status as enum (
  'pending', 'running', 'waiting_approval', 'succeeded', 'failed',
  'skipped', 'cancelled'
);
create type public.approval_decision as enum ('pending', 'approved', 'denied', 'expired', 'revoked');
create type public.audit_actor_type as enum ('human', 'system', 'provider');
create type public.webhook_status as enum ('received', 'processing', 'processed', 'failed', 'ignored');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id),
  check ((status = 'active' and joined_at is not null) or status <> 'active')
);

create index memberships_user_id_idx on public.memberships(user_id, status);
create index memberships_org_role_idx on public.memberships(organization_id, role, status);

create table public.connector_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,63}$'),
  external_account_id text not null,
  display_name text,
  status public.connector_status not null default 'pending',
  scopes text[] not null default '{}',
  configuration jsonb not null default '{}'::jsonb,
  installed_by uuid not null references auth.users(id),
  last_health_check_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  unique (organization_id, provider, external_account_id)
);

create index connector_installations_org_status_idx
  on public.connector_installations(organization_id, status);

create table public.credential_refs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_id uuid not null,
  secret_ref text not null,
  key_version integer not null default 1 check (key_version > 0),
  expires_at timestamptz,
  rotation_state public.rotation_status not null default 'current',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (installation_id),
  foreign key (installation_id, organization_id)
    references public.connector_installations(id, organization_id)
    on delete cascade
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_key text not null,
  workflow_version text not null,
  status public.workflow_run_status not null default 'queued',
  requester_id uuid not null references auth.users(id),
  risk_ceiling public.risk_class not null default 'R1',
  input_redacted jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  budget_cents integer not null default 0 check (budget_cents >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  unique (organization_id, idempotency_key),
  check (completed_at is null or started_at is not null)
);

create index workflow_runs_org_status_created_idx
  on public.workflow_runs(organization_id, status, created_at desc);
create index workflow_runs_requester_idx
  on public.workflow_runs(requester_id, created_at desc);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  step_key text not null,
  sequence integer not null check (sequence >= 0),
  tool_name text,
  status public.workflow_step_status not null default 'pending',
  risk public.risk_class not null default 'R0',
  approval_required boolean not null default false,
  idempotency_key text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  input_redacted jsonb not null default '{}'::jsonb,
  result_redacted jsonb,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  unique (id, run_id, organization_id),
  unique (run_id, step_key),
  foreign key (run_id, organization_id)
    references public.workflow_runs(id, organization_id)
    on delete cascade,
  check (completed_at is null or started_at is not null)
);

create unique index workflow_steps_org_idempotency_idx
  on public.workflow_steps(organization_id, idempotency_key)
  where idempotency_key is not null;
create index workflow_steps_run_sequence_idx on public.workflow_steps(run_id, sequence);
create index workflow_steps_org_status_idx on public.workflow_steps(organization_id, status);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  step_id uuid,
  requested_by uuid not null references auth.users(id),
  assigned_to uuid references auth.users(id),
  decision public.approval_decision not null default 'pending',
  decision_by uuid references auth.users(id),
  action_hash text not null check (action_hash ~ '^[0-9a-f]{64}$'),
  preview_redacted jsonb not null,
  request_reason text,
  decision_reason text,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (run_id, organization_id)
    references public.workflow_runs(id, organization_id)
    on delete cascade,
  foreign key (step_id, run_id, organization_id)
    references public.workflow_steps(id, run_id, organization_id)
    on delete cascade,
  check (
    (decision = 'pending' and decision_by is null and decided_at is null)
    or (decision <> 'pending' and decided_at is not null)
  )
);

create unique index approvals_one_pending_per_step_idx
  on public.approvals(step_id)
  where step_id is not null and decision = 'pending';
create index approvals_org_decision_expiry_idx
  on public.approvals(organization_id, decision, expires_at);
create index approvals_assigned_pending_idx
  on public.approvals(assigned_to, expires_at)
  where decision = 'pending';

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_id uuid,
  step_id uuid,
  actor_type public.audit_actor_type not null,
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  payload_redacted jsonb not null default '{}'::jsonb,
  previous_hash text check (previous_hash is null or previous_hash ~ '^[0-9a-f]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (run_id, organization_id)
    references public.workflow_runs(id, organization_id)
    on delete restrict,
  foreign key (step_id, organization_id)
    references public.workflow_steps(id, organization_id)
    on delete restrict
);

create index audit_events_org_id_desc_idx on public.audit_events(organization_id, id desc);
create index audit_events_run_id_idx on public.audit_events(run_id, id);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  installation_id uuid not null,
  provider text not null,
  delivery_id text not null,
  event_type text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status public.webhook_status not null default 'received',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, delivery_id),
  foreign key (installation_id, organization_id)
    references public.connector_installations(id, organization_id)
    on delete cascade
);

create index webhook_events_status_received_idx on public.webhook_events(status, received_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'::public.membership_status
    );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.memberships membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'::public.membership_status
        and membership.role = any(allowed_roles)
    );
$$;

create or replace function private.append_audit_event(
  target_organization_id uuid,
  target_run_id uuid,
  target_step_id uuid,
  target_actor_type public.audit_actor_type,
  target_actor_user_id uuid,
  target_event_type text,
  target_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_hash text;
  created_timestamp timestamptz := clock_timestamp();
  calculated_hash text;
  inserted_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  select event_hash
    into prior_hash
  from public.audit_events
  where organization_id = target_organization_id
  order by id desc
  limit 1;

  calculated_hash := encode(
    extensions.digest(
      concat_ws(
        '|',
        target_organization_id::text,
        coalesce(target_run_id::text, ''),
        coalesce(target_step_id::text, ''),
        target_actor_type::text,
        coalesce(target_actor_user_id::text, ''),
        target_event_type,
        coalesce(target_payload, '{}'::jsonb)::text,
        coalesce(prior_hash, ''),
        created_timestamp::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.audit_events (
    organization_id, run_id, step_id, actor_type, actor_user_id,
    event_type, payload_redacted, previous_hash, event_hash, created_at
  )
  values (
    target_organization_id, target_run_id, target_step_id, target_actor_type,
    target_actor_user_id, target_event_type, coalesce(target_payload, '{}'::jsonb),
    prior_hash, calculated_hash, created_timestamp
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (organization_name, lower(organization_slug), current_user_id)
  returning id into new_organization_id;

  insert into public.memberships (
    organization_id, user_id, role, status, invited_by, joined_at
  )
  values (
    new_organization_id, current_user_id, 'owner'::public.member_role,
    'active'::public.membership_status, current_user_id, timezone('utc', now())
  );

  perform private.append_audit_event(
    new_organization_id, null, null, 'human'::public.audit_actor_type,
    current_user_id, 'organization.created',
    jsonb_build_object('slug', lower(organization_slug))
  );

  return new_organization_id;
end;
$$;

create or replace function public.decide_approval(
  approval_id uuid,
  requested_decision public.approval_decision,
  reason text default null
)
returns public.approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  approval_row public.approvals%rowtype;
  step_risk public.risk_class := 'R1'::public.risk_class;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if requested_decision not in (
    'approved'::public.approval_decision,
    'denied'::public.approval_decision
  ) then
    raise exception 'decision must be approved or denied';
  end if;

  select *
    into approval_row
  from public.approvals
  where id = approval_id
  for update;

  if not found then
    raise exception 'approval not found';
  end if;

  if approval_row.step_id is not null then
    select risk
      into step_risk
    from public.workflow_steps
    where id = approval_row.step_id;
  end if;

  if approval_row.decision <> 'pending'::public.approval_decision then
    raise exception 'approval is no longer pending';
  end if;

  if approval_row.expires_at <= timezone('utc', now()) then
    raise exception 'approval has expired';
  end if;

  if approval_row.assigned_to is not null
     and approval_row.assigned_to <> current_user_id then
    raise exception 'approval is assigned to another staff member';
  end if;

  if not private.has_org_role(
    approval_row.organization_id,
    array['owner', 'admin', 'operator']::public.member_role[]
  ) then
    raise exception 'insufficient approval role' using errcode = '42501';
  end if;

  if step_risk in ('R3'::public.risk_class, 'R4'::public.risk_class)
     and approval_row.requested_by = current_user_id then
    raise exception 'high-risk requests require a different approver';
  end if;

  update public.approvals
  set decision = requested_decision,
      decision_by = current_user_id,
      decision_reason = reason,
      decided_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = approval_id
  returning * into approval_row;

  perform private.append_audit_event(
    approval_row.organization_id,
    approval_row.run_id,
    approval_row.step_id,
    'human'::public.audit_actor_type,
    current_user_id,
    'approval.' || requested_decision::text,
    jsonb_build_object(
      'approval_id', approval_row.id,
      'action_hash', approval_row.action_hash
    )
  );

  return approval_row;
end;
$$;

create or replace function public.record_audit_event(
  p_organization_id uuid,
  p_event_type text,
  p_actor_type public.audit_actor_type,
  p_payload_redacted jsonb default '{}'::jsonb,
  p_run_id uuid default null,
  p_step_id uuid default null,
  p_actor_user_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
  ) then
    raise exception 'organization not found';
  end if;

  return private.append_audit_event(
    p_organization_id,
    p_run_id,
    p_step_id,
    p_actor_type,
    p_actor_user_id,
    p_event_type,
    coalesce(p_payload_redacted, '{}'::jsonb)
  );
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();
create trigger connector_installations_set_updated_at before update on public.connector_installations
  for each row execute function private.set_updated_at();
create trigger credential_refs_set_updated_at before update on public.credential_refs
  for each row execute function private.set_updated_at();
create trigger workflow_runs_set_updated_at before update on public.workflow_runs
  for each row execute function private.set_updated_at();
create trigger workflow_steps_set_updated_at before update on public.workflow_steps
  for each row execute function private.set_updated_at();
create trigger approvals_set_updated_at before update on public.approvals
  for each row execute function private.set_updated_at();
create trigger webhook_events_set_updated_at before update on public.webhook_events
  for each row execute function private.set_updated_at();

create trigger audit_events_prevent_update before update on public.audit_events
  for each row execute function private.prevent_audit_mutation();
create trigger audit_events_prevent_delete before delete on public.audit_events
  for each row execute function private.prevent_audit_mutation();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.connector_installations enable row level security;
alter table public.credential_refs enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_events enable row level security;
alter table public.webhook_events enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) is not null and id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) is not null and id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select_member on public.organizations for select to authenticated
  using (created_by = (select auth.uid()) or private.is_org_member(id));
create policy organizations_update_admin on public.organizations for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_org_role(id, array['owner', 'admin']::public.member_role[]));

create policy memberships_select_org on public.memberships for select to authenticated
  using (private.is_org_member(organization_id));
create policy memberships_insert_admin on public.memberships for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])
    and (
      private.has_org_role(organization_id, array['owner']::public.member_role[])
      or role in (
        'operator'::public.member_role,
        'member'::public.member_role,
        'viewer'::public.member_role
      )
    )
  );
create policy memberships_update_admin on public.memberships for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (
    private.has_org_role(organization_id, array['owner']::public.member_role[])
    or (
      private.has_org_role(organization_id, array['admin']::public.member_role[])
      and role in (
        'operator'::public.member_role,
        'member'::public.member_role,
        'viewer'::public.member_role
      )
    )
  );
create policy memberships_delete_admin on public.memberships for delete to authenticated
  using (
    private.has_org_role(organization_id, array['owner']::public.member_role[])
    or (
      private.has_org_role(organization_id, array['admin']::public.member_role[])
      and role in (
        'operator'::public.member_role,
        'member'::public.member_role,
        'viewer'::public.member_role
      )
    )
  );

create policy connector_installations_select_member
  on public.connector_installations for select to authenticated
  using (private.is_org_member(organization_id));

create policy workflow_runs_select_member on public.workflow_runs for select to authenticated
  using (private.is_org_member(organization_id));
create policy workflow_runs_insert_operator on public.workflow_runs for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and private.has_org_role(
      organization_id,
      array['owner', 'admin', 'operator', 'member']::public.member_role[]
    )
  );

create policy workflow_steps_select_member on public.workflow_steps for select to authenticated
  using (private.is_org_member(organization_id));
create policy approvals_select_member on public.approvals for select to authenticated
  using (private.is_org_member(organization_id));
create policy audit_events_select_privileged_member
  on public.audit_events for select to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner', 'admin', 'operator', 'viewer']::public.member_role[]
    )
  );

revoke all on all tables in schema public from anon;

revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;
revoke all on public.organizations from authenticated;
grant select, update on public.organizations to authenticated;
revoke all on public.memberships from authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
revoke all on public.connector_installations from authenticated;
grant select on public.connector_installations to authenticated;
revoke all on public.credential_refs from authenticated;
revoke all on public.workflow_runs from authenticated;
grant select, insert on public.workflow_runs to authenticated;
revoke all on public.workflow_steps from authenticated;
grant select on public.workflow_steps to authenticated;
revoke all on public.approvals from authenticated;
grant select on public.approvals to authenticated;
revoke all on public.audit_events from authenticated, service_role;
grant select on public.audit_events to authenticated, service_role;
revoke all on public.webhook_events from authenticated;

revoke all on public.profiles,
  public.organizations,
  public.memberships,
  public.connector_installations,
  public.credential_refs,
  public.workflow_runs,
  public.workflow_steps,
  public.approvals,
  public.webhook_events
from service_role;

grant all on public.profiles,
  public.organizations,
  public.memberships,
  public.connector_installations,
  public.credential_refs,
  public.workflow_runs,
  public.workflow_steps,
  public.approvals,
  public.webhook_events
to service_role;

grant usage, select on all sequences in schema public to service_role;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.append_audit_event(
  uuid, uuid, uuid, public.audit_actor_type, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function private.prevent_audit_mutation() from public, anon, authenticated;

revoke execute on function private.is_org_member(uuid) from public, anon, authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
revoke execute on function private.has_org_role(uuid, public.member_role[]) from public, anon, authenticated;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated;

revoke execute on function public.create_organization(text, text) from public, anon, authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
revoke execute on function public.decide_approval(
  uuid, public.approval_decision, text
) from public, anon, authenticated;
grant execute on function public.decide_approval(
  uuid, public.approval_decision, text
) to authenticated;
revoke execute on function public.record_audit_event(
  uuid, text, public.audit_actor_type, jsonb, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.record_audit_event(
  uuid, text, public.audit_actor_type, jsonb, uuid, uuid, uuid
) to service_role;
