# MCPMaster: AI Workflow Control Tower
## Product, System Architecture, Security, and Delivery Blueprint — Version 1.0

**Date:** July 24, 2026  
**Status:** Build-ready planning baseline  
**Recommended stack:** Next.js + TypeScript + Vercel + Supabase + GitHub App + multi-provider AI gateway  
**Primary principle:** Read automatically. Propose clearly. Approve writes. Execute durably. Audit everything.

---

# 1. Executive Summary

MCPMaster should become an **AI workflow control tower**, not another collection of connectors. Existing AI products already connect to GitHub, Google Drive, Notion, and other services. MCPMaster's value is the operating layer above those pipes: cross-service workflows, policy enforcement, approval gates, cost-aware model routing, durable execution, and a dashboard that records what happened.

The recommended first product is a **GitHub-first engineering operations assistant** for solo founders and small product teams. It starts with read-only workflows such as pull-request triage, deployment health summaries, release readiness, and sprint status. It then adds approval-gated write actions such as creating issues, updating Linear, drafting Notion documents, and triggering safe deployment operations.

The current repository should be improved incrementally rather than rebuilt in one large rewrite. Preserve useful connector code, but replace the duplicated tool definitions, insecure generic execution endpoint, and conflicting deployment approaches with a single typed tool registry and one supported runtime architecture.

# 2. Product Definition

## 2.1 One-sentence definition

MCPMaster is a multi-tenant system that lets people define, run, approve, and audit AI-assisted workflows across development and business tools from a dashboard or an AI host such as Claude or ChatGPT.

## 2.2 The customer outcome

Customers do not buy “MCP access.” They buy outcomes such as:

- “Give me a trustworthy engineering brief every morning.”
- “Turn an approved bug report into a GitHub issue, a Linear task, and a Notion record.”
- “Prepare a release checklist, identify blockers, and wait for my approval before changing anything.”
- “Investigate a failed deployment and assemble the evidence in one place.”

## 2.3 Product promise

**One request becomes a controlled workflow across several services, with visible plans, human approvals, budget controls, retries, verification, and an audit trail.**

## 2.4 Non-goals for Version 1

- Do not support fifteen integrations at launch.
- Do not permit unrestricted autonomous writes.
- Do not become a general-purpose no-code automation builder immediately.
- Do not run customer-supplied arbitrary code.
- Do not expose personal access tokens or service-role credentials to models or browsers.
- Do not include financial transfers, blockchain transactions, identity administration, or destructive cloud operations in the MVP.

# 3. Market and Positioning

## 3.1 Initial target customer

- Solo technical founders.
- Product and engineering teams of roughly 3–25 people.
- Development agencies managing several repositories and client workflows.
- Operations-minded teams already using GitHub, Notion, Linear, Vercel, and AI assistants.

## 3.2 Initial buyer pain

These teams already have connectors, but work is fragmented. Someone still has to interpret multiple systems, decide what matters, coordinate updates, and prove what changed. The pain is not access to APIs. The pain is **reliable cross-tool coordination**.

## 3.3 Positioning statement

> MCPMaster is the approval-gated AI operations layer for small product teams. It coordinates work across GitHub, project management, documentation, and deployment systems while keeping humans in control.

## 3.4 Competitive differentiation

| Existing connector or chatbot | MCPMaster differentiation |
|---|---|
| Calls one tool in one conversation | Runs durable workflows across tools |
| Chat history is the record | Structured run history and immutable audit events |
| Provider-specific AI | Multi-provider model routing and fallback |
| Generic tool permission | Per-tool, per-workspace, per-risk policy |
| Immediate write actions | Plan-first and approval-gated execution |
| Limited cost visibility | Per-run budgets, usage ledger, model spend controls |
| No operational dashboard | Central run, connector, policy, and evidence dashboard |

# 4. Product Principles

1. **The model proposes; policy disposes.** A model never receives direct authority to bypass the policy engine.
2. **Read by default.** New connectors and workflows begin read-only.
3. **Writes require explicit classification.** Every tool is labeled read, low-risk write, high-risk write, or prohibited.
4. **Approval is a workflow state, not a chat message.** It must be stored, attributable, expiring, and auditable.
5. **Every write is idempotent.** Retries cannot create duplicates.
6. **External content is untrusted.** Issues, comments, documents, logs, and webpages are data, not instructions.
7. **One tool registry.** MCP schemas, UI forms, policy metadata, docs, tests, and execution adapters come from one definition.
8. **Models are replaceable.** Business logic must not depend on one AI provider.
9. **Credentials are never model-visible.** Models select tools; server-side adapters resolve secrets.
10. **Incremental migration.** Preserve useful code and replace unsafe paths behind stable interfaces.

# 5. MVP Use Cases

## 5.1 Workflow A — Engineering Morning Brief (read-only)

Inputs: selected repositories, Vercel projects, date window.  
Steps: collect commits, open PRs, failed checks, deployments, and blockers; summarize; cite source records.  
Output: dashboard report and optional email.  
Risk: low.  
Approval: not required.

## 5.2 Workflow B — Pull Request Triage (read-only)

Inputs: repository and PR set.  
Steps: inspect metadata, checks, changed files, review state, and unresolved comments; classify urgency and recommended next action.  
Output: prioritized queue.  
Risk: low.  
Approval: not required.

## 5.3 Workflow C — Bug-to-Workstream (approval-gated)

Inputs: bug description or selected GitHub issue.  
Steps: gather context; draft implementation plan; propose GitHub/Linear/Notion updates; wait for approval; create records; verify links.  
Output: linked work items and audit evidence.  
Risk: medium.  
Approval: required before writes.

## 5.4 Workflow D — Release Readiness (mixed)

Inputs: repository, target branch, release version.  
Steps: inspect CI, open blockers, migrations, environment checks, and deployment status; prepare checklist; optionally create missing tasks after approval.  
Risk: low for analysis, medium for task creation.  
Approval: required only for writes.

## 5.5 Workflow E — Deployment Incident Brief (read-only in MVP)

Inputs: deployment or incident identifier.  
Steps: collect deployment logs and related commits; correlate timestamps; produce likely causes and recommended checks.  
Output: evidence-backed incident brief.  
Risk: low.  
Approval: not required.
