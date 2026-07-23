# 19. Dashboard Information Architecture

## 19.1 Main navigation

- **Home:** health, current runs, pending approvals, spend.
- **Workflows:** catalog, templates, schedules.
- **Runs:** timeline, plan, steps, evidence, cost.
- **Approvals:** pending, decided, expired.
- **Connectors:** installed accounts, scopes, health, rotation.
- **Meta Business:** Page status, inbox review, drafts, webhook health, Page allowlist, and kill switch.
- **Policies:** risk rules, budgets, environment restrictions, law-office response policy.
- **Audit:** immutable event explorer and export.
- **Usage:** model and connector usage.
- **Settings:** workspace, members, roles, notifications.

## 19.2 Run detail page

The run page is the core product screen. It should show:

- Original request.
- Parsed objective and assumptions.
- Structured plan.
- Step timeline.
- Approval cards.
- Live progress.
- Tool inputs and safe result summaries.
- Verification evidence.
- Total cost and duration.
- Final report.
- Recovery controls.

## 19.3 Meta Business screens

The Meta domain application adds:

- Meta installation and token-health screen.
- Explicit Facebook Page allowlist.
- Inbox attention queue containing redacted summaries.
- Post, comment-reply, and message-reply draft editor.
- Exact outbound preview and approval card.
- Webhook verification and processing health.
- Organization, installation, Page, and tool-level kill switches.
- Token rotation/revocation status.
- Law-office escalation queue.
- Redacted audit and provider verification evidence.

The browser never receives Meta access tokens or raw OAuth secrets.

# 20. Repository Migration Plan

Do not replace the repository in a big-bang rewrite. Use incremental branches and maintain a running, validated application after each phase.

## 20.1 Target structure

```text
apps/
  control-plane/
    app/
      (dashboard)/
      api/
      mcp/
    workflows/
  meta-business-mcp/
    src/
      mcp/
      meta/
      tools/
      webhooks/
      approvals/
      audit/
      security/
      policies/
    tests/
      unit/
      integration/
      security/
      fixtures/
packages/
  core/
  db/
  policy/
  shared-security/
  model-router/
  tool-registry/
  connectors/
    github/
    vercel/
    linear/
    notion/
  mcp-gateway/
  audit/
supabase/
  migrations/
  tests/
tests/
  unit/
  integration/
  e2e/
docs/
  architecture/
  decisions/
  runbooks/
legacy/
```

The Meta Business MCP is a separate application and deployment boundary. It may reuse shared packages, but it must not share the legacy generic tool dispatcher, process, credential store, or unrestricted route surface.

## 20.2 What to preserve

- Useful service-specific API client logic after contract review.
- Existing schemas that match real provider responses.
- Existing UI assets that support the control-center vision.
- Deployment documentation that remains accurate after validation.
- The secure GitHub-first runtime foundation as the initial supported execution slice.

## 20.3 What to replace first

- Unauthenticated generic `/tools` execution.
- `demo-key` fallbacks.
- Duplicated tool arrays and registries.
- Mixed stdio and HTTP startup in one server file.
- Fake logs and misleading metrics.
- Broken Docker build/start path.
- Vercel configuration that treats a long-running listener as a normal serverless handler.
- Shared secret/configuration patterns that could expose Meta credentials to unrelated connectors.

## 20.4 Branch strategy

- Protect `main`.
- Use small PRs by architectural seam.
- Require typecheck, unit tests, migration tests, build checks, and security-negative tests where relevant.
- Keep `docs/current-state.md` distinguishing implemented, partial, mocked, unsupported, and planned behavior.
- Keep the architecture blueprint and implementation PRs separate.
- Build Meta in focused PRs: scaffold, security/registry, read tools, webhooks, draft tools, approvals, write tools, dashboard, and runbooks.

# 21. Delivery Roadmap

Adding the dedicated Meta Business MCP changes the realistic initial program from twelve weeks to approximately **sixteen weeks** for a controlled law-office pilot. This assumes a focused small team and excludes external delays caused by provider application review or production-permission approval.

## Phase 0 — Stabilize and Inventory (Week 1)

Deliverables:

- Secret scan and credential rotation if necessary.
- Disable or protect unsafe execution endpoints.
- Add real build, typecheck, lint, and test scripts.
- Add CI.
- Create current-state capability matrix.
- Freeze unsupported connectors.
- Establish a compiled, container-first GitHub runtime.

Exit criteria: repository builds reliably; no unauthenticated mutation path; documentation is truthful.

Status note: the secure-runtime foundation PR implements most of this phase and must be reviewed and merged before domain credentials are introduced.

## Phase 1 — Control Plane Foundation (Weeks 2–3)

Deliverables:

- Next.js dashboard shell.
- Supabase Auth and organization membership.
- RLS migrations and pgTAP policies.
- Workflow run, step, approval, audit, artifact, installation, and usage tables.
- Staff roles suitable for requester, secretary/operator, lawyer/approver, administrator, and auditor.
- Environment separation: local, preview, staging, production.

Exit criteria: an authenticated tenant can create and view a mock run without seeing another tenant’s data; approvals and audit events persist.

## Phase 2 — Tool Registry and GitHub Connector (Weeks 4–5)

Deliverables:

- Single typed tool registry.
- Shared security, redaction, policy, idempotency, and audit packages.
- GitHub App installation and webhook handling.
- GitHub read tools: repositories, issues, PRs, checks, commits.
- GitHub low-risk write tools: create issue, label, comment—disabled by default.
- Connector contract tests.

Exit criteria: a workspace can install the GitHub App and run a cited read-only repository report from the canonical registry.

## Phase 3 — Durable Workflow and Approval Engine (Weeks 6–7)

Deliverables:

- Workflow engine adapter.
- Retries, cancellation, idempotency, and progress events.
- Approval creation, expiration, exact-action hashing, re-authentication, and decision UI.
- Policy engine with R0–R4 classifications.
- Immutable persistent audit events.
- Kill-switch abstraction and pre-execution policy recheck.

Exit criteria: a workflow pauses before a write, resumes only after approval, writes once, verifies, records evidence, and fails closed when permissions or arguments change.

## Phase 4 — Model Router and First Platform Workflows (Weeks 8–9)

Deliverables:

- Multi-provider model adapter and gateway integration.
- Tier routing and per-run budgets.
- PII minimization and prompt-input classification.
- Engineering Morning Brief.
- PR Triage.
- Bug-to-Workstream plan with GitHub write approval.
- Evaluation dataset and quality dashboard.

Exit criteria: workflows route tasks by tier, stay within budget, resist prompt injection, and pass evaluation thresholds.

## Phase 5 — Meta Business MCP Read, Webhook, and Draft Foundation (Weeks 10–12)

Deliverables:

- Scaffold `apps/meta-business-mcp` as an independently deployable service.
- Meta tool registry, permissions matrix, law-office policy, and threat model.
- Mocked Meta API client and synthetic fixtures.
- Safe read tools for Page, posts, comments, inbox, insights, and webhook health.
- Signed webhook verification, replay prevention, Page allowlisting, deduplication, and asynchronous processing.
- Draft-only post, comment reply, message reply, and weekly-plan tools.
- Dashboard Page allowlist, webhook health, drafts, and staff attention queue.
- No real Meta credentials and no production mutations.

Exit criteria: using only synthetic/mocked data, authorized staff can review Page/inbox activity and create policy-classified drafts; invalid signatures, disallowed Page IDs, and replay attempts fail closed.

## Phase 6 — Meta Approval-Bound Writes and Remote MCP (Weeks 13–14)

Deliverables:

- Approval-bound publish, schedule, comment reply, message send, and delete tools.
- Exact preview, action hash, idempotency, verification, redacted evidence, and emergency kill switches.
- Token encryption-reference, expiry, rotation, and revocation workflows.
- Remote MCP endpoint for approved Claude/OpenAI-compatible hosts.
- Email approval notifications through Resend.
- Law-office escalation into BatallaOS/MCPMaster.
- Security-negative and duplicate-mutation tests.
- Non-production provider configuration only after explicit approval.

Exit criteria: an approved synthetic or explicitly authorized non-production action executes once, verifies successfully, records evidence, and cannot bypass staff identity, Page allowlisting, legal-risk policy, or human approval.

## Phase 7 — Hardening and Controlled Law-Office Pilot (Weeks 15–16)

Deliverables:

- Independent security review.
- Load, webhook-volume, retry, and failure testing.
- Billing/usage limits.
- Staff onboarding and approval training.
- Meta Developer setup guide, permissions matrix, data policy, threat model, deployment guide, and incident/token-revocation runbooks.
- Kill-switch and credential-revocation rehearsal.
- Current official Meta and AI-host requirements revalidated.
- Controlled pilot with Batalla & Associates after separate launch approval.

Exit criteria: authorized staff complete primary read, draft, approve, publish/schedule, and inquiry-review workflows without engineering intervention; no critical security findings remain; no automatic legal advice is sent.

## Post-pilot expansion

Linear and Notion cross-tool workflows, additional Pages, Messenger, and WhatsApp Business are scheduled after the initial Meta pilot unless a separate priority decision changes the order.

# 22. Epic Backlog and Acceptance Criteria

## Epic A — Tenant foundation

- Organization creation and membership.
- RLS tests for every table.
- Role enforcement in server routes.
- Audit actor attribution.

Acceptance: automated tests prove members cannot read or mutate another organization’s rows.

## Epic B — Connector installation

- GitHub App registration and install callback.
- Token exchange and short-lived installation tokens.
- Scope display and health check.
- Revocation and uninstall.

Acceptance: installation can be revoked and all subsequent tool calls fail safely.

## Epic C — Tool registry and shared security

- Registry package and generated schemas.
- Tool risk metadata.
- Policy hooks.
- Tool contract test harness.
- Shared redaction, approval hashing, idempotency, kill-switch, and audit helpers.

Acceptance: adding one supported tool automatically updates MCP listing, UI metadata, documentation, policy fixtures, and tests.

## Epic D — Durable workflows

- Start, status, event stream, cancel.
- Step retries and backoff.
- Idempotent mutations.
- Manual recovery state.

Acceptance: killing or redeploying the application during a run does not lose workflow state.

## Epic E — Approvals

- Approval cards.
- Exact action hash.
- Expiration.
- Single and dual approval.
- Re-authentication for high risk.
- Argument-change invalidation.

Acceptance: changing approved arguments invalidates the approval; execution rechecks identity, policy, connector state, and kill switches.

## Epic F — AI routing and privacy boundary

- Task classifier.
- Model tier policy.
- Fallback chain.
- Spend estimator and ledger.
- Evaluation framework.
- PII minimization and redaction.

Acceptance: easy tasks remain on economy tier, complex tasks escalate only under defined rules, and restricted data is absent from model prompts and logs.

## Epic G — Audit and evidence

- Append-only events.
- Redaction rules.
- Report artifacts.
- Export.
- Provider verification evidence.

Acceptance: every external write can be reconstructed from request, plan, approval, invocation, verification, and result records without exposing secrets or ordinary message content.

## Epic H — Meta Business MCP

- Independent application/deployment boundary.
- Official OAuth/token lifecycle.
- Page ID allowlist.
- Read, draft, and approval-bound write tools.
- Signed webhooks, replay prevention, and deduplication.
- Law-office policy classification and escalation.
- Inbox/content minimization and redaction.
- Organization, Page, and tool kill switches.
- Synthetic-data test fixtures.
- Meta setup, security, deployment, and incident runbooks.

Acceptance: every Meta write has authenticated staff attribution, explicit Page allowlisting, exact preview, human approval, idempotency, redacted audit, read-back verification, and a tested emergency stop. Legal-risk messages cannot be sent automatically.

# 23. Testing Strategy

## 23.1 Unit tests

- Tool input/output validation.
- Policy decisions.
- Risk classification.
- Model routing.
- Redaction and PII minimization.
- Idempotency key generation.
- Approval hashes and invalidation.
- Page allowlisting.
- Kill-switch precedence.
- Law-office legal-risk categories.

## 23.2 Database tests

- RLS for every role and table.
- Immutable audit enforcement.
- Unique provider delivery IDs.
- Approval state transitions.
- Outbox consistency.
- Meta Page/install isolation.
- Retention and deletion behavior for classified content.

## 23.3 Connector contract tests

- Sandbox or mocked API responses.
- Token expiration and refresh/rotation.
- Rate limiting.
- Provider error normalization.
- Webhook signatures and replay attempts.
- Pagination and cursor resumption.
- Read-back verification.

## 23.4 Workflow tests

- Happy path.
- Approval denied.
- Approval expires.
- Transient provider failure.
- Permanent provider failure.
- Retry after partial success.
- Duplicate webhook.
- Duplicate mutation request.
- Cancellation.
- Compensation.
- Kill switch activated after approval.

## 23.5 Security-negative tests

- Cross-tenant access.
- Prompt injection in provider content.
- Secret leakage in logs and model prompts.
- CSRF and session handling.
- Permission downgrade and connector revocation.
- Approval tampering.
- Invalid Meta signatures and replay attempts.
- Disallowed Meta Page IDs.
- Requester self-approval when separation of duties is required.
- Legal-risk response attempting automatic send.

## 23.6 AI evaluations

- Golden workflow selection cases.
- Plan completeness.
- Unsupported-action refusal.
- Legal-risk escalation accuracy.
- Citation/evidence coverage.
- Cost target.
- Human usefulness score.

## 23.7 Meta safety constraints

- No production Meta credentials in CI.
- No real messages, replies, comments, schedules, posts, or deletes in automated tests.
- Synthetic test data only.
- Production Page IDs must not appear in fixtures.
- Provider mutation endpoints must be mocked unless a separate non-production test is explicitly approved.

# 24. Deployment and Environment Plan

## 24.1 Environments

- **Local:** local Supabase or isolated development project; mocked provider writes; synthetic Meta fixtures.
- **Preview:** Vercel control-plane preview; no production connector credentials.
- **Staging:** dedicated Supabase and connector sandbox/non-production installations; separate Meta application/credentials only after approval.
- **Production:** isolated projects, protected credentials, strict policies, separate Meta service identity and deployment.

## 24.2 Deployment gates

Before production promotion:

- Typecheck, lint, unit, integration, security-negative, and build checks pass.
- Supabase migrations apply cleanly.
- RLS tests pass.
- No secret scan findings.
- Connector contract tests pass.
- High-risk workflow tests pass.
- Meta signature, replay, Page allowlist, approval, idempotency, and redaction tests pass.
- Production deployment requires an approved protected environment.
- Provider credentials and application review are handled through explicit launch hold points.

## 24.3 Backups and recovery

- Database backup and point-in-time recovery plan.
- Exportable audit records.
- Provider re-sync jobs.
- Connector credential revocation procedure.
- Meta token-revocation and Page-disconnect procedure.
- Run replay from the last safe step where supported.
- Manual recovery runbook for non-compensatable external writes.
- Webhook dead-letter and reprocessing procedure.

## 24.4 Explicit Meta hold points

Do not create a Meta app, add real credentials, request production permissions, connect the production Page, send real content, or deploy the Meta MCP to production without a separate explicit approval.
