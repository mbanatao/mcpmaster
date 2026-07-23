const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateMetaInvocation,
  getMetaToolDefinition,
  loadMetaBusinessConfig,
  metaToolCatalog,
} = require('../dist/index.js');

test('catalog exposes the complete planned Meta tool surface', () => {
  assert.equal(metaToolCatalog.length, 17);
  assert.equal(metaToolCatalog.filter((tool) => tool.mode === 'read').length, 8);
  assert.equal(metaToolCatalog.filter((tool) => tool.mode === 'draft').length, 4);
  assert.equal(metaToolCatalog.filter((tool) => tool.mode === 'write').length, 5);
});

test('post deletion is high risk and requires dual approval', () => {
  assert.deepEqual(getMetaToolDefinition('meta_post_delete'), {
    name: 'meta_post_delete',
    description: 'Delete a Page post after independent high-risk approval.',
    mode: 'write',
    risk: 'R3',
    approval: 'dual',
    requiredCapabilities: ['content.delete'],
    dataClass: 'business_public',
    pageAllowlistRequired: true,
  });
});

test('unknown tools are denied without producing a network-capable decision', () => {
  const result = evaluateMetaInvocation('meta_unknown', {
    staffId: 'staff-1',
    requesterId: 'staff-1',
    pageId: 'synthetic-page',
    allowedPageIds: ['synthetic-page'],
    arguments: {},
    killSwitchActive: false,
  });

  assert.deepEqual(result, {
    allowed: false,
    reasons: ['unknown_tool'],
    requiresHumanApproval: true,
    requiresIndependentApproval: false,
    requiresLegalReview: false,
    networkMutationAllowed: false,
  });
});

test('draft tools remain non-networked and flag legal-risk language', () => {
  const result = evaluateMetaInvocation('meta_message_create_reply_draft', {
    staffId: 'staff-1',
    requesterId: 'staff-1',
    pageId: 'synthetic-page',
    allowedPageIds: ['synthetic-page'],
    arguments: {
      message: 'The statute of limitations is safe and you will win.',
    },
    killSwitchActive: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.networkMutationAllowed, false);
  assert.equal(result.requiresHumanApproval, false);
  assert.equal(result.requiresLegalReview, true);
});

test('write tools are denied until an exact approval is present', () => {
  const result = evaluateMetaInvocation('meta_post_publish', {
    staffId: 'staff-1',
    requesterId: 'staff-1',
    pageId: 'synthetic-page',
    allowedPageIds: ['synthetic-page'],
    arguments: { message: 'Our office is open Monday through Friday.' },
    idempotencyKey: 'meta-publish-0001',
    killSwitchActive: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.networkMutationAllowed, false);
  assert.ok(result.reasons.includes('human_approval_required'));
  assert.ok(result.reasons.includes('approved_action_hash_mismatch'));
});

test('an exactly approved static-information write passes policy', () => {
  const context = {
    staffId: 'staff-1',
    requesterId: 'staff-1',
    pageId: 'synthetic-page',
    allowedPageIds: ['synthetic-page'],
    arguments: { message: 'Our office is open Monday through Friday.' },
    idempotencyKey: 'meta-publish-0001',
    killSwitchActive: false,
  };

  const planned = evaluateMetaInvocation('meta_post_publish', context);
  const approved = evaluateMetaInvocation('meta_post_publish', {
    ...context,
    approvalDecision: 'approved',
    approvedActionHash: planned.actionHash,
  });

  assert.equal(approved.allowed, true);
  assert.equal(approved.networkMutationAllowed, true);
  assert.equal(approved.requiresHumanApproval, true);
  assert.equal(approved.requiresLegalReview, false);
});

test('legal-risk writes require an additional lawyer or secretary review signal', () => {
  const context = {
    staffId: 'staff-1',
    requesterId: 'staff-1',
    pageId: 'synthetic-page',
    allowedPageIds: ['synthetic-page'],
    arguments: { message: 'Your filing deadline is next week and you will win.' },
    idempotencyKey: 'meta-message-0001',
    approvalDecision: 'approved',
    killSwitchActive: false,
  };

  const planned = evaluateMetaInvocation('meta_message_send', context);
  const denied = evaluateMetaInvocation('meta_message_send', {
    ...context,
    approvedActionHash: planned.actionHash,
  });

  assert.equal(denied.allowed, false);
  assert.equal(denied.requiresLegalReview, true);
  assert.ok(denied.reasons.includes('lawyer_or_secretary_review_required'));

  const reviewed = evaluateMetaInvocation('meta_message_send', {
    ...context,
    approvedActionHash: planned.actionHash,
    legalReviewConfirmed: true,
  });

  assert.equal(reviewed.allowed, true);
});

test('configuration defaults to network disabled and kill switch active', () => {
  assert.deepEqual(loadMetaBusinessConfig({}), {
    allowedPageIds: [],
    killSwitchActive: true,
    networkEnabled: false,
    metaAppId: undefined,
    tokenSecretRef: undefined,
    webhookSecretRef: undefined,
    encryptionKeyRef: undefined,
  });
});

test('configuration rejects raw Meta secrets', () => {
  assert.throws(
    () => loadMetaBusinessConfig({ META_ACCESS_TOKEN: 'do-not-store-raw-tokens' }),
    /META_ACCESS_TOKEN is forbidden/,
  );
});

test('network mode cannot start without references, allowlist, and kill-switch clearance', () => {
  assert.throws(
    () => loadMetaBusinessConfig({ META_NETWORK_ENABLED: 'true' }),
    /missing required configuration/,
  );

  assert.throws(
    () => loadMetaBusinessConfig({
      META_NETWORK_ENABLED: 'true',
      META_APP_ID: 'synthetic-app',
      META_TOKEN_SECRET_REF: 'vault://meta/token',
      META_WEBHOOK_SECRET_REF: 'vault://meta/webhook',
      META_ENCRYPTION_KEY_REF: 'kms://meta/key',
      META_ALLOWED_PAGE_IDS: 'synthetic-page',
      META_KILL_SWITCH: 'true',
    }),
    /kill switch is active/,
  );
});
