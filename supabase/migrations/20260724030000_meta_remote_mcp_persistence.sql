create table public.meta_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_id text not null check (char_length(page_id) between 1 and 128),
  kind text not null check (kind in ('post', 'comment_reply', 'message_reply', 'weekly_plan')),
  target_id text check (target_id is null or char_length(target_id) between 1 and 256),
  content text not null check (char_length(content) between 1 and 10000),
  created_by uuid not null references auth.users(id),
  legal_review_required boolean not null default false,
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id)
);

create index meta_drafts_org_page_created_idx
  on public.meta_drafts(organization_id, page_id, created_at desc);
create index meta_drafts_creator_created_idx
  on public.meta_drafts(created_by, created_at desc);

create table public.meta_webhook_health (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_id text not null check (char_length(page_id) between 1 and 128),
  signature_verification_enabled boolean not null default true,
  last_verified_at timestamptz,
  last_delivery_at timestamptz,
  pending_deliveries integer not null default 0 check (pending_deliveries >= 0),
  failed_deliveries integer not null default 0 check (failed_deliveries >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, page_id)
);

alter table public.webhook_events
  add column expires_at timestamptz;

create index webhook_events_expires_at_idx
  on public.webhook_events(expires_at)
  where expires_at is not null;

create trigger meta_drafts_set_updated_at before update on public.meta_drafts
  for each row execute function private.set_updated_at();
create trigger meta_webhook_health_set_updated_at before update on public.meta_webhook_health
  for each row execute function private.set_updated_at();

alter table public.meta_drafts enable row level security;
alter table public.meta_webhook_health enable row level security;

create policy meta_drafts_select_member
  on public.meta_drafts for select to authenticated
  using (private.is_org_member(organization_id));

create policy meta_drafts_insert_staff
  on public.meta_drafts for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_org_role(
      organization_id,
      array['owner', 'admin', 'operator', 'member']::public.member_role[]
    )
  );

revoke all on public.meta_drafts from anon, authenticated;
grant select, insert on public.meta_drafts to authenticated;
revoke all on public.meta_webhook_health from anon, authenticated;

grant all on public.meta_drafts, public.meta_webhook_health to service_role;

create or replace function public.claim_meta_webhook_delivery(
  p_organization_id uuid,
  p_installation_id uuid,
  p_delivery_id text,
  p_payload_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer;
begin
  if p_delivery_id is null or btrim(p_delivery_id) = '' then
    raise exception 'delivery id is required';
  end if;

  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'payload hash must be a lowercase SHA-256 hex digest';
  end if;

  if p_expires_at is null or p_expires_at <= timezone('utc', now()) then
    raise exception 'delivery expiry must be in the future';
  end if;

  if not exists (
    select 1
    from public.connector_installations installation
    where installation.id = p_installation_id
      and installation.organization_id = p_organization_id
      and installation.provider = 'meta'
      and installation.status in (
        'active'::public.connector_status,
        'degraded'::public.connector_status
      )
  ) then
    raise exception 'active Meta installation not found';
  end if;

  insert into public.webhook_events (
    organization_id,
    installation_id,
    provider,
    delivery_id,
    event_type,
    payload_hash,
    status,
    expires_at
  )
  values (
    p_organization_id,
    p_installation_id,
    'meta',
    btrim(p_delivery_id),
    'delivery',
    p_payload_hash,
    'received'::public.webhook_status,
    p_expires_at
  )
  on conflict (provider, delivery_id) do nothing;

  get diagnostics inserted_rows = row_count;
  return inserted_rows = 1;
end;
$$;

create or replace function public.record_meta_webhook_health(
  p_organization_id uuid,
  p_page_id text,
  p_accepted boolean,
  p_received_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_page_id is null or btrim(p_page_id) = '' then
    raise exception 'Page ID is required';
  end if;

  if p_received_at is null then
    raise exception 'received timestamp is required';
  end if;

  if not exists (
    select 1
    from public.connector_installations installation
    where installation.organization_id = p_organization_id
      and installation.provider = 'meta'
      and installation.external_account_id = btrim(p_page_id)
      and installation.status in (
        'active'::public.connector_status,
        'degraded'::public.connector_status
      )
  ) then
    raise exception 'configured Meta Page not found';
  end if;

  insert into public.meta_webhook_health (
    organization_id,
    page_id,
    signature_verification_enabled,
    last_verified_at,
    last_delivery_at,
    failed_deliveries
  )
  values (
    p_organization_id,
    btrim(p_page_id),
    true,
    case when p_accepted then p_received_at else null end,
    p_received_at,
    case when p_accepted then 0 else 1 end
  )
  on conflict (organization_id, page_id) do update
  set signature_verification_enabled = true,
      last_verified_at = case
        when p_accepted then excluded.last_delivery_at
        else public.meta_webhook_health.last_verified_at
      end,
      last_delivery_at = excluded.last_delivery_at,
      failed_deliveries = public.meta_webhook_health.failed_deliveries
        + case when p_accepted then 0 else 1 end,
      updated_at = timezone('utc', now());
end;
$$;

revoke execute on function public.claim_meta_webhook_delivery(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.claim_meta_webhook_delivery(
  uuid, uuid, text, text, timestamptz
) to service_role;

revoke execute on function public.record_meta_webhook_health(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.record_meta_webhook_health(
  uuid, text, boolean, timestamptz
) to service_role;
