const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const {
  InMemoryMetaWebhookClaimStore,
  InMemoryMetaWebhookHealthStore,
  InMemorySecretResolver,
  MetaGraphApiError,
  MetaNetworkReadExecutor,
  MetaPolicyDeniedError,
  MetaWebhookProcessingError,
  MetaWebhookProcessor,
  MetaWebhookSignatureVerifier,
  MetaWriteExecutionDisabledError,
  OfficialMetaReadProvider,
  createOfficialMetaRuntime,
  loadMetaLiveConfig,
} = require('../dist/index.js');

class QueueTransport {
  constructor(responses) {
    this.responses = [...responses];
    this.requests = [];
  }

  async send(request) {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error('No queued response');
    }
    return response;
  }
}

function liveEnvironment(overrides = {}) {
  return {
    META_NETWORK_ENABLED: 'true',
    META_KILL_SWITCH: 'false',
    META_ALLOWED_PAGE_IDS: 'page-123',
    META_APP_ID: 'app-123',
    META_GRAPH_API_VERSION: 'v24.0',
    META_TOKEN_SECRET_REF: 'vault://meta/page-token',
    META_WEBHOOK_SECRET_REF: 'vault://meta/app-secret',
    META_ENCRYPTION_KEY_REF: 'kms://meta/encryption-key',
    ...overrides,
  };
}

function executionContext(overrides = {}) {
  return {
    organizationId: 'org-1',
    staffId: 'staff-1',
    requesterId: 'staff-1',
    allowedPageIds: ['page-123'],
    killSwitchActive: false,
    networkEnabled: true,
    ...overrides,
  };
}

test('live configuration requires an explicit Graph API version and keeps webhooks off by default', () => {
  const config = loadMetaLiveConfig(liveEnvironment());
  assert.equal(config.graphApiVersion, 'v24.0');
  assert.equal(config.webhooksEnabled, false);
  assert.equal(config.requestTimeoutMs, 10000);
  assert.equal(config.webhookMaxBodyBytes, 256 * 1024);

  assert.throws(
    () => loadMetaLiveConfig(liveEnvironment({ META_GRAPH_API_VERSION: '' })),
    /META_GRAPH_API_VERSION/,
  );
  assert.throws(
    () => loadMetaLiveConfig(liveEnvironment({ META_WEBHOOKS_ENABLED: 'true' })),
    /META_WEBHOOK_VERIFY_TOKEN_SECRET_REF/,
  );
  assert.throws(
    () => loadMetaLiveConfig(liveEnvironment({ META_WEBHOOK_VERIFY_TOKEN: 'raw-token' })),
    /forbidden/,
  );
});

test('official read provider uses a bearer token header and never puts the token in the URL', async () => {
  const transport = new QueueTransport([{
    status: 200,
    bodyText: JSON.stringify({
      id: 'page-123',
      name: 'Batalla & Associates',
      category: 'Legal Service',
      website: 'https://example.test',
      phone: '+63 000 000 0000',
      location: { street: 'One Test Street', city: 'Manila', country: 'Philippines' },
    }),
  }]);
  const provider = new OfficialMetaReadProvider({
    apiVersion: 'v24.0',
    pageAccessTokenSecretRef: 'vault://meta/page-token',
    secretResolver: new InMemorySecretResolver({
      'vault://meta/page-token': 'synthetic-secret-token',
    }),
    transport,
  });

  const page = await provider.getPage('page-123');
  assert.equal(page.name, 'Batalla & Associates');
  assert.equal(page.address, 'One Test Street, Manila, Philippines');
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.requests[0].headers.authorization, 'Bearer synthetic-secret-token');
  assert.equal(transport.requests[0].url.includes('synthetic-secret-token'), false);
  assert.match(transport.requests[0].url, /^https:\/\/graph\.facebook\.com\/v24\.0\/page-123\?/);
});

test('official read provider maps Graph API errors without exposing credentials', async () => {
  const transport = new QueueTransport([{
    status: 403,
    bodyText: JSON.stringify({
      error: {
        message: 'Permissions error',
        type: 'OAuthException',
        code: 200,
        error_subcode: 2018028,
        fbtrace_id: 'trace-1',
      },
    }),
  }]);
  const provider = new OfficialMetaReadProvider({
    apiVersion: 'v24.0',
    pageAccessTokenSecretRef: 'vault://meta/page-token',
    secretResolver: new InMemorySecretResolver({
      'vault://meta/page-token': 'synthetic-secret-token',
    }),
    transport,
  });

  await assert.rejects(
    provider.getPage('page-123'),
    (error) => {
      assert.ok(error instanceof MetaGraphApiError);
      assert.equal(error.details.httpStatus, 403);
      assert.equal(error.details.code, 200);
      assert.equal(error.details.subcode, 2018028);
      assert.equal(error.message.includes('synthetic-secret-token'), false);
      return true;
    },
  );
});

test('network read executor requires network mode and still hard-disables all write tools', async () => {
  const transport = new QueueTransport([{
    status: 200,
    bodyText: JSON.stringify({ id: 'page-123', name: 'Batalla & Associates' }),
  }]);
  const provider = new OfficialMetaReadProvider({
    apiVersion: 'v24.0',
    pageAccessTokenSecretRef: 'vault://meta/page-token',
    secretResolver: new InMemorySecretResolver({
      'vault://meta/page-token': 'synthetic-secret-token',
    }),
    transport,
  });
  const executor = new MetaNetworkReadExecutor(provider);

  await assert.rejects(
    executor.execute('meta_page_get', { pageId: 'page-123' }, executionContext({ networkEnabled: false })),
    (error) => error instanceof MetaPolicyDeniedError && error.reasons.includes('meta_network_disabled'),
  );

  const result = await executor.execute(
    'meta_page_get',
    { pageId: 'page-123' },
    executionContext(),
  );
  assert.equal(result.mode, 'read');
  assert.equal(result.data.name, 'Batalla & Associates');

  await assert.rejects(
    executor.execute('meta_post_publish', { pageId: 'page-123', message: 'test' }, executionContext()),
    MetaWriteExecutionDisabledError,
  );
});

test('webhook verification accepts signed deliveries, deduplicates replays, and records health only', async () => {
  const appSecret = 'synthetic-app-secret';
  const rawBody = Buffer.from(JSON.stringify({
    object: 'page',
    entry: [{
      id: 'page-123',
      changes: [{ field: 'feed', value: { item: 'comment' } }],
      messaging: [{ message: { text: 'Sensitive content that must not enter the result.' } }],
    }],
  }));
  const signature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const resolver = new InMemorySecretResolver({
    'vault://meta/app-secret': appSecret,
    'vault://meta/verify-token': 'verify-me',
  });
  const verifier = new MetaWebhookSignatureVerifier({
    appSecretRef: 'vault://meta/app-secret',
    verifyTokenSecretRef: 'vault://meta/verify-token',
    secretResolver: resolver,
  });
  const healthStore = new InMemoryMetaWebhookHealthStore();
  const processor = new MetaWebhookProcessor({
    signatureVerifier: verifier,
    claimStore: new InMemoryMetaWebhookClaimStore(),
    healthStore,
    allowedPageIds: ['page-123'],
    now: () => new Date('2026-07-24T00:00:00.000Z'),
  });

  assert.equal(await verifier.verifyChallenge('subscribe', 'verify-me', 'challenge-123'), 'challenge-123');

  const accepted = await processor.process(rawBody, signature);
  assert.equal(accepted.status, 'accepted');
  assert.deepEqual(accepted.pageIds, ['page-123']);
  assert.deepEqual(accepted.eventTypes, ['change:feed', 'messaging:message']);
  assert.equal(JSON.stringify(accepted).includes('Sensitive content'), false);

  const duplicate = await processor.process(rawBody, signature);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.deliveryId, accepted.deliveryId);

  const health = await healthStore.getWebhookHealth('page-123');
  assert.equal(health.status, 'healthy');
  assert.equal(health.signatureVerificationEnabled, true);
  assert.equal(health.lastVerifiedAt, '2026-07-24T00:00:00.000Z');
});

test('webhook processing rejects invalid signatures and non-allowlisted Pages', async () => {
  const appSecret = 'synthetic-app-secret';
  const resolver = new InMemorySecretResolver({
    'vault://meta/app-secret': appSecret,
    'vault://meta/verify-token': 'verify-me',
  });
  const verifier = new MetaWebhookSignatureVerifier({
    appSecretRef: 'vault://meta/app-secret',
    verifyTokenSecretRef: 'vault://meta/verify-token',
    secretResolver: resolver,
  });
  const processor = new MetaWebhookProcessor({
    signatureVerifier: verifier,
    claimStore: new InMemoryMetaWebhookClaimStore(),
    healthStore: new InMemoryMetaWebhookHealthStore(),
    allowedPageIds: ['page-123'],
  });
  const rawBody = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: 'page-999' }] }));

  await assert.rejects(processor.process(rawBody, 'sha256=' + '0'.repeat(64)), /signature mismatch/i);

  const validSignature = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  await assert.rejects(
    processor.process(rawBody, validSignature),
    (error) => error instanceof MetaWebhookProcessingError && error.code === 'page_not_allowlisted',
  );
});

test('official runtime composes read and webhook boundaries without adding write execution', () => {
  const config = loadMetaLiveConfig(liveEnvironment({
    META_WEBHOOKS_ENABLED: 'true',
    META_WEBHOOK_VERIFY_TOKEN_SECRET_REF: 'vault://meta/verify-token',
  }));
  const runtime = createOfficialMetaRuntime({
    config,
    secretResolver: new InMemorySecretResolver({
      'vault://meta/page-token': 'synthetic-secret-token',
      'vault://meta/app-secret': 'synthetic-app-secret',
      'vault://meta/verify-token': 'verify-me',
    }),
    transport: new QueueTransport([]),
  });

  assert.ok(runtime.readExecutor);
  assert.ok(runtime.webhookProcessor);
  assert.ok(runtime.webhookVerifier);
  assert.equal('writeExecutor' in runtime, false);
});
