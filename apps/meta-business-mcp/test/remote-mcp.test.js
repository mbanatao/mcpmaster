const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BearerAuthenticationError,
  InMemoryMetaDraftStore,
  MetaRemoteMcpHandler,
  createMetaRemoteMcpApp,
  remoteMetaMcpTools,
} = require('../dist/index.js');

const ORGANIZATION_ID = '60000000-0000-4000-8000-000000000001';
const USER_ID = '60000000-0000-4000-8000-000000000002';
const VIEWER_ID = '60000000-0000-4000-8000-000000000003';
const PAGE_ID = 'test-page-remote';
const ACCEPT = 'application/json, text/event-stream';

function createHarness(options = {}) {
  const drafts = new InMemoryMetaDraftStore({
    createId: () => '70000000-0000-4000-8000-000000000001',
    now: () => new Date('2026-07-24T01:00:00.000Z'),
  });
  const readExecutor = {
    async execute(toolName, args) {
      return {
        toolName,
        mode: 'read',
        data: toolName === 'meta_page_get'
          ? { id: args.pageId, name: 'Synthetic Remote Page' }
          : { ok: true, toolName },
        policy: { requiresLegalReview: false },
        audit: { argumentsRedacted: {} },
      };
    },
  };
  const handler = new MetaRemoteMcpHandler({
    readExecutor,
    draftStoreFactory: () => drafts,
    organizationId: ORGANIZATION_ID,
    allowedPageIds: [PAGE_ID],
    killSwitchActive: true,
    networkEnabled: true,
  });
  const authenticator = {
    async authenticate(header) {
      if (header === 'Bearer valid-owner-token') {
        return { userId: USER_ID, accessToken: 'valid-owner-token' };
      }
      if (header === 'Bearer valid-viewer-token') {
        return { userId: VIEWER_ID, accessToken: 'valid-viewer-token' };
      }
      throw new BearerAuthenticationError('A valid bearer access token is required');
    },
  };
  const membershipResolver = {
    async resolve(organizationId, userId) {
      if (organizationId !== ORGANIZATION_ID) return null;
      if (userId === USER_ID) {
        return { organizationId, userId, role: 'operator' };
      }
      if (userId === VIEWER_ID) {
        return { organizationId, userId, role: 'viewer' };
      }
      return null;
    },
  };
  const app = createMetaRemoteMcpApp({
    handler,
    authenticator,
    membershipResolver,
    organizationId: ORGANIZATION_ID,
    allowedOrigins: ['https://chat.example.test'],
    requireHttps: options.requireHttps ?? false,
    requestBodyLimitBytes: 64 * 1024,
    requestsPerMinute: 100,
  });
  return { app, drafts };
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function mcp(baseUrl, body, options = {}) {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      accept: ACCEPT,
      'content-type': 'application/json',
      authorization: options.authorization ?? 'Bearer valid-owner-token',
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.protocolVersion ? { 'mcp-protocol-version': options.protocolVersion } : {}),
    },
    body: JSON.stringify(body),
  });
}

test('remote MCP catalog exposes exactly eight reads and four drafts', () => {
  assert.equal(remoteMetaMcpTools.length, 12);
  assert.equal(remoteMetaMcpTools.filter((tool) => tool.annotations.readOnlyHint).length, 8);
  assert.equal(remoteMetaMcpTools.some((tool) => tool.name === 'meta_post_publish'), false);
  assert.equal(remoteMetaMcpTools.some((tool) => tool.name === 'meta_message_send'), false);
});

test('remote MCP requires authentication and exact Origin allowlisting', async () => {
  const { app } = createHarness();
  await withServer(app, async (baseUrl) => {
    const unauthenticated = await mcp(baseUrl, {
      jsonrpc: '2.0', id: 1, method: 'ping', params: {},
    }, { authorization: 'Bearer invalid' });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('www-authenticate'), 'Bearer');

    const forbiddenOrigin = await mcp(baseUrl, {
      jsonrpc: '2.0', id: 2, method: 'ping', params: {},
    }, { origin: 'https://evil.example.test' });
    assert.equal(forbiddenOrigin.status, 403);

    const allowedOrigin = await mcp(baseUrl, {
      jsonrpc: '2.0', id: 3, method: 'ping', params: {},
    }, { origin: 'https://chat.example.test' });
    assert.equal(allowedOrigin.status, 200);
  });
});

test('initialize negotiates the current protocol and tools/list hides writes', async () => {
  const { app } = createHarness();
  await withServer(app, async (baseUrl) => {
    const initialized = await mcp(baseUrl, {
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    });
    assert.equal(initialized.status, 200);
    const initBody = await initialized.json();
    assert.equal(initBody.result.protocolVersion, '2025-11-25');
    assert.equal(initBody.result.serverInfo.name, 'mcpmaster-meta-business');

    const listed = await mcp(baseUrl, {
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
    }, { protocolVersion: '2025-11-25' });
    const listBody = await listed.json();
    assert.equal(listBody.result.tools.length, 12);
    assert.equal(listBody.result.tools.some((tool) => tool.name === 'meta_post_delete'), false);
  });
});

test('read calls execute and write calls remain unavailable', async () => {
  const { app } = createHarness();
  await withServer(app, async (baseUrl) => {
    const read = await mcp(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'meta_page_get', arguments: { pageId: PAGE_ID } },
    }, { protocolVersion: '2025-11-25' });
    const readBody = await read.json();
    assert.equal(readBody.result.isError, false);
    assert.equal(readBody.result.structuredContent.name, 'Synthetic Remote Page');

    const write = await mcp(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'meta_post_publish', arguments: { pageId: PAGE_ID, message: 'No.' } },
    }, { protocolVersion: '2025-11-25' });
    const writeBody = await write.json();
    assert.equal(writeBody.result.isError, true);
    assert.match(writeBody.result.content[0].text, /not exposed/i);
  });
});

test('operator drafts persist while viewer drafts are denied', async () => {
  const { app, drafts } = createHarness();
  await withServer(app, async (baseUrl) => {
    const created = await mcp(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'meta_post_create_draft',
        arguments: { pageId: PAGE_ID, message: 'Synthetic internal office-hours draft.' },
      },
    }, { protocolVersion: '2025-11-25' });
    const createdBody = await created.json();
    assert.equal(createdBody.result.isError, false);
    assert.equal((await drafts.list(ORGANIZATION_ID, PAGE_ID)).length, 1);

    const denied = await mcp(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'meta_post_create_draft',
        arguments: { pageId: PAGE_ID, message: 'Viewer draft attempt.' },
      },
    }, {
      authorization: 'Bearer valid-viewer-token',
      protocolVersion: '2025-11-25',
    });
    const deniedBody = await denied.json();
    assert.equal(deniedBody.result.isError, true);
    assert.match(deniedBody.result.content[0].text, /draft_role_required/);
    assert.equal((await drafts.list(ORGANIZATION_ID, PAGE_ID)).length, 1);
  });
});

test('unsupported protocol versions are rejected and authenticated GET returns 405', async () => {
  const { app } = createHarness();
  await withServer(app, async (baseUrl) => {
    const unsupported = await mcp(baseUrl, {
      jsonrpc: '2.0', id: 1, method: 'ping', params: {},
    }, { protocolVersion: '1900-01-01' });
    assert.equal(unsupported.status, 400);

    const getResponse = await fetch(`${baseUrl}/mcp`, {
      headers: { authorization: 'Bearer valid-owner-token' },
    });
    assert.equal(getResponse.status, 405);
    assert.match(getResponse.headers.get('allow'), /POST/);
  });
});

test('HTTPS policy denies insecure MCP traffic while keeping health usable', async () => {
  const { app } = createHarness({ requireHttps: true });
  await withServer(app, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const response = await mcp(baseUrl, {
      jsonrpc: '2.0', id: 1, method: 'ping', params: {},
    });
    assert.equal(response.status, 426);
  });
});
