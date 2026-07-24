import type { FetchLike } from '../supabase/rest-client';

export interface AuthenticatedStaffIdentity {
  userId: string;
  accessToken: string;
  email?: string;
}

export interface BearerAuthenticator {
  authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedStaffIdentity>;
}

export class BearerAuthenticationError extends Error {
  readonly status: 401 | 503;

  constructor(message: string, status: 401 | 503 = 401) {
    super(message);
    this.name = 'BearerAuthenticationError';
    this.status = status;
  }
}

export interface SupabaseBearerAuthenticatorOptions {
  supabaseUrl: string;
  publishableKey: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

function normalizeSupabaseUrl(value: string): URL {
  const url = new URL(value.trim());
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('Supabase URL must use HTTPS except for localhost tests');
  }
  url.pathname = '/auth/v1/user';
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

function bearerToken(header: string | undefined): string {
  const match = /^Bearer\s+([^\s]+)$/i.exec(header?.trim() ?? '');
  if (!match || match[1].length < 20 || match[1].length > 8192) {
    throw new BearerAuthenticationError('A valid bearer access token is required');
  }
  return match[1];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class SupabaseBearerAuthenticator implements BearerAuthenticator {
  private readonly userUrl: URL;
  private readonly publishableKey: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: SupabaseBearerAuthenticatorOptions) {
    this.userUrl = normalizeSupabaseUrl(options.supabaseUrl);
    this.publishableKey = required(options.publishableKey, 'Supabase publishable key');
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 500 || this.timeoutMs > 20_000) {
      throw new Error('Supabase authentication timeout must be between 500 and 20000 milliseconds');
    }
  }

  async authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedStaffIdentity> {
    const accessToken = bearerToken(authorizationHeader);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.userUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          apikey: this.publishableKey,
          authorization: `Bearer ${accessToken}`,
        },
        redirect: 'error',
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new BearerAuthenticationError('The bearer access token is invalid or expired');
      }
      if (!response.ok) {
        throw new BearerAuthenticationError('The authentication service is unavailable', 503);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 64 * 1024) {
        throw new BearerAuthenticationError('The authentication service returned an invalid response', 503);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.from(bytes).toString('utf8'));
      } catch {
        throw new BearerAuthenticationError('The authentication service returned invalid JSON', 503);
      }

      const record = typeof payload === 'object' && payload !== null
        ? payload as Record<string, unknown>
        : {};
      const userId = typeof record.id === 'string' ? record.id : '';
      if (!isUuid(userId)) {
        throw new BearerAuthenticationError('The authentication response did not contain a valid user', 503);
      }

      return {
        userId,
        accessToken,
        email: typeof record.email === 'string' ? record.email : undefined,
      };
    } catch (error) {
      if (error instanceof BearerAuthenticationError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BearerAuthenticationError('The authentication service timed out', 503);
      }
      throw new BearerAuthenticationError('The authentication service is unavailable', 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}
