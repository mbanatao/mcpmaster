const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemoryMetaDraftStore,
  MetaPolicyDeniedError,
  MetaReadDraftExecutor,
  MetaWriteExecutionDisabledError,
  SyntheticMetaProvider,
} = require('../dist/index.js');

function createHarness() {
  const provider = new SyntheticMetaProvider('synthetic-page');
  const drafts = new InMemoryMetaDraftStore({
    createId: (() => {
      let sequence = 0;
      return () => `synthetic-draft-${++sequence}`;
    })(),
    now: () => new Date('2026-07-24T00:00:00.000Z'),
  });
  const executor = new MetaReadDraftExecutor(provider, drafts);
  const context = {
    organizationId: 'synthetic-organization',
    staffId: 'staff-1',
    requesterId: 'staff-1',
    allowedPageIds: ['synthetic-page'],
    killSwitchActive: true,
    networkEnabled: false,
  };

  return { provider, drafts, executor, context };
}

test('synthetic provider cannot perform network requests', () => {
  const provider = new SyntheticMetaProvider();
  assert.equal(provider.providerKind, 'synthetic');
  assert.equal(provider.networkCapable, false);
});

test('all eight read tools execute against synthetic data', async () => {
  const { executor, context } = createHarness();
  const cases = [
    ['meta_page_get', { pageId: 'synthetic-page' }],
    ['meta_page_list_posts', { pageId: 'synthetic-page', limit: 10 }],
    ['meta_post_get', { pageId: 'synthetic-page', postId: 'synthetic-post-1' }],
    ['meta_post_list_comments', { pageId: 'synthetic-page', postId: 'synthetic-post-1' }],
    ['meta_inbox_list_threads', { pageId: 'synthetic-page' }],
    ['meta_inbox_get_thread', { pageId: 'synthetic-page', threadId: 'synthetic-thread-1' }],
    ['meta_page_get_insights', { pageId: 'synthetic-page', metricNames: ['page_views'] }],
    ['meta_webhook_health', { pageId: 'synthetic-page' }],
  ];

  for (const [toolName, args] of cases) {
    const result = await executor.execute(toolName, args, context);
    assert.equal(result.toolName, toolName);
    assert.equal(result.mode, 'read');
    assert.equal(result.policy.requiresLegalReview, false);
  }
});

test('a non-allowlisted Page is denied before provider access', async () => {
  const { executor, context } = createHarness();

  await assert.rejects(
    () => executor.execute(
      'meta_page_get',
      { pageId: 'different-page' },
      context,
    ),
    (error) => {
      assert.ok(error instanceof MetaPolicyDeniedError);
      assert.ok(error.reasons.includes('page_not_allowlisted'));
      return true;
    },
  );
});

test('post drafts are stored internally and message content is redacted from audit arguments', async () => {
  const { executor, drafts, context } = createHarness();
  const result = await executor.execute(
    'meta_post_create_draft',
    {
      pageId: 'synthetic-page',
      message: 'Our office is open Monday through Friday.',
    },
    context,
  );

  assert.equal(result.mode, 'draft');
  assert.equal(result.data.id, 'synthetic-draft-1');
  assert.equal(result.data.status, 'draft');
  assert.equal(result.data.legalReviewRequired, false);
  assert.deepEqual(result.audit.argumentsRedacted, {
    pageId: 'synthetic-page',
    message: '[REDACTED_PERSONAL]',
  });

  const stored = await drafts.get('synthetic-organization', 'synthetic-draft-1');
  assert.equal(stored.content, 'Our office is open Monday through Friday.');
});

test('legal-risk message drafts are retained but flagged for human legal review', async () => {
  const { executor, context } = createHarness();
  const result = await executor.execute(
    'meta_message_create_reply_draft',
    {
      pageId: 'synthetic-page',
      threadId: 'synthetic-thread-1',
      message: 'Your filing deadline is next week and you will win.',
    },
    context,
  );

  assert.equal(result.data.kind, 'message_reply');
  assert.equal(result.data.legalReviewRequired, true);
  assert.equal(result.policy.requiresLegalReview, true);
});

test('weekly-plan drafts are deterministic and never scheduled', async () => {
  const { executor, context } = createHarness();
  const result = await executor.execute(
    'meta_content_create_weekly_plan',
    {
      pageId: 'synthetic-page',
      weekOf: '2026-07-27',
      topics: ['Office hours', 'How to request a consultation'],
    },
    context,
  );

  assert.equal(result.data.kind, 'weekly_plan');
  assert.equal(
    result.data.content,
    'Weekly content plan — 2026-07-27\n1. Office hours\n2. How to request a consultation',
  );
  assert.equal(result.data.status, 'draft');
});

test('write tools are impossible in the read/draft executor', async () => {
  const { executor, context } = createHarness();

  await assert.rejects(
    () => executor.execute(
      'meta_post_publish',
      { pageId: 'synthetic-page', message: 'Do not publish this.' },
      context,
    ),
    MetaWriteExecutionDisabledError,
  );
});

test('read/draft executor rejects a network-capable provider implementation', () => {
  const provider = {
    providerKind: 'official-meta',
    networkCapable: true,
  };
  const drafts = new InMemoryMetaDraftStore();

  assert.throws(
    () => new MetaReadDraftExecutor(provider, drafts),
    /accepts only a non-networked Meta provider/,
  );
});
