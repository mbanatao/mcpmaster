# MCPMaster Architecture Blueprint

This directory contains the build-ready Version 1.0 blueprint for evolving MCPMaster into an approval-gated AI workflow control tower.

## Documents

1. [Product Overview](./00-product-overview.md) — product definition, market, principles, and MVP workflows.
2. [System Architecture](./01-system-architecture.md) — platform planes, stack, components, data model, APIs, and MCP surface.
3. [Contracts, Security, and Reliability](./02-contracts-security-reliability.md) — tool/workflow contracts, model routing, controls, threats, and service objectives.
4. [Dashboard, Migration, and Delivery](./03-dashboard-migration-delivery.md) — UI information architecture, incremental repository migration, 12-week roadmap, backlog, testing, and deployment.
5. [Business, Launch, and Definition of Done](./04-business-launch-and-definition-of-done.md) — cost model, pricing, go-to-market wedge, architecture decisions, launch criteria, and implementation sequence.

## Product direction

> Build MCPMaster as a GitHub-first, approval-gated AI workflow product. Read automatically, propose clearly, approve writes, execute durably, verify results, and audit everything.

## Immediate priorities

1. Protect or disable the unauthenticated generic tool-execution path.
2. Remove demo credential fallbacks.
3. Establish real build, typecheck, test, and CI checks.
4. Introduce one typed tool registry.
5. Build the read-only Engineering Morning Brief before enabling external writes.
