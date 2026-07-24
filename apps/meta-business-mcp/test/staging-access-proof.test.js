const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemorySecretResolver,
  loadMetaStagingAccessProofConfig,
  MetaStagingAccessProofRunner,
} = require('../dist/index.js');

const APP_ID = '1223350063226282';
const PAGE_ID = '1223714984161061';
const USER_TOKEN_REF = 'env://META_STAGING_META_USER_TOKEN';
const DEBUGGER_TOKEN_REF = 'env://META_STAGING_META_DEBUGGER_TOKEN';

function accessProofEnvironment(overrides = {}) {
  return {
    MCPMASTER_ENVIRONMENT: 'staging',
    META_STAGING_ACCESS_PROOF_ENABLED: 'true',
    META_EXTERNAL_WRITES_ENABLED: 'false',
    META_ALLOWED_PAGE_IDS: PAGE_ID,
    META_STAGING_EXPECTED_PAGE_ID: PAGE_ID,
    META_APP_ID: APP_ID,
    META_GRAPH_API_VERSION: 'v99.0',
    META_STAGING_META_USER_TOKEN_SECRET_REF: USER_TOKEN_REF,
    META_STAGING_META_DEBUGGER_TOKEN_SECRET_REF: DEBUGGER_TOKEN_REF,
    ...overrides,
  };
}

function graphResponse(value, status = 200) {
  return {
    status,
    bodyText: JSON.stringify(value),
    contentType: 'application/json',
  };
}

function transportFor({
  appId = APP_ID,
  pageId = PAGE_ID,
  scopes = ['pages_show_list', 'pages_read_engagement'],
  tokenType = 'USER',
  isValid = true,
  expiresAt = 4102444800,
} = {}) {
  const observed = [];
  return {
    observed,
    transport: {
      async send(request) {
        observed.push(request);
        const url = new URL(request.url);
        if (url.pathname.endsWith('/debug_token')) {
          return graphResponse({
            data: {
              app_id: appId,
              type: tokenType,
              is_valid: isValid,
              user_id: 'human-user-123',
              scopes,
              expires_at: expiresAt,
              data_access_expires_at: expiresAt,
            },
          });
        }
        return graphResponse({
          data: [{ id: pageId, name: 'Controlled Staging Page', tasks: ['ANALYZE', 'MODERATE'] }],
        });
      },
    },
  };
}

function secretResolver() {
  return new InMemorySecretResolver({
    [USER_TOKEN_REF]: 'opaque-human-user-token',
    [DEBUGGER_TOKEN_REF]: 'opaque-debugger-token',
  });
}

test('access-proof config fails closed outside staging, with writes, or without exact Page allowlisting', () => {
  assert.throws(
    () => loadMetaStagingAccessProofConfig(accessProofEnvironment({ MCPMASTER_ENVIRONMENT: 'production' })),
    /must be exactly staging/,
  );
  assert.throws(
    () => loadMetaStagingAccessProofConfig(accessProofEnvironment({ META_EXTERNAL_WRITES_ENABLED: 'true' })),
    /refuses to run while external writes are enabled/,
  );
  assert.throws(
    () => loadMetaStagingAccessProofConfig(accessProofEnvironment({ META_ALLOWED_PAGE_IDS: '999999' })),
    /must be present in META_ALLOWED_PAGE_IDS/,
  );
  assert.throws(
    () => loadMetaStagingAccessProofConfig(accessProofEnvironment({ META_ALLOWED_PAGE_IDS: '*' })),
    /without wildcards/,
  );
});

test('access-proof runner verifies human token provenance, least-privilege scopes, and exact Page access', async () => {
  const { observed, transport } = transportFor();
  let now = Date.parse('2026-07-24T06:00:00.000Z');
  const report = await new MetaStagingAccessProofRunner({
    config: loadMetaStagingAccessProofConfig(accessProofEnvironment()),
    secretResolver: secretResolver(),
    transport,
    now: () => (now += 5),
  }).run();

  assert.equal(report.environment, 'staging');
  assert.equal(report.externalWritesEnabled, false);
  assert.equal(report.appId, APP_ID);
  assert.equal(report.pageId, PAGE_ID);
  assert.equal(report.tokenType, 'USER');
  assert.match(report.userIdentityHash, /^[a-f0-9]{16}$/);
  assert.deepEqual(report.scopes, ['pages_read_engagement', 'pages_show_list']);
  assert.deepEqual(report.pageTasks, ['ANALYZE', 'MODERATE']);
  assert.equal(report.checks.length, 4);
  assert.equal(JSON.stringify(report).includes('opaque-human-user-token'), false);
  assert.equal(JSON.stringify(report).includes('human-user-123'), false);

  assert.equal(observed.length, 2);
  assert.equal(observed[0].method, 'GET');
  assert.equal(observed[0].headers.authorization, 'Bearer opaque-debugger-token');
  assert.equal(new URL(observed[0].url).searchParams.get('input_token'), 'opaque-human-user-token');
  assert.equal(observed[1].headers.authorization, 'Bearer opaque-human-user-token');
  assert.equal(new URL(observed[1].url).searchParams.get('fields'), 'id,name,tasks');
});

test('access-proof runner rejects a token issued by another App', async () => {
  const { transport } = transportFor({ appId: '9999999999999999' });
  await assert.rejects(
    () => new MetaStagingAccessProofRunner({
      config: loadMetaStagingAccessProofConfig(accessProofEnvironment()),
      secretResolver: secretResolver(),
      transport,
    }).run(),
    /not issued by the expected staging App ID/,
  );
});

test('access-proof runner rejects missing read scopes, non-human tokens, expired access, and inaccessible Pages', async () => {
  const cases = [
    {
      transport: transportFor({ scopes: ['pages_show_list'] }).transport,
      expected: /missing required read scopes: pages_read_engagement/,
    },
    {
      transport: transportFor({ tokenType: 'SYSTEM_USER' }).transport,
      expected: /requires a human USER token/,
    },
    {
      transport: transportFor({ expiresAt: 1 }).transport,
      expected: /has expired/,
    },
    {
      transport: transportFor({ pageId: '9999999999999999' }).transport,
      expected: /cannot access the expected allowlisted Page ID/,
    },
  ];

  for (const item of cases) {
    await assert.rejects(
      () => new MetaStagingAccessProofRunner({
        config: loadMetaStagingAccessProofConfig(accessProofEnvironment()),
        secretResolver: secretResolver(),
        transport: item.transport,
        now: () => Date.parse('2026-07-24T06:00:00.000Z'),
      }).run(),
      item.expected,
    );
  }
});
