# Meta Business MCP staging status

Last updated: 2026-07-24

## Repository readiness

The deployable Meta Business MCP implementation is present on `main`.

- authenticated Streamable HTTP MCP service
- eight read tools and four internal-draft tools
- no exposed or executable external-write tools
- Supabase-backed drafts and webhook state
- signed webhook verification and replay protection
- protected manual staging-readiness workflow
- root `Dockerfile.vercel`
- Vercel platform `PORT` and external-bind compatibility

## Vercel staging resource

A dedicated Vercel project exists.

- project name: `mcpmaster-meta-staging`
- project ID: `prj_aG8ekiHMsCEYn6dbIK5Mk4HeNuZ8`
- protected preview deployment ID: `dpl_4Bu6LKGRqFKYSw7Ww9fPjLSEZpKp`
- preview hostname: `mcpmaster-meta-staging-ey8ick0ph-mbanatao.vercel.app`

The current deployment remains a fail-closed bootstrap rather than the full Meta MCP runtime. It is protected by Vercel Authentication and intentionally reports:

- `externalWritesEnabled: false`
- `providerNetworkEnabled: false`
- `mcpEnabled: false`
- no Meta credentials
- no webhook endpoint configuration

The connected Vercel integration can deploy and inspect projects, but it does not expose encrypted environment-variable writes. The current execution workspace also has no authenticated Vercel CLI or browser-automation binary. Do not place secrets in source, deployment payloads, logs, or documentation.

## Supabase staging resource

The Free-plan capacity blocker has been resolved by explicit authorization to pause RealMatch.

### Project states

- `Battle` — `ydyzokdndnhwjpibrsvu` — unchanged
- `RealMatch` — `rkthpfdzzisudaxxqvgn` — paused / `INACTIVE`
- `MCPMaster Meta Staging` — `jcyqixttuebxqqfkjonq` — `ACTIVE_HEALTHY`

The staging project is isolated from Battle and RealMatch.

- region: `ap-southeast-2`
- API origin: `https://jcyqixttuebxqqfkjonq.supabase.co`
- quoted recurring project cost at creation: `$0/month`

### Applied repository migrations

The remote migration history matches the repository versions:

- `20260724010000` — `control_plane_foundation`
- `20260724030000` — `meta_remote_mcp_persistence`

The installed schema includes:

- profiles, organizations, memberships, and connector installations
- credential references
- workflow runs, steps, approvals, and append-only audit events
- webhook event replay state
- Meta drafts and webhook health
- exact approval and webhook RPCs

RLS is enabled on every application table. `credential_refs`, `webhook_events`, and `meta_webhook_health` intentionally have no authenticated-user policies and remain server-only.

### Auth and tenant readiness

A real staging Supabase Auth identity has been created through the supported email/password signup flow and is email-confirmed.

- Auth user ID: `76a3bf0a-5bfa-4ce2-b92a-3646824e5754`
- profile display name: `MCPMaster Staging Owner`
- profile timezone: `Asia/Manila`
- confirmed sign-in recorded by Supabase Auth

The staging tenant exists and is active.

- organization ID: `2270b266-59da-4c39-bfd9-9f8d08352af0`
- organization slug: `mcpmaster-staging`
- membership role: `owner`
- membership status: `active`
- exactly one `organization.created` append-only audit event exists

Temporary database HTTP transport used for the supported Auth call was removed after use. Its bookkeeping records were also removed, leaving only the two canonical repository migrations in remote history.

### Advisor review

Supabase security and performance advisors were run after migration.

Security results contain no critical finding. Informational notices for server-only RLS tables are intentional. Warnings for `create_organization` and `decide_approval` reflect reviewed `SECURITY DEFINER` RPCs that perform explicit authentication and organization-role checks.

Performance results are informational on an empty staging database. Missing foreign-key indexes should be evaluated through a repository migration after workload evidence; do not add staging-only indexes that create schema drift. Unused-index notices are expected before traffic exists.

## Remaining controlled steps

1. Approve an exact Facebook Page ID for staging.
2. Create the Meta connector installation for that Page only.
3. Add reviewed encrypted Vercel environment variables and server-side secret references through an authenticated Vercel dashboard or CLI session.
4. Replace the fail-closed bootstrap with the repository Meta MCP runtime.
5. Create or connect a dedicated Meta developer staging application through an authenticated human owner.
6. Store a short-lived Page token only in encrypted secret storage.
7. Run the manual `Meta Staging Readiness` workflow with confirmation `READ_ONLY`.
8. Verify service health, MCP initialization, exact twelve-tool discovery, and one `meta_page_get` call.

## Hold points

Do not:

- restore or delete RealMatch without explicit authorization;
- apply MCPMaster migrations to Battle or RealMatch;
- fabricate or directly mutate Auth confirmation state;
- create or connect a Meta application without an authenticated human owner;
- commit or log provider, Supabase server, staff access, or refresh tokens;
- expose webhooks before signature verification and ingress are reviewed;
- enable publishing, scheduling, replies, messages, or deletion.
