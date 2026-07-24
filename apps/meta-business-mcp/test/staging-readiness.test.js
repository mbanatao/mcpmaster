const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemorySecretResolver,
  loadMetaStagingReadinessConfig,
  MetaStagingReadinessRunner,
} = require('../dist/index.js');

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const INSTALLATION_ID = 'a0000000-0000-4000-8000-000000000002';
const PAGE_ID = 'staging-page-123';

function stagingEnvironment(overrides = {}) {
  return {
    MCPMASTER_ENVIRONMENT: 'staging',
    META_STAGING_READ_ONLY_VALIDATION_ENABLED: 'true',
    META_EXTERNAL_WRITES_ENABLED: 'false',
    META_STAGING_BASE_URL: 'https://meta-staging.example.test',
    META_STAGING_ORIGIN: 'https://chat-staging.example.test',
    META_STAGING_ACCESS_TOKEN_SECRET_REF: 'env://META_STAGING_STAFF_TOKEN',
    META_STAGING_EXPECTED_PAGE_ID: PAGE_ID,
    META_REMOTE_MCP_ENABLED: 'true',
    META_NETWORK_ENABLED: 'true',
    META_KILL_SWITCH: 'false',
    META_ALLOWED_PAGE_IDS: PAGE_ID,
    META_APP_ID: 'synthetic-app',
    META_GRAPH_API_VERSION: 'v99.0',
    META_TOKEN_SECRET_REF: 'env://META_PAGE_TOKEN',
    META_WEBHOOK_SECRET_REF: 'env://META_APP_SECRET_VALUE',
    META_WEBHOOK_VERIFY_TOKEN_SECRET_REF: 'env://META_VERIFY_TOKEN',
    META_ENCRYPTION_KEY_REF: 'kms://synthetic-key',
    META_REMOTE_MCP_ORGANIZATION_ID: ORG_ID,
    META_REMOTE_MCP_INSTALLATION_ID: INSTALLATION_ID,
    SUPABASE_URL: 'https://project.supabase.test',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    META_SUPABASE_SERVICE_KEY_SECRET_REF: 'env://META_SUPABASE_SERVER_KEY',
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function expectedTools() {
  return [
    'meta_page_get',
    'meta_page_list_posts',
    'meta_post_get',
    'meta_post_list_comments',
    'meta_inbox_list_threads',
    'meta_inbox_get_thread',
    'meta_page_get_insights',
    'meta_webhook_health',
    'meta_post_create_draft',
    'meta_comment_create_reply_draft',
    'meta_message_create_reply_draft',
    'meta_content_create_weekly_plan',
  ];
}

test('staging config fails closed outside staging or when writes are enabled', () => {
  assert.throws(
    () => loadMetaStagingReadinessConfig(stagingEnvironment({ MCPMASTER_ENVIRONMENT: 'production' })),
    /must be exactly staging/,
  );
  assert.throws(
    () => loadMetaStagingReadinessConfig(stagingEnvironment({ META_EXTERNAL_WRITES_ENABLED: 'true' })),
    /refuses to run while external writes are enabled/,
  );
  assert.throws(
    () => loadMetaStagingReadinessConfig(stagingEnvironment({ META_STAGING_EXPECTED_PAGE_ID: 'other-page' })),
    /must be present in META_ALLOWED_PAGE_IDS/,
  );
});

test('readiness runner verifies health, protocol, exact safe catalog, and one allowlisted read', async () => {
  const observed = [];
  const fetchFn = async (url, init = {}) => {
    observed.push({
      url: String(url),
      method: init.method,
      headers: new Headers(init.headers),
      body: init.body,
    });
    if (String(url).endsWith('/health')) {
      return jsonResponse({ status: 'ok', externalWritesEnabled: false });
    }
    const request = JSON.parse(init.body);
    if (request.method === 'initialize') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: { protocolVersion: '2025-11-25' },
      });
    }
    if (request.method === 'tools/list') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: expectedTools().map((name) => ({ name })) },
      });
    }
    return jsonResponse({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ id: PAGE_ID }) }],
        structuredContent: { id: PAGE_ID, name: 'Synthetic Staging Page' },
        isError: false,
      },
    });
  };

  let now = Date.parse('2026-07-24T05:00:00.000Z');
  const report = await new MetaStagingReadinessRunner({
    config: loadMetaStagingReadinessConfig(stagingEnvironment()),
    secretResolver: new InMemorySecretResolver({
      'env://META_STAGING_STAFF_TOKEN': 'opaque-staging-token-value',
    }),
    fetchFn,
    now: () => (now += 5),
  }).run();

  assert.equal(report.environment, 'staging');
  assert.equal(report.externalWritesEnabled, false);
  assert.equal(report.toolCount, 12);
  assert.equal(report.checks.length, 4);
  assert.equal(observed[0].headers.get('authorization'), null);
  assert.equal(observed[1].headers.get('authorization'), 'Bearer opaque-staging-token-value');
  assert.equal(observed[1].headers.get('origin'), 'https://chat-staging.example.test');
  assert.equal(observed.some((request) => String(request.body).includes('meta_post_publish')), false);
  assert.equal(observed.at(-1).body.includes('meta_page_get'), true);
});

test('readiness runner aborts if any external write tool becomes discoverable', async () => {
  const fetchFn = async (url, init = {}) => {
    if (String(url).endsWith('/health')) {
      return jsonResponse({ status: 'ok', externalWritesEnabled: false });
    }
    const request = JSON.parse(init.body);
    if (request.method === 'initialize') {
      return jsonResponse({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2025-11-25' } });
    }
    return jsonResponse({
      jsonrpc: '2.0',
      id: request.id,
      result: { tools: [...expectedTools(), 'meta_post_publish'].map((name) => ({ name })) },
    });
  };

  await assert.rejects(
    () => new MetaStagingReadinessRunner({
      config: loadMetaStagingReadinessConfig(stagingEnvironment()),
      secretResolver: new InMemorySecretResolver({
        'env://META_STAGING_STAFF_TOKEN': 'opaque-staging-token-value',
      }),
      fetchFn,
    }).run(),
    /External write tool was exposed/,
  );
});
