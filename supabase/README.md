# MCPMaster Control Plane Database

This directory contains the reproducible local Supabase database for the MCPMaster control plane.

It does not connect to a hosted Supabase project and contains no production credentials.

## Current scope

The initial migration creates:

- user profiles linked to `auth.users`;
- organizations and staff memberships;
- connector installation metadata;
- server-only encrypted credential references;
- workflow runs and steps;
- approval requests bound to exact action hashes;
- append-only, hash-chained audit events;
- deduplicated webhook event envelopes.

## Security properties

- Row Level Security is enabled on every table in `public`.
- Tenant access is derived from active organization membership.
- Authorization never relies on user-editable `user_metadata`.
- Credential references and raw webhook processing state are server-only.
- Workflow steps and approval requests are created by trusted server code.
- Approval decisions are performed through `public.decide_approval`.
- R3 and R4 actions cannot be approved by their requester.
- Audit records are hash chained and rejected on update or delete.
- External mutation idempotency keys are unique within an organization.

## Local verification

Install Docker and the Supabase CLI, then run:

```bash
supabase db start
supabase test db
supabase stop --no-backup
```

The CI workflow pins Supabase CLI `2.84.2` and runs the same migration and pgTAP test sequence on every pull request.

## Hosted environments

A hosted development or staging project will be linked only after explicit approval. Before linking:

1. Review every migration and RLS policy.
2. Run database tests locally.
3. Run Supabase database advisors against the target project.
4. Confirm environment separation and backup policy.
5. Use `supabase db push --dry-run` before applying migrations.

Never run a linked database reset against production.
