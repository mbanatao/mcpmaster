# Threat Model

## Protected assets

- Meta application and Page tokens.
- Webhook verification secrets.
- Encryption keys and secret references.
- Facebook Page and post identifiers.
- Inbox messages, comments, and personal data.
- Approval decisions and exact action hashes.
- Idempotency records and audit evidence.
- Staff identity, organization membership, and role.

## Trust boundaries

1. AI host to remote MCP endpoint.
2. Authenticated staff session to control plane.
3. Control plane to approval and audit database.
4. Meta Business MCP to secret resolver.
5. Meta Business MCP to official Meta endpoints.
6. Meta webhook ingress to verified event processing.
7. Provider content to AI model context.

Provider content is untrusted data. It cannot grant permissions, change policy, authorize a write, reveal secrets, or select a non-allowlisted target.

## Principal threats and required controls

| Threat | Control |
|---|---|
| Stolen or leaked token | Server-only secret references, encryption, rotation, revocation, no token logging |
| Wrong Page targeted | Exact Page ID allowlist and target included in approval hash |
| Approval replay or tampering | SHA-256 action hash, expiration, staff identity, idempotency, re-approval on change |
| Duplicate post or message | Organization-scoped idempotency key stored before mutation |
| Forged webhook | Provider signature verification, timestamp window, delivery-ID uniqueness |
| Webhook replay | Delivery deduplication and processed-event state |
| Prompt injection | Provider text treated as untrusted; deterministic policy remains authoritative |
| Legal-risk auto-response | Legal-risk classifier plus mandatory human/lawyer or secretary review |
| Personal-data leakage | Data minimization, redaction before model use, no ordinary message-body logging |
| Cross-tenant access | Organization-scoped rows, Supabase RLS, server-side membership checks |
| Over-permissioned application | Least-privilege capabilities and separate read/write enablement |
| Runaway automation | Rate limits, budgets, kill switch, bounded retries, circuit breaker |
| Compromised AI client | MCP exposes high-level tools; every write is independently authorized server-side |

## Fail-safe defaults

- `META_NETWORK_ENABLED=false`.
- `META_KILL_SWITCH=true`.
- Empty Page allowlist.
- Raw Meta secret environment variables are rejected.
- Unknown tools are denied.
- Draft tools never perform network mutations.
- Writes without a matching approved action hash are denied.

## Out of scope for this milestone

No provider connection exists yet. OAuth, webhooks, token resolution, API calls, remote MCP transport, and deployment require later security review and explicit approval.
