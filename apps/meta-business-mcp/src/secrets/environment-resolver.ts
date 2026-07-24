import {
  SecretResolutionError,
  type ResolvedSecret,
  type SecretResolver,
} from './resolver';

export interface EnvironmentSecretResolverOptions {
  environment?: NodeJS.ProcessEnv;
  allowedVariableNames?: readonly string[];
}

const SAFE_NAME = /^[A-Z][A-Z0-9_]{2,127}$/;

export class EnvironmentSecretResolver implements SecretResolver {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly allowedVariableNames?: Set<string>;

  constructor(options: EnvironmentSecretResolverOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.allowedVariableNames = options.allowedVariableNames
      ? new Set(options.allowedVariableNames)
      : undefined;
  }

  async resolve(secretRef: string): Promise<ResolvedSecret> {
    const match = /^env:\/\/([A-Z][A-Z0-9_]{2,127})$/.exec(secretRef.trim());
    if (!match || !SAFE_NAME.test(match[1])) {
      throw new SecretResolutionError('Environment secret references must use env://VARIABLE_NAME');
    }

    const variableName = match[1];
    if (/^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(variableName)) {
      throw new SecretResolutionError('Publicly exposed environment variables cannot hold server secrets');
    }
    if (this.allowedVariableNames && !this.allowedVariableNames.has(variableName)) {
      throw new SecretResolutionError(`Environment secret reference is not allowlisted: ${variableName}`);
    }

    const value = this.environment[variableName]?.trim();
    if (!value) {
      throw new SecretResolutionError(`Environment secret reference is unavailable: ${variableName}`);
    }

    return { value };
  }
}
