# MCPMaster Architecture Blueprint

This directory contains the build-ready Version 1.0 blueprint for evolving MCPMaster into an approval-gated AI workflow control tower.

## Documents

1. [Product Overview](./00-product-overview.md) — product definition, market, principles, and MVP workflows.
2. [System Architecture](./01-system-architecture.md) — platform planes, stack, components, data model, APIs, and MCP surface.
3. [Contracts, Security, and Reliability](./02-contracts-security-reliability.md) — tool/workflow contracts, model routing, controls, threats, and service objectives.
4. [Dashboard, Migration, and Delivery](./03-dashboard-migration-delivery.md) — UI information architecture, incremental repository migration, program roadmap, backlog, testing, and deployment.
5. [Business, Launch, and Definition of Done](./04-business-launch-and-definition-of-done.md) — cost model, pricing, go-to-market wedge, architecture decisions, launch criteria, and implementation sequence.
6. [Meta Business MCP](./05-meta-business-mcp.md) — dedicated law-office Meta application, Page/inbox tools, approvals, privacy controls, webhook security, testing, and launch hold points.

## Product direction

> Build MCPMaster as a GitHub-first, approval-gated AI workflow product. Read automatically, propose clearly, approve writes, execute durably, verify results, and audit everything.

GitHub remains the first platform connector and foundation proving ground. The **Meta Business MCP is a mandatory domain application** built after persistent identity, approvals, and audit foundations exist. It is deployed separately from the generic bridge and follows the law-office rule: **AI drafts; a human approves; the MCP sends.**

## Immediate priorities

1. Complete and merge the secure runtime foundation.
2. Protect or remove every unauthenticated generic tool-execution path.
3. Remove demo credential fallbacks and establish real build, typecheck, test, and CI gates.
4. Introduce persistent organizations, staff identity, approval records, durable workflow state, and audit storage.
5. Introduce one typed tool registry and shared security package.
6. Build the read-only Engineering Morning Brief and GitHub approval workflow.
7. Scaffold the independently deployable `apps/meta-business-mcp` with no real Meta credentials.
8. Implement Meta read and draft tools before any external write tool.
9. Require explicit human approval, Page allowlisting, idempotency, redacted audit, and read-back verification for every Meta write.
10. Do not create a Meta app, add real credentials, connect the production Page, or send real content without separate explicit approval.
