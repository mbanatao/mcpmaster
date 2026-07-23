# Meta Business MCP — Dedicated Law-Office Application

## 1. Architecture decision

Meta Business capabilities are a mandatory MCPMaster workstream, but they must **not** be added to the generic legacy `/tools` execution surface.

Build Meta Business as a separately deployable application inside the MCPMaster repository with its own trust boundary, credentials, database access policy, webhook ingress, rate limits, audit trail, approval queue, and emergency shutdown controls.

The operating principle is:

> **AI drafts. A human approves. The Meta Business MCP sends.**

This application is intended first for Batalla & Associates and should be designed so that additional law-office tenants can be supported later without weakening isolation.

## 2. Product purpose

The Meta Business MCP gives approved AI clients and the MCPMaster dashboard a safe way to:

- Read the configured Facebook Page and its public activity.
- Surface unanswered messages and comments.
- Summarize items that need staff attention.
- Draft posts, comment replies, and message replies.
- Present exact previews for human approval.
- Publish, schedule, reply, send, or delete only after policy checks and explicit approval.
- Record a redacted, attributable audit trail for every external action.

It is not an autonomous legal-advice bot and must never be marketed or configured as one.

## 3. Scope and non-goals

### 3.1 Initial scope

- One explicitly configured Batalla & Associates Facebook Page.
- Official Meta business APIs and OAuth tokens only.
- Remote MCP endpoint suitable for approved MCP-capable AI hosts.
- Dashboard approval queue and audit history inside the MCPMaster control plane.
- Facebook Page posts, comments, Page inbox, insights, and webhook health.
- Human approval before every external publication or message.

### 3.2 Later scope

- Additional Facebook Pages and tenant onboarding.
- Official Messenger Platform workflows.
- Official WhatsApp Business Cloud API workflows.
- Approved response templates and office-information knowledge base.
- SLA routing, staff assignment, and escalation into BatallaOS.

### 3.3 Explicit non-goals

- Personal Facebook account automation.
- Password-based login or browser automation.
- Automatic legal advice.
- Automatic case evaluation or outcome prediction.
- Automatic sending of messages involving confidential or material legal facts.
- Production posting during tests.
- Creation of a Meta application or production-permission request without explicit approval.

## 4. Repository structure

The target repository structure is:

```text
mcpmaster/
  apps/
    control-plane/
      # Dashboard, tenants, approvals, runs, audit, billing.
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
      README.md
      env.example
      Dockerfile
  packages/
    shared-security/
    tool-registry/
    policy/
    audit/
    db/
    core/
  supabase/
    migrations/
    tests/
  docs/
    architecture/
    decisions/
    runbooks/
  legacy/
```

The Meta application may reuse shared policy, audit, schema, and identity packages, but it must not share a process, route handler, credential store, or unrestricted tool dispatcher with the historical “ultimate bridge.”

## 5. Independent deployment and trust boundary

The Meta Business MCP receives its own:

- Meta application registration.
- OAuth client and application secrets.
- Page access tokens and rotation lifecycle.
- Explicit Page ID allowlist.
- Encryption keys or KMS/Vault references.
- Webhook verification token and application secret.
- Database schema permissions and tenant policies.
- Audit retention and export policy.
- Rate limits and provider quotas.
- Deployment identity and environment variables.
- Emergency kill switch.
- Health and readiness endpoints.

A compromise or misconfiguration in another connector must not grant access to Meta credentials or message content.

## 6. Tool catalog

All names are stable, versioned tool definitions generated from the canonical registry. Each definition includes input/output schemas, required scopes, risk class, approval policy, idempotency rules, redaction rules, timeout, retry policy, and verification logic.

### 6.1 Safe read tools — R0

- `meta_page_get`
- `meta_page_list_posts`
- `meta_post_get`
- `meta_post_list_comments`
- `meta_inbox_list_threads`
- `meta_inbox_get_thread`
- `meta_page_get_insights`
- `meta_webhook_health`

Read tools may run automatically for authorized staff when the Page is allowlisted. They still require authenticated tenant context, least-privilege scopes, rate limits, request correlation, and audit events.

### 6.2 Draft-only tools — R0/R1

- `meta_post_create_draft`
- `meta_comment_create_reply_draft`
- `meta_message_create_reply_draft`
- `meta_content_create_weekly_plan`

Draft tools must never publish or transmit content to an external recipient. Drafts are stored as internal approval artifacts with provenance, policy flags, and redacted source references.

### 6.3 Confirmed write tools — R2/R3

- `meta_post_publish`
- `meta_post_schedule`
- `meta_comment_reply`
- `meta_message_send`
- `meta_post_delete`

Every write tool requires all of the following:

1. Authenticated staff identity.
2. Active organization membership with an allowed role.
3. Explicit Page ID allowlisting.
4. Valid, least-privilege connector installation.
5. A visible preview of the exact content, recipient/target, Page, schedule, attachments, and effect.
6. Human approval bound to a cryptographic hash of the exact proposed action.
7. Re-approval if any argument changes.
8. Idempotency key persisted before provider mutation.
9. Redacted request record.
10. Append-only audit events.
11. Provider request/delivery identifier when available.
12. Read-back verification of the resulting post, comment, schedule, message status, or deletion.
13. Kill-switch and policy evaluation immediately before execution.

`meta_post_delete` is R3 and should be disabled by default. Initially it should require a different approver from the requester or remain unavailable for solo workspaces.

## 7. Law-office safety policy

### 7.1 Permitted automatic activity

The system may automatically read, classify, summarize, and prepare drafts based on approved facts such as:

- Office address.
- Approved telephone numbers.
- Approved practice areas or services.
- Office hours.
- Consultation-request acknowledgment.
- Request for a callback number.
- Instruction to call the office directly for urgent deadlines.
- Confirmation that a message was received and will be reviewed.

Even approved facts are only drafted automatically; external sending remains approval-gated in the initial release.

### 7.2 Mandatory human review

Any content involving the following must become a secretary or lawyer review item inside BatallaOS/MCPMaster:

- Legal advice.
- Merits or weaknesses of a case.
- Limitation periods, filing dates, hearing dates, or other deadlines.
- Fees, retainers, engagement terms, or payment promises.
- Conflict clearance.
- Confidential matter facts or documents.
- Litigation or negotiation strategy.
- Predictions of outcomes.
- Whether an attorney-client relationship exists.
- Admissions, waivers, settlement terms, or legal conclusions.
- Requests for sensitive identity, financial, health, or case data.

The model may summarize the incoming message for staff, but it must not generate or send a substantive answer without authorized human review.

### 7.3 Policy enforcement

Law-office restrictions are enforced server-side before model invocation, during draft classification, before approval creation, and immediately before execution. Model claims cannot downgrade a message’s risk.

Use deterministic rules and approved classifiers to flag legal-risk categories. Uncertain classifications escalate to human review.

## 8. Approval workflow

A write workflow follows this lifecycle:

1. Receive request from dashboard or authenticated MCP host.
2. Resolve organization, staff identity, role, and Meta installation.
3. Validate Page ID against the installation allowlist.
4. Collect minimum necessary context.
5. Redact or minimize personal data before any model call.
6. Generate a structured draft or action plan.
7. Run law-office policy classification.
8. Render an exact approval card.
9. Store an action hash, idempotency key, expiry, requester, and required approver role.
10. Wait durably for approval.
11. Re-evaluate permissions, kill switch, token status, Page allowlist, and action hash.
12. Execute one provider mutation.
13. Read back and verify the result.
14. Record redacted evidence and final status.
15. Notify the requester and assigned staff.

Approval cards must show:

- Page name and Page ID.
- Action type.
- Exact target post, comment, thread, or recipient reference.
- Full outbound text and attachment preview.
- Scheduled date and timezone when applicable.
- Source request and reason.
- Legal-risk classification.
- Data sent to an AI provider, summarized by category.
- Reversibility and deletion implications.
- Approval expiration.

## 9. Data model additions

Add or extend the following records:

- `meta_installations`: organization, Meta app/account identifiers, Page IDs, status, scopes, token reference, expiry, rotation state.
- `meta_page_allowlist`: installation, Page ID, Page name, environment, enabled state.
- `meta_drafts`: organization, type, structured content, safe preview, classification, source references, model decision.
- `meta_approval_actions`: approval, exact action hash, Page ID, target identifiers, idempotency key, expiry.
- `meta_webhook_events`: delivery/event ID, Page ID, event type, signature status, payload hash, deduplication status, processed time.
- `meta_sync_cursors`: installation, resource type, provider cursor, last successful sync.
- `meta_message_refs`: minimum provider identifiers and redacted metadata needed for staff workflow; avoid duplicating message bodies unless required.
- `meta_incidents`: kill-switch activation, token compromise, revoked scope, replay attempt, or policy violation.

Message and comment bodies should not be copied into ordinary audit logs. Sensitive payload storage, when unavoidable, must be encrypted, access-controlled, short-lived, and separately classified.

## 10. Privacy and model boundary

- Minimize personal data before sending any content to an AI provider.
- Prefer deterministic extraction and local rules before model calls.
- Replace names, phone numbers, email addresses, addresses, identifiers, and case references with placeholders when full values are unnecessary.
- Do not include Meta access tokens, webhook secrets, raw OAuth responses, or provider debug objects in model context.
- Do not put full inbox content into general observability systems.
- Do not use message content for model training or evaluation unless synthetic or explicitly approved and anonymized.
- Store only the minimum content required for approval and audit.
- Apply retention windows by data class and provide deletion/export procedures.
- Use synthetic test fixtures only.

## 11. Meta API and OAuth requirements

- Use official Meta business APIs only.
- Use OAuth and official Page/business tokens; never collect personal passwords.
- Request the least-privilege scopes needed for enabled tools.
- Separate development, staging, and production Meta applications or credentials where supported.
- Encrypt token references and support expiry detection, rotation, revocation, and emergency invalidation.
- Never expose tokens to browsers, MCP responses, source control, logs, errors, traces, approval cards, or model prompts.
- Revalidate current Meta API versions, permissions, review requirements, and rate limits immediately before implementation and launch.

## 12. Webhook architecture

The Meta webhook ingress must implement:

- Verification challenge handling.
- Signed payload verification with the configured application secret.
- Raw-body verification before JSON parsing where required.
- Event allowlisting.
- Page ID allowlisting.
- Delivery/event deduplication.
- Replay-window enforcement.
- Request IDs and trace correlation.
- Payload-size limits.
- Fast acknowledgment followed by durable asynchronous processing.
- Dead-letter/manual recovery path.
- Redacted logs containing hashes and identifiers, not message bodies.
- Health endpoint reporting last verified event and processing lag without exposing content.

Webhook events are untrusted input. They may trigger read/summarize workflows or create review items, but they cannot directly authorize a write.

## 13. Emergency controls

Provide multiple levels of shutdown:

- Global Meta connector kill switch.
- Environment-level switch.
- Organization-level switch.
- Installation-level switch.
- Page-level write disablement.
- Tool-level disablement.
- Automatic write suspension after signature failures, token anomalies, repeated provider errors, policy violations, unusual volume, or audit-store failure.

Read access may remain available during some incidents, but external writes must fail closed.

## 14. Remote MCP and AI host integration

Expose the Meta application as a remote MCP server with authenticated, organization-aware sessions. Do not expose tokens or arbitrary provider APIs.

AI hosts should see the approved Meta tool catalog and high-level workflows, while MCPMaster remains authoritative for:

- User and tenant identity.
- Page allowlisting.
- Policies.
- Approval state.
- Execution.
- Audit and evidence.
- Spend and rate limits.

Host-specific support, plan requirements, remote-MCP constraints, and write-capability limitations must be revalidated against current official documentation before launch. The Meta MCP remains useful even when a particular host is read-only because staff can complete approvals and writes through the MCPMaster dashboard.

## 15. Initial workflows

### 15.1 Draft office announcement

Input: topic, approved facts, desired publish window.

Output: one or more professional drafts, policy classification, source facts, and approval-ready preview. No external write.

### 15.2 Unanswered inquiry review

Read recent Page inbox threads, identify items without a staff response, minimize personal data, summarize each item, classify legal risk, and create staff review tasks.

### 15.3 Prepare inquiry replies

Prepare replies for selected messages without sending. Approved static-office information may be included; legal-risk items receive escalation-only drafts.

### 15.4 Approved publish or schedule

Take an approved draft, validate its immutable action hash, publish or schedule once, verify the provider result, and record evidence.

### 15.5 Comment attention summary

List new Page comments, identify spam, urgent reputation issues, and potential client inquiries, then create a staff attention report. No automatic replies in the initial release.

## 16. Testing requirements

### 16.1 Unit tests

- Tool schemas and risk metadata.
- Page allowlist enforcement.
- Legal-risk classification rules.
- PII minimization and redaction.
- Approval hash generation and invalidation.
- Idempotency generation.
- Kill-switch precedence.
- Token and error redaction.

### 16.2 Integration tests with mocked Meta APIs

- OAuth callback and token reference storage.
- Token expiry, refresh/rotation, and revocation.
- Read tools and pagination.
- Draft workflows.
- Approved publish, schedule, reply, send, and delete flows.
- Provider rate limits and retryable errors.
- Read-back verification.
- Duplicate mutation prevention.

### 16.3 Webhook and security-negative tests

- Invalid and missing signatures.
- Replay attempts.
- Duplicate delivery IDs.
- Disallowed Page IDs.
- Oversized payloads.
- Unrecognized event types.
- Prompt injection inside messages and comments.
- Approval tampering.
- Requester attempting to self-approve restricted actions.
- Secret leakage checks across logs, errors, traces, MCP responses, and snapshots.
- Kill switch activated between approval and execution.

### 16.4 Safety constraints

- No production tokens in CI.
- No real messages or posts during tests.
- Synthetic names, threads, comments, and case scenarios only.
- Provider writes mocked or directed to a dedicated non-production Page only after explicit approval.

## 17. CI and quality gates

The Meta application CI must include:

- Dependency and secret scanning.
- Formatting and linting.
- Type checking.
- Unit tests.
- Integration tests using mocked Meta APIs.
- Security-negative tests.
- Container/application build.
- Schema/migration checks.
- Tool-registry generation checks.
- Verification that no real credentials or production Page IDs appear in fixtures.

Production deployment is blocked unless all gates pass and an authorized human approves the protected environment.

## 18. Documentation and runbooks

Add the following before any real credential is configured:

- Meta Developer setup guide.
- Required permission/scope matrix.
- Environment-variable template containing no secrets.
- Threat model.
- Data classification and retention policy.
- Law-office response policy.
- Deployment guide.
- Token rotation and revocation runbook.
- Webhook troubleshooting guide.
- Incident-response and kill-switch runbook.
- Audit export procedure.
- Staff approval guide.

## 19. Implementation sequence

1. Complete and merge the secure runtime foundation.
2. Complete tenant identity, organization membership, RLS, persistent audit, and durable approvals.
3. Add `packages/shared-security` abstractions used by every domain app.
4. Scaffold `apps/meta-business-mcp` with health endpoints and no provider credentials.
5. Define the canonical Meta tool registry, permissions matrix, and law-office policy rules.
6. Add mocked Meta client and synthetic fixtures.
7. Implement safe read tools.
8. Implement webhook signature verification, deduplication, and health.
9. Implement draft-only tools and approval artifacts.
10. Implement approval-bound write execution with idempotency and verification.
11. Add dashboard Meta installation, Page allowlist, approval, audit, and kill-switch screens.
12. Run security review and negative-test suite.
13. Create or configure a non-production Meta application only after explicit approval.
14. Test with synthetic or approved non-production data.
15. Request production permissions and configure real credentials only after a separate explicit approval and launch-readiness review.

## 20. Definition of done

The Meta Business MCP is ready for a controlled pilot only when:

- It is independently deployable and independently revocable.
- All tools come from one typed, versioned registry.
- Read, draft, write, and destructive risk classes are enforced server-side.
- Every write has authenticated staff attribution, Page allowlisting, exact preview, approval hash, idempotency key, audit trail, and read-back verification.
- Legal-risk content is never automatically answered or sent.
- Message content is absent from ordinary logs.
- Tests use synthetic data and cannot contact production mutation endpoints.
- Webhook signatures, replay prevention, and deduplication pass negative tests.
- Token rotation, revocation, and kill-switch procedures have been rehearsed.
- Current Meta and AI-host requirements have been verified from official documentation.
- A lawyer or authorized office administrator has approved the response policy and launch configuration.

## 21. Explicit hold points

Do not perform any of the following without a separate, explicit user approval:

- Create or configure a Meta developer application.
- Add real Facebook, Messenger, or WhatsApp credentials.
- Request production permissions or application review.
- Connect the Batalla & Associates production Page.
- Send a real message, comment reply, or post.
- Deploy the Meta MCP to production.
- Enable automatic external sending.
