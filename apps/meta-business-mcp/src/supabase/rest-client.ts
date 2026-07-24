export type FetchLike = typeof fetch;

export interface SupabaseRestClientOptions {
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export class SupabaseRestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SupabaseRestError';
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(value: string): URL {
  const url = new URL(value.trim());
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('Supabase URL must use HTTPS except for localhost tests');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function safeErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const code = (value as Record<string, unknown>).code;
  return typeof code === 'string' && code.length <= 128 ? code : undefined;
}

function safeErrorMessage(value: unknown, status: number): string {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const candidate of [record.message, record.error_description, record.error]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().slice(0, 300);
      }
    }
  }
  return `Supabase request failed with HTTP ${status}`;
}

export class SupabaseRestClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly accessToken: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: SupabaseRestClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.supabaseUrl);
    this.apiKey = required(options.apiKey, 'Supabase API key');
    this.accessToken = required(options.accessToken, 'Supabase access token');
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 500 || this.timeoutMs > 30_000) {
      throw new Error('Supabase request timeout must be between 500 and 30000 milliseconds');
    }
    if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 1024 || this.maxResponseBytes > 5 * 1024 * 1024) {
      throw new Error('Supabase response limit must be between 1024 and 5242880 bytes');
    }
  }

  async requestJson(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    if (!path.startsWith('/rest/v1/')) {
      throw new Error('Supabase REST paths must begin with /rest/v1/');
    }

    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new Error('Supabase REST request origin mismatch');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('apikey', this.apiKey);
      headers.set('authorization', `Bearer ${this.accessToken}`);
      headers.set('accept', 'application/json');
      if (init.body !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

      const response = await this.fetchFn(url, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: 'error',
      });

      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > this.maxResponseBytes) {
        throw new SupabaseRestError('Supabase response exceeded the configured size limit', 502);
      }

      const text = Buffer.from(body).toString('utf8');
      let parsed: unknown = null;
      if (text.trim()) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new SupabaseRestError('Supabase returned invalid JSON', 502);
        }
      }

      if (!response.ok) {
        throw new SupabaseRestError(
          safeErrorMessage(parsed, response.status),
          response.status,
          safeErrorCode(parsed),
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof SupabaseRestError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SupabaseRestError('Supabase request timed out', 504);
      }
      throw new SupabaseRestError('Supabase request failed', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}
