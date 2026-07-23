import { toolRegistry } from './tool-catalog.js';

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

function requiredEnvironmentValue(service: string, name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new MissingConfigurationError(service, [name]);
  }
  return value;
}

export function buildToolConfiguration(toolName: string): Record<string, unknown> {
  const entry = toolRegistry[toolName];
  if (!entry) {
    throw new UnknownToolError(toolName);
  }

  return {
    github: {
      token: requiredEnvironmentValue('github', 'GITHUB_TOKEN'),
    },
  };
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
