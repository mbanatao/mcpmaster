const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EnvironmentSecretResolver,
  SupabaseBearerAuthenticator,
  SupabaseMetaDraftStore,
  SupabaseMetaWebhookClaimStore,
  SupabaseMetaWebhookHealthStore,
  SupabaseOrganizationMembershipResolver,
  loadMetaRemoteMcpConfig,
} = require('../dist/index.js');

const ORG_ID = '80000000-0000-4000-8000-000000000001';
const USER_ID = '80000000-0000-4000-8000-000000000002';
const INSTALLATION_ID = '80000000-0000-4000-8000-000000000003';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Supabase bearer authenticator validates through auth user endpoint without logging or decoding locally', async () => {
  let observed;
  const authenticator = new SupabaseBearerAuthenticator({
    supabaseUrl: 'https://project.supabase.test',
    publishableKey: 'publishable-test-key',
    fetchFn: async (url, init) => {
      observed = { url: String(url), headers: new Headers(init.headers) };
      return jsonResponse({ id: USER_ID, email: 'staff@example.test' });
    },
  });

  const identity = await authenticator.authenticate('Bearer opaque-user-access-token-123456789');
  assert.equal(identity.userId, USER_ID);
  assert.equal(identity.accessToken, 'opaque-user-access-token-123456789');
  assert.equal(observed.url, 'https://project.supabase.test/auth/v1/user');
  assert.equal(observed.headers.get('apikey'), 'publishable-test-key');
  assert.equal(observed.headers.get('authorization'), 'Bearer opaque-user-access-token-123456789');
});

test('membership resolution uses the caller token and active tenant filters', async () => {
  let observed;
  const resolver = new SupabaseOrganizationMembershipResolver({
    supabaseUrl: 'https://project.supabase.test',
    publishableKey: 'publishable-test-key',
    fetchFn: async (url, init) => {
      observed = { url: String(url), headers: new Headers(init.headers) };
      return jsonResponse([{
        organization_id: ORG_ID,
        user_id: USER_ID,
        role: 'operator',
        status: 'active',
      }]);
    },
  });

  const membership = await resolver.resolve(ORG_ID, USER_ID, 'caller-jwt-token');
  assert.deepEqual(membership, { organizationId: ORG_ID, userId: USER_ID, role: 'operator' });
  assert.match(observed.url, /memberships/);
  assert.match(observed.url, new RegExp(ORG_ID));
  assert.equal(observed.headers.get('authorization'), 'Bearer caller-jwt-token');
});

test('draft persistence uses caller-scoped RLS credentials and maps the returned record', async () => {
  let observed;
  const store = new SupabaseMetaDraftStore({
    supabaseUrl: 'https://project.supabase.test',
    publishableKey: 'publishable-test-key',
    accessToken: 'caller-draft-jwt',
    fetchFn: async (url, init) => {
      observed = {
        url: String(url),
        method: init.method,
        headers: new Headers(init.headers),
        body: JSON.parse(init.body),
      };
      return jsonResponse([{
        id: '90000000-0000-4000-8000-000000000001',
        organization_id: ORG_ID,
        page_id: 'test-page',
        kind: 'post',
        target_id: null,
        content: 'Synthetic internal draft.',
        created_by: USER_ID,
        created_at: '2026-07-24T02:00:00.000Z',
        legal_review_required: false,
        status: 'draft',
      }]);
    },
  });

  const draft = await store.create({
    organizationId: ORG_ID,
    pageId: 'test-page',
    kind: 'post',
    content: 'Synthetic internal draft.',
    createdBy: USER_ID,
    legalReviewRequired: false,
  });
  assert.equal(draft.organizationId, ORG_ID);
  assert.equal(draft.status, 'draft');
  assert.equal(observed.method, 'POST');
  assert.equal(observed.headers.get('authorization'), 'Bearer caller-draft-jwt');
  assert.equal(observed.headers.get('prefer'), 'return=representation');
  assert.equal(observed.body.created_by, USER_ID);
});

test('webhook persistence uses service-only RPCs and stores no payload bodies', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    if (String(url).includes('claim_meta_webhook_delivery')) {
      return jsonResponse(true);
    }
    if (String(url).includes('record_meta_webhook_health')) {
      return new Response(null, { status: 204 });
    }
    return jsonResponse([{
      page_id: 'test-page',
      signature_verification_enabled: true,
      last_verified_at: '2026-07-24T03:00:00.000Z',
      last_delivery_at: '2026-07-24T03:00:00.000Z',
      pending_deliveries: 0,
      failed_deliveries: 0,
    }]);
  };
  const options = {
    supabaseUrl: 'https://project.supabase.test',
    serviceKey: 'server-secret-test-key',
    organizationId: ORG_ID,
    installationId: INSTALLATION_ID,
    fetchFn,
  };
  const claims = new SupabaseMetaWebhookClaimStore(options);
  const health = new SupabaseMetaWebhookHealthStore(options);
  const hash = 'a'.repeat(64);

  assert.equal(await claims.claim(`meta:${hash}`, '2026-07-25T03:00:00.000Z'), true);
  await health.recordAccepted('test-page', '2026-07-24T03:00:00.000Z');
  const state = await health.getWebhookHealth('test-page');
  assert.equal(state.status, 'healthy');

  assert.equal(calls[0].headers.get('authorization'), 'Bearer server-secret-test-key');
  assert.equal(calls[0].body.p_payload_hash, hash);
  assert.equal(Object.values(calls[0].body).some((value) => String(value).includes('message body')), false);
  assert.equal(calls[1].body.p_accepted, true);
});

test('environment secret resolver allows only explicit server references', async () => {
  const resolver = new EnvironmentSecretResolver({
    environment: { META_RUNTIME_SECRET: 'synthetic-secret' },
    allowedVariableNames: ['META_RUNTIME_SECRET'],
  });
  assert.deepEqual(await resolver.resolve('env://META_RUNTIME_SECRET'), { value: 'synthetic-secret' });
  await assert.rejects(() => resolver.resolve('env://NEXT_PUBLIC_META_SECRET'), /Publicly exposed/);
  await assert.rejects(() => resolver.resolve('env://UNLISTED_SECRET'), /not allowlisted/);
});

test('remote configuration rejects raw service credentials and defaults HTTPS on', () => {
  const base = {
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
  const config = loadMetaRemoteMcpConfig(base);
  assert.equal(config.requireHttps, true);
  assert.equal(config.remoteMcpEnabled, true);

  assert.throws(
    () => loadMetaRemoteMcpConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: 'forbidden' }),
    /SUPABASE_SERVICE_ROLE_KEY is forbidden/,
  );
});
