# Meta Business MCP

This application is the isolated Meta Business domain boundary for MCPMaster.

The governing operating rule is:

> AI drafts. A human approves. The MCP sends.

## Current milestone

This branch contains:

- the typed 17-tool catalog;
- deterministic Page allowlisting;
- exact action hashing for approval binding;
- idempotency, network-mode, independent-approval, and kill-switch policy checks;
- audit redaction primitives;
- law-office legal-risk classification;
- fail-safe configuration parsing;
- a typed Meta provider port;
- a non-networked synthetic provider implementing all eight read tools;
- tenant-scoped in-memory draft storage;
- executable post, comment-reply, message-reply, and weekly-plan drafts;
- synthetic unit and security-negative tests.

It does **not** contain an official Meta API client, OAuth callback, remote MCP server, webhook receiver, token resolver, network request, deployment configuration, or production credential.

## Current application structure

```text
apps/meta-business-mcp/
  src/
    drafts/
    meta/
    security/
    tools/
  docs/
  test/
```

The future `mcp`, `webhooks`, `approvals`, and persistent `audit` adapters are not yet implemented.

## Tool groups

### Read

- `meta_page_get`
- `meta_page_list_posts`
- `meta_post_get`
- `meta_post_list_comments`
- `meta_inbox_list_threads`
- `meta_inbox_get_thread`
- `meta_page_get_insights`
- `meta_webhook_health`

All eight read tools currently execute only against the synthetic provider. The read/draft executor rejects any provider marked network-capable.

### Draft only

- `meta_post_create_draft`
- `meta_comment_create_reply_draft`
- `meta_message_create_reply_draft`
- `meta_content_create_weekly_plan`

Draft tools store internal draft records and never publish, schedule, reply, or send content. Legal-risk drafts remain available for staff review but are visibly flagged.

### External writes

- `meta_post_publish`
- `meta_post_schedule`
- `meta_comment_reply`
- `meta_message_send`
- `meta_post_delete`

Every external write must eventually have authenticated staff identity, an exact Page allowlist match, an approved action hash, an idempotency key, audit evidence, explicit network enablement, and the emergency kill switch disabled. Post deletion is classified R3 and requires independent approval.

The current executor throws `MetaWriteExecutionDisabledError` for every write tool. There is no write provider method or network mutation path in this milestone.

## Law-office boundary

The deterministic policy escalates content involving:

- legal advice;
- merits or case strategy;
- deadlines and limitation periods;
- fees or engagement terms;
- conflict clearance;
- confidential case facts;
- outcome predictions.

This classifier is a safety gate, not a legal-analysis system. Provider content remains untrusted and final outbound content requires human review.

## Local verification

From the repository root:

```bash
npm run build
npm test
```

Tests use synthetic identifiers and content only.

## Explicit hold points

Do not create or connect a Meta application, add real tokens, request production permissions, connect a production Page, deploy this app, publish content, or send messages without separate explicit approval.
