# 25. Cost Model

These are planning ranges, not vendor quotations. Validate current pricing before launch.

| Stage | Expected monthly platform range | Main drivers |
|---|---:|---|
| Internal alpha | $50–$200 | database, hosting, light model usage |
| Private beta | $200–$800 | workflow volume, observability, email, multiple models |
| Early paid product | $1,000–$5,000+ | customer volume, model tokens, logs, support, provider APIs |

The most important controls are model budgets, workflow limits, log retention, and protection against repeated or looping tool calls. Server costs are usually less dangerous than uncontrolled AI usage and operational failures.

# 26. Monetization Hypothesis

Start as subscription SaaS with included usage and overages.

| Plan | Hypothesis | Included outcome |
|---|---:|---|
| Solo | $39–$59/month | one workspace, GitHub workflows, limited runs |
| Team | $149–$299/month | multiple members, approvals, GitHub + Linear + Notion |
| Growth | $499+/month | higher limits, advanced policies, audit exports, priority support |
| Enterprise/self-hosted | annual contract later | SSO, retention controls, dedicated support, deployment options |

Do not sell the source code as the primary offer. Sell the operational result, reliability, governance, and saved coordination time.

# 27. Go-to-Market Wedge

## 27.1 Launch message

> Your AI engineering operations assistant: it watches GitHub and deployments, prepares the work, and asks before changing anything.

## 27.2 Design partner profile

- Uses GitHub every day.
- Has at least two adjacent systems such as Linear, Notion, or Vercel.
- Feels coordination pain weekly.
- Can install a GitHub App without enterprise procurement.
- Will share real workflow examples and feedback.

## 27.3 First proof points

- Time saved creating daily engineering status.
- Faster PR and blocker triage.
- Fewer missed cross-tool updates.
- Percentage of proposed actions approved without editing.
- Zero unauthorized actions.
- Cost per successful workflow.

# 28. Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Product is seen as a connector wrapper | Sell complete workflows, approvals, audit, and dashboard outcomes |
| Too many integrations dilute quality | GitHub-first; add providers only after contract and security standards pass |
| AI proposes unsafe actions | Structured plans, policy engine, approval hashes, prohibited action class |
| Provider APIs change | Adapter packages, contract tests, versioned tools |
| Workflow engine lock-in | Internal engine abstraction and portable domain events |
| Token costs grow unexpectedly | Tier routing, budgets, caching, deterministic code first |
| Prompt injection | Treat connector content as untrusted; never resolve authority from content |
| Customer credentials leak | Scoped OAuth/App tokens, encrypted references, no model/browser exposure |
| Retried writes create duplicates | Required idempotency and verification |
| Enterprise sales arrive too early | Focus on self-serve small teams before compliance-heavy enterprise |

# 29. Architecture Decisions

## ADR-001 — Incremental refactor, not full rewrite

Decision: preserve useful code and replace unsafe seams gradually.  
Reason: reduces risk and keeps progress demonstrable.

## ADR-002 — One TypeScript control plane

Decision: Next.js and TypeScript for the dashboard, APIs, workflow definitions, schemas, and shared packages.  
Reason: matches existing preference and lowers operational complexity.

## ADR-003 — Supabase is the system of record

Decision: Postgres stores tenant state, workflow metadata, approvals, policies, audit events, and usage.  
Reason: relational consistency and enforceable RLS.

## ADR-004 — GitHub App over PAT

Decision: use a GitHub App for customer installations.  
Reason: minimum scopes, install lifecycle, short-lived tokens, and webhooks.

## ADR-005 — Approval-gated writes

Decision: R2 and above require explicit approval; R3 is disabled or dual-approved.  
Reason: trust and safety are core product features.

## ADR-006 — Workflow engine abstraction

Decision: use Vercel Workflows initially, wrapped by an internal interface.  
Reason: durable execution fits the preferred stack while preserving future portability.

## ADR-007 — Provider-neutral model router

Decision: route by task tier through one provider abstraction.  
Reason: cost control, fallback, and reduced vendor lock-in.

# 30. Definition of Done for Version 1

Version 1 is ready for a private beta when:

1. A user can create a workspace and install the GitHub App.
2. A user can run a read-only Engineering Morning Brief.
3. Every finding links to evidence from the connected system.
4. A write-capable workflow displays an exact plan and waits for approval.
5. Approval is stored, attributable, expiring, and bound to the proposed arguments.
6. The workflow survives retry and deployment interruption.
7. A write executes only once and is verified afterward.
8. The run timeline contains a complete audit trail.
9. Workspace budgets and model limits are enforced.
10. The system is accessible from the dashboard and a remote MCP host.
11. RLS, webhook, prompt-injection, and credential-leak tests pass.
12. Three design partners complete the primary workflow without developer intervention.

# 31. First 20 Implementation Tasks

1. Create `architecture-v2` branch and protect `main`.
2. Add `build`, `typecheck`, `lint`, `test`, and `test:e2e` scripts.
3. Add GitHub Actions CI.
4. Remove demo credential fallbacks.
5. Protect or disable the current generic `/tools` endpoint.
6. Split stdio MCP, HTTP API, and web app entry points.
7. Add Supabase migrations for organizations, memberships, runs, steps, approvals, and audit events.
8. Add RLS policies and pgTAP tests.
9. Create the typed tool registry package.
10. Port one read-only GitHub tool into the registry.
11. Register a private GitHub App for internal testing.
12. Implement installation callback, webhook verification, and token resolution.
13. Implement the workflow engine adapter and one mock workflow.
14. Add run status and progress streaming.
15. Implement approval state machine and dashboard card.
16. Add idempotency middleware and tool invocation records.
17. Build Engineering Morning Brief using GitHub read tools.
18. Add model router with economy and standard tiers.
19. Expose high-level workflow tools over remote MCP.
20. Run a security review before enabling the first external write.

# 32. Recommended Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
AI_GATEWAY_API_KEY or provider-specific server keys
RESEND_API_KEY
APP_ENCRYPTION_KEY or vault/KMS configuration
APP_BASE_URL
ENVIRONMENT
AUDIT_HASH_KEY
```

Rules:

- Public variables contain no secrets.
- Platform keys remain in server-side environment configuration.
- Tenant connector credentials are referenced by opaque IDs and resolved only inside authorized execution steps.
- Rotate webhook, encryption, and provider keys on a documented schedule.

# 33. Source and Standards Baseline

The architecture aligns with the following current official documentation, verified July 24, 2026:

- Model Context Protocol architecture and security boundaries — modelcontextprotocol.io.
- Anthropic MCP documentation for Claude products and remote MCP connections — docs.anthropic.com.
- OpenAI Apps SDK and remote MCP tooling — developers.openai.com and platform.openai.com.
- Vercel Workflows for durable, resumable execution — vercel.com/docs/workflow.
- Vercel AI Gateway for provider abstraction, budgets, routing, and fallback — vercel.com/docs/ai-gateway.
- Supabase Auth, Postgres RLS, secure server keys, and Vault — supabase.com/docs.
- GitHub Apps permissions and signed webhooks — docs.github.com.

# 34. Final Recommendation

Build MCPMaster as a **GitHub-first, approval-gated AI workflow product**, not a universal integration showcase. The first commercial value is trustworthy coordination: gather evidence, create a plan, ask for approval, execute once, verify, and record everything. Add connectors only when they strengthen that workflow and meet the same security and reliability contract.

The near-term objective is not “144 tools.” It is **three workflows that customers trust enough to run every day**.
