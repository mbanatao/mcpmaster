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

A dedicated Vercel project has been created.

- project name: `mcpmaster-meta-staging`
- project ID: `prj_aG8ekiHMsCEYn6dbIK5Mk4HeNuZ8`
- protected preview deployment ID: `dpl_4Bu6LKGRqFKYSw7Ww9fPjLSEZpKp`
- preview hostname: `mcpmaster-meta-staging-ey8ick0ph-mbanatao.vercel.app`

The current deployment is a fail-closed bootstrap, not the full Meta MCP runtime. It contains explicit Vercel Functions for readiness and MCP-blocked responses because no isolated Supabase resource or provider credentials are available yet.

The bootstrap state is intentionally:

- `externalWritesEnabled: false`
- `providerNetworkEnabled: false`
- `mcpEnabled: false`
- no Supabase credentials
- no Meta credentials
- no webhook endpoint configuration

The preview is protected by Vercel Authentication.

## Supabase capacity blocker

The connected Supabase organization currently contains two active Free-plan projects:

- `Battle` — `ydyzokdndnhwjpibrsvu`
- `RealMatch` — `rkthpfdzzisudaxxqvgn`

The following safe provisioning attempts were made:

1. Create an isolated `mcpmaster-meta-staging` branch from `Battle`.
   - rejected because database branching requires the Pro plan or above.
2. Create a separate `MCPMaster Meta Staging` project in `ap-southeast-2`.
   - quoted cost: `$0/month`.
   - rejected because the organization has reached the two-active-Free-project limit.

No existing Supabase project was paused, deleted, migrated, or repurposed.

## Decision required before database provisioning

Choose one of these paths:

1. Upgrade the Supabase organization to Pro, then create an isolated branch from `Battle`.
2. Intentionally pause or delete a disposable existing Supabase project, then create a separate staging project.
3. Explicitly authorize a reviewed isolated-schema strategy inside an existing project. This is not recommended and has not been implemented.

Do not choose or execute one of these paths implicitly.

## Next actions after capacity is available

1. Create the isolated Supabase staging resource in `ap-southeast-2`.
2. Apply all repository migrations.
3. Run Supabase security and performance advisors.
4. Seed a dedicated staging organization, active staff membership, and Meta connector installation.
5. Store only encrypted Vercel staging environment variables and server-side secret references.
6. Replace the fail-closed Vercel bootstrap with the repository `Dockerfile.vercel` deployment.
7. Create or connect a dedicated Meta developer staging application.
8. Allowlist exactly one approved Facebook Page ID.
9. Run the manual `Meta Staging Readiness` workflow with confirmation `READ_ONLY`.
10. Verify service health, MCP initialization, exact twelve-tool discovery, and one `meta_page_get` call.

## Hold points

Do not:

- pause or delete `Battle` or `RealMatch` without explicit authorization;
- apply MCPMaster migrations to either existing project;
- create or connect a Meta application without an authenticated human owner;
- add real provider credentials before the isolated database and HTTPS runtime are reviewed;
- expose webhooks;
- enable publishing, scheduling, replies, messages, or deletion.
