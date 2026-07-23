import { toolRegistry } from '../tools/index.js';

type ToolName = keyof typeof toolRegistry;
type ToolHandler = (typeof toolRegistry)[ToolName]['handler'];

export class UnknownToolError extends Error {
  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = 'UnknownToolError';
  }
}

export class MissingConfigurationError extends Error {
  readonly missing: string[];

  constructor(service: string, missing: string[]) {
    super(`Configuration missing for ${service}: ${missing.join(', ')}`);
    this.name = 'MissingConfigurationError';
    this.missing = missing;
  }
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requireValues(service: string, names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    const value = optional(name);
    if (!value) {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new MissingConfigurationError(service, missing);
  }

  return values;
}

function handlerFor(toolName: string): ToolHandler {
  const entry = toolRegistry[toolName as ToolName];
  if (!entry) {
    throw new UnknownToolError(toolName);
  }
  return entry.handler;
}

export function buildToolConfiguration(toolName: string): Record<string, unknown> {
  const handler = handlerFor(toolName);

  switch (handler) {
    case 'notion': {
      const values = requireValues(handler, ['NOTION_API_KEY']);
      return { notion: { apiKey: values.NOTION_API_KEY, version: optional('NOTION_VERSION') || '2022-06-28' } };
    }
    case 'linear': {
      const values = requireValues(handler, ['LINEAR_API_KEY']);
      return { linear: { apiKey: values.LINEAR_API_KEY } };
    }
    case 'github': {
      const values = requireValues(handler, ['GITHUB_TOKEN']);
      return { github: { token: values.GITHUB_TOKEN } };
    }
    case 'firebase': {
      const values = requireValues(handler, ['FIREBASE_PROJECT_ID']);
      return {
        firebase: {
          projectId: values.FIREBASE_PROJECT_ID,
          serviceAccountKey: optional('FIREBASE_SERVICE_ACCOUNT_KEY'),
          apiKey: optional('FIREBASE_API_KEY'),
        },
      };
    }
    case 'gcp': {
      const values = requireValues(handler, ['GCP_PROJECT_ID']);
      return {
        gcp: {
          projectId: values.GCP_PROJECT_ID,
          serviceAccountKey: optional('GCP_SERVICE_ACCOUNT_KEY'),
          region: optional('GCP_REGION') || 'us-central1',
          zone: optional('GCP_ZONE') || 'us-central1-a',
        },
      };
    }
    case 'figma': {
      const values = requireValues(handler, ['FIGMA_ACCESS_TOKEN']);
      return { figma: { accessToken: values.FIGMA_ACCESS_TOKEN } };
    }
    case 'zapier': {
      const values = requireValues(handler, ['ZAPIER_API_KEY']);
      return { zapier: { apiKey: values.ZAPIER_API_KEY } };
    }
    case 'bnd': {
      const values = requireValues(handler, ['BND_API_KEY']);
      return { bnd: { apiKey: values.BND_API_KEY, network: optional('BND_NETWORK') || 'mainnet' } };
    }
    case 'saviynt': {
      const values = requireValues(handler, ['SAVIYNT_API_KEY', 'SAVIYNT_TENANT_ID']);
      return { saviynt: { apiKey: values.SAVIYNT_API_KEY, tenantId: values.SAVIYNT_TENANT_ID } };
    }
    case 'anthropic': {
      const values = requireValues(handler, ['ANTHROPIC_API_KEY']);
      return {
        anthropic: {
          apiKey: values.ANTHROPIC_API_KEY,
          model: optional('ANTHROPIC_MODEL') || 'claude-3-5-sonnet-latest',
        },
      };
    }
    case 'neon': {
      const values = requireValues(handler, ['NEON_API_KEY', 'NEON_PROJECT_ID']);
      return { neon: { apiKey: values.NEON_API_KEY, projectId: values.NEON_PROJECT_ID } };
    }
    case 'deepmind': {
      const values = requireValues(handler, ['DEEPMIND_API_KEY', 'DEEPMIND_PROJECT_ID']);
      return { deepmind: { apiKey: values.DEEPMIND_API_KEY, projectId: values.DEEPMIND_PROJECT_ID } };
    }
    case 'openai': {
      const values = requireValues(handler, ['OPENAI_API_KEY']);
      return {
        openai: {
          apiKey: values.OPENAI_API_KEY,
          organization: optional('OPENAI_ORGANIZATION'),
          defaultModel: optional('OPENAI_DEFAULT_MODEL') || 'gpt-4o',
        },
      };
    }
    case 'box': {
      const values = requireValues(handler, ['BOX_ACCESS_TOKEN']);
      return {
        box: {
          accessToken: values.BOX_ACCESS_TOKEN,
          clientId: optional('BOX_CLIENT_ID'),
          clientSecret: optional('BOX_CLIENT_SECRET'),
        },
      };
    }
    default: {
      const exhaustive: never = handler;
      throw new Error(`Unsupported tool handler: ${exhaustive}`);
    }
  }
}

export function inspectToolConfiguration(toolName: string): { configured: boolean; missing: string[] } {
  try {
    buildToolConfiguration(toolName);
    return { configured: true, missing: [] };
  } catch (error) {
    if (error instanceof MissingConfigurationError) {
      return { configured: false, missing: error.missing };
    }
    throw error;
  }
}
