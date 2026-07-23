import { loadMetaBusinessConfig, type MetaBusinessConfig } from './config';

export interface MetaLiveConfig extends MetaBusinessConfig {
  graphApiVersion: string;
  webhooksEnabled: boolean;
  webhookVerifyTokenSecretRef?: string;
  requestTimeoutMs: number;
  webhookMaxBodyBytes: number;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
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
  variableName: string,
): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${variableName} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function graphApiVersion(value: string | undefined): string {
  const normalized = optional(value);
  if (!normalized || !/^v\d+\.\d+$/.test(normalized)) {
    throw new Error('META_GRAPH_API_VERSION must match v<major>.<minor>');
  }
  return normalized;
}

export function loadMetaLiveConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MetaLiveConfig {
  if (optional(environment.META_WEBHOOK_VERIFY_TOKEN)) {
    throw new Error(
      'META_WEBHOOK_VERIFY_TOKEN is forbidden. Configure a server-side secret reference instead.',
    );
  }

  const base = loadMetaBusinessConfig(environment);
  if (!base.networkEnabled) {
    throw new Error('Live Meta configuration requires META_NETWORK_ENABLED=true');
  }

  const config: MetaLiveConfig = {
    ...base,
    graphApiVersion: graphApiVersion(environment.META_GRAPH_API_VERSION),
    webhooksEnabled: parseBoolean(environment.META_WEBHOOKS_ENABLED, false),
    webhookVerifyTokenSecretRef: optional(environment.META_WEBHOOK_VERIFY_TOKEN_SECRET_REF),
    requestTimeoutMs: parseInteger(
      environment.META_REQUEST_TIMEOUT_MS,
      10_000,
      1_000,
      30_000,
      'META_REQUEST_TIMEOUT_MS',
    ),
    webhookMaxBodyBytes: parseInteger(
      environment.META_WEBHOOK_MAX_BODY_BYTES,
      256 * 1024,
      1_024,
      1_024 * 1_024,
      'META_WEBHOOK_MAX_BODY_BYTES',
    ),
  };

  if (config.webhooksEnabled && !config.webhookVerifyTokenSecretRef) {
    throw new Error(
      'Meta webhook mode is missing required configuration: META_WEBHOOK_VERIFY_TOKEN_SECRET_REF',
    );
  }

  return config;
}
