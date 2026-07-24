# Meta Business MCP

This application is the isolated Meta Business domain boundary for MCPMaster.

> AI drafts. A human approves. The MCP sends.

## Current milestone

The application now contains:

- the complete 17-tool catalog and law-office policy boundary;
- a standalone authenticated Streamable HTTP MCP service;
- exactly eight exposed read tools and four exposed internal-draft tools;
- no exposed or executable external-write tools;
- Supabase Auth bearer verification and active organization-membership checks;
- persistent tenant-scoped drafts protected by Row Level Security;
- a separately composed official Meta read-only provider;
- server-side secret-reference interfaces;
- fixed-origin, version-pinned Graph API GET requests with bounded responses and timeouts;
- HMAC-SHA256 webhook challenge and delivery verification;
- tenant-scoped replay deduplication and durable webhook health state;
- Page allowlisting, rate limits, request limits, origin validation, and HTTPS enforcement;
- a dedicated non-root production container;
- mocked integration, protocol, persistence, and security-negative tests.

Nothing in this milestone creates a Meta application, requests provider permissions, adds real credentials, connects a production Page, or deploys the service.

## Application structure

```text
apps/meta-business-mcp/
  src/
    auth/
    drafts/
    mcp/
    meta/
    runtime/
    secrets/
    security/
    supabase/
    tools/
    webhooks/
  docs/
  test/
  Dockerfile
```

## Remote MCP boundary

The service uses one Streamable HTTP endpoint:

```text
POST /mcp
GET  /mcp
```

`POST /mcp` accepts one JSON-RPC message and returns JSON. `GET /mcp` is authenticated and returns `405 Method Not Allowed` because this stateless milestone does not provide an SSE stream. The implemented methods are:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Supported MCP protocol versions are `2025-11-25`, `2025-06-18`, and `2025-03-26`.

Every MCP request requires:

- HTTPS, except explicit loopback development;
- a Supabase Auth bearer access token;
- an active membership in the configured organization;
- an allowed browser Origin when an `Origin` header is present;
- a supported MCP protocol version after initialization;
- compliance with per-user rate and body-size limits.

Owner, admin, operator, and member roles may create internal drafts. Viewer roles may use reads but cannot create drafts.

## Exposed read tools

- `meta_page_get`
- `meta_page_list_posts`
- `meta_post_get`
- `meta_post_list_comments`
- `meta_inbox_list_threads`
- `meta_inbox_get_thread`
- `meta_page_get_insights`
- `meta_webhook_health`

Official provider reads:

- use only `GET` requests;
- resolve the Page token through a server-side secret reference;
- send the token only in the `Authorization: Bearer` header;
- fix the origin to `https://graph.facebook.com`;
- require an explicit Graph API version;
- reject unsafe paths, redirects, oversized responses, invalid JSON, and Graph API errors.

## Exposed draft tools

- `meta_post_create_draft`
- `meta_comment_create_reply_draft`
- `meta_message_create_reply_draft`
- `meta_content_create_weekly_plan`

Drafts are stored in `public.meta_drafts` using the authenticated staff member's access token. Supabase RLS enforces organization membership and creator identity. Draft tools never publish, schedule, reply, or send content. Legal-risk drafts are stored with `legal_review_required=true`.

## External writes remain unavailable

The following catalog tools are not included in remote MCP discovery and cannot execute:

- `meta_post_publish`
- `meta_post_schedule`
- `meta_comment_reply`
- `meta_message_send`
- `meta_post_delete`

There is no official write provider and no remote write executor. Future writes must require an exact preview, authenticated staff identity, Page allowlisting, an approved action hash, idempotency, audit evidence, read-back verification, and kill-switch clearance. Post deletion remains R3 and requires an independent approver.

## Webhook persistence

Webhook ingress is available only when deliberately enabled. It preserves the raw body for signature verification and then:

1. verifies `X-Hub-Signature-256` before parsing JSON;
2. derives a SHA-256 delivery identity;
3. claims that identity atomically within the organization;
4. accepts only Page webhook objects and exact allowlisted Page IDs;
5. records only hashes, IDs, timestamps, event categories, and health counters.

Message bodies are not stored in ordinary webhook event or health records. Replay claims and health mutations use service-only Supabase RPCs. The service key is resolved server-side and is never returned through MCP.

## Supabase model

The migration adds:

- `public.meta_drafts`, protected by RLS;
- `public.meta_webhook_health`, server-only;
- tenant-scoped webhook delivery uniqueness;
- an expiry field for replay claims;
- `claim_meta_webhook_delivery`, service-role only;
- `record_meta_webhook_health`, service-role only.

Staff draft operations use each caller's JWT. Service credentials are limited to webhook ingestion and health persistence.

## Running locally

Build and test from the repository root:

```bash
npm run check
npm test
```

Start the service only after supplying a reviewed configuration:

```bash
npm run build
npm run start:meta-remote
```

For loopback-only development, `META_REMOTE_MCP_REQUIRE_HTTPS=false` is permitted. Non-loopback startup with HTTPS disabled is rejected. In hosted environments, terminate TLS at a trusted reverse proxy directly in front of the container and preserve the forwarded protocol header.

Build the standalone image from the repository root:

```bash
docker build -f apps/meta-business-mcp/Dockerfile -t mcpmaster-meta-business .
```

See `env.example` for the complete configuration contract. Credential references may point to deployment-platform encrypted environment secrets using `env://VARIABLE_NAME`; never commit the referenced values.

## Law-office boundary

The deterministic policy escalates content involving legal advice, merits, strategy, deadlines, limitation periods, fees, engagement terms, conflict clearance, confidential case facts, or outcome predictions.

This classifier is a safety gate, not a legal-analysis system. Provider content remains untrusted. Every future external message or publication must receive human review.

## Verification

CI validates:

- strict TypeScript compilation;
- all Node unit, protocol, persistence, and security-negative tests;
- the existing bridge image;
- the standalone Meta MCP image;
- clean Supabase migration replay and pgTAP security tests.

Tests use only synthetic identities, tokens, Page IDs, HTTP responses, and webhook payloads. They never call Meta or perform an external mutation.

## Explicit hold points

Do not create or connect a Meta application, add real tokens, request production permissions, connect a production Page, publish the service publicly, configure ChatGPT or Claude against it, publish content, or send messages without separate explicit approval and an environment review.
