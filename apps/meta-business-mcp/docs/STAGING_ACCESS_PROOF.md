# Meta Staging Access Proof

## Purpose

`npm run meta:staging:prove-access` performs a one-shot, read-only proof before any Meta connector can move beyond `pending`.

It proves only these technical facts:

1. a short-lived human `USER` token is valid;
2. the token was issued by the exact `META_APP_ID` configured for staging;
3. the token contains `pages_show_list` and `pages_read_engagement`;
4. the authenticated human can access the exact Page in both `META_STAGING_EXPECTED_PAGE_ID` and `META_ALLOWED_PAGE_IDS`.

It does **not** prove that the App is owned by the intended Meta Business Portfolio. That remains a human dashboard verification checkpoint.

## Safety boundary

The proof:

- runs only when `MCPMASTER_ENVIRONMENT=staging`;
- requires `META_STAGING_ACCESS_PROOF_ENABLED=true`;
- refuses to run if `META_EXTERNAL_WRITES_ENABLED=true`;
- rejects wildcard Page allowlists;
- requires exact numeric App and Page IDs;
- accepts tokens only through secret references;
- requires a human `USER` token rather than a system-user token;
- checks token and data-access expiry;
- performs only Graph API GET requests;
- requests only `id,name,tasks` from `/me/accounts` and never requests a Page token;
- emits a truncated SHA-256 identity hash rather than the Meta user ID;
- never changes the connector installation, scopes, credentials, webhook state, or status;
- never publishes, schedules, replies, sends, or deletes.

## Graph requests

The runner makes exactly two requests to the configured Graph API version:

1. `GET /debug_token` to validate token type, validity, App provenance, scopes, and expiry;
2. `GET /me/accounts?fields=id,name,tasks` to confirm access to the exact allowlisted Page.

The inspected human token is passed as the `input_token` required by Meta's token-debug endpoint. The debugger credential and human token are resolved immediately before the requests and are not included in the report.

## Required environment

Non-secret values:

```text
MCPMASTER_ENVIRONMENT=staging
META_EXTERNAL_WRITES_ENABLED=false
META_STAGING_ACCESS_PROOF_ENABLED=true
META_APP_ID=<exact numeric staging App ID>
META_GRAPH_API_VERSION=<explicit version such as v23.0>
META_ALLOWED_PAGE_IDS=<exact numeric Page ID>
META_STAGING_EXPECTED_PAGE_ID=<same exact numeric Page ID>
META_STAGING_META_USER_TOKEN_SECRET_REF=env://META_STAGING_META_USER_TOKEN
META_STAGING_META_DEBUGGER_TOKEN_SECRET_REF=env://META_STAGING_META_DEBUGGER_TOKEN
```

Encrypted one-shot secrets:

```text
META_STAGING_META_USER_TOKEN=<short-lived human USER token>
META_STAGING_META_DEBUGGER_TOKEN=<App/admin token allowed to inspect the human token>
```

The two secret references may resolve to the same short-lived administrator token only when Meta permits that token to inspect itself. Do not add an App secret, Page token, refresh token, or permanent system-user token to the repository or command line.

## Run

```bash
npm run meta:staging:prove-access
```

Expected output is a redacted JSON report containing:

- exact App ID;
- exact Page ID;
- token type `USER`;
- hashed human identity;
- granted scope names;
- Page task names;
- four pass/fail checks;
- completion timestamp.

The report must not contain either token or the raw Meta user ID.

## Acceptance

A successful report is necessary but not sufficient for connector activation. Before activation, a human owner must also verify in Meta Business Manager or the App dashboard that:

- the App is the intended dedicated staging App;
- the App belongs to the intended Business Portfolio;
- recovery contacts and administrator MFA are configured;
- the Page is the intended controlled staging Page;
- permissions remain least privilege;
- external writes, webhooks, and provider networking remain disabled until separately approved.

## Failure response

On any mismatch, expiry, missing scope, or inaccessible Page:

1. leave the connector `pending`;
2. do not request broader permissions automatically;
3. revoke the suspect token;
4. preserve only the redacted error category;
5. verify the App and Page manually before issuing another short-lived token.
