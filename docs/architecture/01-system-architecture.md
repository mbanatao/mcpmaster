# 6. High-Level Architecture

The product is divided into five planes:

1. **Experience plane:** dashboard, remote MCP endpoint, and later chat channels.
2. **Control plane:** tenants, workflows, policies, approvals, connector configuration, and billing.
3. **Orchestration plane:** durable workflow runs, retries, waiting, compensation, and streaming progress.
4. **Execution plane:** typed connector adapters that call external APIs with scoped credentials.
5. **Data and evidence plane:** Supabase Postgres, RLS, audit events, artifacts, usage, and encrypted credential references.

# 7. Recommended Technology Stack

| Concern | Recommended choice | Reason |
|---|---|---|
| Product UI and API | Next.js App Router + TypeScript | Matches your existing preferred stack and supports one deployable control plane |
| Hosting and previews | Vercel | Existing deployment preference; strong preview workflow and integrated observability |
| Durable workflows | Vercel Workflows behind an internal adapter | Supports retries, pause/resume, long-running approval waits, and step observability |
| Database and auth | Supabase Postgres + Supabase Auth | Strong relational state model, RLS, migrations, and existing familiarity |
| Tenant isolation | Postgres RLS with organization membership claims | Enforcement remains close to the data |
| Secrets | Vercel server-side secrets for platform keys; encrypted tenant credential references using Supabase Vault or an external KMS-backed vault | Prevents credentials from entering browser or model context |
| Model access | Vercel AI Gateway or equivalent internal provider adapter | One interface for OpenAI, Anthropic, Google, xAI, routing, budgets, and fallbacks |
| GitHub integration | GitHub App, not personal access tokens | Installable, scoped permissions, short-lived tokens, webhook support |
| Schemas | Zod + JSON Schema generation | Shared validation for APIs, tools, UI forms, and MCP definitions |
| Testing | Vitest, Playwright, pgTAP, connector contract tests | Covers TypeScript logic, UI, database security, and external adapters |
| Email | Resend | Existing connected service; useful for approvals and run summaries |

# 8. Component Architecture

## 8.1 Web Control Plane

Responsibilities:

- Authentication and workspace selection.
- Connector installation and health.
- Workflow catalog and run creation.
- Run timeline with step-level status.
- Approval inbox.
- Audit explorer and evidence downloads.
- Model usage and budget display.
- Workspace policy management.

The web application must never execute connector calls directly from the browser. It calls authenticated server routes, which create workflow runs.

## 8.2 Remote MCP Gateway

Expose a remote MCP server so Claude, ChatGPT/OpenAI clients, and other MCP-capable hosts can discover controlled tools. The remote MCP server should expose high-level workflow tools such as:

- `workflow.run_engineering_brief`
- `workflow.plan_bug_workstream`
- `workflow.get_run_status`
- `approval.list_pending`
- `approval.decide`

Do not expose every raw provider operation to the AI host. High-level workflow tools are safer, more differentiated, and easier to support.

## 8.3 Workflow Orchestrator

The orchestrator owns run state and should support:

- Durable step execution.
- Automatic retry with exponential backoff for transient failures.
- Waiting for approval for hours or days without holding compute.
- Timeouts and cancellation.
- Idempotency keys for every external mutation.
- Compensation steps when reversal is possible.
- Progress events streamed to the dashboard.
- Deterministic resumption after deploys or crashes.

Create an internal `WorkflowEngine` interface so the product is not permanently tied to one vendor implementation.

## 8.4 Tool Registry

A single registry is the architectural center of the product. Each tool definition includes:

- Stable name and semantic version.
- Provider and adapter.
- Human-readable description.
- Zod input and output schemas.
- Risk level.
- Read-only annotation.
- Required connector permissions.
- Default approval policy.
- Timeout and retry policy.
- Idempotency strategy.
- Data classification.
- Audit redaction rules.
- Verification function.

MCP tool schemas, REST endpoints, dashboard forms, policy rules, and tests should be generated from this registry.

## 8.5 Connector Runtime

Each connector package should contain:

- OAuth or app installation flow.
- Token refresh and revocation logic.
- Typed API client.
- Tool adapters.
- Provider webhook validation.
- Rate-limit handling.
- Error normalization.
- Contract tests against a sandbox account.

MVP connector order:

1. GitHub.
2. Vercel.
3. Linear.
4. Notion.
5. Optional: Slack or email delivery.

Other current connectors remain disabled until they meet the same standard.

## 8.6 Model Router

The router chooses a model tier rather than allowing workflows to hardcode providers.

Recommended tiers:

- **Tier 0 — deterministic:** rules, schemas, SQL, and ordinary code; no model call.
- **Tier 1 — economy:** classification, extraction, labeling, short summaries.
- **Tier 2 — standard:** workflow planning, synthesis, ordinary code analysis.
- **Tier 3 — frontier:** difficult debugging, architecture reasoning, conflict resolution.

Routing inputs:

- Task type.
- Input size.
- Required capabilities.
- Risk level.
- Latency target.
- Workspace budget.
- Provider health.
- Data residency policy.

The router produces a logged decision record: selected tier, provider/model, estimated cost, fallback chain, and reason.

## 8.7 Policy and Approval Engine

Policy is evaluated before every tool call, not just once per workflow. Inputs include:

- Workspace and user role.
- Connector installation and granted scopes.
- Tool risk level.
- Target resource.
- Proposed arguments.
- Time window and rate limits.
- Budget state.
- Previous approvals.
- Environment: preview, staging, production.

Possible decisions:

- Allow.
- Allow with redaction.
- Require approval.
- Require two approvals.
- Deny.
- Defer for missing context.

## 8.8 Audit and Evidence Service

Every meaningful transition produces an append-only event:

- Request accepted.
- Plan generated.
- Policy evaluated.
- Approval requested.
- Approval granted or denied.
- Tool call started.
- Tool call completed or failed.
- Verification completed.
- Run completed, cancelled, or timed out.

Audit records store hashes and safe summaries, not raw secrets. Sensitive provider payloads should be selectively encrypted or redacted.

# 9. End-to-End Workflow Lifecycle

1. User submits an outcome from the dashboard or an AI host.
2. The system authenticates the user and resolves the workspace.
3. Intent is classified and mapped to a workflow template.
4. Read-only context is collected through scoped connector tools.
5. A model produces a structured plan with assumptions and proposed writes.
6. The policy engine checks every proposed tool call.
7. The user sees a human-readable approval card showing exact effects.
8. Approved steps execute as durable workflow steps.
9. Each external mutation is verified by reading the resulting state.
10. The system records evidence and produces a final report.
11. Costs are added to the usage ledger.
12. Failures either retry, compensate, or enter a manual recovery state.

# 10. Risk and Approval Matrix

| Risk class | Examples | Default behavior |
|---|---|---|
| R0: pure read | list PRs, read issue, deployment status | automatic |
| R1: reversible low-risk write | add label, create draft, add comment | one approval or workspace opt-in |
| R2: material write | create issue, update project state, trigger non-production deployment | explicit approval every run initially |
| R3: high-risk | merge PR, production deployment, modify permissions, delete data | two-person approval or disabled in MVP |
| R4: prohibited | money transfer, secret disclosure, identity admin, arbitrary shell execution | always denied |

Approval cards must show:

- Service and account.
- Exact action.
- Target resource.
- Before-and-after summary when available.
- Reason and originating user request.
- Estimated AI and provider cost.
- Expiration time.
- Whether the action is reversible.

# 11. Multi-Tenant Identity and Authorization

## 11.1 Roles

- **Owner:** billing, connectors, policies, members, all approvals.
- **Admin:** workflows, connectors, policies, approvals, no ownership transfer.
- **Operator:** run workflows and approve allowed categories.
- **Member:** run permitted workflows; cannot approve own high-risk request.
- **Viewer/Auditor:** read reports and audit events only.

## 11.2 Separation of duties

For R3 actions, requester and approver must be different users. For a solo workspace, R3 remains disabled until an explicit “solo high-risk mode” exists with stronger re-authentication and delay.

## 11.3 Supabase enforcement

Every tenant-owned table contains `organization_id`. RLS policies check active membership and role. Service-role access is restricted to server-only workflow code. Browser clients never receive service-role keys.

# 12. Core Data Model

| Table | Purpose | Important fields |
|---|---|---|
| `organizations` | Tenant/workspace | id, name, slug, plan, status, budget limits |
| `profiles` | User profile | user_id, display_name, timezone |
| `memberships` | User-to-organization authorization | organization_id, user_id, role, status |
| `connector_installations` | Installed provider accounts | organization_id, provider, external_account_id, status, scopes |
| `credential_refs` | Encrypted secret reference metadata | installation_id, secret_ref, expires_at, rotation_state |
| `tool_definitions` | Registry snapshot for auditability | name, version, provider, risk, schemas, policy metadata |
| `workflow_templates` | Versioned workflow definitions | key, version, input_schema, status |
| `workflow_runs` | Top-level run state | organization_id, template_version, status, requester_id, budget |
| `workflow_steps` | Durable step state | run_id, sequence, tool_name, status, attempts, idempotency_key |
| `plans` | Structured proposed execution plan | run_id, plan_json, model_decision_id, hash |
| `approvals` | Human decision records | run_id, step_id, requested_from, decision, expires_at, reason |
| `tool_invocations` | Tool request/response envelope | step_id, arguments_redacted, result_redacted, provider_request_id |
| `audit_events` | Append-only event history | organization_id, run_id, actor, event_type, payload, hash, created_at |
| `artifacts` | Reports and evidence | run_id, type, storage_path, checksum, classification |
| `model_decisions` | Router selections | task_class, tier, provider, model, estimated_cost, fallback_chain |
| `usage_ledger` | Billable and internal usage | organization_id, run_id, metric, quantity, estimated_cost |
| `policy_rules` | Workspace policy | effect, conditions, priority, version |
| `webhook_events` | Verified inbound provider events | provider, delivery_id, event_type, payload_hash, processed_at |
| `outbox_events` | Reliable internal event publication | aggregate_type, aggregate_id, event_type, payload, published_at |

Database rules:

- Use UUID primary keys.
- Store timestamps in UTC; render in workspace/user timezone.
- Make workflow templates and tool definitions immutable by version.
- Use unique constraints on provider delivery IDs and idempotency keys.
- Partition or archive high-volume audit and invocation tables later.
- Never store refresh tokens in ordinary plaintext columns.

# 13. API and MCP Surface

## 13.1 Core REST routes

| Method and route | Purpose |
|---|---|
| `POST /api/workflow-runs` | Validate input and start a workflow |
| `GET /api/workflow-runs/:runId` | Run summary and current state |
| `GET /api/workflow-runs/:runId/events` | Server-sent progress stream |
| `POST /api/workflow-runs/:runId/cancel` | Request cancellation |
| `GET /api/approvals` | Pending approvals for current user |
| `POST /api/approvals/:approvalId/decision` | Approve or deny with re-authentication when required |
| `GET /api/connectors` | Installed connectors and health |
| `POST /api/connectors/:provider/install` | Begin OAuth/App installation |
| `DELETE /api/connectors/:installationId` | Revoke and disconnect |
| `POST /api/webhooks/github` | Signed GitHub App webhook ingress |
| `POST /api/webhooks/:provider` | Other verified provider events |
| `GET /api/audit-events` | Filtered audit explorer |
| `GET /api/usage` | Workspace usage and spend |
| `POST /mcp` | Remote MCP transport endpoint |

## 13.2 API standards

- Zod validation at every boundary.
- Typed error envelope with stable error codes.
- Request IDs and trace IDs returned to clients.
- Idempotency header required for write-starting API calls.
- Cursor pagination.
- No provider secrets in logs or responses.
- Rate limits by user, workspace, endpoint, and connector.

## 13.3 Recommended MCP tools

Expose workflows, not raw APIs:

- `mcpmaster.list_workflows`
- `mcpmaster.start_workflow`
- `mcpmaster.get_run`
- `mcpmaster.list_pending_approvals`
- `mcpmaster.decide_approval`
- `mcpmaster.get_report`

The MCP host remains a presentation and interaction surface. MCPMaster remains the authority for policies, tenant context, approvals, execution, and audit.
