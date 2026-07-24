# Meta Business MCP Staging Readiness Runbook

## Purpose

This runbook moves the Meta Business MCP from tested code to a controlled staging validation without enabling external writes.

The staging rule remains:

> AI may read and draft internally. No process may publish, schedule, reply, send, or delete.

The automated workflow is `.github/workflows/meta-staging-readiness.yml`. It is manual-only and must be protected by a GitHub Environment named `meta-staging`.

## What the workflow does

1. Requires the operator to type `READ_ONLY`.
2. Builds and tests the complete repository.
3. Validates a redacted staging configuration.
4. Links the repository to the staging Supabase project.
5. Lists local and remote migration history.
6. Runs `supabase db push --dry-run --linked`.
7. Calls the deployed service health endpoint.
8. Negotiates MCP protocol version `2025-11-25`.
9. Verifies the exact twelve-tool read/draft catalog.
10. Fails if any external-write tool is discoverable.
11. Calls only `meta_page_get` for the explicitly allowlisted Page.
12. Emits a redacted pass/fail report without Page content or tokens.

## What the workflow never does

- It does not create a Supabase project.
- It does not apply database migrations.
- It does not create or configure a Meta application.
- It does not request Meta permissions or app review.
- It does not create or rotate Page tokens.
- It does not deploy the MCP service.
- It does not configure a public webhook.
- It does not call a draft tool.
- It does not publish, schedule, reply, send, or delete.
- It does not print provider responses, message bodies, tokens, or server keys.

## Required approval checkpoints

Each checkpoint is independent. Approval of one checkpoint does not authorize later checkpoints.

### A. Staging infrastructure approval

Authorizes creation of:

- one staging Supabase project containing synthetic or staging-only records;
- one HTTPS deployment of the standalone Meta MCP container;
- one protected GitHub Environment named `meta-staging`;
- encrypted staging secrets and non-secret environment variables.

This does not authorize Meta application creation or Page access.

### B. Database migration approval

Authorizes applying the committed migrations to the staging Supabase project after the dry-run output has been reviewed.

The readiness workflow itself remains dry-run-only. Migration application should occur through a separately reviewed deployment action, with one operator applying migrations at a time.

### C. Meta application approval

Authorizes creating or selecting a dedicated staging Meta application and configuring only the permissions needed for approved read validation.

This does not authorize external writes, production Page access, Messenger sends, comments, publishing, scheduling, or deletion.

### D. Page connection approval

Authorizes connecting one explicitly named staging or controlled Page ID and storing its token in the approved secret manager.

The Page ID must match `META_STAGING_EXPECTED_PAGE_ID` and `META_ALLOWED_PAGE_IDS` exactly.

### E. Read-only validation approval

Authorizes running the protected GitHub Actions workflow against the deployed staging service.

## GitHub Environment configuration

Create an Environment named `meta-staging` and enable required reviewers before adding values.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_PROJECT_ID` | Staging Supabase project reference |
| `SUPABASE_URL` | Staging Supabase HTTPS origin |
| `SUPABASE_PUBLISHABLE_KEY` | Staging publishable key used with caller JWTs |
| `META_STAGING_BASE_URL` | HTTPS origin of the deployed Meta MCP service |
| `META_STAGING_ORIGIN` | Optional exact browser/client Origin expected by the service |
| `META_STAGING_EXPECTED_PAGE_ID` | The single Page ID approved for validation |
| `META_APP_ID` | Dedicated staging Meta application ID |
| `META_GRAPH_API_VERSION` | Explicit Graph API version validated for the staging app |
| `META_REMOTE_MCP_ORGANIZATION_ID` | Staging MCPMaster organization UUID |
| `META_REMOTE_MCP_INSTALLATION_ID` | Staging Meta connector installation UUID |

### Environment secrets

| Secret | Purpose | Exposure window |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Allows the Supabase CLI to link to the staging project | Supabase workflow steps |
| `SUPABASE_DB_PASSWORD` | Allows migration history and dry-run checks | Supabase workflow steps |
| `META_STAGING_STAFF_TOKEN` | Short-lived staff access token for the remote MCP smoke test | Smoke-test step only |

Provider Page tokens, Meta app secrets, webhook verify tokens, and the Supabase server key are intentionally not loaded by the readiness workflow.

## Staging database preparation

1. Create a new staging project rather than reusing production.
2. Confirm the project uses a supported current Postgres version.
3. Keep staging data synthetic. Do not copy Facebook messages, client files, or production legal matters.
4. Configure Auth for staging staff identities.
5. Apply repository migrations only after the dry-run output is reviewed and approved.
6. Confirm the application tables are exposed only as required and retain explicit grants plus RLS.
7. Create the staging organization and active staff membership.
8. Create one Meta connector installation with the exact Page ID and `active` or `degraded` status.
9. Confirm no real credentials are stored in database columns; only secret references may be stored.

## HTTPS deployment criteria

Deploy `apps/meta-business-mcp/Dockerfile` separately from the legacy bridge.

The deployment must:

- terminate TLS at a trusted ingress directly in front of the container;
- set `META_REMOTE_MCP_REQUIRE_HTTPS=true`;
- expose only `/health`, `/mcp`, and the deliberately enabled webhook route;
- bind the container to a private interface where the platform permits;
- set an exact Origin allowlist without wildcards;
- use a non-root runtime user;
- restrict outbound traffic to the configured Supabase origin, secret manager, and `graph.facebook.com`;
- keep external writes disabled in both configuration and code;
- send application logs to a staging-only sink with retention limits;
- avoid logging authorization headers, query tokens, Page content, comments, or inbox bodies.

## Meta staging application preparation

Do not use a personal Facebook password. Use a dedicated Meta application and official access tokens.

Before connecting a Page:

1. Record the application owner and recovery contacts.
2. Enable multi-factor authentication for administrators.
3. Document the exact approved Page ID.
4. Request only the read permissions required for the approved test cases.
5. Keep publishing, comment management, message sending, and deletion permissions out of scope.
6. Store tokens through the deployment platform's encrypted secret store or approved vault.
7. Set token-expiry and rotation reminders.
8. Document the immediate revocation path.
9. Keep the emergency kill switch available before the first call.

## Read-only validation procedure

1. Confirm all five write tools remain absent from `tools/list`:
   - `meta_post_publish`
   - `meta_post_schedule`
   - `meta_comment_reply`
   - `meta_message_send`
   - `meta_post_delete`
2. Confirm the `/health` response reports `externalWritesEnabled: false`.
3. Confirm the migration dry run contains only expected pending migrations or reports that staging is current.
4. Run **Meta Staging Readiness** from GitHub Actions.
5. Enter `READ_ONLY` exactly.
6. Approve the protected Environment deployment when the run is ready.
7. Review the redacted report.
8. Confirm that the only live provider tool invoked was `meta_page_get`.
9. Save the workflow run URL and commit SHA in the staging evidence record.

## Acceptance criteria

The staging gate passes only when:

- repository type-checking and all tests pass;
- both production container images build;
- the migration history is readable;
- the migration dry run succeeds without applying changes;
- the health endpoint confirms writes are disabled;
- MCP initialization succeeds over HTTPS;
- exactly twelve read/draft tools are visible;
- no write tool is visible;
- `meta_page_get` succeeds for the allowlisted Page;
- no token, Page content, inbox body, comment text, or client information appears in logs or workflow output.

## Failure response

On any failure:

1. Do not retry with broader permissions.
2. Keep external writes disabled.
3. Activate the emergency kill switch if the deployed service may be misconfigured.
4. Revoke the staging staff token if it may have been exposed.
5. Revoke the Page token for any provider-side anomaly.
6. disable the staging deployment or block ingress if authorization or Origin enforcement fails.
7. Preserve only redacted diagnostics.
8. Open a focused remediation PR and rerun local CI before another staging attempt.

## Rollback

A staging rollback consists of:

- disabling the service deployment;
- revoking the staging Page token;
- removing the Page ID from the allowlist;
- enabling the kill switch;
- removing the GitHub Environment's staff-token secret;
- reverting the application release to the last validated image;
- repairing migration state only through reviewed migration procedures, never by deleting schema history casually.

## Evidence record

For every staging attempt, record:

- date and operator;
- commit SHA and image digest;
- GitHub Actions run URL;
- Supabase project reference;
- Meta application ID and Page ID, without tokens;
- migration dry-run result;
- twelve-tool catalog result;
- Page-read result as pass/fail only;
- incidents, warnings, and rollback actions.
