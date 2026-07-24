const test = require('node:test');
const assert = require('node:assert/strict');

const { loadMetaRemoteMcpConfig } = require('../dist/index.js');

const ORG_ID = '80000000-0000-4000-8000-000000000001';
const INSTALLATION_ID = '80000000-0000-4000-8000-000000000003';

function baseEnvironment() {
  return {
    META_REMOTE_MCP_ENABLED: 'true',
    META_NETWORK_ENABLED: 'true',
    META_KILL_SWITCH: 'false',
    META_ALLOWED_PAGE_IDS: 'test-page',
    META_APP_ID: 'synthetic-app',
    META_GRAPH_API_VERSION: 'v99.0',
    META_TOKEN_SECRET_REF: 'env://META_TOKEN',
    META_WEBHOOK_SECRET_REF: 'env://META_APP_SECRET_VALUE',
    META_WEBHOOK_VERIFY_TOKEN_SECRET_REF: 'env://META_VERIFY_TOKEN',
    META_ENCRYPTION_KEY_REF: 'kms://synthetic-key',
    META_REMOTE_MCP_ORGANIZATION_ID: ORG_ID,
    META_REMOTE_MCP_INSTALLATION_ID: INSTALLATION_ID,
    SUPABASE_URL: 'https://project.supabase.test',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    META_SUPABASE_SERVICE_KEY_SECRET_REF: 'env://META_SUPABASE_SERVER_KEY',
  };
}

test('Vercel runtime binds externally and honors the platform-provided port', () => {
  const config = loadMetaRemoteMcpConfig({
    ...baseEnvironment(),
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    PORT: '4317',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 4317);
  assert.equal(config.requireHttps, true);
});

test('explicit service host overrides the Vercel default while PORT remains authoritative', () => {
  const config = loadMetaRemoteMcpConfig({
    ...baseEnvironment(),
    VERCEL: '1',
    PORT: '8080',
    META_REMOTE_MCP_HOST: '127.0.0.1',
    META_REMOTE_MCP_PORT: '3200',
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8080);
});

test('invalid platform ports fail closed', () => {
  assert.throws(
    () => loadMetaRemoteMcpConfig({
      ...baseEnvironment(),
      VERCEL: '1',
      PORT: 'not-a-port',
    }),
    /PORT must be an integer/,
  );
});
