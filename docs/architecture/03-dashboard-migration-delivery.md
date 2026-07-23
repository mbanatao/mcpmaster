# 19. Dashboard Information Architecture

## 19.1 Main navigation

- **Home:** health, current runs, pending approvals, spend.
- **Workflows:** catalog, templates, schedules.
- **Runs:** timeline, plan, steps, evidence, cost.
- **Approvals:** pending, decided, expired.
- **Connectors:** installed accounts, scopes, health, rotation.
- **Policies:** risk rules, budgets, environment restrictions.
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

# 20. Repository Migration Plan

Do not replace the repository in a big-bang rewrite. Use an incremental architecture branch and maintain a running application after each phase.

## 20.1 Target structure

```text
app/
  (dashboard)/
  api/
  mcp/
workflows/
packages/
  core/
  db/
  policy/
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
legacy/
```

## 20.2 What to preserve

- Useful service-specific API client logic.
- Existing schemas that match real provider responses.
- Existing UI assets that support the control-center vision.
- Deployment documentation that remains accurate after validation.

## 20.3 What to replace first

- Unauthenticated generic `/tools` execution.
- `demo-key` fallbacks.
- Duplicated tool arrays and registries.
- Mixed stdio and HTTP startup in one server file.
- Fake logs and misleading metrics.
- Broken Docker build/start path.
- Vercel configuration that treats a long-running listener as a normal serverless handler.

## 20.4 Branch strategy

- Protect `main`.
- Create `architecture-v2` for the migration.
- Use small PRs by architectural seam.
- Require typecheck, unit tests, migration tests, and build checks.
- Keep a `docs/current-state.md` file that distinguishes implemented, partial, mocked, and planned behavior.

# 21. Delivery Roadmap

## Phase 0 — Stabilize and Inventory (Week 1)

Deliverables:

- Secret scan and credential rotation if necessary.
- Disable or protect unsafe execution endpoints.
- Add real build, typecheck, lint, and test scripts.
- Add CI.
- Create current-state capability matrix.
- Freeze unsupported connectors.

Exit criteria: repository builds reliably; no unauthenticated mutation path; documentation is truthful.

## Phase 1 — Control Plane Foundation (Weeks 2–3)

Deliverables:

- Next.js dashboard shell.
- Supabase Auth and organization membership.
- RLS migrations and pgTAP policies.
- Workflow run, step, approval, audit, and usage tables.
- Environment separation: local, preview, staging, production.

Exit criteria: authenticated tenant can create and view a mock run without seeing another tenant’s data.

## Phase 2 — Tool Registry and GitHub Connector (Weeks 4–5)

Deliverables:

- Single typed tool registry.
- GitHub App installation and webhook handling.
- GitHub read tools: repositories, issues, PRs, checks, commits.
- GitHub low-risk write tools: create issue, label, comment—disabled by default.
- Connector contract tests.

Exit criteria: a workspace can install the GitHub App and run a cited read-only repository report.

## Phase 3 — Durable Workflow and Approval Engine (Weeks 6–7)

Deliverables:

- Workflow engine adapter.
- Retries, cancellation, idempotency, and progress events.
- Approval creation, expiration, and decision UI.
- Policy engine with R0–R4 classifications.
- Immutable audit events.

Exit criteria: a workflow pauses before a write, resumes only after approval, writes once, verifies, and records evidence.

## Phase 4 — Model Router and First Product Workflows (Weeks 8–9)

Deliverables:

- Multi-provider model adapter and gateway integration.
- Tier routing and per-run budgets.
- Engineering Morning Brief.
- PR Triage.
- Bug-to-Workstream plan with GitHub write approval.
- Evaluation dataset and quality dashboard.

Exit criteria: workflows route tasks by tier, stay within budget, and pass evaluation thresholds.

## Phase 5 — Linear/Notion and Distribution (Weeks 10–11)

Deliverables:

- Linear and Notion OAuth connectors.
- Linked Bug-to-Workstream workflow.
- Remote MCP endpoint for Claude and OpenAI-compatible hosts.
- Email approval notifications through Resend.

Exit criteria: a request from the dashboard or MCP host can create a plan, obtain approval, update multiple systems, and return a linked report.

## Phase 6 — Hardening and Private Beta (Week 12)

Deliverables:

- Security review.
- Load and failure testing.
- Billing/usage limits.
- Onboarding flow.
- Runbooks and incident procedures.
- Private beta with 3–5 design partners.

Exit criteria: beta users complete the primary workflows without engineering intervention and no critical security findings remain.

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

## Epic C — Tool registry

- Registry package and generated schemas.
- Tool risk metadata.
- Policy hooks.
- Tool contract test harness.

Acceptance: adding one tool automatically updates MCP listing, UI metadata, documentation, and tests.

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

Acceptance: changing approved arguments invalidates the approval.

## Epic F — AI routing

- Task classifier.
- Model tier policy.
- Fallback chain.
- Spend estimator and ledger.
- Evaluation framework.

Acceptance: a test suite proves easy tasks remain on economy tier and complex tasks escalate only under defined rules.

## Epic G — Audit and evidence

- Append-only events.
- Redaction rules.
- Report artifacts.
- Export.

Acceptance: every external write can be reconstructed from request, plan, approval, invocation, verification, and result records.

# 23. Testing Strategy

## 23.1 Unit tests

- Tool input/output validation.
- Policy decisions.
- Risk classification.
- Model routing.
- Redaction.
- Idempotency key generation.

## 23.2 Database tests

- RLS for every role and table.
- Immutable audit enforcement.
- Unique provider delivery IDs.
- Approval state transitions.
- Outbox consistency.

## 23.3 Connector contract tests

- Sandbox API responses.
- Token expiration and refresh.
- Rate limiting.
- Provider error normalization.
- Webhook signatures and replay attempts.

## 23.4 Workflow tests

- Happy path.
- Approval denied.
- Approval expires.
- Transient provider failure.
- Permanent provider failure.
- Retry after partial success.
- Duplicate webhook.
- Cancellation.
- Compensation.

## 23.5 Security tests

- Cross-tenant access.
- Prompt injection in provider content.
- Secret leakage in logs and model prompts.
- CSRF and session handling.
- Permission downgrade and connector revocation.
- Approval tampering.

## 23.6 AI evaluations

- Golden workflow selection cases.
- Plan completeness.
- Unsupported-action refusal.
- Citation/evidence coverage.
- Cost target.
- Human usefulness score.

# 24. Deployment and Environment Plan

## 24.1 Environments

- **Local:** local Supabase or isolated development project, mocked provider writes.
- **Preview:** Vercel preview, per-branch schema strategy or safe shared test environment.
- **Staging:** dedicated Supabase and provider sandbox installations.
- **Production:** isolated production project, protected credentials, strict policies.

## 24.2 Deployment gates

Before production promotion:

- Typecheck, lint, unit, integration, and build pass.
- Supabase migrations apply cleanly.
- RLS tests pass.
- No secret scan findings.
- Connector contract tests pass.
- High-risk workflow tests pass.
- Production deployment requires an approved GitHub environment or equivalent protected action.

## 24.3 Backups and recovery

- Database backup and point-in-time recovery plan.
- Exportable audit records.
- Provider re-sync jobs.
- Connector credential revocation procedure.
- Run replay from last safe step where supported.
- Manual recovery runbook for non-compensatable external writes.
