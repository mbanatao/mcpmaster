import type { SecretResolver } from '../secrets/resolver';
import { resolveRequiredSecret } from '../secrets/resolver';
import { loadMetaRemoteMcpConfig } from '../remote-config';

const WRITE_TOOL_NAMES = new Set([
  'meta_post_publish',
  'meta_post_schedule',
  'meta_comment_reply',
  'meta_message_send',
  'meta_post_delete',
]);

const EXPECTED_READ_DRAFT_TOOLS = [
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
] as const;

export interface MetaStagingReadinessConfig {
  baseUrl: string;
  origin?: string;
  accessTokenSecretRef: string;
  expectedPageId: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
}

export interface MetaStagingCheck {
  name: string;
  ok: boolean;
  durationMs: number;
  detail: string;
}

export interface MetaStagingReadinessReport {
  environment: 'staging';
  externalWritesEnabled: false;
  pageId: string;
  toolCount: number;
  checks: MetaStagingCheck[];
  completedAt: string;
}

export interface MetaStagingReadinessOptions {
  config: MetaStagingReadinessConfig;
  secretResolver: SecretResolver;
  fetchFn?: typeof fetch;
  now?: () => number;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = optional(environment[name]);
  if (!value) {
    throw new Error(`${name} is required for Meta staging readiness`);
  }
  return value;
}

function booleanValue(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  throw new Error(`Expected true or false, received: ${value}`);
}

function integerValue(
  value: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function httpsOrigin(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS`);
  }
  return url.origin;
}

export function loadMetaStagingReadinessConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MetaStagingReadinessConfig {
  if (environment.MCPMASTER_ENVIRONMENT !== 'staging') {
    throw new Error('MCPMASTER_ENVIRONMENT must be exactly staging');
  }
  if (!booleanValue(environment.META_STAGING_READ_ONLY_VALIDATION_ENABLED, false)) {
    throw new Error('META_STAGING_READ_ONLY_VALIDATION_ENABLED must be true');
  }
  if (booleanValue(environment.META_EXTERNAL_WRITES_ENABLED, false)) {
    throw new Error('Meta staging readiness refuses to run while external writes are enabled');
  }

  const remote = loadMetaRemoteMcpConfig(environment);
  const expectedPageId = required(environment, 'META_STAGING_EXPECTED_PAGE_ID');
  if (!remote.allowedPageIds.includes(expectedPageId)) {
    throw new Error('META_STAGING_EXPECTED_PAGE_ID must be present in META_ALLOWED_PAGE_IDS');
  }

  return {
    baseUrl: httpsOrigin(required(environment, 'META_STAGING_BASE_URL'), 'META_STAGING_BASE_URL'),
    origin: optional(environment.META_STAGING_ORIGIN)
      ? httpsOrigin(required(environment, 'META_STAGING_ORIGIN'), 'META_STAGING_ORIGIN')
      : undefined,
    accessTokenSecretRef: required(environment, 'META_STAGING_ACCESS_TOKEN_SECRET_REF'),
    expectedPageId,
    requestTimeoutMs: integerValue(
      environment.META_STAGING_SMOKE_TIMEOUT_MS,
      10_000,
      1_000,
      30_000,
      'META_STAGING_SMOKE_TIMEOUT_MS',
    ),
    maxResponseBytes: integerValue(
      environment.META_STAGING_MAX_RESPONSE_BYTES,
      1024 * 1024,
      16 * 1024,
      2 * 1024 * 1024,
      'META_STAGING_MAX_RESPONSE_BYTES',
    ),
  };
}

interface JsonRpcEnvelope {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function readBoundedJson(
  response: Response,
  maxResponseBytes: number,
): Promise<unknown> {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
    throw new Error('Staging response exceeded the configured size limit');
  }
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Staging endpoint returned invalid JSON');
  }
}

export class MetaStagingReadinessRunner {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: MetaStagingReadinessOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async run(): Promise<MetaStagingReadinessReport> {
    const token = await resolveRequiredSecret(
      this.options.secretResolver,
      this.options.config.accessTokenSecretRef,
    );
    const checks: MetaStagingCheck[] = [];

    const health = await this.measure('service_health', async () => {
      const response = await this.request('/health', { method: 'GET' }, false, token.value);
      const body = record(await readBoundedJson(response, this.options.config.maxResponseBytes));
      if (!response.ok || body.status !== 'ok' || body.externalWritesEnabled !== false) {
        throw new Error('Health endpoint did not confirm a write-disabled service');
      }
      return 'healthy and external writes disabled';
    });
    checks.push(health);

    const initialize = await this.rpc(1, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'mcpmaster-staging-readiness', version: '1.0.0' },
    }, token.value);
    const initResult = record(initialize.result);
    if (initResult.protocolVersion !== '2025-11-25') {
      throw new Error('Remote MCP did not negotiate protocol version 2025-11-25');
    }
    checks.push({
      name: 'mcp_initialize',
      ok: true,
      durationMs: initialize.durationMs,
      detail: 'protocol 2025-11-25 negotiated',
    });

    const listed = await this.rpc(2, 'tools/list', {}, token.value);
    const tools = array(record(listed.result).tools).map((item) => String(record(item).name ?? ''));
    const unexpectedWrite = tools.find((name) => WRITE_TOOL_NAMES.has(name));
    if (unexpectedWrite) {
      throw new Error(`External write tool was exposed in staging: ${unexpectedWrite}`);
    }
    const missing = EXPECTED_READ_DRAFT_TOOLS.filter((name) => !tools.includes(name));
    if (missing.length > 0 || tools.length !== EXPECTED_READ_DRAFT_TOOLS.length) {
      throw new Error(`Unexpected staging tool catalog. Missing: ${missing.join(', ') || 'none'}`);
    }
    checks.push({
      name: 'tool_catalog',
      ok: true,
      durationMs: listed.durationMs,
      detail: 'exact twelve-tool read/draft catalog; no external writes',
    });

    const pageRead = await this.rpc(3, 'tools/call', {
      name: 'meta_page_get',
      arguments: { pageId: this.options.config.expectedPageId },
    }, token.value);
    const toolResult = record(pageRead.result);
    if (toolResult.isError !== false) {
      throw new Error('Allowlisted meta_page_get returned a tool error');
    }
    const structured = record(toolResult.structuredContent);
    if (structured.id !== undefined && String(structured.id) !== this.options.config.expectedPageId) {
      throw new Error('Meta Page response did not match the expected allowlisted Page ID');
    }
    checks.push({
      name: 'allowlisted_page_read',
      ok: true,
      durationMs: pageRead.durationMs,
      detail: `read-only Page validation succeeded for ${this.options.config.expectedPageId}`,
    });

    return {
      environment: 'staging',
      externalWritesEnabled: false,
      pageId: this.options.config.expectedPageId,
      toolCount: tools.length,
      checks,
      completedAt: new Date(this.now()).toISOString(),
    };
  }

  private async measure(
    name: string,
    operation: () => Promise<string>,
  ): Promise<MetaStagingCheck> {
    const startedAt = this.now();
    const detail = await operation();
    return { name, ok: true, durationMs: this.now() - startedAt, detail };
  }

  private async rpc(
    id: number,
    method: string,
    params: Record<string, unknown>,
    accessToken: string,
  ): Promise<JsonRpcEnvelope & { durationMs: number }> {
    const startedAt = this.now();
    const response = await this.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }, true, accessToken);
    const body = record(await readBoundedJson(response, this.options.config.maxResponseBytes)) as JsonRpcEnvelope;
    if (!response.ok || body.error !== undefined) {
      throw new Error(`MCP staging request failed for ${method}`);
    }
    return { ...body, durationMs: this.now() - startedAt };
  }

  private async request(
    path: string,
    init: RequestInit,
    authenticated: boolean,
    accessToken: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.config.requestTimeoutMs);
    const headers = new Headers(init.headers);
    if (authenticated) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
    if (this.options.config.origin) {
      headers.set('origin', this.options.config.origin);
    }
    try {
      return await this.fetchFn(`${this.options.config.baseUrl}${path}`, {
        ...init,
        headers,
        redirect: 'error',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
