import {
  EnvironmentSecretResolver,
} from './secrets/environment-resolver';
import {
  loadMetaStagingAccessProofConfig,
  MetaStagingAccessProofRunner,
} from './staging/access-proof';
import {
  loadMetaStagingReadinessConfig,
  MetaStagingReadinessRunner,
} from './staging/readiness';

function environmentSecretName(reference: string): string | undefined {
  const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference.trim());
  return match?.[1];
}

function resolverForReferences(
  environment: NodeJS.ProcessEnv,
  references: readonly string[],
): EnvironmentSecretResolver {
  return new EnvironmentSecretResolver({
    environment,
    allowedVariableNames: references
      .map(environmentSecretName)
      .filter((name): name is string => Boolean(name)),
  });
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'validate';

  if (command === 'validate') {
    const config = loadMetaStagingReadinessConfig(process.env);
    process.stdout.write(`${JSON.stringify({
      status: 'ready',
      environment: 'staging',
      baseUrl: config.baseUrl,
      origin: config.origin,
      expectedPageId: config.expectedPageId,
      externalWritesEnabled: false,
      accessTokenReferenceConfigured: true,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'prove-access') {
    const config = loadMetaStagingAccessProofConfig(process.env);
    const report = await new MetaStagingAccessProofRunner({
      config,
      secretResolver: resolverForReferences(process.env, [
        config.userAccessTokenSecretRef,
        config.debuggerAccessTokenSecretRef,
      ]),
    }).run();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (command === 'smoke') {
    const config = loadMetaStagingReadinessConfig(process.env);
    const report = await new MetaStagingReadinessRunner({
      config,
      secretResolver: resolverForReferences(process.env, [config.accessTokenSecretRef]),
    }).run();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  throw new Error('Usage: staging-cli.js [validate|prove-access|smoke]');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown staging readiness failure';
  process.stderr.write(`Meta staging readiness failed: ${message}\n`);
  process.exitCode = 1;
});
