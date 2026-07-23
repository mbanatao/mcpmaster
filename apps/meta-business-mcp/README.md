# Meta Business MCP

This application is the isolated Meta Business domain boundary for MCPMaster.

> AI drafts. A human approves. The MCP sends.

## Current milestone

The application now contains:

- the complete 17-tool catalog and law-office policy boundary;
- exact Page allowlisting, approval hashing, audit redaction, idempotency, and kill-switch checks;
- a non-networked synthetic provider and internal draft tools;
- a separately composed official Meta **read-only** provider;
- server-side secret-reference interfaces with no raw-token environment support;
- fixed-origin, version-pinned Graph API GET requests with bounded response size and timeouts;
- an official-network read executor that cannot execute draft or write tools;
- HMAC-SHA256 webhook delivery verification using `X-Hub-Signature-256`;
- webhook verification-challenge handling;
- Page allowlisting, replay deduplication, payload-size limits, and redacted delivery metadata;
- webhook health tracking without storing message bodies in ordinary health records;
- mocked integration and security-negative tests.

## Current application structure

```text
apps/meta-business-mcp/
  src/
    drafts/
    meta/
    runtime/
    secrets/
    security/
    tools/
    webhooks/
  docs/
  test/
```

## Read tools

- `meta_page_get`
- `meta_page_list_posts`
- `meta_post_get`
- `meta_post_list_comments`
- `meta_inbox_list_threads`
- `meta_inbox_get_thread`
- `meta_page_get_insights`
- `meta_webhook_health`

Synthetic reads remain available through `MetaReadDraftExecutor`. Official provider reads use the separate `MetaNetworkReadExecutor`, which requires explicit network configuration and an exact Page allowlist.

The official provider:

- uses only `GET` requests;
- resolves the Page token from a server-side secret reference for each request;
- sends the token only in the `Authorization: Bearer` header;
- fixes the origin to `https://graph.facebook.com`;
- requires an explicit Graph API version;
- rejects unsafe path segments, redirects, oversized responses, invalid JSON, and Graph API errors.

## Draft tools

- `meta_post_create_draft`
- `meta_comment_create_reply_draft`
- `meta_message_create_reply_draft`
- `meta_content_create_weekly_plan`

Draft tools remain internal. They never publish, schedule, reply, or send content. Legal-risk drafts remain available for staff review but are visibly flagged.

## External writes

- `meta_post_publish`
- `meta_post_schedule`
- `meta_comment_reply`
- `meta_message_send`
- `meta_post_delete`

There is still no official write provider and no write executor. Every external write throws `MetaWriteExecutionDisabledError`.

Future writes must require authenticated staff identity, an exact Page match, a visible preview, an approved action hash, idempotency, an audit event, explicit network enablement, and kill-switch clearance. Post deletion remains R3 and requires an independent approver.

## Webhook boundary

Webhook delivery processing requires the exact raw request body and verifies the `X-Hub-Signature-256` HMAC before parsing JSON. It then:

1. derives a SHA-256 delivery identity;
2. rejects duplicate replays within the configured window;
3. accepts only Page webhook objects;
4. rejects non-allowlisted Page IDs;
5. records only Page IDs, event categories, hashes, timestamps, and health state.

The webhook processor does not expose a public HTTP route in this milestone. A future ingress adapter must preserve the raw body bytes and pass them to this verifier unchanged.

## Configuration

The legacy safe configuration remains available through `loadMetaBusinessConfig`. The official read/webhook runtime uses `loadMetaLiveConfig`, which additionally requires:

- `META_GRAPH_API_VERSION`;
- `META_REQUEST_TIMEOUT_MS` within the allowed range;
- `META_WEBHOOK_VERIFY_TOKEN_SECRET_REF` when webhooks are enabled;
- `META_WEBHOOK_MAX_BODY_BYTES` within the allowed range.

See `env.example`. All credential values are secret references, never raw tokens or app secrets.

## Law-office boundary

The deterministic policy escalates content involving legal advice, merits, strategy, deadlines, limitation periods, fees, engagement terms, conflict clearance, confidential case facts, or outcome predictions.

This classifier is a safety gate, not a legal-analysis system. Provider content remains untrusted and final outbound content requires human review.

## Verification

From the repository root:

```bash
npm run check
npm test
```

Tests use mocked transports, synthetic identifiers, synthetic tokens, and synthetic webhook payloads. They never call Meta or publish content.

## Explicit hold points

Do not create or connect a Meta application, add real tokens, request production permissions, connect a production Page, expose a public webhook endpoint, deploy this application, publish content, or send messages without separate explicit approval.
