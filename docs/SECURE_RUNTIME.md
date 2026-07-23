# Secure Runtime Foundation

This document describes the first implementation milestone for MCPMaster.

## Runtime split

MCPMaster now has two explicit entry points:

- `src/http-server.ts` — the container-hosted HTTP control plane.
- `src/mcp-stdio.ts` — the local MCP stdio process.

The previous `src/server.ts` remains temporarily available through `npm run start:legacy`, but it is no longer the production default.

## HTTP security model

The following routes are public:

- `GET /`
- `GET /health`

Every other route requires:

```http
Authorization: Bearer <BRIDGE_ADMIN_TOKEN>
```

`BRIDGE_ADMIN_TOKEN` must contain at least 32 characters.

Write and destructive tools additionally require:

```http
X-Approval-Token: <BRIDGE_APPROVAL_TOKEN>
```

Read-only tools do not require the approval token. Unknown tool actions fail closed and are treated as write operations.

## Tool workflow

### Inspect available tools

```bash
curl http://localhost:3000/tools \
  -H "Authorization: Bearer $BRIDGE_ADMIN_TOKEN"
```

### Create a non-executing plan

```bash
curl http://localhost:3000/tools/plan \
  -H "Authorization: Bearer $BRIDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"github.create-issue","args":{"owner":"example","repo":"app","title":"Investigate failure"}}'
```

### Execute a read tool

```bash
curl http://localhost:3000/tools/execute \
  -H "Authorization: Bearer $BRIDGE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"github.get-repository","args":{"owner":"example","repo":"app"}}'
```

### Execute an approved write tool

```bash
curl http://localhost:3000/tools/execute \
  -H "Authorization: Bearer $BRIDGE_ADMIN_TOKEN" \
  -H "X-Approval-Token: $BRIDGE_APPROVAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"github.create-issue","args":{"owner":"example","repo":"app","title":"Investigate failure"}}'
```

The compatibility route `POST /tools` remains temporarily available, but it is authenticated, approval-gated, and marked deprecated.

## MCP stdio behavior

The MCP process is read-only by default:

```bash
npm run build
npm run start:mcp
```

Write tools are not advertised unless the local process is launched with:

```bash
MCP_ALLOW_WRITES=true npm run start:mcp
```

This setting is intended only for a trusted local environment. The HTTP control plane should be used whenever explicit per-request approval is required.

## Service credentials

The runtime no longer substitutes `demo-key` values. A tool fails with `SERVICE_NOT_CONFIGURED` when its required service credentials are missing.

See `env.example` for the complete environment contract.

## Container deployment

The supported production path for this milestone is a persistent container:

```bash
docker build -t mcpmaster .
docker run --rm -p 3000:3000 --env-file .env mcpmaster
```

The old Vercel serverless configuration was removed because a persistent Express listener and MCP stdio transport do not belong in a normal serverless function. A future Vercel control-plane application should be introduced as a separate web application using durable workflow APIs.

## Audit behavior

The HTTP runtime stores a bounded in-memory audit ring containing:

- request ID
- tool name
- risk class
- lifecycle status
- timestamp
- duration
- error summary

Arguments, credentials, and provider results are deliberately excluded. Persistent tenant-aware audit storage is a later milestone.

## Current limitations

- Approval tokens are environment-level, not user-specific.
- Audit events are in memory and reset on restart.
- The legacy connector implementations still need individual hardening and contract tests.
- Tool input schemas are not yet generated from a single canonical registry.
- Multi-tenant authentication and durable workflow execution are not part of this foundation PR.
