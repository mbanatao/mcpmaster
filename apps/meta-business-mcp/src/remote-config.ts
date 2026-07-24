import { loadMetaLiveConfig, type MetaLiveConfig } from './live-config';

export interface MetaRemoteMcpConfig extends MetaLiveConfig {
  remoteMcpEnabled: true;
  host: string;
  port: number;
  allowedOrigins: string[];
  requireHttps: boolean;
  organizationId: string;
  installationId: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceKeySecretRef: string;
  requestBodyLimitBytes: number;
  requestsPerMinute: number;
  authTimeoutMs: number;
  supabaseTimeoutMs: number;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = optional(environment[name]);
  if (!value) {
    throw new Error(`${name} is required for the remote Meta MCP service`);
  }
  return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
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

function parseInteger(
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

function parseOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.includes('*')) {
        throw new Error('META_REMOTE_MCP_ALLOWED_ORIGINS cannot contain wildcards');
      }
      const url = new URL(item);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        throw new Error('Remote MCP origins must use HTTPS except for localhost tests');
      }
      return url.origin;
    });
  return [...new Set(origins)];
}

function uuid(value: string, name: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID`);
  }
  return value;
}

function supabaseUrl(value: string): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('SUPABASE_URL must use HTTPS except for localhost tests');
  }
  return url.origin;
}

function platformManaged(environment: NodeJS.ProcessEnv): boolean {
  return optional(environment.VERCEL) === '1' || Boolean(optional(environment.VERCEL_ENV));
}

function runtimeHost(environment: NodeJS.ProcessEnv): string {
  return optional(environment.META_REMOTE_MCP_HOST)
    ?? (platformManaged(environment) ? '0.0.0.0' : '127.0.0.1');
}

function runtimePort(environment: NodeJS.ProcessEnv): number {
  const platformPort = optional(environment.PORT);
  return parseInteger(
    platformPort ?? environment.META_REMOTE_MCP_PORT,
    3200,
    1,
    65535,
    platformPort ? 'PORT' : 'META_REMOTE_MCP_PORT',
  );
}

const FORBIDDEN_RAW_SERVICE_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'META_SUPABASE_SERVICE_KEY',
] as const;

export function loadMetaRemoteMcpConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MetaRemoteMcpConfig {
  if (!parseBoolean(environment.META_REMOTE_MCP_ENABLED, false)) {
    throw new Error('Remote Meta MCP startup requires META_REMOTE_MCP_ENABLED=true');
  }

  for (const variableName of FORBIDDEN_RAW_SERVICE_KEYS) {
    if (optional(environment[variableName])) {
      throw new Error(`${variableName} is forbidden. Configure a server-side secret reference instead.`);
    }
  }

  const live = loadMetaLiveConfig(environment);
  return {
    ...live,
    remoteMcpEnabled: true,
    host: runtimeHost(environment),
    port: runtimePort(environment),
    allowedOrigins: parseOrigins(environment.META_REMOTE_MCP_ALLOWED_ORIGINS),
    requireHttps: parseBoolean(environment.META_REMOTE_MCP_REQUIRE_HTTPS, true),
    organizationId: uuid(
      required(environment, 'META_REMOTE_MCP_ORGANIZATION_ID'),
      'META_REMOTE_MCP_ORGANIZATION_ID',
    ),
    installationId: uuid(
      required(environment, 'META_REMOTE_MCP_INSTALLATION_ID'),
      'META_REMOTE_MCP_INSTALLATION_ID',
    ),
    supabaseUrl: supabaseUrl(required(environment, 'SUPABASE_URL')),
    supabasePublishableKey: required(environment, 'SUPABASE_PUBLISHABLE_KEY'),
    supabaseServiceKeySecretRef: required(environment, 'META_SUPABASE_SERVICE_KEY_SECRET_REF'),
    requestBodyLimitBytes: parseInteger(
      environment.META_REMOTE_MCP_BODY_LIMIT_BYTES,
      256 * 1024,
      8 * 1024,
      1024 * 1024,
      'META_REMOTE_MCP_BODY_LIMIT_BYTES',
    ),
    requestsPerMinute: parseInteger(
      environment.META_REMOTE_MCP_REQUESTS_PER_MINUTE,
      60,
      1,
      600,
      'META_REMOTE_MCP_REQUESTS_PER_MINUTE',
    ),
    authTimeoutMs: parseInteger(
      environment.META_REMOTE_MCP_AUTH_TIMEOUT_MS,
      8_000,
      500,
      20_000,
      'META_REMOTE_MCP_AUTH_TIMEOUT_MS',
    ),
    supabaseTimeoutMs: parseInteger(
      environment.META_SUPABASE_REQUEST_TIMEOUT_MS,
      10_000,
      500,
      30_000,
      'META_SUPABASE_REQUEST_TIMEOUT_MS',
    ),
  };
}
