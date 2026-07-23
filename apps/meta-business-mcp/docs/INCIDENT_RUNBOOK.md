# Incident and Token-Revocation Runbook

This runbook becomes executable only after a provider integration exists. Until then, it defines the required response order.

## Immediate containment

1. Activate the Meta emergency kill switch.
2. Disable all write and draft-to-send workflow execution.
3. Preserve read-only health information when safe.
4. Revoke the affected credential or secret reference through the approved secret manager.
5. Disable the connector installation if revocation cannot be confirmed.
6. Block webhook processing if signature integrity is in doubt.

## Investigation

- Identify the organization, connector installation, Page ID, staff actor, workflow run, and time window.
- Review redacted audit events and provider request identifiers.
- Check for changed approval hashes, repeated idempotency keys, or unexpected target Page IDs.
- Check webhook delivery IDs for replay or duplication.
- Never copy raw message bodies, tokens, or secrets into incident chat, tickets, or ordinary logs.

## Recovery

1. Rotate the Meta token and webhook secret.
2. Rotate encryption keys when secret storage may be affected.
3. Re-verify the exact Page allowlist.
4. Re-run connector health checks with writes still disabled.
5. Reconcile posts, comments, and messages against verified audit records.
6. Restore read-only operation first.
7. Restore writes only after owner approval and a clean synthetic canary.

## User-impact handling

- Escalate any exposure of personal or confidential message content immediately.
- Record what data was affected, who had access, and how long exposure lasted.
- Consult counsel before external notification obligations are assessed.
- Do not send automated legal explanations or assurances to affected people.

## Evidence retention

Preserve immutable audit exports, deployment identifiers, provider request IDs, webhook delivery metadata, and credential-rotation evidence. Store sensitive evidence only in the approved incident location.

## Post-incident requirements

- Root-cause analysis.
- New regression or security-negative test.
- Review of scopes, rate limits, allowlists, and approval policy.
- Confirmation that revoked credentials fail all subsequent requests.
- Explicit owner sign-off before writes are re-enabled.
