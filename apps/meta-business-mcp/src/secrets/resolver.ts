export interface ResolvedSecret {
  value: string;
  version?: string;
  expiresAt?: string;
}

export interface SecretResolver {
  resolve(secretRef: string): Promise<ResolvedSecret>;
}

export class SecretResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretResolutionError';
  }
}

export async function resolveRequiredSecret(
  resolver: SecretResolver,
  secretRef: string,
): Promise<ResolvedSecret> {
  const normalizedRef = secretRef.trim();
  if (!normalizedRef) {
    throw new SecretResolutionError('A non-empty server-side secret reference is required');
  }

  const resolved = await resolver.resolve(normalizedRef);
  if (!resolved.value || !resolved.value.trim()) {
    throw new SecretResolutionError(`Secret reference did not resolve to a value: ${normalizedRef}`);
  }

  return {
    ...resolved,
    value: resolved.value.trim(),
  };
}

export class InMemorySecretResolver implements SecretResolver {
  private readonly values = new Map<string, ResolvedSecret>();

  constructor(initialValues: Record<string, string | ResolvedSecret> = {}) {
    for (const [reference, value] of Object.entries(initialValues)) {
      this.values.set(reference, typeof value === 'string' ? { value } : { ...value });
    }
  }

  async resolve(secretRef: string): Promise<ResolvedSecret> {
    const value = this.values.get(secretRef);
    if (!value) {
      throw new SecretResolutionError(`Unknown secret reference: ${secretRef}`);
    }
    return { ...value };
  }
}
