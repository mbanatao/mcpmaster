const test = require('node:test');
const assert = require('node:assert/strict');

const {
  authorizeExternalWrite,
  canonicalizeJson,
  computeActionHash,
  evaluateLawOfficeText,
  isPageAllowed,
  redactForAudit,
} = require('../dist/index.js');

test('canonical JSON is stable across object key order', () => {
  assert.equal(
    canonicalizeJson({ b: 2, a: { z: true, y: false } }),
    canonicalizeJson({ a: { y: false, z: true }, b: 2 }),
  );
});

test('action hash changes when the approved action changes', () => {
  const base = {
    toolName: 'meta_post_publish',
    provider: 'meta',
    accountId: 'synthetic-page',
    requesterId: 'staff-1',
    arguments: { message: 'Office hours are 9–5.' },
  };

  const first = computeActionHash(base);
  const second = computeActionHash({
    ...base,
    arguments: { message: 'Office hours are 10–4.' },
  });

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('audit redaction removes secrets and personal message content', () => {
  assert.deepEqual(
    redactForAudit({
      access_token: 'secret-token',
      message: 'A client described private facts.',
      page_id: 'synthetic-page',
    }),
    {
      access_token: '[REDACTED_SECRET]',
      message: '[REDACTED_PERSONAL]',
      page_id: 'synthetic-page',
    },
  );
});

test('page allowlisting requires an exact configured ID', () => {
  assert.equal(isPageAllowed('12345', ['12345']), true);
  assert.equal(isPageAllowed('123', ['12345']), false);
  assert.equal(isPageAllowed('*', ['*']), false);
});

test('law-office policy flags deadlines and outcome predictions', () => {
  const result = evaluateLawOfficeText(
    'Tell the client the statute of limitations is safe and that we will win.',
  );

  assert.equal(result.disposition, 'legal_review_required');
  assert.deepEqual(result.reasons.sort(), [
    'deadline_or_limitation_period',
    'outcome_prediction',
  ]);
});

test('external writes fail closed when approval controls are absent', () => {
  const result = authorizeExternalWrite({
    staffId: '',
    pageId: 'wrong-page',
    allowedPageIds: ['synthetic-page'],
    idempotencyKey: 'short',
    approvalDecision: 'pending',
    expectedActionHash: 'a'.repeat(64),
    approvedActionHash: 'b'.repeat(64),
    killSwitchActive: true,
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons.sort(), [
    'approved_action_hash_mismatch',
    'authenticated_staff_required',
    'emergency_kill_switch_active',
    'human_approval_required',
    'page_not_allowlisted',
    'valid_idempotency_key_required',
  ]);
});

test('approved static office information can pass the deterministic gate', () => {
  const actionHash = computeActionHash({
    toolName: 'meta_post_publish',
    provider: 'meta',
    accountId: 'synthetic-page',
    requesterId: 'staff-1',
    arguments: { message: 'Our office is open Monday through Friday.' },
  });

  const result = authorizeExternalWrite({
    staffId: 'staff-1',
    pageId: 'synthetic-page',
    allowedPageIds: ['synthetic-page'],
    idempotencyKey: 'meta-publish-0001',
    approvalDecision: 'approved',
    expectedActionHash: actionHash,
    approvedActionHash: actionHash,
    killSwitchActive: false,
    outboundText: 'Our office is open Monday through Friday.',
  });

  assert.deepEqual(result, {
    allowed: true,
    reasons: [],
    requiresLegalReview: false,
  });
});
